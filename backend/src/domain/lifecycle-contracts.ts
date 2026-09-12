import { z } from "zod";

import { objectId, optionalText } from "./validation.js";

const confirmed = z.literal(true);
const lifecycleRevision = z.string().min(20).max(200);
const reason = z.string().trim().min(1).max(2_000);

export const lifecycleProjectParams = z.object({ projectId: objectId }).strict();
export const lifecycleRoundParams = z.object({ projectId: objectId, roundId: objectId }).strict();
export const requestCompletionInput = z.object({ confirmed, lifecycleRevision, summary: optionalText(2_000) }).strict();
export const completionDecisionInput = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("approved"), confirmed, lifecycleRevision, note: optionalText(2_000) }).strict(),
  z.object({ outcome: z.literal("returned"), confirmed, lifecycleRevision, reason }).strict(),
]);
export const completionWithdrawalInput = z.object({ confirmed, lifecycleRevision, reason }).strict();
export const archiveTransitionInput = z.object({ confirmed, lifecycleRevision, reason }).strict();
export const activityQuery = z.object({ cursor: z.string().min(1).max(1_000).optional(), limit: z.coerce.number().int().min(1).max(50).default(20) }).strict();

export type CompletionDecisionInput = z.infer<typeof completionDecisionInput>;
