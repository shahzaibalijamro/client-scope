import { createHash } from "node:crypto";

import { z } from "zod";

import { objectId } from "./validation.js";

export const AI_FEEDBACK_INPUT_VERSION = "client-feedback-summary-input-v1";
export const AI_FEEDBACK_SCHEMA_VERSION = "client-feedback-summary-output-v1";
export const AI_FEEDBACK_PROMPT_VERSION = "client-feedback-summary-v1";
export const AI_FEEDBACK_INPUT_MAX_BYTES = 256 * 1_024;
export const AI_FEEDBACK_RESPONSE_MAX_BYTES = 512 * 1_024;
export const AI_FEEDBACK_SOURCE_MAX = 1_000;
export const AI_FEEDBACK_ITEM_MAX = 50;
export const AI_FEEDBACK_CITATION_MAX = 20;
export const AI_FEEDBACK_PROVIDER_TIMEOUT_MS = 30_000;

const clientRole = z.enum(["client-participant", "client-approver"]);
const sourceKind = z.enum(["comment", "revision-request"]);
const boundedText = z.string().trim().min(1).max(1_000);

export const eligibleFeedbackRecordSchema = z.object({
  feedbackRecordId: objectId,
  versionId: objectId,
  kind: sourceKind,
  text: z.string().min(1).max(2_000),
  authorId: objectId,
  authorRole: clientRole,
  createdAt: z.string().datetime(),
}).strict();

export const canonicalFeedbackInputSchema = z.object({
  version: z.literal(AI_FEEDBACK_INPUT_VERSION),
  records: z.array(eligibleFeedbackRecordSchema).max(AI_FEEDBACK_SOURCE_MAX),
}).strict();

export type EligibleFeedbackRecord = z.infer<typeof eligibleFeedbackRecordSchema>;
export type CanonicalFeedbackInput = z.infer<typeof canonicalFeedbackInputSchema>;

export function canonicalizeEligibleFeedback(records: EligibleFeedbackRecord[]) {
  const distinct = new Map(records.map((record) => [record.feedbackRecordId, eligibleFeedbackRecordSchema.parse(record)]));
  const value: CanonicalFeedbackInput = {
    version: AI_FEEDBACK_INPUT_VERSION,
    records: [...distinct.values()].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      left.versionId.localeCompare(right.versionId) ||
      left.kind.localeCompare(right.kind) ||
      left.feedbackRecordId.localeCompare(right.feedbackRecordId)),
  };
  const serialized = JSON.stringify(value);
  return {
    value,
    serialized,
    byteLength: Buffer.byteLength(serialized, "utf8"),
    fingerprint: createHash("sha256").update(serialized).digest("hex"),
  };
}

export const feedbackCitationSchema = z.object({
  feedbackRecordId: objectId,
  versionId: objectId,
}).strict();

const groundedItemSchema = z.object({
  text: boundedText,
  citations: z.array(feedbackCitationSchema).min(1).max(AI_FEEDBACK_CITATION_MAX),
}).strict().superRefine((value, context) => {
  const keys = value.citations.map((citation) => `${citation.feedbackRecordId}:${citation.versionId}`);
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: "custom", path: ["citations"], message: "Citations must be unique." });
  }
});

export const feedbackSummaryOutputSchema = z.object({
  themes: z.array(groundedItemSchema).max(AI_FEEDBACK_ITEM_MAX),
  requestedActions: z.array(groundedItemSchema).max(AI_FEEDBACK_ITEM_MAX),
  tensions: z.array(groundedItemSchema).max(AI_FEEDBACK_ITEM_MAX),
}).strict().superRefine((value, context) => {
  if (value.themes.length + value.requestedActions.length + value.tensions.length === 0) {
    context.addIssue({ code: "custom", message: "A feedback summary must contain at least one grounded item." });
  }
});

export type FeedbackSummaryOutput = z.infer<typeof feedbackSummaryOutputSchema>;

export function validateGroundedFeedbackSummary(output: FeedbackSummaryOutput, input: CanonicalFeedbackInput): FeedbackSummaryOutput {
  const sources = new Map(input.records.map((record) => [record.feedbackRecordId, record.versionId]));
  for (const item of [...output.themes, ...output.requestedActions, ...output.tensions]) {
    for (const citation of item.citations) {
      if (sources.get(citation.feedbackRecordId) !== citation.versionId) throw new Error("unknown-or-mismatched-source-reference");
    }
  }
  return output;
}

export const generateFeedbackSummaryInput = z.object({}).strict();
