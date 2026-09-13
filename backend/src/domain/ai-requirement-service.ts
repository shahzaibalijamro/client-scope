/* eslint-disable @typescript-eslint/no-explicit-any -- private persistence records are exposed only through explicit allow-list projections. */
import { randomBytes, randomUUID } from "node:crypto";

import mongoose, { type ClientSession } from "mongoose";

import { ApiError } from "../errors.js";
import {
  AI_GENERATION_LIMIT, AI_GENERATION_WINDOW_MS, AI_PROMPT_VERSION, AI_PROPOSAL_TTL_MS,
  AI_RESPONSE_MAX_BYTES, generatedProposalSchema, workingProposalSchema,
  type ApplyProposalInput, type GeneratedProposal, type UpdateWorkingProposalInput, type WorkingProposal,
} from "./ai-requirement-contracts.js";
import { AiGenerationLedger, AiRequirementProposal } from "./ai-requirement-models.js";
import {
  AiProviderError, type RequirementStructuringProvider,
} from "./ai-requirement-provider.js";
import { ScopeDraft } from "./scope-models.js";
import {
  assertProjectContentMutable, assertProvider, projectContext, type Actor,
} from "./scope-service.js";

export type AiClock = () => Date;
const systemClock: AiClock = () => new Date();
const opaqueToken = () => randomBytes(32).toString("base64url");
const notFound = () => new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
const unavailable = () => new ApiError(410, "AI_PROPOSAL_UNAVAILABLE", "This AI proposal is no longer available.");
const staleProposal = () => new ApiError(409, "AI_PROPOSAL_STALE", "The proposal changed. Refresh and try again.");
const staleDraft = () => new ApiError(409, "AI_DRAFT_STALE", "The requirement draft changed. Review or discard this proposal; it cannot be applied.");

async function transact<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => { result = await work(session); });
    return result as T;
  } finally { await session.endSession(); }
}

function cleanGenerated(value: any): GeneratedProposal {
  return {
    groups: value.groups.map((group: any) => ({ key: group.key, name: group.name })),
    requirements: value.requirements.map((item: any) => ({
      key: item.key, ...(item.groupKey ? { groupKey: item.groupKey } : {}), title: item.title,
      description: item.description, acceptanceCriteria: [...item.acceptanceCriteria],
    })),
    warnings: value.warnings.map((warning: any) => ({
      category: warning.category, message: warning.message, ...(warning.targetKey ? { targetKey: warning.targetKey } : {}),
    })),
  };
}

function cleanWorking(value: any): WorkingProposal {
  return {
    groups: value.groups.map((group: any) => ({ key: group.key, name: group.name })),
    requirements: value.requirements.map((item: any) => ({
      key: item.key, ...(item.groupKey ? { groupKey: item.groupKey } : {}), title: item.title,
      description: item.description, acceptanceCriteria: [...item.acceptanceCriteria], selected: item.selected,
    })),
  };
}

function actorView(actor: any) { return { id: String(actor.id), displayName: actor.displayName }; }

function actions(state: string, mutable: boolean) {
  return {
    canEdit: state === "pending" && mutable,
    canDiscard: state === "pending",
    canApply: state === "pending" && mutable,
  };
}

function pendingView(proposal: any, mutable: boolean) {
  return {
    id: String(proposal._id), state: "pending" as const,
    binding: { projectId: String(proposal.projectId), draftId: String(proposal.draftId), baseDraftRevision: proposal.baseDraftRevision },
    proposalRevision: proposal.proposalRevision, expiresAt: proposal.expiresAt.toISOString(), createdAt: proposal.createdAt.toISOString(),
    initiatedBy: actorView(proposal.initiatedBy), rawSource: proposal.rawSource,
    original: cleanGenerated(proposal.original), working: cleanWorking(proposal.working),
    warnings: cleanGenerated(proposal.original).warnings, actions: actions("pending", mutable),
  };
}

function appliedResultView(proposal: any) {
  return {
    id: String(proposal._id), state: "applied" as const, appliedAt: proposal.appliedAt.toISOString(),
    draft: { revisionToken: proposal.appliedResult.draftRevision },
    appended: { groupIds: [...proposal.appliedResult.groupIds], requirementIds: [...proposal.appliedResult.requirementIds] },
  };
}

