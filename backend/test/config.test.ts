import { describe, expect, it } from "vitest";

import { ConfigurationError, loadConfig } from "../src/config.js";

const validEnvironment = {
  NODE_ENV: "test",
  PORT: "4100",
  MONGODB_URI: "mongodb://127.0.0.1:27017/clientscope-test",
  FRONTEND_ORIGIN: "http://localhost:3000",
  SESSION_SECRET: "test-session-secret-with-at-least-32-characters",
  AUTH_THROTTLE_LIMIT: "12",
  EMAIL_DELIVERY_MODE: "local",
} satisfies NodeJS.ProcessEnv;

describe("loadConfig", () => {
  it("accepts and normalizes valid configuration without starting network work", () => {
    expect(loadConfig(validEnvironment)).toEqual({
      NODE_ENV: "test",
      PORT: 4100,
      MONGODB_URI: validEnvironment.MONGODB_URI,
      FRONTEND_ORIGIN: validEnvironment.FRONTEND_ORIGIN,
      SESSION_SECRET: validEnvironment.SESSION_SECRET,
      AUTH_THROTTLE_LIMIT: 12,
      EMAIL_DELIVERY_MODE: "local",
    });
  });

  it.each(["NODE_ENV", "PORT", "MONGODB_URI", "FRONTEND_ORIGIN", "SESSION_SECRET", "AUTH_THROTTLE_LIMIT", "EMAIL_DELIVERY_MODE"] as const)(
    "rejects a missing %s value deterministically",
    (field) => {
      const environment = { ...validEnvironment };
      delete environment[field];

      expect(() => loadConfig(environment)).toThrow(ConfigurationError);
      expect(() => loadConfig(environment)).toThrow(field);
    },
  );

  it.each([
    ["NODE_ENV", "staging"],
    ["PORT", "0"],
    ["PORT", "65536"],
    ["PORT", "not-a-port"],
    ["MONGODB_URI", "https://database.example/secret"],
  ])("rejects invalid %s configuration", (field, value) => {
    expect(() => loadConfig({ ...validEnvironment, [field]: value })).toThrow(
      ConfigurationError,
    );
  });

  it("never includes a supplied connection string in diagnostics", () => {
    const secret = "mongodb://secret-user:secret-pass@example.invalid/db with-space";

    expect(() => loadConfig({ ...validEnvironment, MONGODB_URI: secret })).toThrowError(
      expect.objectContaining({ message: expect.not.stringContaining(secret) }),
    );
  });
});
