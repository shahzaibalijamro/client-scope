import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import { compareTargetScopes, metadataComparison, type TargetScope } from "../src/domain/change-comparison.js";
import { proposalTransitionAllowed, requestTransitionAllowed } from "../src/domain/change-control-service.js";

const id = () => String(new mongoose.Types.ObjectId());
const requirement = (logicalId: string, title: string, order: number, groupId?: string) => ({ logicalId, title, description: "Description", acceptanceCriteria: ["A", "B"], order, ...(groupId ? { groupId } : {}) });

describe("Slice 1.3 change-control rules", () => {
  it("keeps request and proposal lifecycle boundaries separate", () => {
    expect(requestTransitionAllowed("draft", "in-review")).toBe(true);
    expect(requestTransitionAllowed("in-review", "revision-draft")).toBe(true);
    expect(requestTransitionAllowed("revision-draft", "canceled")).toBe(true);
    expect(requestTransitionAllowed("approved", "in-review")).toBe(false);
    expect(proposalTransitionAllowed("in-review", "rejected")).toBe(true);
    expect(proposalTransitionAllowed("changes-requested", "in-review")).toBe(false);
  });

  it("classifies material group and requirement changes by stable identity", () => {
    const keptGroup = id(); const removedGroup = id(); const newGroup = id();
    const changed = id(); const removed = id(); const added = id();
    const source: TargetScope = {
      groups: [{ id: keptGroup, name: "Core", order: 0 }, { id: removedGroup, name: "Legacy", order: 1 }],
      requirements: [requirement(changed, "Old", 0, keptGroup), requirement(removed, "Removed", 1, removedGroup)],
    };
    const target: TargetScope = {
      groups: [{ id: newGroup, name: "New", order: 0 }, { id: keptGroup, name: "Renamed", order: 2 }],
      requirements: [requirement(added, "Added", 0, newGroup), requirement(changed, "New", 4)],
    };
    const items = compareTargetScopes(source, target, "base-scope");
    expect(items.find((item) => item.entityId === changed)?.changeKinds).toEqual(["content-changed", "moved"]);
    expect(items.find((item) => item.entityId === keptGroup)?.changeKinds).toEqual(["content-changed"]);
    expect(items.find((item) => item.entityId === removed)?.changeKinds).toEqual(["removed"]);
    expect(items.find((item) => item.entityId === added)?.changeKinds).toEqual(["added"]);
  });

  it("ignores display order while treating acceptance-criterion order as content", () => {
    const groupId = id(); const logicalId = id();
    const source: TargetScope = { groups: [{ id: groupId, name: "Core", order: 0 }], requirements: [requirement(logicalId, "Same", 0, groupId)] };
    const reordered: TargetScope = { groups: [{ id: groupId, name: "Core", order: 9 }], requirements: [{ ...requirement(logicalId, "Same", 8, groupId) }] };
    expect(compareTargetScopes(source, reordered, "base-scope")).toEqual([]);
    reordered.requirements[0]!.acceptanceCriteria = ["B", "A"];
    expect(compareTargetScopes(source, reordered, "base-scope")[0]!.changeKinds).toEqual(["content-changed"]);
  });

  it("reports rationale and impact separately from scope items", () => {
    expect(metadataComparison({ rationale: "Old", impactSummary: "One" }, { rationale: "New", impactSummary: "Two" })).toMatchObject({ rationaleChanged: true, impactChanged: true });
  });
});
