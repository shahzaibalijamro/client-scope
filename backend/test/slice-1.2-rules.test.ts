import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import { draftContentInput, scopeGroupInput, scopeRequirementInput } from "../src/domain/scope-contracts.js";
import { compareVersions, type ComparableVersion } from "../src/domain/scope-service.js";

const oid = () => new mongoose.Types.ObjectId();

describe("Slice 1.2 scope rules", () => {
  it("enforces text and collection boundaries", () => {
    expect(scopeGroupInput.parse({ name: "  Discovery  ", order: 0 }).name).toBe("Discovery");
    expect(() => scopeGroupInput.parse({ name: " ", order: 0 })).toThrow();
    expect(() => scopeGroupInput.parse({ name: "x".repeat(121), order: 0 })).toThrow();
    expect(scopeRequirementInput.parse({
      title: "Requirement", description: `Line one\nLine two`, acceptanceCriteria: ["Works"], order: 0,
    }).description).toBe("Line one\nLine two");
    expect(() => scopeRequirementInput.parse({
      title: "Requirement", description: "Description", acceptanceCriteria: [], order: 0,
    })).toThrow();
    expect(() => scopeRequirementInput.parse({
      title: "Requirement", description: "x".repeat(5_001), acceptanceCriteria: ["Works"], order: 0,
    })).toThrow();
    expect(() => scopeRequirementInput.parse({
      title: "Requirement", description: "Description", acceptanceCriteria: Array.from({ length: 51 }, () => "Works"), order: 0,
    })).toThrow();
  });

  it("rejects invalid group references and duplicate stable identities", () => {
    const groupId = String(oid());
    const logicalId = String(oid());
    expect(draftContentInput.safeParse({
      revisionToken: "t".repeat(32), groups: [{ id: groupId, name: "Group", order: 0 }],
      requirements: [{ logicalId, groupId, title: "One", description: "Description", acceptanceCriteria: ["Done"], order: 0 }],
    }).success).toBe(true);
    expect(draftContentInput.safeParse({
      revisionToken: "t".repeat(32), groups: [],
      requirements: [{ logicalId, groupId, title: "One", description: "Description", acceptanceCriteria: ["Done"], order: 0 }],
    }).success).toBe(false);
  });

  it("compares by logical identity and ignores display ordering", () => {
    const unchanged = oid(); const changed = oid(); const removed = oid(); const added = oid();
    const group = oid();
    const requirement = (logicalId: mongoose.Types.ObjectId, title: string, order: number, groupId?: mongoose.Types.ObjectId) => ({
      snapshotId: oid(), logicalId, title, description: "Description", acceptanceCriteria: ["Criterion"], order,
      ...(groupId ? { groupId } : {}),
    });
    const previous: ComparableVersion = {
      groups: [{ id: group, name: "Core" }],
      requirements: [requirement(unchanged, "Same", 0), requirement(changed, "Old", 1, group), requirement(removed, "Same title", 2)],
    };
    const current: ComparableVersion = {
      groups: [{ id: group, name: "Renamed core" }],
      requirements: [requirement(added, "Same title", 0), requirement(unchanged, "Same", 2), requirement(changed, "Old", 1, group)],
    };
    const comparison = compareVersions(previous, current)!;
    expect(comparison.added.map((item) => item.logicalId)).toEqual([String(added)]);
    expect(comparison.removed.map((item) => item.logicalId)).toEqual([String(removed)]);
    expect(comparison.contentChanged.map((item) => item.logicalId)).toEqual([String(changed)]);
  });

  it("treats acceptance-criterion order as content while ignoring group display order", () => {
    const logicalId = oid(); const groupId = oid();
    const base: ComparableVersion = {
      groups: [{ id: groupId, name: "Core" }],
      requirements: [{ snapshotId: oid(), logicalId, groupId, title: "R", description: "D", acceptanceCriteria: ["A", "B"], order: 0 }],
    };
    const groupReordered: ComparableVersion = { groups: [{ ...base.groups[0]! }], requirements: [{ ...base.requirements[0]!, snapshotId: oid(), order: 5 }] };
    expect(compareVersions(base, groupReordered)!.contentChanged).toHaveLength(0);
    const criteriaReordered: ComparableVersion = { groups: base.groups, requirements: [{ ...base.requirements[0]!, snapshotId: oid(), acceptanceCriteria: ["B", "A"] }] };
    expect(compareVersions(base, criteriaReordered)!.contentChanged).toHaveLength(1);
    expect(compareVersions(undefined, base)).toBeUndefined();
  });
});
