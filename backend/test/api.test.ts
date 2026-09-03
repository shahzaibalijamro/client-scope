import express from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { errorHandler } from "../src/errors.js";
import { validateRequest } from "../src/validation.js";

let database: MongoMemoryServer | undefined;

beforeAll(async () => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  database = await MongoMemoryServer.create();
  const config = loadConfig({
    NODE_ENV: "test",
    PORT: "4100",
    MONGODB_URI: database.getUri(),
  });
  await mongoose.connect(config.MONGODB_URI);
});

afterAll(async () => {
  await mongoose.disconnect();
  await database?.stop();
});

describe("API boundaries", () => {
  it("returns exactly the safe healthy representation while MongoDB is connected", async () => {
    const collectionsBefore = await mongoose.connection.db?.listCollections().toArray();

    const response = await request(createApp()).get("/api/v1/health").expect(200);

    const collectionsAfter = await mongoose.connection.db?.listCollections().toArray();
    expect(response.body).toEqual({ status: "ok", database: "connected" });
    expect(collectionsAfter).toEqual(collectionsBefore);
  });

  it.each([
    ["disconnected", mongoose.ConnectionStates.disconnected],
    ["connecting", mongoose.ConnectionStates.connecting],
    ["disconnecting", mongoose.ConnectionStates.disconnecting],
    ["unknown", 99],
  ])("returns the approved unavailable response for %s state", async (_label, state) => {
    const response = await request(createApp({ readDatabaseState: () => state }))
      .get("/api/v1/health")
      .expect(503);

    expect(response.body).toEqual({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Service is temporarily unavailable.",
        details: { database: "disconnected" },
      },
    });
  });

  it("returns the standard not-found envelope without unnecessary details", async () => {
    const response = await request(createApp()).get("/api/v1/missing").expect(404);

    expect(response.body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "The requested resource was not found.",
      },
    });
  });

  it("returns a safe envelope for malformed JSON", async () => {
    const response = await request(createApp())
      .post("/api/v1/missing")
      .set("Content-Type", "application/json")
      .send('{"broken":')
      .expect(400);

    expect(response.body).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "The request could not be understood.",
      },
    });
  });

  it("returns safe field details for a controlled validation failure", async () => {
    const app = express();
    app.get(
      "/validate",
      validateRequest("query", z.object({ page: z.coerce.number().int().positive() })),
      (_request, response) => response.sendStatus(204),
    );
    app.use(errorHandler);

    const response = await request(app).get("/validate?page=invalid").expect(400);

    expect(response.body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "The request contains invalid data.",
        details: {
          fields: [{ field: "page", message: "Invalid input: expected number, received NaN" }],
        },
      },
    });
  });

  it("hides unexpected error internals", async () => {
    const app = express();
    app.get("/failure", () => {
      throw new Error("mongodb://user:password@private-host/db C:\\private\\file.ts");
    });
    app.use(errorHandler);

    const response = await request(app).get("/failure").expect(500);
    const serialized = JSON.stringify(response.body);

    expect(response.body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
      },
    });
    expect(serialized).not.toMatch(/password|private-host|file\.ts|stack/i);
  });
});