function summaryView(proposal: any) {
  return {
    id: String(proposal._id), state: proposal.state as "pending" | "applied",
    createdAt: proposal.createdAt.toISOString(), expiresAt: proposal.expiresAt.toISOString(),
    ...(proposal.appliedAt ? { appliedAt: proposal.appliedAt.toISOString() } : {}),
    initiatedBy: actorView(proposal.initiatedBy),
    counts: {
      groups: proposal.original?.groups.length ?? proposal.finalSelection?.groups.length ?? 0,
      requirements: proposal.original?.requirements.length ?? proposal.finalSelection?.requirements.length ?? 0,
      warnings: proposal.original?.warnings.length ?? 0,
    },
  };
}

function provenanceView(proposal: any) {
  return {
    id: String(proposal._id), state: "applied" as const,
    binding: { projectId: String(proposal.projectId), draftId: String(proposal.draftId), baseDraftRevision: proposal.baseDraftRevision },
    rawSource: proposal.rawSource, original: cleanGenerated(proposal.original),
    finalSelection: {
      groups: proposal.finalSelection.groups.map((group: any) => ({ key: group.key, name: group.name })),
      requirements: proposal.finalSelection.requirements.map((item: any) => ({
        key: item.key, ...(item.groupKey ? { groupKey: item.groupKey } : {}), title: item.title,
        description: item.description, acceptanceCriteria: [...item.acceptanceCriteria],
      })),
    },
    initiatedBy: actorView(proposal.initiatedBy), appliedBy: actorView(proposal.appliedBy),
    createdAt: proposal.createdAt.toISOString(), appliedAt: proposal.appliedAt.toISOString(),
    promptVersion: proposal.promptVersion, operationId: proposal.operationId,
    provider: { id: proposal.providerId, model: proposal.modelId },
    execution: { durationMs: proposal.execution.durationMs },
  };
}

async function expirePending(projectId: string, now: Date): Promise<void> {
  await AiRequirementProposal.updateMany(
    { projectId, state: "pending", expiresAt: { $lte: now } },
    {
      $set: { state: "expired", expiredAt: now },
      $unset: { rawSource: 1, original: 1, working: 1, operationId: 1, promptVersion: 1, providerId: 1, modelId: 1, execution: 1 },
    },
  );
}

async function admitGeneration(userId: mongoose.Types.ObjectId, now: Date): Promise<string> {
  const operationId = randomUUID();
  await transact(async (session) => {
    const ledger: any = await AiGenerationLedger.findOneAndUpdate(
      { userId }, { $inc: { sequence: 1 }, $setOnInsert: { admittedAt: [] } },
      { upsert: true, returnDocument: "after", session },
    );
    const cutoff = new Date(now.getTime() - AI_GENERATION_WINDOW_MS);
    const recent = ledger.admittedAt.filter((date: Date) => date > cutoff);
    if (ledger.inFlightUntil && ledger.inFlightUntil > now) {
      throw new ApiError(429, "AI_GENERATION_IN_FLIGHT", "Wait for your current AI generation request to finish before starting another.");
    }
    if (recent.length >= AI_GENERATION_LIMIT) {
      const retryAt = new Date(recent[0]!.getTime() + AI_GENERATION_WINDOW_MS);
      throw new ApiError(429, "AI_RATE_LIMITED", "The hourly AI generation limit has been reached. Try again later.", {
        retryAfterSeconds: Math.max(1, Math.ceil((retryAt.getTime() - now.getTime()) / 1_000)),
      });
    }
    ledger.admittedAt = [...recent, now];
    ledger.inFlightOperationId = operationId;
    ledger.inFlightUntil = new Date(now.getTime() + 60_000);
    await ledger.save({ session });
  });
  return operationId;
}

async function releaseGeneration(userId: mongoose.Types.ObjectId, operationId: string): Promise<void> {
  await AiGenerationLedger.updateOne({ userId, inFlightOperationId: operationId }, { $unset: { inFlightOperationId: 1, inFlightUntil: 1 } });
}

