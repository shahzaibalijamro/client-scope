import { z } from "zod";

import { scopeAcceptanceCriteria, scopeDescription, scopeTitle } from "./scope-contracts.js";
import { objectId } from "./validation.js";

export const AI_REVIEW_INPUT_MAX_BYTES = 256 * 1_024;
export const AI_REVIEW_RESPONSE_MAX_BYTES = 512 * 1_024;
export const AI_REVIEW_ITEM_MAX = 200;
export const AI_REVIEW_LEASE_MS = 2 * 60 * 1_000;
export const AI_REVIEW_TTL_MS = 24 * 60 * 60 * 1_000;
export const AI_REVIEW_PROVIDER_TIMEOUT_MS = 30_000;
export const AI_REVIEW_PROMPT_VERSION = "requirement-quality-review-v1";
export const AI_REVIEW_INPUT_VERSION = "requirement-quality-review-input-v1";

const boundedText = z.string().trim().min(1).max(1_000);
const localKey = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/u);

export const canonicalReviewRequirementSchema = z.object({
  logicalRequirementId: objectId,
  groupLabel: z.string().min(1).max(120).optional(),
  title: z.string(),
  description: z.string(),
  acceptanceCriteria: z.array(z.string()),
}).strict();

export const canonicalReviewInputSchema = z.object({
  version: z.literal(AI_REVIEW_INPUT_VERSION),
  requirements: z.array(canonicalReviewRequirementSchema).min(1).max(200),
}).strict();

export type CanonicalReviewInput = z.infer<typeof canonicalReviewInputSchema>;

export function canonicalizeRequirementDraft(draft: {
  groups: Array<{ id: unknown; name: string; order: number }>;
  requirements: Array<{
    logicalId: unknown; groupId?: unknown; title: string; description: string;
    acceptanceCriteria: string[]; order: number;
  }>;
}): { value: CanonicalReviewInput; serialized: string; byteLength: number } {
  const groupNames = new Map(draft.groups.map((group) => [String(group.id), group.name]));
  const value: CanonicalReviewInput = {
    version: AI_REVIEW_INPUT_VERSION,
    requirements: [...draft.requirements]
      .sort((left, right) => left.order - right.order || String(left.logicalId).localeCompare(String(right.logicalId)))
      .map((requirement) => ({
        logicalRequirementId: String(requirement.logicalId),
        ...(requirement.groupId && groupNames.get(String(requirement.groupId))
          ? { groupLabel: groupNames.get(String(requirement.groupId))! }
          : {}),
        title: requirement.title,
        description: requirement.description,
        acceptanceCriteria: [...requirement.acceptanceCriteria],
      })),
  };
  const serialized = JSON.stringify(value);
  return { value, serialized, byteLength: Buffer.byteLength(serialized, "utf8") };
}

export const reviewFindingSchema = z.object({
  key: localKey,
  category: z.enum(["vagueness", "missing-acceptance-detail", "conflict", "clarification-needed"]),
  explanation: boundedText,
  primaryRequirementId: objectId,
  relatedRequirementIds: z.array(objectId).max(20).optional(),
}).strict();

const patchBase = { findingKey: localKey, targetRequirementId: objectId };
export const reviewPatchSchema = z.discriminatedUnion("kind", [
  z.object({ ...patchBase, kind: z.literal("replace-title"), expectedValue: z.string(), proposedValue: scopeTitle }).strict(),
  z.object({ ...patchBase, kind: z.literal("replace-description"), expectedValue: z.string(), proposedValue: scopeDescription }).strict(),
  z.object({ ...patchBase, kind: z.literal("replace-acceptance-criteria"), expectedValue: z.array(z.string()), proposedValue: scopeAcceptanceCriteria }).strict(),
  z.object({ ...patchBase, kind: z.literal("append-acceptance-criteria"), expectedValue: z.array(z.string()), proposedValue: scopeAcceptanceCriteria }).strict(),
]);

export const reviewSuggestionSchema = z.object({
  key: localKey,
  rationale: boundedText,
  patch: reviewPatchSchema,
}).strict();

export const reviewQuestionSchema = z.object({
  findingKey: localKey,
  requirementIds: z.array(objectId).min(1).max(20),
  question: boundedText,
}).strict();

