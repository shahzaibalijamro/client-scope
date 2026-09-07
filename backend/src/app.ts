import express, { type Express, type RequestHandler } from "express";

import { errorHandler, notFoundHandler } from "./errors.js";
import { createHealthRouter, type DatabaseStateReader } from "./health.js";
import { logDiagnostic } from "./logger.js";
import { resolveSession } from "./domain/auth.js";
import { createIdentityRouter } from "./domain/identity-routes.js";
import { createWorkspaceRouter } from "./domain/workspace-routes.js";
import { developmentEmail, SafeDevelopmentEmailService, type EmailService } from "./domain/email.js";

export function safeDiagnosticPath(path: string): string {
  return path.replace(/(\/invitation-links\/)[^/]+/u, "$1:token");
}

function requestDiagnostics(): RequestHandler {
  return (request, response, next) => {
    const startedAt = performance.now();
    const path = safeDiagnosticPath(request.path);

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
  emailService?: EmailService;
}>;

export function createApp(options: AppOptions = {}): Express {
  const app = express();
  const emailService = options.emailService ?? developmentEmail;

  app.disable("x-powered-by");
  app.use(requestDiagnostics());
  app.use(express.json({ limit: "100kb" }));
  app.use(resolveSession);
  app.use("/api/v1", createHealthRouter(options.readDatabaseState));
  app.use("/api/v1", createIdentityRouter(emailService));
  app.use("/api/v1", createWorkspaceRouter(emailService));
  if (process.env.NODE_ENV !== "production" && process.env.E2E_TEST_MODE === "1" && emailService instanceof SafeDevelopmentEmailService) {
    app.get("/api/v1/test/emails", (request, response) => {
      const to = String(request.query.to ?? "");
      const category = String(request.query.category ?? "");
      const message = [...emailService.sent].reverse().find((item) => item.to === to && item.category === category);
      if (!message) {
        response.status(404).json({ error: { code: "TEST_EMAIL_NOT_FOUND", message: "No matching test email is available." } });
        return;
      }
      response.json({ subject: message.subject, text: message.text });
    });
  }
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