function providerFailure(error: unknown): ApiError {
  const category = error instanceof AiProviderError ? error.category : "transport";
  if (category === "disabled" || category === "configuration") return new ApiError(503, "AI_UNAVAILABLE", "AI requirement structuring is unavailable. Manual requirement editing remains available.");
  if (category === "timeout") return new ApiError(504, "AI_TIMEOUT", "AI requirement structuring timed out. Your draft was not changed; try again deliberately.");
  if (category === "quota" || category === "rate") return new ApiError(429, "AI_PROVIDER_LIMITED", "AI requirement structuring is temporarily limited. Your draft was not changed; try again later.");
  if (category === "blocked") return new ApiError(422, "AI_RESPONSE_BLOCKED", "The source could not be structured. Revise it or continue with manual editing.");
  if (category === "malformed" || category === "oversized" || category === "semantic") return new ApiError(502, "AI_RESPONSE_INVALID", "AI returned an unusable response. Your draft was not changed; try again deliberately.");
  return new ApiError(503, "AI_UNAVAILABLE", "AI requirement structuring is temporarily unavailable. Manual requirement editing remains available.");
}

export class AiRequirementService {
  constructor(private readonly provider: RequirementStructuringProvider, private readonly clock: AiClock = systemClock) {}

  async list(projectId: string, actor: Actor) {
    const now = this.clock();
    const { project, role } = await projectContext(projectId, actor._id); assertProvider(role);
    await expirePending(projectId, now);
    const runs = await AiRequirementProposal.find({ projectId, state: { $in: ["pending", "applied"] } }).sort({ createdAt: -1 }).lean();
    return { availability: { enabled: this.provider.available && (!project.lifecycleState || project.lifecycleState === "active") }, runs: runs.map(summaryView) };
  }

  async generate(projectId: string, actor: Actor, source: string, requestActive: () => boolean = () => true) {
    const now = this.clock();
    const { project, role } = await projectContext(projectId, actor._id); assertProvider(role); assertProjectContentMutable(project);
    const draft = await ScopeDraft.findOne({ projectId }).lean();
    if (!draft) throw new ApiError(409, "AI_DRAFT_REQUIRED", "Start an editable requirement draft before using AI structuring.");
    const capacity = { groups: Math.min(10, Math.max(0, 50 - draft.groups.length)), requirements: Math.min(25, Math.max(0, 200 - draft.requirements.length)) };
    if (capacity.requirements === 0) throw new ApiError(409, "AI_DRAFT_CAPACITY", "The requirement draft has no remaining requirement capacity.");
    if (!this.provider.available) throw providerFailure(new AiProviderError("disabled"));
    const admissionId = await admitGeneration(actor._id, now);
    try {
      const result = await this.provider.generate(source, capacity);
      if (Buffer.byteLength(JSON.stringify(result.output), "utf8") > AI_RESPONSE_MAX_BYTES) throw new AiProviderError("oversized");
      const parsed = generatedProposalSchema.safeParse(result.output);
      if (!parsed.success || parsed.data.groups.length > capacity.groups || parsed.data.requirements.length > capacity.requirements) throw new AiProviderError("semantic");
      if (!requestActive()) throw new AiProviderError("transport");
      const proposal = await AiRequirementProposal.create({
        workspaceId: project.workspaceId, projectId: project._id, draftId: draft._id, baseDraftRevision: draft.revisionToken,
        state: "pending", expiresAt: new Date(now.getTime() + AI_PROPOSAL_TTL_MS), proposalRevision: opaqueToken(),
        initiatedBy: { id: actor._id, displayName: actor.displayName }, rawSource: source,
        original: parsed.data, working: { groups: parsed.data.groups, requirements: parsed.data.requirements.map((item) => ({ ...item, selected: true })) },
        operationId: result.operationId, promptVersion: AI_PROMPT_VERSION, providerId: result.providerId, modelId: result.modelId,
        execution: { durationMs: result.durationMs },
      });
      return pendingView(proposal, true);
    } catch (error) { throw providerFailure(error); }
    finally { await releaseGeneration(actor._id, admissionId).catch(() => undefined); }
  }

