import { z } from "zod";

import { objectId } from "./validation.js";

const plainText = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum);
const optionalNarrative = z.string().trim().max(2_000).transform((value) => value || undefined).optional();

export const scopeGroupInput = z.object({
  id: objectId.optional(),
  name: plainText(1, 120),
  order: z.number().int().min(0),
}).strict();

export const scopeRequirementInput = z.object({
  logicalId: objectId.optional(),
  groupId: objectId.optional(),
  title: plainText(1, 120),
  description: plainText(1, 5_000),
  acceptanceCriteria: z.array(plainText(1, 2_000)).min(1).max(50),
  order: z.number().int().min(0),
}).strict();

export const draftContentInput = z.object({
  revisionToken: z.string().min(32).max(200),
  groups: z.array(scopeGroupInput).max(50),
  requirements: z.array(scopeRequirementInput).max(200),
}).strict().superRefine((value, context) => {
  const groupIds = new Set(value.groups.flatMap((group) => group.id ? [group.id] : []));
  const logicalIds = value.requirements.flatMap((requirement) => requirement.logicalId ? [requirement.logicalId] : []);
  if (groupIds.size !== value.groups.filter((group) => group.id).length) {
    context.addIssue({ code: "custom", path: ["groups"], message: "Group identifiers must be unique." });
  }
  if (new Set(logicalIds).size !== logicalIds.length) {
    context.addIssue({ code: "custom", path: ["requirements"], message: "Requirement identifiers must be unique." });
  }
  value.requirements.forEach((requirement, index) => {
    if (requirement.groupId && !groupIds.has(requirement.groupId)) {
      context.addIssue({ code: "custom", path: ["requirements", index, "groupId"], message: "Select a group in this draft." });
    }
  });
});

export const submitScopeInput = z.object({
  revisionToken: z.string().min(32).max(200),
  revisionSummary: optionalNarrative,
  confirmed: z.literal(true),
}).strict();

export const commentInput = z.object({
  body: plainText(1, 2_000),
  requirementSnapshotId: objectId.optional(),
}).strict();

export const decisionInput = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("approved"), confirmed: z.literal(true), note: optionalNarrative }).strict(),
  z.object({ outcome: z.literal("changes-requested"), confirmed: z.literal(true), note: plainText(1, 2_000) }).strict(),
]);

export const withdrawalInput = z.object({
  confirmed: z.literal(true),
  reason: plainText(1, 2_000),
}).strict();

export type DraftContentInput = z.infer<typeof draftContentInput>;
export type DecisionInput = z.infer<typeof decisionInput>;
