import { Router } from "express";
import { z } from "zod";

import { validateRequest } from "../validation.js";
import { asyncRoute, requireVerified } from "./auth.js";
import {
  archiveMilestoneInput, archiveQuery, createMilestoneInput, editMilestoneInput,
  reorderMilestonesInput, transitionMilestoneInput,
} from "./milestone-contracts.js";
import {
  archiveMilestone, createMilestone, editMilestone, readArchivedMilestones, readMilestones,
  reorderMilestones, transitionMilestone, type Clock,
} from "./milestone-service.js";
import { assertBrowserMutation } from "./security.js";
import { objectId } from "./validation.js";

const projectParams = z.object({ projectId: objectId }).strict();
const milestoneParams = z.object({ projectId: objectId, milestoneId: objectId }).strict();

export function createMilestoneRouter(clock?: Clock): Router {
  const router = Router();
  router.get("/projects/:projectId/milestones", validateRequest("params", projectParams), asyncRoute(async (request, response) => {
    const { user } = requireVerified(request);
    response.json({ timeline: await readMilestones(String(request.params.projectId), user._id, clock) });
  }));
  router.get(
    "/projects/:projectId/milestones/archive", validateRequest("params", projectParams), validateRequest("query", archiveQuery),
    asyncRoute(async (request, response) => {
      const { user } = requireVerified(request);
      response.json({ archive: await readArchivedMilestones(String(request.params.projectId), user._id, request.query as unknown as { cursor?: string; limit: number }, clock) });
    }),
  );
  router.post(
    "/projects/:projectId/milestones", validateRequest("params", projectParams), validateRequest("body", createMilestoneInput),
    asyncRoute(async (request, response) => {
      assertBrowserMutation(request); const { user } = requireVerified(request);
      response.status(201).json(await createMilestone(String(request.params.projectId), user, request.body, clock));
    }),
  );
  router.patch(
    "/projects/:projectId/milestones/:milestoneId", validateRequest("params", milestoneParams), validateRequest("body", editMilestoneInput),
    asyncRoute(async (request, response) => {
      assertBrowserMutation(request); const { user } = requireVerified(request);
      response.json(await editMilestone(String(request.params.projectId), String(request.params.milestoneId), user, request.body, clock));
    }),
  );
  router.post(
    "/projects/:projectId/milestones/:milestoneId/transitions", validateRequest("params", milestoneParams), validateRequest("body", transitionMilestoneInput),
    asyncRoute(async (request, response) => {
      assertBrowserMutation(request); const { user } = requireVerified(request);
      response.json(await transitionMilestone(String(request.params.projectId), String(request.params.milestoneId), user, request.body, clock));
    }),
  );
  router.put(
    "/projects/:projectId/milestones/order", validateRequest("params", projectParams), validateRequest("body", reorderMilestonesInput),
    asyncRoute(async (request, response) => {
      assertBrowserMutation(request); const { user } = requireVerified(request);
      response.json(await reorderMilestones(String(request.params.projectId), user, request.body, clock));
    }),
  );
  router.post(
    "/projects/:projectId/milestones/:milestoneId/archive", validateRequest("params", milestoneParams), validateRequest("body", archiveMilestoneInput),
    asyncRoute(async (request, response) => {
      assertBrowserMutation(request); const { user } = requireVerified(request);
      response.json(await archiveMilestone(String(request.params.projectId), String(request.params.milestoneId), user, request.body, clock));
    }),
  );
  return router;
}
