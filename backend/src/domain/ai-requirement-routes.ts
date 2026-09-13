import { Router } from "express";
import { z } from "zod";

import { validateRequest } from "../validation.js";
import { asyncRoute, requireVerified } from "./auth.js";
import {
  applyProposalInput, discardProposalInput, generateProposalInput, updateWorkingProposalInput,
} from "./ai-requirement-contracts.js";
import { AiRequirementService, type AiClock } from "./ai-requirement-service.js";
import {
  DisabledRequirementStructuringProvider, type RequirementStructuringProvider,
} from "./ai-requirement-provider.js";
import { assertBrowserMutation } from "./security.js";
import { objectId } from "./validation.js";

const projectParams = z.object({ projectId: objectId }).strict();
const proposalParams = z.object({ projectId: objectId, proposalId: objectId }).strict();

export function createAiRequirementRouter(
  provider: RequirementStructuringProvider = new DisabledRequirementStructuringProvider(),
  clock?: AiClock,
): Router {
  const router = Router();
  const service = new AiRequirementService(provider, clock);
  const base = "/projects/:projectId/ai/requirement-proposals";

  router.get(base, validateRequest("params", projectParams), asyncRoute(async (request, response) => {
    const { user } = requireVerified(request);
    response.json(await service.list(String(request.params.projectId), user));
  }));
  router.post(base, validateRequest("params", projectParams), validateRequest("body", generateProposalInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request);
    response.status(201).json({ proposal: await service.generate(String(request.params.projectId), user, request.body.source, () => !request.aborted) });
  }));
  router.get(`${base}/:proposalId`, validateRequest("params", proposalParams), asyncRoute(async (request, response) => {
    const { user } = requireVerified(request);
    response.json({ proposal: await service.get(String(request.params.projectId), String(request.params.proposalId), user) });
  }));
  router.put(`${base}/:proposalId`, validateRequest("params", proposalParams), validateRequest("body", updateWorkingProposalInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request);
    response.json({ proposal: await service.update(String(request.params.projectId), String(request.params.proposalId), user, request.body) });
  }));
  router.post(`${base}/:proposalId/discard`, validateRequest("params", proposalParams), validateRequest("body", discardProposalInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request);
    response.json({ proposal: await service.discard(String(request.params.projectId), String(request.params.proposalId), user, request.body.expectedProposalRevision) });
  }));
  router.post(`${base}/:proposalId/apply`, validateRequest("params", proposalParams), validateRequest("body", applyProposalInput), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request);
    response.json({ proposal: await service.apply(String(request.params.projectId), String(request.params.proposalId), user, request.body) });
  }));
  router.get(`${base}/:proposalId/provenance`, validateRequest("params", proposalParams), asyncRoute(async (request, response) => {
    const { user } = requireVerified(request);
    response.json({ provenance: await service.provenance(String(request.params.projectId), String(request.params.proposalId), user) });
  }));
  return router;
}
