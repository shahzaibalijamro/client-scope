import { z } from "zod";

import { scopeGroupInput, scopeRequirementInput } from "./scope-contracts.js";
import { objectId } from "./validation.js";

const plainText = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum);
const optionalText = (maximum: number) => z.string().trim().max(maximum).transform((value) => value || undefined).optional();

export const changeRequestState = z.enum(["draft", "in-review", "revision-draft", "approved", "rejected", "canceled"]);
export const proposalOutcome = z.enum(["in-review", "approved", "changes-requested", "rejected", "withdrawn"]);
export const comparisonKind = z.enum(["base-scope", "previous-proposal"]);
export const changeKind = z.enum(["added", "removed", "content-changed", "moved"]);

export const startChangeRequestInput = z.object({ title: plainText(1, 120) }).strict();

export const changeDraftInput = z.object({
  revisionToken: z.string().min(32).max(200),
  title: plainText(1, 120),
  rationale: plainText(1, 5_000),
  impactSummary: optionalText(2_000),
  revisionSummary: optionalText(2_000),
  groups: z.array(scopeGroupInput).max(50),
  requirements: z.array(scopeRequirementInput).max(200),
}).strict().superRefine((value, context) => {
  const groupIds = value.groups.flatMap((group) => group.id ? [group.id] : []);
  const logicalIds = value.requirements.flatMap((requirement) => requirement.logicalId ? [requirement.logicalId] : []);
  if (new Set(groupIds).size !== groupIds.length) context.addIssue({ code: "custom", path: ["groups"], message: "Group identifiers must be unique." });
  if (new Set(logicalIds).size !== logicalIds.length) context.addIssue({ code: "custom", path: ["requirements"], message: "Requirement identifiers must be unique." });
  const groups = new Set(groupIds);
  value.requirements.forEach((requirement, index) => {
    if (requirement.groupId && !groups.has(requirement.groupId)) {
      context.addIssue({ code: "custom", path: ["requirements", index, "groupId"], message: "Select a group in this proposal draft." });
    }
  });
});

export const submitChangeProposalInput = z.object({ revisionToken: z.string().min(32).max(200), confirmed: z.literal(true) }).strict();
export const confirmedOnlyInput = z.object({ confirmed: z.literal(true) }).strict();

export const changeCommentInput = z.object({
  body: plainText(1, 2_000),
  comparisonKind: comparisonKind.optional(),
  changeItemId: objectId.optional(),
}).strict().superRefine((value, context) => {
  if (Boolean(value.comparisonKind) !== Boolean(value.changeItemId)) {
    context.addIssue({ code: "custom", path: ["changeItemId"], message: "Select both the comparison and its exact change item." });
  }
});

export const changeDecisionInput = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("approved"), confirmed: z.literal(true), note: optionalText(2_000) }).strict(),
  z.object({ outcome: z.literal("changes-requested"), confirmed: z.literal(true), note: plainText(1, 2_000) }).strict(),
  z.object({ outcome: z.literal("rejected"), confirmed: z.literal(true), note: plainText(1, 2_000) }).strict(),
]);

export const reasonInput = z.object({ confirmed: z.literal(true), reason: plainText(1, 2_000) }).strict();

export type ChangeDraftInput = z.infer<typeof changeDraftInput>;
export type ChangeDecisionInput = z.infer<typeof changeDecisionInput>;
export type ComparisonKind = z.infer<typeof comparisonKind>;
export type ChangeKind = z.infer<typeof changeKind>;
