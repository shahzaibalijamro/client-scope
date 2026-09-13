/* eslint-disable @typescript-eslint/no-explicit-any -- private persistence records are reduced through explicit provider-only projections. */
import { randomBytes } from "node:crypto";

import mongoose, { type ClientSession } from "mongoose";

import { ApiError } from "../errors.js";
import { admitAiRequirementRequest, releaseAiRequirementRequest } from "./ai-requirement-limits.js";
import {
  AI_REVIEW_INPUT_MAX_BYTES, AI_REVIEW_LEASE_MS, AI_REVIEW_PROMPT_VERSION, AI_REVIEW_RESPONSE_MAX_BYTES, AI_REVIEW_TTL_MS,
  applyReviewInput, canonicalReviewInputSchema, canonicalizeRequirementDraft, requirementQualityReviewOutputSchema,
  reviewPatchSchema, type ApplyReviewInput, type ReviewPatch, type UpdateWorkingReviewInput, updateWorkingReviewInput,
  validateGroundedReview,
} from "./ai-requirement-review-contracts.js";
import { AiRequirementReview } from "./ai-requirement-review-models.js";
import type { RequirementQualityReviewProvider } from "./ai-requirement-review-provider.js";
import { AiProviderError } from "./ai-requirement-provider.js";
import { draftContentInput } from "./scope-contracts.js";
import { ScopeDraft } from "./scope-models.js";
import { assertProjectContentMutable, assertProvider, projectContext, type Actor } from "./scope-service.js";

export type AiReviewClock = () => Date;
const systemClock: AiReviewClock = () => new Date();
const opaqueToken = () => randomBytes(32).toString("base64url");
const notFound = () => new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
const unavailable = () => new ApiError(410, "AI_REVIEW_UNAVAILABLE", "This quality review is no longer available.");
const staleReview = () => new ApiError(409, "AI_REVIEW_STALE", "The quality review changed. Refresh and try again.");
const staleDraft = () => new ApiError(409, "AI_DRAFT_STALE", "The requirement draft changed. This review remains readable but cannot be edited or applied.");

async function transact<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => { result = await work(session); });
    return result as T;
  } finally { await session.endSession(); }
}

function actorView(actor: any) { return { id: String(actor.id), displayName: actor.displayName }; }
function cleanPatch(value: any): ReviewPatch {
  return {
    findingKey: value.findingKey, targetRequirementId: value.targetRequirementId, kind: value.kind,
    expectedValue: Array.isArray(value.expectedValue) ? [...value.expectedValue] : value.expectedValue,
    proposedValue: Array.isArray(value.proposedValue) ? [...value.proposedValue] : value.proposedValue,
  } as ReviewPatch;
}
function cleanOriginal(value: any) {
  return {
    findings: value.findings.map((item: any) => ({
      key: item.key, category: item.category, explanation: item.explanation, primaryRequirementId: item.primaryRequirementId,
      ...(item.relatedRequirementIds?.length ? { relatedRequirementIds: [...item.relatedRequirementIds] } : {}),
    })),
    suggestions: value.suggestions.map((item: any) => ({ key: item.key, rationale: item.rationale, patch: cleanPatch(item.patch) })),
    clarificationQuestions: value.clarificationQuestions.map((item: any) => ({ findingKey: item.findingKey, requirementIds: [...item.requirementIds], question: item.question })),
  };
}
function parseCanonical(review: any) { return canonicalReviewInputSchema.parse(JSON.parse(review.canonicalInput)); }

async function currentFreshness(review: any): Promise<"fresh" | "stale"> {
  if (review.freshnessBecameStaleAt) return "stale";
  const draft = await ScopeDraft.findOne({ _id: review.draftId, projectId: review.projectId }).select("revisionToken").lean();
  if (draft?.revisionToken === review.baseDraftRevision) return "fresh";
  const now = new Date();
  await AiRequirementReview.updateOne(
    { _id: review._id, freshnessBecameStaleAt: { $exists: false } },
    { $set: { freshnessBecameStaleAt: now }, $unset: { activeBindingKey: 1 } },
  );
  review.freshnessBecameStaleAt = now;
  return "stale";
}

