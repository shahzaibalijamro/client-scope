import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import {
  archiveMilestoneInput, archiveQuery, createMilestoneInput, milestoneStatus,
  reorderMilestonesInput, transitionMilestoneInput,
} from "../src/domain/milestone-contracts.js";
import { canTransition, isMilestoneOverdue, utcDate } from "../src/domain/milestone-service.js";

describe("Slice 1.4 milestone rules", () => {
  it("accepts only the three stored progress states and all directed changes", () => {
    expect(milestoneStatus.options).toEqual(["upcoming", "in-progress", "completed"]);
    for (const invalid of ["overdue", "archived", "Upcoming", "done"]) expect(milestoneStatus.safeParse(invalid).success).toBe(false);
    for (const from of milestoneStatus.options) for (const to of milestoneStatus.options) {
      expect(canTransition(from, to)).toBe(from !== to);
    }
  });

  it("normalizes optional text and accepts only real date-only targets", () => {
    const revisionToken = "x".repeat(32);
    expect(createMilestoneInput.parse({ revisionToken, title: "  Launch  ", description: "  ", targetDate: "" })).toEqual({ revisionToken, title: "Launch", description: undefined, targetDate: undefined });
    expect(createMilestoneInput.safeParse({ revisionToken, title: "Launch", targetDate: "2024-02-29" }).success).toBe(true);
    for (const targetDate of ["2023-02-29", "2026-13-01", "09/10/2026", "2026-09-10T00:00:00Z"]) {
      expect(createMilestoneInput.safeParse({ revisionToken, title: "Launch", targetDate }).success).toBe(false);
    }
    expect(transitionMilestoneInput.parse({ revisionToken, status: "completed", note: "  shipped\nwell  " }).note).toBe("shipped\nwell");
    expect(archiveMilestoneInput.safeParse({ revisionToken, confirmed: true, reason: " " }).success).toBe(false);
  });

  it("validates complete-list primitives and bounded archive pages", () => {
    const id = String(new mongoose.Types.ObjectId()); const revisionToken = "x".repeat(32);
    expect(reorderMilestonesInput.safeParse({ revisionToken, milestoneIds: [id, id] }).success).toBe(false);
    expect(archiveQuery.parse({})).toEqual({ limit: 20 });
    expect(archiveQuery.parse({ limit: "50" })).toEqual({ limit: 50 });
    expect(archiveQuery.safeParse({ limit: 0 }).success).toBe(false);
    expect(archiveQuery.safeParse({ limit: 51 }).success).toBe(false);
  });

  it("derives overdue from one UTC date without adding a stored status", () => {
    expect(utcDate(() => new Date("2026-09-11T00:00:00.000Z"))).toBe("2026-09-11");
    expect(isMilestoneOverdue({ targetDate: "2026-09-10", status: "upcoming" }, "2026-09-11")).toBe(true);
    expect(isMilestoneOverdue({ targetDate: "2026-09-11", status: "in-progress" }, "2026-09-11")).toBe(false);
    expect(isMilestoneOverdue({ targetDate: "2026-09-10", status: "completed" }, "2026-09-11")).toBe(false);
    expect(isMilestoneOverdue({ status: "upcoming" }, "2026-09-11")).toBe(false);
  });
});
