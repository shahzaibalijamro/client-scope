import { Router } from "express";
import { z } from "zod";

import { validateRequest } from "../validation.js";
import { generateFeedbackSummaryInput } from "./ai-feedback-summary-contracts.js";
import { DisabledFeedbackSummarizationProvider, type FeedbackSummarizationProvider } from "./ai-feedback-summary-provider.js";
import { AiFeedbackSummaryService, type AiFeedbackClock } from "./ai-feedback-summary-service.js";
import { asyncRoute, requireVerified } from "./auth.js";
import { assertBrowserMutation } from "./security.js";
import { objectId } from "./validation.js";
import type { DemoService } from "./demo-service.js";

const params = z.object({ projectId: objectId, deliverableId: objectId }).strict();
const path = "/projects/:projectId/deliverables/:deliverableId/feedback-summary";

export function createAiFeedbackSummaryRouter(provider: FeedbackSummarizationProvider = new DisabledFeedbackSummarizationProvider(), clock?: AiFeedbackClock, demoService?: DemoService): Router {
  const router = Router(); const service = new AiFeedbackSummaryService(provider, clock, demoService);
  router.get(path, validateRequest("params", params), asyncRoute(async (request, response) => {
    const { user } = requireVerified(request);
    response.json(await service.read(String(request.params.projectId), String(request.params.deliverableId), user));
  }));
  router.post(path, validateRequest("params", params), validateRequest("body", generateFeedbackSummaryInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request);
    response.status(201).json({ summary: await service.generate(String(request.params.projectId), String(request.params.deliverableId), user, () => !request.aborted) });
  }));
  return router;
}
