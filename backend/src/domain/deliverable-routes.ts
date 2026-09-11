import { Router } from "express";
import { z } from "zod";

import { validateRequest } from "../validation.js";
import { asyncRoute, requireVerified } from "./auth.js";
import {
  authorizeUploadInput, commentInput, confirmedInput, createDeliverableInput, decisionInput, detachAttachmentInput,
  finalizeUploadInput, pageQuery, reasonInput, updateDeliverableDraftInput,
} from "./deliverable-contracts.js";
import {
  authorizeAttachmentAccess, authorizeDeliverableUpload, cancelDeliverable, createDeliverable, decideDeliverable,
  detachDeliverableAttachment, discardDeliverable, finalizeDeliverableUpload, postDeliverableComment, readDeliverableComments,
  readDeliverables, readDeliverableVersions, readTerminalDeliverables, submitDeliverable, updateDeliverableDraft, withdrawDeliverable,
} from "./deliverable-service.js";
import type { EmailService } from "./email.js";
import { assertBrowserMutation } from "./security.js";
import type { PrivateAssetStorage } from "./private-asset-storage.js";
import { objectId } from "./validation.js";

const projectParams = z.object({ projectId: objectId }).strict();
const deliverableParams = z.object({ projectId: objectId, deliverableId: objectId }).strict();
const versionParams = z.object({ projectId: objectId, deliverableId: objectId, versionId: objectId }).strict();
const attachmentParams = z.object({ projectId: objectId, deliverableId: objectId, versionId: objectId, attachmentId: objectId }).strict();
const draftAttachmentParams = z.object({ projectId: objectId, deliverableId: objectId, attachmentId: objectId }).strict();

export function createDeliverableRouter(email: EmailService, storage: PrivateAssetStorage): Router {
  const router = Router();
  router.get("/projects/:projectId/deliverables", validateRequest("params", projectParams), asyncRoute(async (request, response) => {
    const { user } = requireVerified(request); response.json({ deliverables: await readDeliverables(String(request.params.projectId), user._id) });
  }));
  router.get("/projects/:projectId/deliverables/history", validateRequest("params", projectParams), validateRequest("query", pageQuery), asyncRoute(async (request, response) => {
    const { user } = requireVerified(request); response.json({ history: await readTerminalDeliverables(String(request.params.projectId), user._id, request.query as unknown as { cursor?: string; limit: number }) });
  }));
  router.post("/projects/:projectId/deliverables", validateRequest("params", projectParams), validateRequest("body", createDeliverableInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request); response.status(201).json(await createDeliverable(String(request.params.projectId), user, request.body));
  }));
  router.put("/projects/:projectId/deliverables/:deliverableId/draft", validateRequest("params", deliverableParams), validateRequest("body", updateDeliverableDraftInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request); response.json(await updateDeliverableDraft(String(request.params.projectId), String(request.params.deliverableId), user, request.body));
  }));
  router.post("/projects/:projectId/deliverables/:deliverableId/discard", validateRequest("params", deliverableParams), validateRequest("body", confirmedInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request); response.json(await discardDeliverable(String(request.params.projectId), String(request.params.deliverableId), user, request.body.revisionToken, storage));
  }));
  router.post("/projects/:projectId/deliverables/:deliverableId/uploads/authorization", validateRequest("params", deliverableParams), validateRequest("body", authorizeUploadInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request); response.status(201).json(await authorizeDeliverableUpload(String(request.params.projectId), String(request.params.deliverableId), user, request.body, storage));
  }));
  router.post("/projects/:projectId/deliverables/:deliverableId/uploads/finalization", validateRequest("params", deliverableParams), validateRequest("body", finalizeUploadInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request); response.status(201).json(await finalizeDeliverableUpload(String(request.params.projectId), String(request.params.deliverableId), user, request.body, storage));
  }));
  router.post("/projects/:projectId/deliverables/:deliverableId/attachments/:attachmentId/detach", validateRequest("params", draftAttachmentParams), validateRequest("body", detachAttachmentInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request); response.json(await detachDeliverableAttachment(String(request.params.projectId), String(request.params.deliverableId), String(request.params.attachmentId), user, request.body.revisionToken, storage));
  }));
  router.post("/projects/:projectId/deliverables/:deliverableId/submissions", validateRequest("params", deliverableParams), validateRequest("body", confirmedInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request); response.status(201).json(await submitDeliverable(String(request.params.projectId), String(request.params.deliverableId), user, request.body.revisionToken, email));
  }));
  router.get("/projects/:projectId/deliverables/:deliverableId/versions", validateRequest("params", deliverableParams), validateRequest("query", pageQuery), asyncRoute(async (request, response) => {
    const { user } = requireVerified(request); response.json({ history: await readDeliverableVersions(String(request.params.projectId), String(request.params.deliverableId), user._id, request.query as unknown as { cursor?: string; limit: number }) });
  }));
  router.get("/projects/:projectId/deliverables/:deliverableId/versions/:versionId/comments", validateRequest("params", versionParams), validateRequest("query", pageQuery), asyncRoute(async (request, response) => {
    const { user } = requireVerified(request); response.json({ history: await readDeliverableComments(String(request.params.projectId), String(request.params.deliverableId), String(request.params.versionId), user._id, request.query as unknown as { cursor?: string; limit: number }) });
  }));
  router.post("/projects/:projectId/deliverables/:deliverableId/versions/:versionId/comments", validateRequest("params", versionParams), validateRequest("body", commentInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request); response.status(201).json(await postDeliverableComment(String(request.params.projectId), String(request.params.deliverableId), String(request.params.versionId), user, request.body.body));
  }));
  router.post("/projects/:projectId/deliverables/:deliverableId/versions/:versionId/decisions", validateRequest("params", versionParams), validateRequest("body", decisionInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request); response.json(await decideDeliverable(String(request.params.projectId), String(request.params.deliverableId), String(request.params.versionId), user, request.body, email));
  }));
  router.post("/projects/:projectId/deliverables/:deliverableId/versions/:versionId/withdrawal", validateRequest("params", versionParams), validateRequest("body", reasonInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request); response.json(await withdrawDeliverable(String(request.params.projectId), String(request.params.deliverableId), String(request.params.versionId), user, request.body.reason));
  }));
  router.post("/projects/:projectId/deliverables/:deliverableId/cancellation", validateRequest("params", deliverableParams), validateRequest("body", reasonInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request); response.json(await cancelDeliverable(String(request.params.projectId), String(request.params.deliverableId), user, request.body.reason, storage));
  }));
  router.post("/projects/:projectId/deliverables/:deliverableId/versions/:versionId/attachments/:attachmentId/access", validateRequest("params", attachmentParams), validateRequest("body", z.object({}).strict()), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request); response.json(await authorizeAttachmentAccess(String(request.params.projectId), String(request.params.deliverableId), String(request.params.versionId), String(request.params.attachmentId), user._id, storage));
  }));
  return router;
}
