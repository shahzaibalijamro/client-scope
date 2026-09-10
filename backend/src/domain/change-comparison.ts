import type { ChangeKind, ComparisonKind } from "./change-control-contracts.js";

export type TargetGroup = { id: string | { toString(): string }; name: string; order: number };
export type TargetRequirement = {
  snapshotId?: string | { toString(): string }; logicalId: string | { toString(): string };
  groupId?: string | { toString(): string } | null; title: string; description: string;
  acceptanceCriteria: string[]; order: number;
};
export type TargetScope = { groups: TargetGroup[]; requirements: TargetRequirement[] };
export type ComparisonItemDraft = {
  comparisonKind: ComparisonKind; entityKind: "group" | "requirement"; entityId: string;
  changeKinds: ChangeKind[]; before?: Record<string, unknown>; after?: Record<string, unknown>; position: number;
};

const identifier = (value: string | { toString(): string }) => String(value);
const groupSnapshot = (group: TargetGroup) => ({ id: identifier(group.id), name: group.name, order: group.order });
const requirementSnapshot = (requirement: TargetRequirement) => ({
  ...(requirement.snapshotId ? { snapshotId: identifier(requirement.snapshotId) } : {}), logicalId: identifier(requirement.logicalId),
  ...(requirement.groupId ? { groupId: identifier(requirement.groupId) } : {}), title: requirement.title,
  description: requirement.description, acceptanceCriteria: [...requirement.acceptanceCriteria], order: requirement.order,
});

function sorted<T extends { order: number }>(items: T[], identity: (item: T) => string): T[] {
  return [...items].sort((left, right) => left.order - right.order || identity(left).localeCompare(identity(right)));
}

export function compareTargetScopes(source: TargetScope, target: TargetScope, comparisonKind: ComparisonKind): ComparisonItemDraft[] {
  const sourceGroups = new Map(source.groups.map((group) => [identifier(group.id), group]));
  const targetGroups = new Map(target.groups.map((group) => [identifier(group.id), group]));
  const sourceRequirements = new Map(source.requirements.map((item) => [identifier(item.logicalId), item]));
  const targetRequirements = new Map(target.requirements.map((item) => [identifier(item.logicalId), item]));
  const items: ComparisonItemDraft[] = [];

  for (const group of sorted(target.groups, (item) => identifier(item.id))) {
    const prior = sourceGroups.get(identifier(group.id));
    if (!prior) items.push({ comparisonKind, entityKind: "group", entityId: identifier(group.id), changeKinds: ["added"], after: groupSnapshot(group), position: items.length });
    else if (prior.name !== group.name) items.push({ comparisonKind, entityKind: "group", entityId: identifier(group.id), changeKinds: ["content-changed"], before: groupSnapshot(prior), after: groupSnapshot(group), position: items.length });
  }
  for (const group of sorted(source.groups.filter((item) => !targetGroups.has(identifier(item.id))), (item) => identifier(item.id))) {
    items.push({ comparisonKind, entityKind: "group", entityId: identifier(group.id), changeKinds: ["removed"], before: groupSnapshot(group), position: items.length });
  }
  for (const requirement of sorted(target.requirements, (item) => identifier(item.logicalId))) {
    const prior = sourceRequirements.get(identifier(requirement.logicalId));
    if (!prior) {
      items.push({ comparisonKind, entityKind: "requirement", entityId: identifier(requirement.logicalId), changeKinds: ["added"], after: requirementSnapshot(requirement), position: items.length });
      continue;
    }
    const kinds: ChangeKind[] = [];
    if (prior.title !== requirement.title || prior.description !== requirement.description ||
        JSON.stringify(prior.acceptanceCriteria) !== JSON.stringify(requirement.acceptanceCriteria)) kinds.push("content-changed");
    if ((prior.groupId ? identifier(prior.groupId) : undefined) !== (requirement.groupId ? identifier(requirement.groupId) : undefined)) kinds.push("moved");
    if (kinds.length) items.push({ comparisonKind, entityKind: "requirement", entityId: identifier(requirement.logicalId), changeKinds: kinds, before: requirementSnapshot(prior), after: requirementSnapshot(requirement), position: items.length });
  }
  for (const requirement of sorted(source.requirements.filter((item) => !targetRequirements.has(identifier(item.logicalId))), (item) => identifier(item.logicalId))) {
    items.push({ comparisonKind, entityKind: "requirement", entityId: identifier(requirement.logicalId), changeKinds: ["removed"], before: requirementSnapshot(requirement), position: items.length });
  }
  return items;
}

export function metadataComparison(previous: { rationale: string; impactSummary?: string | null }, current: { rationale: string; impactSummary?: string | null }) {
  const rationaleChanged = previous.rationale !== current.rationale;
  const impactChanged = (previous.impactSummary ?? undefined) !== (current.impactSummary ?? undefined);
  return {
    rationaleChanged, impactChanged,
    ...(rationaleChanged ? { rationale: { before: previous.rationale, after: current.rationale } } : {}),
    ...(impactChanged ? { impactSummary: { before: previous.impactSummary ?? undefined, after: current.impactSummary ?? undefined } } : {}),
  };
}