  async get(projectId: string, proposalId: string, actor: Actor) {
    const now = this.clock();
    const { project, role } = await projectContext(projectId, actor._id); assertProvider(role);
    await expirePending(projectId, now);
    const proposal = await AiRequirementProposal.findOne({ _id: proposalId, projectId });
    if (!proposal) throw notFound();
    if (proposal.state !== "pending") {
      if (proposal.state === "applied") return appliedResultView(proposal);
      throw unavailable();
    }
    const draft = await ScopeDraft.findOne({ _id: proposal.draftId, projectId }).select("revisionToken").lean();
    const mutable = (!project.lifecycleState || project.lifecycleState === "active") && Boolean(draft && draft.revisionToken === proposal.baseDraftRevision);
    return pendingView(proposal, mutable);
  }

  async update(projectId: string, proposalId: string, actor: Actor, input: UpdateWorkingProposalInput) {
    const now = this.clock();
    const current = await projectContext(projectId, actor._id); assertProvider(current.role);
    await expirePending(projectId, now);
    return transact(async (session) => {
      const { project, role } = await projectContext(projectId, actor._id, session, true); assertProvider(role); assertProjectContentMutable(project);
      const proposal = await AiRequirementProposal.findOne({ _id: proposalId, projectId }).session(session);
      if (!proposal) throw notFound();
      if (proposal.state !== "pending" || proposal.expiresAt <= now) throw unavailable();
      if (proposal.proposalRevision !== input.expectedProposalRevision) throw staleProposal();
      const draft = await ScopeDraft.findOne({ _id: proposal.draftId, projectId, revisionToken: proposal.baseDraftRevision }).session(session);
      if (!draft) throw staleDraft();
      const parsed = workingProposalSchema.parse(input.working);
      const originalRequirementKeys = proposal.original!.requirements.map((item) => item.key).sort();
      const nextRequirementKeys = parsed.requirements.map((item) => item.key).sort();
      const originalGroupKeys = new Set(proposal.original!.groups.map((item) => item.key));
      if (JSON.stringify(originalRequirementKeys) !== JSON.stringify(nextRequirementKeys) || parsed.groups.some((group) => !originalGroupKeys.has(group.key))) {
        throw new ApiError(400, "VALIDATION_ERROR", "Proposal groups and requirements cannot be added or replaced in staging.");
      }
      const nextRevision = opaqueToken();
      const updated = await AiRequirementProposal.findOneAndUpdate(
        { _id: proposal._id, state: "pending", proposalRevision: input.expectedProposalRevision },
        { $set: { working: parsed, proposalRevision: nextRevision } }, { returnDocument: "after", session },
      );
      if (!updated) throw staleProposal();
      return pendingView(updated, true);
    });
  }

  async discard(projectId: string, proposalId: string, actor: Actor, expectedProposalRevision: string) {
    const now = this.clock();
    const { role } = await projectContext(projectId, actor._id); assertProvider(role);
    const proposal = await AiRequirementProposal.findOne({ _id: proposalId, projectId });
    if (!proposal) throw notFound();
    if (proposal.state === "discarded" || proposal.state === "expired") return { id: String(proposal._id), state: proposal.state };
    if (proposal.state === "applied") return appliedResultView(proposal);
    if (proposal.expiresAt <= now) { await expirePending(projectId, now); throw unavailable(); }
    if (proposal.proposalRevision !== expectedProposalRevision) throw staleProposal();
    const changed = await AiRequirementProposal.findOneAndUpdate(
      { _id: proposal._id, state: "pending", proposalRevision: expectedProposalRevision },
      { $set: { state: "discarded", discardedAt: now }, $unset: { rawSource: 1, original: 1, working: 1, operationId: 1, promptVersion: 1, providerId: 1, modelId: 1, execution: 1 } },
      { returnDocument: "after" },
    );
    if (!changed) throw staleProposal();
    return { id: String(changed._id), state: "discarded" as const };
  }