function detailView(review: any, freshness: "fresh" | "stale") {
  const original = cleanOriginal(review.original);
  const workingByKey = new Map((review.workingSuggestions ?? []).map((item: any) => [item.key, item]));
  const mutable = review.state === "pending-review" && freshness === "fresh";
  return {
    id: String(review._id), state: review.state, freshness,
    binding: { projectId: String(review.projectId), draftId: String(review.draftId), baseDraftRevision: review.baseDraftRevision },
    reviewRevision: review.reviewRevision, createdAt: review.createdAt.toISOString(),
    ...(review.generatedAt ? { generatedAt: review.generatedAt.toISOString() } : {}),
    ...(review.expiresAt ? { expiresAt: review.expiresAt.toISOString() } : {}),
    initiatedBy: actorView(review.initiatedBy), boundDraft: parseCanonical(review), original,
    ...(review.state === "pending-review" ? { workingSuggestions: original.suggestions.map((suggestion: any) => {
      const working: any = workingByKey.get(suggestion.key);
      return { ...suggestion, selected: Boolean(working?.selected), patch: { ...suggestion.patch, proposedValue: Array.isArray(working?.proposedValue) ? [...working.proposedValue] : working?.proposedValue } };
    }) } : {}),
    ...(review.finalSelectedPatches?.length ? { finalSelectedPatches: review.finalSelectedPatches.map(cleanPatch) } : {}),
    ...(review.appliedAt ? { appliedAt: review.appliedAt.toISOString(), appliedBy: actorView(review.appliedBy), appliedDraftRevision: review.appliedDraftRevision } : {}),
    actions: { canEdit: mutable, canDiscard: review.state === "pending-review", canApply: mutable && (review.workingSuggestions ?? []).some((item: any) => item.selected) },
  };
}

function summaryView(review: any, freshness: "fresh" | "stale") {
  return {
    id: String(review._id), state: review.state, freshness, createdAt: review.createdAt.toISOString(),
    ...(review.generatedAt ? { generatedAt: review.generatedAt.toISOString() } : {}),
    ...(review.expiresAt ? { expiresAt: review.expiresAt.toISOString() } : {}),
    ...(review.appliedAt ? { appliedAt: review.appliedAt.toISOString() } : {}),
    initiatedBy: actorView(review.initiatedBy),
    counts: { findings: review.original?.findings.length ?? 0, suggestions: review.original?.suggestions.length ?? review.finalSelectedPatches?.length ?? 0, clarificationQuestions: review.original?.clarificationQuestions.length ?? 0 },
  };
}

async function cleanup(projectId: string, now: Date): Promise<void> {
  await Promise.all([
    AiRequirementReview.deleteMany({ projectId, state: "generating", generationLeaseUntil: { $lte: now } }),
    AiRequirementReview.updateMany(
      { projectId, state: "pending-review", expiresAt: { $lte: now } },
      { $set: { state: "expired", expiredAt: now }, $unset: { activeBindingKey: 1, canonicalInput: 1, original: 1, workingSuggestions: 1, operationId: 1, promptVersion: 1, providerId: 1, modelId: 1, execution: 1 } },
    ),
  ]);
}

function providerFailure(error: unknown): ApiError {
  const category = error instanceof AiProviderError ? error.category : "transport";
  if (category === "disabled" || category === "configuration") return new ApiError(503, "AI_UNAVAILABLE", "AI quality review is unavailable. Manual requirement editing remains available.");
  if (category === "timeout") return new ApiError(504, "AI_TIMEOUT", "AI quality review timed out. The draft was not changed; try again deliberately.");
  if (category === "quota" || category === "rate") return new ApiError(429, "AI_PROVIDER_LIMITED", "AI quality review is temporarily limited. The draft was not changed; try again later.");
  if (category === "blocked") return new ApiError(422, "AI_RESPONSE_BLOCKED", "The draft could not be reviewed. Continue with manual editing or try again deliberately.");
  if (category === "malformed" || category === "oversized" || category === "semantic") return new ApiError(502, "AI_RESPONSE_INVALID", "AI returned an unusable review. The draft was not changed; try again deliberately.");
  return new ApiError(503, "AI_UNAVAILABLE", "AI quality review is temporarily unavailable. Manual requirement editing remains available.");
}

function activeKey(projectId: string, draftId: unknown, revision: string) { return `${projectId}:${String(draftId)}:${revision}`; }

