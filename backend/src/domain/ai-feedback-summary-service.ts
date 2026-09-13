/* eslint-disable @typescript-eslint/no-explicit-any -- private records are reduced through explicit provider-only projections. */
import { randomBytes } from "node:crypto";

import mongoose, { type ClientSession } from "mongoose";

import { ApiError } from "../errors.js";
import {
  AI_FEEDBACK_INPUT_MAX_BYTES, AI_FEEDBACK_PROMPT_VERSION, AI_FEEDBACK_RESPONSE_MAX_BYTES, AI_FEEDBACK_SCHEMA_VERSION,
  canonicalizeEligibleFeedback, feedbackSummaryOutputSchema, type EligibleFeedbackRecord,
  type FeedbackSummaryOutput, validateGroundedFeedbackSummary,
} from "./ai-feedback-summary-contracts.js";
import { AiFeedbackSummary } from "./ai-feedback-summary-models.js";
import type { FeedbackSummarizationProvider } from "./ai-feedback-summary-provider.js";
import { admitAiRequirementRequest, releaseAiRequirementRequest } from "./ai-requirement-limits.js";
import { AiProviderError } from "./ai-requirement-provider.js";
import { Deliverable, DeliverableComment, DeliverableOutcome, DeliverableVersion } from "./deliverable-models.js";
import { assertProjectContentMutable, assertProvider, projectContext, type Actor } from "./scope-service.js";

export type AiFeedbackClock = () => Date;
const systemClock: AiFeedbackClock = () => new Date();
const opaqueToken = () => randomBytes(32).toString("base64url");
const notFound = () => new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
const sourcesChanged = () => new ApiError(409, "AI_FEEDBACK_SOURCES_CHANGED", "Client feedback changed while the summary was being generated. The previous summary was kept; review the latest feedback and try again.");
const replacementConflict = () => new ApiError(409, "AI_FEEDBACK_SUMMARY_CHANGED", "Another feedback summary was saved first. The complete saved result was kept; refresh before regenerating.");

type SourceRecord = EligibleFeedbackRecord & { versionNumber: number; authorName: string };

async function transact<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => { result = await work(session); });
    return result as T;
  } finally { await session.endSession(); }
}

async function eligibleSourceSet(projectId: string, deliverableId: string, session?: ClientSession) {
  const versionQuery = DeliverableVersion.find({ projectId, deliverableId }).sort({ number: 1, _id: 1 }).lean();
  if (session) versionQuery.session(session);
  const versions = await versionQuery;
  const versionById = new Map(versions.map((version) => [String(version._id), version.number]));
  const versionIds = versions.map((version) => version._id);
  const commentQuery = DeliverableComment.find({
    projectId, deliverableId, versionId: { $in: versionIds }, authorRole: { $in: ["client-participant", "client-approver"] },
  }).lean();
  const outcomeQuery = DeliverableOutcome.find({
    projectId, deliverableId, versionId: { $in: versionIds }, kind: "changes-requested", actorRole: "client-approver", note: { $type: "string", $ne: "" },
  }).lean();
  if (session) { commentQuery.session(session); outcomeQuery.session(session); }
  const [comments, outcomes] = await Promise.all([commentQuery, outcomeQuery]);
  const records: SourceRecord[] = [
    ...comments.map((comment) => ({
      feedbackRecordId: String(comment._id), versionId: String(comment.versionId), versionNumber: versionById.get(String(comment.versionId))!,
      kind: "comment" as const, text: comment.body, authorId: String(comment.authorId), authorName: comment.authorName,
      authorRole: comment.authorRole as "client-participant" | "client-approver", createdAt: comment.postedAt.toISOString(),
    })),
    ...outcomes.map((outcome) => ({
      feedbackRecordId: String(outcome._id), versionId: String(outcome.versionId), versionNumber: versionById.get(String(outcome.versionId))!,
      kind: "revision-request" as const, text: outcome.note!, authorId: String(outcome.actorId), authorName: outcome.actorName,
      authorRole: "client-approver" as const, createdAt: outcome.occurredAt.toISOString(),
    })),
  ];
  const canonical = canonicalizeEligibleFeedback(records.map((record) => ({
    feedbackRecordId: record.feedbackRecordId, versionId: record.versionId, kind: record.kind, text: record.text,
    authorId: record.authorId, authorRole: record.authorRole, createdAt: record.createdAt,
  })));
  const metadata = new Map(records.map((record) => [record.feedbackRecordId, record]));
  const sourceReferences = canonical.value.records.map((record) => {
    const source = metadata.get(record.feedbackRecordId)!;
    return {
      feedbackRecordId: record.feedbackRecordId, versionId: record.versionId, versionNumber: source.versionNumber, kind: record.kind,
      author: { id: record.authorId, displayName: source.authorName, role: record.authorRole }, createdAt: record.createdAt,
    };
  });
  return { ...canonical, sourceReferences };
}