export const requirementQualityReviewOutputSchema = z.object({
  findings: z.array(reviewFindingSchema).max(AI_REVIEW_ITEM_MAX),
  suggestions: z.array(reviewSuggestionSchema).max(AI_REVIEW_ITEM_MAX),
  clarificationQuestions: z.array(reviewQuestionSchema).max(AI_REVIEW_ITEM_MAX),
}).strict().superRefine((value, context) => {
  const findingKeys = value.findings.map((item) => item.key);
  const suggestionKeys = value.suggestions.map((item) => item.key);
  if (new Set(findingKeys).size !== findingKeys.length) context.addIssue({ code: "custom", path: ["findings"], message: "Finding keys must be unique." });
  if (new Set(suggestionKeys).size !== suggestionKeys.length) context.addIssue({ code: "custom", path: ["suggestions"], message: "Suggestion keys must be unique." });
  const known = new Set(findingKeys);
  const suggestionFindings = new Set<string>();
  const questionFindings = new Set<string>();
  value.suggestions.forEach((item, index) => {
    if (!known.has(item.patch.findingKey)) context.addIssue({ code: "custom", path: ["suggestions", index, "patch", "findingKey"], message: "Suggestion finding is unknown." });
    suggestionFindings.add(item.patch.findingKey);
  });
  value.clarificationQuestions.forEach((item, index) => {
    if (!known.has(item.findingKey)) context.addIssue({ code: "custom", path: ["clarificationQuestions", index, "findingKey"], message: "Question finding is unknown." });
    if (new Set(item.requirementIds).size !== item.requirementIds.length) context.addIssue({ code: "custom", path: ["clarificationQuestions", index, "requirementIds"], message: "Question requirement references must be unique." });
    questionFindings.add(item.findingKey);
  });
  value.findings.forEach((finding, index) => {
    const related = finding.relatedRequirementIds ?? [];
    if (new Set(related).size !== related.length || related.includes(finding.primaryRequirementId)) {
      context.addIssue({ code: "custom", path: ["findings", index, "relatedRequirementIds"], message: "Related requirement references must be unique and different from the primary reference." });
    }
    if (suggestionFindings.has(finding.key) && questionFindings.has(finding.key)) {
      context.addIssue({ code: "custom", path: ["findings", index], message: "A finding cannot contain both a suggestion and a clarification question." });
    }
    if (finding.category === "clarification-needed" && (!questionFindings.has(finding.key) || suggestionFindings.has(finding.key))) {
      context.addIssue({ code: "custom", path: ["findings", index], message: "Clarification findings require a non-applyable question." });
    }
  });
});

export type RequirementQualityReviewOutput = z.infer<typeof requirementQualityReviewOutputSchema>;
export type ReviewPatch = z.infer<typeof reviewPatchSchema>;

export function validateGroundedReview(output: RequirementQualityReviewOutput, input: CanonicalReviewInput): RequirementQualityReviewOutput {
  const requirements = new Map(input.requirements.map((item) => [item.logicalRequirementId, item]));
  const findings = new Map(output.findings.map((item) => [item.key, item]));
  for (const finding of output.findings) {
    if (!requirements.has(finding.primaryRequirementId) || (finding.relatedRequirementIds ?? []).some((id) => !requirements.has(id))) {
      throw new Error("unknown-requirement-reference");
    }
  }
  for (const suggestion of output.suggestions) {
    const finding = findings.get(suggestion.patch.findingKey);
    const target = requirements.get(suggestion.patch.targetRequirementId);
    if (!finding || !target || ![finding.primaryRequirementId, ...(finding.relatedRequirementIds ?? [])].includes(suggestion.patch.targetRequirementId)) {
      throw new Error("ungrounded-suggestion");
    }
    const expected = suggestion.patch.kind === "replace-title" ? target.title
      : suggestion.patch.kind === "replace-description" ? target.description : target.acceptanceCriteria;
    if (JSON.stringify(expected) !== JSON.stringify(suggestion.patch.expectedValue)) throw new Error("expected-value-mismatch");
  }
  for (const question of output.clarificationQuestions) {
    const finding = findings.get(question.findingKey);
    if (!finding || question.requirementIds.some((id) => !requirements.has(id)) || !question.requirementIds.some((id) => [finding.primaryRequirementId, ...(finding.relatedRequirementIds ?? [])].includes(id))) {
      throw new Error("ungrounded-question");
    }
  }
  return output;
}

const workingSuggestionSchema = z.object({
  key: localKey,
  selected: z.boolean(),
  proposedValue: z.union([scopeTitle, scopeDescription, scopeAcceptanceCriteria]),
}).strict();

export const generateReviewInput = z.object({
  expectedDraftId: objectId,
  expectedDraftRevision: z.string().min(32).max(200),
}).strict();

export const updateWorkingReviewInput = z.object({
  expectedReviewRevision: z.string().min(32).max(200),
  suggestions: z.array(workingSuggestionSchema).max(AI_REVIEW_ITEM_MAX),
}).strict().superRefine((value, context) => {
  const keys = value.suggestions.map((item) => item.key);
  if (new Set(keys).size !== keys.length) context.addIssue({ code: "custom", path: ["suggestions"], message: "Suggestion keys must be unique." });
});

export const discardReviewInput = z.object({ expectedReviewRevision: z.string().min(32).max(200), confirmed: z.literal(true) }).strict();
export const applyReviewInput = z.object({
  expectedReviewRevision: z.string().min(32).max(200),
  expectedDraftRevision: z.string().min(32).max(200),
  confirmed: z.literal(true),
}).strict();

export type UpdateWorkingReviewInput = z.infer<typeof updateWorkingReviewInput>;
export type ApplyReviewInput = z.infer<typeof applyReviewInput>;
