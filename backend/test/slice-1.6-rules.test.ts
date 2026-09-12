import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import {
  activityQuery, archiveTransitionInput, completionDecisionInput, completionWithdrawalInput, requestCompletionInput,
} from "../src/domain/lifecycle-contracts.js";

describe("Slice 1.6 lifecycle contracts", () => {
  const revision = "r".repeat(32);

  it("requires explicit confirmation and trims optional completion text", () => {
    expect(requestCompletionInput.parse({ confirmed: true, lifecycleRevision: revision, summary: "  Ready  " })).toEqual({ confirmed: true, lifecycleRevision: revision, summary: "Ready" });
    expect(requestCompletionInput.safeParse({ confirmed: false, lifecycleRevision: revision }).success).toBe(false);
    expect(requestCompletionInput.safeParse({ confirmed: true, lifecycleRevision: revision, unknown: true }).success).toBe(false);
    expect(completionDecisionInput.parse({ confirmed: true, lifecycleRevision: revision, outcome: "approved", note: " " })).toEqual({ confirmed: true, lifecycleRevision: revision, outcome: "approved", note: undefined });
  });

  it("requires bounded reasons for return, withdrawal, archive, and restore", () => {
    expect(completionDecisionInput.safeParse({ confirmed: true, lifecycleRevision: revision, outcome: "returned", reason: " " }).success).toBe(false);
    expect(completionWithdrawalInput.safeParse({ confirmed: true, lifecycleRevision: revision, reason: " " }).success).toBe(false);
    expect(archiveTransitionInput.parse({ confirmed: true, lifecycleRevision: revision, reason: "  Records organized  " }).reason).toBe("Records organized");
    expect(archiveTransitionInput.safeParse({ confirmed: true, lifecycleRevision: revision, reason: "x".repeat(2_001) }).success).toBe(false);
  });

  it("validates activity page bounds and exact identifiers", () => {
    expect(activityQuery.parse({})).toEqual({ limit: 20 });
    expect(activityQuery.parse({ limit: "50" })).toEqual({ limit: 50 });
    expect(activityQuery.safeParse({ limit: 51 }).success).toBe(false);
    expect(mongoose.isValidObjectId(new mongoose.Types.ObjectId().toString())).toBe(true);
  });
});