function cleanCitations(citations: any[]) {
  return citations.map((citation) => ({ feedbackRecordId: String(citation.feedbackRecordId), versionId: String(citation.versionId) }));
}
function cleanOutput(output: any): FeedbackSummaryOutput {
  const clean = (items: any[]) => items.map((item) => ({ text: item.text, citations: cleanCitations(item.citations) }));
  return { themes: clean(output.themes), requestedActions: clean(output.requestedActions), tensions: clean(output.tensions) };
}
function sourceReferenceView(reference: any) {
  return {
    feedbackRecordId: String(reference.feedbackRecordId), versionId: String(reference.versionId), versionNumber: reference.versionNumber, kind: reference.kind,
    author: { id: String(reference.author.id), displayName: reference.author.displayName, role: reference.author.role }, createdAt: reference.createdAt.toISOString(),
  };
}
function summaryView(summary: any, currentFingerprint: string) {
  return {
    id: String(summary._id), deliverableId: String(summary.deliverableId), freshness: summary.sourceFingerprint === currentFingerprint ? "current" as const : "outdated" as const,
    generatedAt: summary.generatedAt.toISOString(), generatedBy: { id: String(summary.generatedBy.id), displayName: summary.generatedBy.displayName },
    sourceFingerprint: summary.sourceFingerprint, sourceReferences: summary.sourceReferences.map(sourceReferenceView), output: cleanOutput(summary.output),
    provenance: {
      promptVersion: summary.promptVersion, schemaVersion: summary.schemaVersion, operationId: summary.operationId,
      provider: { id: summary.providerId, model: summary.modelId }, execution: { durationMs: summary.execution.durationMs },
    },
  };
}

function providerFailure(error: unknown): ApiError {
  const category = error instanceof AiProviderError ? error.category : "transport";
  if (category === "disabled" || category === "configuration") return new ApiError(503, "AI_UNAVAILABLE", "AI feedback summarization is unavailable. Original feedback remains available.");
  if (category === "timeout") return new ApiError(504, "AI_TIMEOUT", "Feedback summarization timed out. The previous summary and original feedback were not changed; try again deliberately.");
  if (category === "quota" || category === "rate") return new ApiError(429, "AI_PROVIDER_LIMITED", "AI feedback summarization is temporarily limited. Try again later.");
  if (category === "blocked") return new ApiError(422, "AI_RESPONSE_BLOCKED", "The feedback could not be summarized. Review the original feedback or try again deliberately.");
  if (category === "malformed" || category === "oversized" || category === "semantic") return new ApiError(502, "AI_RESPONSE_INVALID", "AI returned an unusable feedback summary. The previous summary and original feedback were not changed.");
  return new ApiError(503, "AI_UNAVAILABLE", "AI feedback summarization is temporarily unavailable. Original feedback remains available.");
}

function lifecycleActive(project: { lifecycleState?: string }) { return !project.lifecycleState || project.lifecycleState === "active"; }

export class AiFeedbackSummaryService {
  constructor(private readonly provider: FeedbackSummarizationProvider, private readonly clock: AiFeedbackClock = systemClock) {}

  async read(projectId: string, deliverableId: string, actor: Actor) {
    const { project, role } = await projectContext(projectId, actor._id); assertProvider(role);
    const deliverable = await Deliverable.findOne({ _id: deliverableId, projectId: project._id, number: { $exists: true } }).select("_id").lean();
    if (!deliverable) throw notFound();
    const [sources, saved] = await Promise.all([eligibleSourceSet(projectId, deliverableId), AiFeedbackSummary.findOne({ projectId, deliverableId })]);
    const active = lifecycleActive(project); const enough = sources.value.records.length >= 2;
    const unavailableReason = !active ? "project-locked" as const : !enough ? "insufficient-feedback" as const : !this.provider.available ? "ai-disabled" as const : undefined;
    return {
      availability: { enabled: this.provider.available, eligibleCount: sources.value.records.length, minimumRequired: 2 as const, canGenerate: active && enough && this.provider.available, ...(unavailableReason ? { unavailableReason } : {}) },
      ...(saved ? { summary: summaryView(saved, sources.fingerprint) } : {}),
    };
  }

