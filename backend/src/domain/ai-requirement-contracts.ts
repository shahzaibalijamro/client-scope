import { z } from "zod";

export const AI_SOURCE_MAX = 20_000;
export const AI_GROUP_MAX = 10;
export const AI_REQUIREMENT_MAX = 25;
export const AI_WARNING_MAX = 50;
export const AI_WARNING_TEXT_MAX = 1_000;
export const AI_RESPONSE_MAX_BYTES = 512 * 1_024;
export const AI_PROPOSAL_TTL_MS = 24 * 60 * 60 * 1_000;
export const AI_GENERATION_LIMIT = 10;
export const AI_GENERATION_WINDOW_MS = 60 * 60 * 1_000;
export const AI_PROMPT_VERSION = "requirement-structuring-v1";

const text = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum);
export const proposalKey = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/u);

export const generatedGroupSchema = z.object({
  key: proposalKey,
  name: text(1, 120),
}).strict();

export const generatedRequirementSchema = z.object({
  key: proposalKey,
  groupKey: proposalKey.optional(),
  title: text(1, 120),
  description: text(1, 5_000),
  acceptanceCriteria: z.array(text(1, 2_000)).min(1).max(50),
}).strict();

export const groundingWarningSchema = z.object({
  category: z.enum(["unsupported-detail", "conflict", "ambiguity"]),
  message: text(1, AI_WARNING_TEXT_MAX),
  targetKey: proposalKey.optional(),
}).strict();

export const generatedProposalSchema = z.object({
  groups: z.array(generatedGroupSchema).max(AI_GROUP_MAX),
  requirements: z.array(generatedRequirementSchema).min(1).max(AI_REQUIREMENT_MAX),
  warnings: z.array(groundingWarningSchema).max(AI_WARNING_MAX),
}).strict().superRefine((value, context) => {
  const groupKeys = value.groups.map((group) => group.key);
  const requirementKeys = value.requirements.map((requirement) => requirement.key);
  if (new Set(groupKeys).size !== groupKeys.length) {
    context.addIssue({ code: "custom", path: ["groups"], message: "Group keys must be unique." });
  }
  if (new Set(requirementKeys).size !== requirementKeys.length) {
    context.addIssue({ code: "custom", path: ["requirements"], message: "Requirement keys must be unique." });
  }
  const knownGroups = new Set(groupKeys);
  const knownTargets = new Set([...groupKeys, ...requirementKeys]);
  value.requirements.forEach((requirement, index) => {
    if (requirement.groupKey && !knownGroups.has(requirement.groupKey)) {
      context.addIssue({ code: "custom", path: ["requirements", index, "groupKey"], message: "Select a proposal group." });
    }
  });
  value.warnings.forEach((warning, index) => {
    if (warning.targetKey && !knownTargets.has(warning.targetKey)) {
      context.addIssue({ code: "custom", path: ["warnings", index, "targetKey"], message: "Warning target is unknown." });
    }
  });
});

export const workingGroupSchema = generatedGroupSchema;
export const workingRequirementSchema = generatedRequirementSchema.extend({ selected: z.boolean() }).strict();
export const workingProposalSchema = z.object({
  groups: z.array(workingGroupSchema).max(AI_GROUP_MAX),
  requirements: z.array(workingRequirementSchema).min(1).max(AI_REQUIREMENT_MAX),
}).strict().superRefine((value, context) => {
  const parsed = generatedProposalSchema.safeParse({ groups: value.groups, requirements: value.requirements.map((item) => ({
    key: item.key, ...(item.groupKey ? { groupKey: item.groupKey } : {}), title: item.title,
    description: item.description, acceptanceCriteria: item.acceptanceCriteria,
  })), warnings: [] });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) context.addIssue({ ...issue, path: issue.path });
  }
});

export const generateProposalInput = z.object({
  source: z.string().max(AI_SOURCE_MAX).refine((value) => value.trim().length > 0, "Enter source text to structure."),
}).strict();

export const updateWorkingProposalInput = z.object({
  expectedProposalRevision: z.string().min(32).max(200),
  working: workingProposalSchema,
}).strict().refine((value) => Buffer.byteLength(JSON.stringify(value), "utf8") <= AI_RESPONSE_MAX_BYTES, "The working proposal is too large.");

export const applyProposalInput = z.object({
  expectedProposalRevision: z.string().min(32).max(200),
  expectedDraftRevision: z.string().min(32).max(200),
  selection: z.object({
    groups: z.array(generatedGroupSchema).max(AI_GROUP_MAX),
    requirements: z.array(generatedRequirementSchema).min(1).max(AI_REQUIREMENT_MAX),
  }).strict(),
  confirmed: z.literal(true),
}).strict().superRefine((value, context) => {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > AI_RESPONSE_MAX_BYTES) {
    context.addIssue({ code: "custom", message: "The selected proposal is too large." });
  }
  const parsed = generatedProposalSchema.safeParse({ ...value.selection, warnings: [] });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) context.addIssue({ ...issue, path: ["selection", ...issue.path] });
  }
  const used = new Set(value.selection.requirements.flatMap((item) => item.groupKey ? [item.groupKey] : []));
  if (value.selection.groups.some((group) => !used.has(group.key))) {
    context.addIssue({ code: "custom", path: ["selection", "groups"], message: "Only groups used by selected requirements may be applied." });
  }
});

export const discardProposalInput = z.object({
  expectedProposalRevision: z.string().min(32).max(200),
  confirmed: z.literal(true),
}).strict();

export const proposalStateSchema = z.enum(["pending", "applied", "discarded", "expired"]);
export type GeneratedProposal = z.infer<typeof generatedProposalSchema>;
export type WorkingProposal = z.infer<typeof workingProposalSchema>;
export type ApplyProposalInput = z.infer<typeof applyProposalInput>;
export type UpdateWorkingProposalInput = z.infer<typeof updateWorkingProposalInput>;
