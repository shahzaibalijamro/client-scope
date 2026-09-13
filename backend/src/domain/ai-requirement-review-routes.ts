import { Router } from "express";
import { z } from "zod";

import { validateRequest } from "../validation.js";
import { asyncRoute, requireVerified } from "./auth.js";
import {
  applyReviewInput, discardReviewInput, generateReviewInput, updateWorkingReviewInput,
} from "./ai-requirement-review-contracts.js";
import { DisabledRequirementQualityReviewProvider, type RequirementQualityReviewProvider } from "./ai-requirement-review-provider.js";
import { AiRequirementReviewService, type AiReviewClock } from "./ai-requirement-review-service.js";
import { assertBrowserMutation } from "./security.js";
import { objectId } from "./validation.js";

const projectParams = z.object({ projectId: objectId }).strict();
const reviewParams = z.object({ projectId: objectId, reviewId: objectId }).strict();

export function createAiRequirementReviewRouter(
  provider: RequirementQualityReviewProvider = new DisabledRequirementQualityReviewProvider(),
  clock?: AiReviewClock,
): Router {
  const router = Router();
  const service = new AiRequirementReviewService(provider, clock);
  const base = "/projects/:projectId/ai/requirement-reviews";

  router.get(base, validateRequest("params", projectParams), asyncRoute(async (request, response) => {
    const { user } = requireVerified(request);
    response.json(await service.list(String(request.params.projectId), user));
  }));
  router.post(base, validateRequest("params", projectParams), validateRequest("body", generateReviewInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request);
    response.status(201).json({ review: await service.generate(String(request.params.projectId), user, request.body, () => !request.aborted) });
  }));
  router.get(`${base}/:reviewId`, validateRequest("params", reviewParams), asyncRoute(async (request, response) => {
    const { user } = requireVerified(request);
    response.json({ review: await service.get(String(request.params.projectId), String(request.params.reviewId), user) });
  }));
  router.put(`${base}/:reviewId`, validateRequest("params", reviewParams), validateRequest("body", updateWorkingReviewInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request);
    response.json({ review: await service.update(String(request.params.projectId), String(request.params.reviewId), user, request.body) });
  }));
  router.post(`${base}/:reviewId/discard`, validateRequest("params", reviewParams), validateRequest("body", discardReviewInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request);
    response.json({ review: await service.discard(String(request.params.projectId), String(request.params.reviewId), user, request.body.expectedReviewRevision) });
  }));
  router.post(`${base}/:reviewId/apply`, validateRequest("params", reviewParams), validateRequest("body", applyReviewInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request);
    response.json({ review: await service.apply(String(request.params.projectId), String(request.params.reviewId), user, request.body) });
  }));
  router.get(`${base}/:reviewId/provenance`, validateRequest("params", reviewParams), asyncRoute(async (request, response) => {
    const { user } = requireVerified(request);
    response.json({ provenance: await service.provenance(String(request.params.projectId), String(request.params.reviewId), user) });
  }));
  return router;
}
