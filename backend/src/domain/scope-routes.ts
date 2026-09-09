import { Router } from "express";
import { z } from "zod";

import { validateRequest } from "../validation.js";
import { asyncRoute, requireVerified } from "./auth.js";
import type { EmailService } from "./email.js";
import { developmentEmail } from "./email.js";
import { assertBrowserMutation } from "./security.js";
import { commentInput, decisionInput, draftContentInput, submitScopeInput, withdrawalInput } from "./scope-contracts.js";
import { decideScope, postComment, readScope, startDraft, submitDraft, updateDraft, withdrawScope } from "./scope-service.js";
import { objectId } from "./validation.js";

const projectParams = z.object({ projectId: objectId }).strict();
const versionParams = z.object({ projectId: objectId, versionId: objectId }).strict();

export function createScopeRouter(emailService: EmailService = developmentEmail): Router {
  const router = Router();
  router.get("/projects/:projectId/scope", validateRequest("params", projectParams), asyncRoute(async (request, response) => {
    const { user } = requireVerified(request);
    response.json({ scope: await readScope(String(request.params.projectId), user._id) });
  }));
  router.post("/projects/:projectId/scope/draft", validateRequest("params", projectParams), validateRequest("body", z.object({}).strict()), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request);
    response.status(201).json({ draft: await startDraft(String(request.params.projectId), user) });
  }));
  router.put("/projects/:projectId/scope/draft", validateRequest("params", projectParams), validateRequest("body", draftContentInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request);
    response.json({ draft: await updateDraft(String(request.params.projectId), user, request.body) });
  }));
  router.post("/projects/:projectId/scope/submissions", validateRequest("params", projectParams), validateRequest("body", submitScopeInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request);
    response.status(201).json(await submitDraft(String(request.params.projectId), user, request.body, emailService));
  }));
  router.post("/projects/:projectId/scope/versions/:versionId/comments", validateRequest("params", versionParams), validateRequest("body", commentInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request);
    response.status(201).json(await postComment(String(request.params.projectId), String(request.params.versionId), user, request.body));
  }));
  router.post("/projects/:projectId/scope/versions/:versionId/decisions", validateRequest("params", versionParams), validateRequest("body", decisionInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request);
    response.json(await decideScope(String(request.params.projectId), String(request.params.versionId), user, request.body, emailService));
  }));
  router.post("/projects/:projectId/scope/versions/:versionId/withdrawal", validateRequest("params", versionParams), validateRequest("body", withdrawalInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request);
    response.json(await withdrawScope(String(request.params.projectId), String(request.params.versionId), user, request.body.reason, emailService));
  }));
  return router;
}