  async apply(projectId: string, proposalId: string, actor: Actor, input: ApplyProposalInput) {
    const now = this.clock();
    const initial = await projectContext(projectId, actor._id); assertProvider(initial.role);
    const existing = await AiRequirementProposal.findOne({ _id: proposalId, projectId });
    if (!existing) throw notFound();
    if (existing.state === "applied") return appliedResultView(existing);
    if (existing.state !== "pending") throw unavailable();
    if (existing.expiresAt <= now) { await expirePending(projectId, now); throw unavailable(); }
    return transact(async (session) => {
      const { project, role } = await projectContext(projectId, actor._id, session, true); assertProvider(role); assertProjectContentMutable(project);
      const proposal = await AiRequirementProposal.findOne({ _id: proposalId, projectId, state: "pending" }).session(session);
      if (!proposal) throw staleProposal();
      if (proposal.proposalRevision !== input.expectedProposalRevision) throw staleProposal();
      if (proposal.baseDraftRevision !== input.expectedDraftRevision) throw staleDraft();
      const draft = await ScopeDraft.findOne({ _id: proposal.draftId, projectId, revisionToken: input.expectedDraftRevision }).session(session);
      if (!draft) throw staleDraft();
      const selectedWorking = cleanWorking(proposal.working).requirements.filter((item) => item.selected).map((item) => ({
        key: item.key, ...(item.groupKey ? { groupKey: item.groupKey } : {}), title: item.title,
        description: item.description, acceptanceCriteria: item.acceptanceCriteria,
      }));
      const usedKeys = new Set(selectedWorking.flatMap((item) => item.groupKey ? [item.groupKey] : []));
      const selectedGroups = cleanWorking(proposal.working).groups.filter((group) => usedKeys.has(group.key));
      if (JSON.stringify(input.selection) !== JSON.stringify({ groups: selectedGroups, requirements: selectedWorking })) {
        throw new ApiError(400, "VALIDATION_ERROR", "Apply the current selected working proposal exactly as reviewed.");
      }
      if (draft.groups.length + input.selection.groups.length > 50 || draft.requirements.length + input.selection.requirements.length > 200) {
        throw new ApiError(409, "AI_DRAFT_CAPACITY", "The draft no longer has room for this proposal.");
      }
      const groupMap = new Map<string, mongoose.Types.ObjectId>();
      const groups = input.selection.groups.map((group, index) => {
        const id = new mongoose.Types.ObjectId(); groupMap.set(group.key, id);
        return { id, name: group.name, order: draft.groups.length + index };
      });
      const requirements = input.selection.requirements.map((item, index) => ({
        logicalId: new mongoose.Types.ObjectId(), ...(item.groupKey ? { groupId: groupMap.get(item.groupKey)! } : {}),
        title: item.title, description: item.description, acceptanceCriteria: [...item.acceptanceCriteria],
        order: draft.requirements.length + index,
      }));
      const nextDraftRevision = opaqueToken();
      const updatedDraft = await ScopeDraft.findOneAndUpdate(
        { _id: draft._id, projectId, revisionToken: input.expectedDraftRevision },
        { $push: { groups: { $each: groups }, requirements: { $each: requirements } }, $set: { revisionToken: nextDraftRevision } },
        { returnDocument: "after", session },
      );
      if (!updatedDraft) throw staleDraft();
      const applied = await AiRequirementProposal.findOneAndUpdate(
        { _id: proposal._id, state: "pending", proposalRevision: input.expectedProposalRevision },
        { $set: {
          state: "applied", finalSelection: input.selection, appliedBy: { id: actor._id, displayName: actor.displayName }, appliedAt: now,
          appliedResult: { draftRevision: nextDraftRevision, groupIds: groups.map((group) => String(group.id)), requirementIds: requirements.map((item) => String(item.logicalId)) },
        }, $unset: { working: 1 } }, { returnDocument: "after", session },
      );
      if (!applied) throw staleProposal();
      return appliedResultView(applied);
    });
  }

  async provenance(projectId: string, proposalId: string, actor: Actor) {
    const { role } = await projectContext(projectId, actor._id); assertProvider(role);
    const proposal = await AiRequirementProposal.findOne({ _id: proposalId, projectId, state: "applied" });
    if (!proposal) throw notFound();
    return provenanceView(proposal);
  }
}
