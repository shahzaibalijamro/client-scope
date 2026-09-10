import { Router } from "express";
import { z } from "zod";

import { validateRequest } from "../validation.js";
import { asyncRoute, requireVerified } from "./auth.js";
import {
  changeCommentInput, changeDecisionInput, changeDraftInput, confirmedOnlyInput, reasonInput,
  startChangeRequestInput, submitChangeProposalInput,
} from "./change-control-contracts.js";
import {
  cancelChangeRequest, decideChangeProposal, discardChangeRequest, postChangeComment, readChangeControl,
  startChangeRequest, submitChangeProposal, updateChangeDraft, withdrawChangeProposal,
} from "./change-control-service.js";
import { developmentEmail, type EmailService } from "./email.js";
import { assertBrowserMutation } from "./security.js";
import { objectId } from "./validation.js";

const projectParams = z.object({ projectId: objectId }).strict();
const requestParams = z.object({ projectId: objectId, requestId: objectId }).strict();
const proposalParams = z.object({ projectId: objectId, requestId: objectId, proposalId: objectId }).strict();

export function createChangeControlRouter(emailService: EmailService = developmentEmail): Router {
  const router = Router();
  router.get("/projects/:projectId/change-requests", validateRequest("params", projectParams), asyncRoute(async (request, response) => {
    const { user } = requireVerified(request);
    response.json({ changeControl: await readChangeControl(String(request.params.projectId), user._id) });
  }));
  router.post("/projects/:projectId/change-requests", validateRequest("params", projectParams), validateRequest("body", startChangeRequestInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request);
    response.status(201).json(await startChangeRequest(String(request.params.projectId), user, request.body.title));
  }));
  router.put("/projects/:projectId/change-requests/:requestId/draft", validateRequest("params", requestParams), validateRequest("body", changeDraftInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request);
    response.json(await updateChangeDraft(String(request.params.projectId), String(request.params.requestId), user, request.body));
  }));
  router.post("/projects/:projectId/change-requests/:requestId/discard", validateRequest("params", requestParams), validateRequest("body", confirmedOnlyInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request);
    response.json(await discardChangeRequest(String(request.params.projectId), String(request.params.requestId), user));
  }));
  router.post("/projects/:projectId/change-requests/:requestId/submissions", validateRequest("params", requestParams), validateRequest("body", submitChangeProposalInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request);
    response.status(201).json(await submitChangeProposal(String(request.params.projectId), String(request.params.requestId), user, request.body.revisionToken, emailService));
  }));
  router.post("/projects/:projectId/change-requests/:requestId/proposals/:proposalId/comments", validateRequest("params", proposalParams), validateRequest("body", changeCommentInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request);
    response.status(201).json(await postChangeComment(String(request.params.projectId), String(request.params.requestId), String(request.params.proposalId), user, request.body));
  }));
  router.post("/projects/:projectId/change-requests/:requestId/proposals/:proposalId/decisions", validateRequest("params", proposalParams), validateRequest("body", changeDecisionInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request);
    response.json(await decideChangeProposal(String(request.params.projectId), String(request.params.requestId), String(request.params.proposalId), user, request.body, emailService));
  }));
  router.post("/projects/:projectId/change-requests/:requestId/proposals/:proposalId/withdrawal", validateRequest("params", proposalParams), validateRequest("body", reasonInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request);
    response.json(await withdrawChangeProposal(String(request.params.projectId), String(request.params.requestId), String(request.params.proposalId), user, request.body.reason, emailService));
  }));
  router.post("/projects/:projectId/change-requests/:requestId/cancellation", validateRequest("params", requestParams), validateRequest("body", reasonInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request);
    response.json(await cancelChangeRequest(String(request.params.projectId), String(request.params.requestId), user, request.body.reason, emailService));
  }));
  return router;
}
