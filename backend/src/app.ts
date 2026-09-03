import express, { type Express, type RequestHandler } from "express";

import { errorHandler, notFoundHandler } from "./errors.js";
import { createHealthRouter, type DatabaseStateReader } from "./health.js";
import { logDiagnostic } from "./logger.js";

function requestDiagnostics(): RequestHandler {
  return (request, response, next) => {
    const startedAt = performance.now();
    const path = request.path;

    response.on("finish", () => {
      logDiagnostic("info", "request.completed", {
        method: request.method,
        path,
        status: response.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
        errorCode:
          typeof response.locals.errorCode === "string"
            ? response.locals.errorCode
            : undefined,
      });
    });

    next();
  };
}

export type AppOptions = Readonly<{
  readDatabaseState?: DatabaseStateReader;
}>;

export function createApp(options: AppOptions = {}): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(requestDiagnostics());
  app.use(express.json({ limit: "100kb" }));
  app.use("/api/v1", createHealthRouter(options.readDatabaseState));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
