import { z } from "zod";

import { dateOnly, objectId } from "./validation.js";

const revisionToken = z.string().min(32).max(200);
const optionalNarrative = z.string().trim().max(2_000).transform((value) => value || undefined).optional();

export const milestoneStatus = z.enum(["upcoming", "in-progress", "completed"]);

export const createMilestoneInput = z.object({
  revisionToken,
  title: z.string().trim().min(1).max(120),
  description: optionalNarrative,
  targetDate: z.union([dateOnly, z.literal("").transform(() => undefined)]).optional(),
}).strict();

export const editMilestoneInput = createMilestoneInput;

export const transitionMilestoneInput = z.object({
  revisionToken,
  status: milestoneStatus,
  note: optionalNarrative,
}).strict();

export const reorderMilestonesInput = z.object({
  revisionToken,
  milestoneIds: z.array(objectId).max(50),
}).strict().superRefine((value, context) => {
  if (new Set(value.milestoneIds).size !== value.milestoneIds.length) {
    context.addIssue({ code: "custom", path: ["milestoneIds"], message: "Milestone identifiers must be unique." });
  }
});

export const archiveMilestoneInput = z.object({
  revisionToken,
  confirmed: z.literal(true),
  reason: z.string().trim().min(1).max(2_000),
}).strict();

export const archiveQuery = z.object({
  cursor: z.string().min(16).max(1_000).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

const actorResponse = z.object({
  id: objectId, displayName: z.string(), role: z.enum(["workspace-owner", "service-team-member"]),
}).strict();
export const milestoneTransitionResponse = z.object({
  id: objectId, previousStatus: milestoneStatus, nextStatus: milestoneStatus,
  actor: actorResponse, transitionedAt: z.string(), note: z.string().optional(),
}).strict();
export const milestoneResponse = z.object({
  id: objectId, title: z.string(), description: z.string().optional(), targetDate: dateOnly.optional(),
  status: milestoneStatus, recordState: z.enum(["active", "archived"]), position: z.number().int(), isOverdue: z.boolean(), createdAt: z.string(), updatedAt: z.string(),
  latestTransition: milestoneTransitionResponse.optional(),
  archive: z.object({ actor: actorResponse, archivedAt: z.string(), reason: z.string() }).strict().optional(),
}).strict();
export const milestonePermissionsResponse = z.object({
  canCreate: z.boolean(), canEdit: z.boolean(), canTransition: z.boolean(), canReorder: z.boolean(), canArchive: z.boolean(),
}).strict();
export const milestoneTimelineResponse = z.object({
  available: z.boolean(), activeCount: z.number().int().min(0).max(50), limit: z.literal(50),
  permissions: milestonePermissionsResponse, revisionToken: z.string().optional(), milestones: z.array(milestoneResponse).max(50),
}).strict();
export const milestoneArchiveResponse = z.object({ milestones: z.array(milestoneResponse).max(50), nextCursor: z.string().optional() }).strict();
export const milestoneMutationResponse = z.object({
  milestone: milestoneResponse, revisionToken: z.string(), activeCount: z.number().int().optional(), unchanged: z.boolean().optional(),
}).strict();
export const milestoneOrderResponse = z.object({ revisionToken: z.string(), unchanged: z.boolean(), milestoneIds: z.array(objectId).max(50) }).strict();

export type MilestoneStatus = z.infer<typeof milestoneStatus>;
export type CreateMilestoneInput = z.infer<typeof createMilestoneInput>;
export type EditMilestoneInput = z.infer<typeof editMilestoneInput>;
export type TransitionMilestoneInput = z.infer<typeof transitionMilestoneInput>;
export type ReorderMilestonesInput = z.infer<typeof reorderMilestonesInput>;
export type ArchiveMilestoneInput = z.infer<typeof archiveMilestoneInput>;
