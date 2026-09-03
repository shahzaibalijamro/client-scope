import { Router, type RequestHandler } from "express";
import mongoose from "mongoose";

import { getDatabaseReadyState } from "./database.js";
import { ApiError } from "./errors.js";

export type DatabaseStateReader = () => number;

export function createHealthHandler(
  readDatabaseState: DatabaseStateReader = getDatabaseReadyState,
): RequestHandler {
  return (_request, response, next) => {
    if (readDatabaseState() !== mongoose.ConnectionStates.connected) {
      next(
        new ApiError(503, "SERVICE_UNAVAILABLE", "Service is temporarily unavailable.", {
          database: "disconnected",
        }),
      );
      return;
    }

    response.status(200).json({
      status: "ok",
      database: "connected",
    });
  };
}

export function createHealthRouter(
  readDatabaseState: DatabaseStateReader = getDatabaseReadyState,
): Router {
  const router = Router();
  router.get("/health", createHealthHandler(readDatabaseState));
  return router;
}