export class AiRequirementReviewService {
  constructor(private readonly provider: RequirementQualityReviewProvider, private readonly clock: AiReviewClock = systemClock) {}

  async list(projectId: string, actor: Actor) {
    const now = this.clock();
    const { project, role } = await projectContext(projectId, actor._id); assertProvider(role);
    await cleanup(projectId, now);
    const mutable = !project.lifecycleState || project.lifecycleState === "active";
    const draft = mutable ? await ScopeDraft.exists({ projectId }) : null;
    const visibleStates: Array<"generating" | "pending-review" | "applied"> = mutable && draft ? ["generating", "pending-review", "applied"] : ["applied"];
    const records = await AiRequirementReview.find({ projectId, state: { $in: visibleStates } }).sort({ createdAt: -1 });
    const runs = await Promise.all(records.map(async (record) => summaryView(record, record.state === "applied" ? "stale" : await currentFreshness(record))));
    return { availability: { enabled: this.provider.available && mutable && Boolean(draft) }, runs };
  }

  async generate(projectId: string, actor: Actor, input: { expectedDraftId: string; expectedDraftRevision: string }, requestActive: () => boolean = () => true) {
    const now = this.clock();
    const { project, role } = await projectContext(projectId, actor._id); assertProvider(role); assertProjectContentMutable(project);
    const draft = await ScopeDraft.findOne({ _id: input.expectedDraftId, projectId, revisionToken: input.expectedDraftRevision }).lean();
    if (!draft) throw staleDraft();
    if (!draft.requirements.length) throw new ApiError(409, "AI_REVIEW_DRAFT_REQUIRED", "Add and save at least one requirement before requesting a quality review.");
    const initialCanonical = canonicalizeRequirementDraft(draft);
    if (initialCanonical.byteLength > AI_REVIEW_INPUT_MAX_BYTES) throw new ApiError(413, "AI_REVIEW_INPUT_TOO_LARGE", "This draft is too large for AI quality review. Manual editing remains available.", { maximumBytes: AI_REVIEW_INPUT_MAX_BYTES, actualBytes: initialCanonical.byteLength });
    if (!this.provider.available) throw providerFailure(new AiProviderError("disabled"));
    await cleanup(projectId, now);
    const bindingKey = activeKey(projectId, draft._id, draft.revisionToken);
    let reservation: InstanceType<typeof AiRequirementReview>;
    let canonical = initialCanonical;
    try {
      reservation = await transact(async (session) => {
        const locked = await projectContext(projectId, actor._id, session, true); assertProvider(locked.role); assertProjectContentMutable(locked.project);
        const currentDraft = await ScopeDraft.findOne({ _id: input.expectedDraftId, projectId, revisionToken: input.expectedDraftRevision }).session(session).lean();
        if (!currentDraft) throw staleDraft();
        canonical = canonicalizeRequirementDraft(currentDraft);
        if (canonical.byteLength > AI_REVIEW_INPUT_MAX_BYTES) throw new ApiError(413, "AI_REVIEW_INPUT_TOO_LARGE", "This draft is too large for AI quality review. Manual editing remains available.", { maximumBytes: AI_REVIEW_INPUT_MAX_BYTES, actualBytes: canonical.byteLength });
        const created = new AiRequirementReview({
          workspaceId: locked.project.workspaceId, projectId: locked.project._id, draftId: currentDraft._id, baseDraftRevision: currentDraft.revisionToken,
          activeBindingKey: bindingKey, state: "generating", generationLeaseUntil: new Date(now.getTime() + AI_REVIEW_LEASE_MS),
          reviewRevision: opaqueToken(), canonicalInput: canonical.serialized, initiatedBy: { id: actor._id, displayName: actor.displayName },
        });
        await created.save({ session });
        return created;
      });
    } catch (error) {
      if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) throw new ApiError(409, "AI_REVIEW_ACTIVE", "A quality review is already active for this saved draft.");
      throw error;
    }
    let admissionId: string | undefined;
    try {
      admissionId = await admitAiRequirementRequest(actor._id, now);
      const result = await this.provider.review(canonical.value);
      if (!requestActive()) throw new AiProviderError("transport");
      if (Buffer.byteLength(JSON.stringify(result.output), "utf8") > AI_REVIEW_RESPONSE_MAX_BYTES) throw new AiProviderError("oversized");
      const parsed = requirementQualityReviewOutputSchema.safeParse(result.output);
      if (!parsed.success) throw new AiProviderError("semantic");
      try { validateGroundedReview(parsed.data, canonical.value); } catch { throw new AiProviderError("semantic"); }
      const generatedAt = this.clock();
      const updated = await AiRequirementReview.findOneAndUpdate(
        { _id: reservation._id, state: "generating", reviewRevision: reservation.reviewRevision },
        { $set: {
          state: "pending-review", original: parsed.data,
          workingSuggestions: parsed.data.suggestions.map((item) => ({ key: item.key, selected: true, proposedValue: item.patch.proposedValue })),
          generatedAt, expiresAt: new Date(generatedAt.getTime() + AI_REVIEW_TTL_MS), operationId: result.operationId,
          promptVersion: AI_REVIEW_PROMPT_VERSION, providerId: result.providerId, modelId: result.modelId, execution: { durationMs: result.durationMs },
        }, $unset: { generationLeaseUntil: 1 } }, { returnDocument: "after" },
      );
      if (!updated) throw new AiProviderError("transport");
      const freshness = await currentFreshness(updated);
      return detailView(updated, freshness);
    } catch (error) {
      await AiRequirementReview.deleteOne({ _id: reservation._id, state: "generating" }).catch(() => undefined);
      if (error instanceof ApiError) throw error;
      throw providerFailure(error);
    } finally {
      if (admissionId) await releaseAiRequirementRequest(actor._id, admissionId).catch(() => undefined);
    }
  }

  async get(projectId: string, reviewId: string, actor: Actor) {
    const now = this.clock();
    const { project, role } = await projectContext(projectId, actor._id); assertProvider(role);
    await cleanup(projectId, now);
    const review = await AiRequirementReview.findOne({ _id: reviewId, projectId });
    if (!review) throw notFound();
    if (review.state === "discarded" || review.state === "expired" || review.state === "generating") throw unavailable();
    if (review.state === "pending-review") {
      if (project.lifecycleState && project.lifecycleState !== "active") throw notFound();
      if (!await ScopeDraft.exists({ projectId })) throw notFound();
    }
    return detailView(review, review.state === "applied" ? "stale" : await currentFreshness(review));
  }

  async update(projectId: string, reviewId: string, actor: Actor, unknownInput: UpdateWorkingReviewInput) {
    const input = updateWorkingReviewInput.parse(unknownInput);
    const now = this.clock();
    const initial = await projectContext(projectId, actor._id); assertProvider(initial.role); assertProjectContentMutable(initial.project);
    await cleanup(projectId, now);
    return transact(async (session) => {
      const { project, role } = await projectContext(projectId, actor._id, session, true); assertProvider(role); assertProjectContentMutable(project);
      const review = await AiRequirementReview.findOne({ _id: reviewId, projectId, state: "pending-review" }).session(session);
      if (!review) throw unavailable();
      if (!review.expiresAt || review.expiresAt <= now) throw unavailable();
      if (review.reviewRevision !== input.expectedReviewRevision) throw staleReview();
      const draft = await ScopeDraft.findOne({ _id: review.draftId, projectId, revisionToken: review.baseDraftRevision }).session(session);
      if (!draft) throw staleDraft();
      const original = cleanOriginal(review.original);
      const byKey = new Map(input.suggestions.map((item) => [item.key, item]));
      if (byKey.size !== original.suggestions.length || original.suggestions.some((item: any) => !byKey.has(item.key))) {
        throw new ApiError(400, "VALIDATION_ERROR", "Working suggestions cannot be added, removed, or retargeted.");
      }
      const working = original.suggestions.map((suggestion: any) => {
        const item = byKey.get(suggestion.key)!;
        const candidate = reviewPatchSchema.safeParse({ ...suggestion.patch, proposedValue: item.proposedValue });
        if (!candidate.success) throw new ApiError(400, "VALIDATION_ERROR", "A proposed value is invalid.", { fields: candidate.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) });
        return { key: suggestion.key, selected: item.selected, proposedValue: item.proposedValue };
      });
      const nextRevision = opaqueToken();
      const updated = await AiRequirementReview.findOneAndUpdate(
        { _id: review._id, state: "pending-review", reviewRevision: input.expectedReviewRevision },
        { $set: { workingSuggestions: working, reviewRevision: nextRevision } }, { returnDocument: "after", session },
      );
      if (!updated) throw staleReview();
      return detailView(updated, "fresh");
    });
  }

  async discard(projectId: string, reviewId: string, actor: Actor, expectedReviewRevision: string) {
    const now = this.clock();
    const { project, role } = await projectContext(projectId, actor._id); assertProvider(role); assertProjectContentMutable(project);
    await cleanup(projectId, now);
    const review = await AiRequirementReview.findOne({ _id: reviewId, projectId });
    if (!review) throw notFound();
    if (review.state === "discarded") return { id: String(review._id), state: "discarded" as const };
    if (review.state !== "pending-review" && review.state !== "generating") throw unavailable();
    if (review.reviewRevision !== expectedReviewRevision) throw staleReview();
    const changed = await AiRequirementReview.findOneAndUpdate(
      { _id: review._id, state: review.state, reviewRevision: expectedReviewRevision },
      { $set: { state: "discarded", discardedAt: now }, $unset: { activeBindingKey: 1, generationLeaseUntil: 1, canonicalInput: 1, original: 1, workingSuggestions: 1, operationId: 1, promptVersion: 1, providerId: 1, modelId: 1, execution: 1 } },
      { returnDocument: "after" },
    );
    if (!changed) throw staleReview();
    return { id: String(changed._id), state: "discarded" as const };
  }

  async apply(projectId: string, reviewId: string, actor: Actor, unknownInput: ApplyReviewInput) {
    const input = applyReviewInput.parse(unknownInput);
    const now = this.clock();
    const initial = await projectContext(projectId, actor._id); assertProvider(initial.role); assertProjectContentMutable(initial.project);
    await cleanup(projectId, now);
    const prior = await AiRequirementReview.findOne({ _id: reviewId, projectId });
    if (!prior) throw notFound();
    if (prior.state === "applied") return { id: String(prior._id), state: "applied" as const, appliedAt: prior.appliedAt!.toISOString(), draft: { revisionToken: prior.appliedDraftRevision } };
    if (prior.state !== "pending-review") throw unavailable();
    return transact(async (session) => {
      const { project, role } = await projectContext(projectId, actor._id, session, true); assertProvider(role); assertProjectContentMutable(project);
      const review = await AiRequirementReview.findOne({ _id: reviewId, projectId, state: "pending-review" }).session(session);
      if (!review) throw staleReview();
      if (!review.expiresAt || review.expiresAt <= now) throw unavailable();
      if (review.reviewRevision !== input.expectedReviewRevision) throw staleReview();
      if (review.baseDraftRevision !== input.expectedDraftRevision) throw staleDraft();
      const draft = await ScopeDraft.findOne({ _id: review.draftId, projectId, revisionToken: input.expectedDraftRevision }).session(session);
      if (!draft) throw staleDraft();
      const canonical = parseCanonical(review);
      const original = cleanOriginal(review.original);
      validateGroundedReview(requirementQualityReviewOutputSchema.parse(original), canonical);
      const workingByKey = new Map((review.workingSuggestions ?? []).map((item: any) => [item.key, item]));
      const selected = original.suggestions.filter((suggestion: any) => workingByKey.get(suggestion.key)?.selected).map((suggestion: any) => {
        const proposedValue = workingByKey.get(suggestion.key)!.proposedValue;
        const parsed = reviewPatchSchema.safeParse({ ...suggestion.patch, proposedValue });
        if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "A selected suggestion is invalid.");
        return parsed.data;
      });
      if (!selected.length) throw new ApiError(400, "AI_REVIEW_SELECTION_REQUIRED", "Select at least one applyable suggestion.");
      const targets = new Map(draft.requirements.map((item) => [String(item.logicalId), item]));
      const replacements = new Set<string>();
      const criteriaModes = new Map<string, "replace" | "append">();
      for (const patch of selected) {
        const target = targets.get(patch.targetRequirementId);
        if (!target) throw staleDraft();
        const current = patch.kind === "replace-title" ? target.title : patch.kind === "replace-description" ? target.description : [...target.acceptanceCriteria];
        if (JSON.stringify(current) !== JSON.stringify(patch.expectedValue)) throw staleDraft();
        if (patch.kind === "replace-title" || patch.kind === "replace-description") {
          const fieldKey = `${patch.targetRequirementId}:${patch.kind}`;
          if (replacements.has(fieldKey)) throw new ApiError(409, "AI_REVIEW_PATCH_CONFLICT", "Selected suggestions overlap and cannot be applied together.");
          replacements.add(fieldKey);
        } else {
          const nextMode = patch.kind === "replace-acceptance-criteria" ? "replace" : "append";
          const currentMode = criteriaModes.get(patch.targetRequirementId);
          if (currentMode === "replace" || (currentMode === "append" && nextMode === "replace")) throw new ApiError(409, "AI_REVIEW_PATCH_CONFLICT", "Selected acceptance-criteria suggestions conflict.");
          criteriaModes.set(patch.targetRequirementId, nextMode);
        }
      }
      const candidateRequirements = draft.requirements.map((item) => ({
        logicalId: String(item.logicalId), ...(item.groupId ? { groupId: String(item.groupId) } : {}), title: item.title,
        description: item.description, acceptanceCriteria: [...item.acceptanceCriteria], order: item.order,
      }));
      const candidateById = new Map(candidateRequirements.map((item) => [item.logicalId, item]));
      for (const patch of selected) {
        const item = candidateById.get(patch.targetRequirementId)!;
        if (patch.kind === "replace-title") item.title = patch.proposedValue;
        else if (patch.kind === "replace-description") item.description = patch.proposedValue;
        else if (patch.kind === "replace-acceptance-criteria") item.acceptanceCriteria = [...patch.proposedValue];
        else item.acceptanceCriteria.push(...patch.proposedValue);
      }
      const complete = draftContentInput.safeParse({
        revisionToken: draft.revisionToken,
        groups: draft.groups.map((group) => ({ id: String(group.id), name: group.name, order: group.order })),
        requirements: candidateRequirements,
      });
      if (!complete.success) throw new ApiError(400, "VALIDATION_ERROR", "The selected changes would make the draft invalid.", { fields: complete.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) });
      const nextDraftRevision = opaqueToken();
      const updatedDraft = await ScopeDraft.findOneAndUpdate(
        { _id: draft._id, projectId, revisionToken: input.expectedDraftRevision },
        { $set: { requirements: candidateRequirements.map((item) => ({ ...item, logicalId: new mongoose.Types.ObjectId(item.logicalId), ...(item.groupId ? { groupId: new mongoose.Types.ObjectId(item.groupId) } : {}) })), revisionToken: nextDraftRevision } },
        { returnDocument: "after", session },
      );
      if (!updatedDraft) throw staleDraft();
      const applied = await AiRequirementReview.findOneAndUpdate(
        { _id: review._id, state: "pending-review", reviewRevision: input.expectedReviewRevision },
        { $set: { state: "applied", finalSelectedPatches: selected, appliedBy: { id: actor._id, displayName: actor.displayName }, appliedAt: now, appliedDraftRevision: nextDraftRevision }, $unset: { activeBindingKey: 1, workingSuggestions: 1 } },
        { returnDocument: "after", session },
      );
      if (!applied) throw staleReview();
      return { id: String(applied._id), state: "applied" as const, appliedAt: applied.appliedAt!.toISOString(), draft: { revisionToken: nextDraftRevision } };
    });
  }

  async provenance(projectId: string, reviewId: string, actor: Actor) {
    const { role } = await projectContext(projectId, actor._id); assertProvider(role);
    const review = await AiRequirementReview.findOne({ _id: reviewId, projectId, state: "applied" });
    if (!review) throw notFound();
    return {
      id: String(review._id), state: "applied" as const,
      binding: { projectId: String(review.projectId), draftId: String(review.draftId), baseDraftRevision: review.baseDraftRevision },
      canonicalInput: parseCanonical(review), original: cleanOriginal(review.original), finalSelectedPatches: review.finalSelectedPatches!.map(cleanPatch),
      initiatedBy: actorView(review.initiatedBy), appliedBy: actorView(review.appliedBy), generatedAt: review.generatedAt!.toISOString(), appliedAt: review.appliedAt!.toISOString(),
      promptVersion: review.promptVersion, operationId: review.operationId, provider: { id: review.providerId, model: review.modelId }, execution: { durationMs: review.execution!.durationMs },
    };
  }
}
