import express, { type Express, type RequestHandler } from "express";

import { errorHandler, notFoundHandler } from "./errors.js";
import { createHealthRouter, type DatabaseStateReader } from "./health.js";
import { logDiagnostic } from "./logger.js";
import { resolveSession } from "./domain/auth.js";
import { createIdentityRouter } from "./domain/identity-routes.js";
import { createWorkspaceRouter } from "./domain/workspace-routes.js";
import { createScopeRouter } from "./domain/scope-routes.js";
import { createChangeControlRouter } from "./domain/change-control-routes.js";
import { createMilestoneRouter } from "./domain/milestone-routes.js";
import type { Clock } from "./domain/milestone-service.js";
import { developmentEmail, SafeDevelopmentEmailService, type EmailService } from "./domain/email.js";
import { createDeliverableRouter } from "./domain/deliverable-routes.js";
import { createLifecycleRouter } from "./domain/lifecycle-routes.js";
import { DeterministicPrivateAssetStorage, type PrivateAssetStorage } from "./domain/private-asset-storage.js";
import { createAiRequirementRouter } from "./domain/ai-requirement-routes.js";
import { DisabledRequirementStructuringProvider, type RequirementStructuringProvider } from "./domain/ai-requirement-provider.js";
import { createAiRequirementReviewRouter } from "./domain/ai-requirement-review-routes.js";
import { DisabledRequirementQualityReviewProvider, type RequirementQualityReviewProvider } from "./domain/ai-requirement-review-provider.js";
import { createAiFeedbackSummaryRouter } from "./domain/ai-feedback-summary-routes.js";
import { DisabledFeedbackSummarizationProvider, type FeedbackSummarizationProvider } from "./domain/ai-feedback-summary-provider.js";
import { createProjectExportRouter } from "./domain/project-export-routes.js";
import { DemoService } from "./domain/demo-service.js";
import { createDemoRouter, demoBoundary } from "./domain/demo-routes.js";
import { loadDemoConfig } from "./config.js";

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
  clock?: Clock;
  privateAssetStorage?: PrivateAssetStorage;
  requirementStructuringProvider?: RequirementStructuringProvider;
  requirementQualityReviewProvider?: RequirementQualityReviewProvider;
  feedbackSummarizationProvider?: FeedbackSummarizationProvider;
  aiClock?: Clock;
  demoService?: DemoService;
}>;

export function createApp(options: AppOptions = {}): Express {
  const app = express();
  const emailService = options.emailService ?? developmentEmail;
  const privateAssetStorage = options.privateAssetStorage ?? new DeterministicPrivateAssetStorage();
  const requirementStructuringProvider = options.requirementStructuringProvider ?? new DisabledRequirementStructuringProvider();
  const requirementQualityReviewProvider = options.requirementQualityReviewProvider ?? new DisabledRequirementQualityReviewProvider();
  const feedbackSummarizationProvider = options.feedbackSummarizationProvider ?? new DisabledFeedbackSummarizationProvider();
  const demoService = options.demoService ?? new DemoService(loadDemoConfig(process.env));

  app.disable("x-powered-by");
  app.use(requestDiagnostics());
  app.use(express.json({ limit: "520kb" }));
  app.use(resolveSession);
  app.use("/api/v1", demoBoundary(demoService));
  app.use("/api/v1", createDemoRouter(demoService));
  app.use("/api/v1", createHealthRouter(options.readDatabaseState));
  app.use("/api/v1", createIdentityRouter(emailService));
  app.use("/api/v1", createWorkspaceRouter(emailService, demoService));
  app.use("/api/v1", createScopeRouter(emailService));
  app.use("/api/v1", createAiRequirementRouter(requirementStructuringProvider, options.aiClock, demoService));
  app.use("/api/v1", createAiRequirementReviewRouter(requirementQualityReviewProvider, options.aiClock, demoService));
  app.use("/api/v1", createAiFeedbackSummaryRouter(feedbackSummarizationProvider, options.aiClock, demoService));
  app.use("/api/v1", createChangeControlRouter(emailService));
  app.use("/api/v1", createMilestoneRouter(options.clock));
  app.use("/api/v1", createDeliverableRouter(emailService, privateAssetStorage, demoService));
  app.use("/api/v1", createLifecycleRouter(emailService));
  app.use("/api/v1", createProjectExportRouter(privateAssetStorage));
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