  async generate(projectId: string, deliverableId: string, actor: Actor, requestActive: () => boolean = () => true) {
    const now = this.clock();
    const initial = await projectContext(projectId, actor._id); assertProvider(initial.role); assertProjectContentMutable(initial.project);
    const deliverable = await Deliverable.findOne({ _id: deliverableId, projectId: initial.project._id, number: { $exists: true } }).select("_id").lean();
    if (!deliverable) throw notFound();
    const sources = await eligibleSourceSet(projectId, deliverableId);
    if (sources.value.records.length < 2) throw new ApiError(409, "AI_FEEDBACK_INSUFFICIENT", "At least two distinct eligible client feedback records are required before generating a summary.", { eligibleCount: sources.value.records.length, minimumRequired: 2 });
    if (sources.byteLength > AI_FEEDBACK_INPUT_MAX_BYTES) throw new ApiError(413, "AI_FEEDBACK_INPUT_TOO_LARGE", "This deliverable has too much eligible feedback to summarize safely. Original feedback remains available.", { maximumBytes: AI_FEEDBACK_INPUT_MAX_BYTES, actualBytes: sources.byteLength });
    if (!this.provider.available) throw providerFailure(new AiProviderError("disabled"));
    const baseline = await AiFeedbackSummary.findOne({ projectId, deliverableId }).select("_id runRevision").lean();
    let admissionId: string | undefined;
    try {
      admissionId = await admitAiRequirementRequest(actor._id, now);
      let result;
      try { result = await this.provider.summarize(sources.value); } catch (error) { throw providerFailure(error); }
      if (!requestActive()) throw providerFailure(new AiProviderError("transport"));
      if (Buffer.byteLength(JSON.stringify(result.output), "utf8") > AI_FEEDBACK_RESPONSE_MAX_BYTES) throw providerFailure(new AiProviderError("oversized"));
      const parsed = feedbackSummaryOutputSchema.safeParse(result.output);
      if (!parsed.success) throw providerFailure(new AiProviderError("semantic"));
      try { validateGroundedFeedbackSummary(parsed.data, sources.value); } catch { throw providerFailure(new AiProviderError("semantic")); }
      const generatedAt = this.clock(); const runRevision = opaqueToken();
      const values = {
        workspaceId: initial.project.workspaceId, projectId: initial.project._id, deliverableId, runRevision,
        sourceFingerprint: sources.fingerprint, sourceReferences: sources.sourceReferences, generatedBy: { id: actor._id, displayName: actor.displayName }, generatedAt,
        promptVersion: AI_FEEDBACK_PROMPT_VERSION, schemaVersion: AI_FEEDBACK_SCHEMA_VERSION, operationId: result.operationId,
        providerId: result.providerId, modelId: result.modelId, execution: { durationMs: result.durationMs }, output: parsed.data,
      };
      let saved;
      try {
        saved = await transact(async (session) => {
          const locked = await projectContext(projectId, actor._id, session); assertProvider(locked.role); assertProjectContentMutable(locked.project);
          if (!await Deliverable.exists({ _id: deliverableId, projectId: locked.project._id, number: { $exists: true } }).session(session)) throw notFound();
          const currentSources = await eligibleSourceSet(projectId, deliverableId, session);
          if (currentSources.fingerprint !== sources.fingerprint) throw sourcesChanged();
          if (baseline) {
            const updated = await AiFeedbackSummary.findOneAndUpdate({ _id: baseline._id, projectId, deliverableId, runRevision: baseline.runRevision }, { $set: values }, { returnDocument: "after", session });
            if (!updated) throw replacementConflict();
            return updated;
          }
          const created = new AiFeedbackSummary(values); await created.save({ session }); return created;
        });
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) throw replacementConflict();
        throw new ApiError(503, "AI_SUMMARY_SAVE_FAILED", "The new feedback summary could not be saved. Any previous summary was kept; try again deliberately.");
      }
      return summaryView(saved, sources.fingerprint);
    } finally {
      if (admissionId) await releaseAiRequirementRequest(actor._id, admissionId).catch(() => undefined);
    }
  }
}
