import { Router } from "express";

import { validateRequest } from "../validation.js";
import { asyncRoute, requireVerified } from "./auth.js";
import type { EmailService } from "./email.js";
import {
  activityQuery, archiveTransitionInput, completionDecisionInput, completionWithdrawalInput,
  lifecycleProjectParams, lifecycleRoundParams, requestCompletionInput,
} from "./lifecycle-contracts.js";
import {
  decideCompletion, readActivity, readLifecycle, requestCompletion, transitionArchive, withdrawCompletion,
} from "./lifecycle-service.js";
import { assertBrowserMutation } from "./security.js";

export function createLifecycleRouter(email: EmailService): Router {
  const router = Router();
  router.get("/projects/:projectId/lifecycle", validateRequest("params", lifecycleProjectParams), asyncRoute(async (request, response) => {
    const { user } = requireVerified(request); response.json({ lifecycle: await readLifecycle(String(request.params.projectId), user._id) });
  }));
  router.get("/projects/:projectId/activity", validateRequest("params", lifecycleProjectParams), validateRequest("query", activityQuery), asyncRoute(async (request, response) => {
    const { user } = requireVerified(request); response.json({ activity: await readActivity(String(request.params.projectId), user._id, request.query as unknown as { cursor?: string; limit: number }) });
  }));
  router.post("/projects/:projectId/completion-requests", validateRequest("params", lifecycleProjectParams), validateRequest("body", requestCompletionInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request); response.status(201).json(await requestCompletion(String(request.params.projectId), user, request.body, email));
  }));
  router.post("/projects/:projectId/completion-rounds/:roundId/decisions", validateRequest("params", lifecycleRoundParams), validateRequest("body", completionDecisionInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request); response.json(await decideCompletion(String(request.params.projectId), String(request.params.roundId), user, request.body, email));
  }));
  router.post("/projects/:projectId/completion-rounds/:roundId/withdrawal", validateRequest("params", lifecycleRoundParams), validateRequest("body", completionWithdrawalInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request); response.json(await withdrawCompletion(String(request.params.projectId), String(request.params.roundId), user, request.body, email));
  }));
  router.post("/projects/:projectId/archive", validateRequest("params", lifecycleProjectParams), validateRequest("body", archiveTransitionInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request); response.json(await transitionArchive(String(request.params.projectId), user, request.body, "archived"));
  }));
  router.post("/projects/:projectId/restore", validateRequest("params", lifecycleProjectParams), validateRequest("body", archiveTransitionInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request); response.json(await transitionArchive(String(request.params.projectId), user, request.body, "restored"));
  }));
  return router;
}
