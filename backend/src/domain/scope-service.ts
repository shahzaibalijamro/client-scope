/* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose records are reduced through explicit allow-list serializers at this domain boundary. */
import { randomBytes } from "node:crypto";

import mongoose, { type ClientSession } from "mongoose";

import { ApiError } from "../errors.js";
import type { EmailService } from "./email.js";
import { Activity, EffectiveProjectAccess, Project, ProjectAssignment, User, Workspace, WorkspaceMembership } from "./models.js";
import type { DecisionInput, DraftContentInput } from "./scope-contracts.js";
import { draftContentInput } from "./scope-contracts.js";
import { ScopeComment, ScopeDecision, ScopeDraft, ScopeVersion } from "./scope-models.js";

export type ProjectRole = "workspace-owner" | "service-team-member" | "client-participant" | "client-approver";
export type Actor = { _id: mongoose.Types.ObjectId; displayName: string };
export type ProjectRecord = { _id: mongoose.Types.ObjectId; workspaceId: mongoose.Types.ObjectId; name: string };

const notFound = () => new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
const stale = () => new ApiError(409, "STALE_STATE", "The scope changed. Refresh and try again.");
const opaqueToken = () => randomBytes(32).toString("base64url");
const newId = () => new mongoose.Types.ObjectId();

async function transact<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => { result = await work(session); });
    return result as T;
  } finally {
    await session.endSession();
  }
}

async function roleFor(project: ProjectRecord, userId: mongoose.Types.ObjectId, session?: ClientSession, lockAccess = false): Promise<ProjectRole | null> {
  const workspaceQuery = Workspace.findById(project.workspaceId).lean();
  if (session) workspaceQuery.session(session);
  const workspace = await workspaceQuery;
  if (workspace && String(workspace.ownerId) === String(userId)) return "workspace-owner";
  const access = lockAccess && session
    ? await EffectiveProjectAccess.findOneAndUpdate(
      { projectId: project._id, userId }, { $inc: { authoritySequence: 1 } }, { returnDocument: "after", session },
    ).lean()
    : await (() => {
      const accessQuery = EffectiveProjectAccess.findOne({ projectId: project._id, userId }).lean();
      if (session) accessQuery.session(session);
      return accessQuery;
    })();
  return access ? access.role as ProjectRole : null;
}

export async function projectContext(projectId: string, userId: mongoose.Types.ObjectId, session?: ClientSession, lockAccess = false) {
  const query = Project.findById(projectId).lean<ProjectRecord>();
  if (session) query.session(session);
  const project = await query;
  if (!project) throw notFound();
  const role = await roleFor(project, userId, session, lockAccess);
  if (!role) throw notFound();
  return { project, role };
}

export function assertProvider(role: ProjectRole): void {
  if (role !== "workspace-owner" && role !== "service-team-member") throw notFound();
}

export function assertOwner(role: ProjectRole): void {
  if (role !== "workspace-owner") throw notFound();
}

export function projectEvent(input: {
  project: ProjectRecord; actor: Actor; action: string; context: Record<string, unknown>;
}, session: ClientSession) {
  return new Activity({
    workspaceId: input.project.workspaceId, projectId: input.project._id,
    actorId: input.actor._id, actorName: input.actor.displayName,
    action: input.action, audience: "project", context: input.context, occurredAt: new Date(),
  }).save({ session });
}

function groupView(group: { id: mongoose.Types.ObjectId; name: string; order: number }) {
  return { id: String(group.id), name: group.name, order: group.order };
}

function requirementView(requirement: {
  logicalId: mongoose.Types.ObjectId | string; snapshotId?: mongoose.Types.ObjectId | string | null;
  groupId?: mongoose.Types.ObjectId | string | null;
  title: string; description: string; acceptanceCriteria: string[]; order: number;
}) {
  return {
    ...(requirement.snapshotId ? { snapshotId: String(requirement.snapshotId) } : {}),
    logicalId: String(requirement.logicalId), ...(requirement.groupId ? { groupId: String(requirement.groupId) } : {}),
    title: requirement.title, description: requirement.description,
    acceptanceCriteria: [...requirement.acceptanceCriteria], order: requirement.order,
  };
}

function draftView(draft: InstanceType<typeof ScopeDraft> | Record<string, any>) {
  return {
    revisionToken: draft.revisionToken,
    copiedFromVersionId: draft.sourceVersionId ? String(draft.sourceVersionId) : undefined,
    groups: [...draft.groups].sort((a, b) => a.order - b.order).map(groupView),
    requirements: [...draft.requirements].sort((a, b) => a.order - b.order).map(requirementView),
  };
}

function versionView(version: Record<string, any>, comments: Record<string, any>[] = []) {
  return {
    id: String(version._id), number: version.number, status: version.status,
    groups: [...version.groups].sort((a, b) => a.order - b.order).map(groupView),
    requirements: [...version.requirements].sort((a, b) => a.order - b.order).map(requirementView),
    revisionSummary: version.revisionSummary,
    submitter: { id: String(version.submitterId), displayName: version.submitterName, role: version.submitterRole },
    submittedAt: version.submittedAt.toISOString(),
    terminal: version.terminalAt ? {
      actor: { id: String(version.terminalActorId), displayName: version.terminalActorName, role: version.terminalRole },
      at: version.terminalAt.toISOString(), note: version.terminalNote,
    } : undefined,
    supersession: version.supersededAt ? {
      at: version.supersededAt.toISOString(), changeRequestId: String(version.supersededByChangeRequestId),
      proposalId: String(version.supersededByProposalId), successorScopeVersionId: String(version.successorScopeVersionId),
    } : undefined,
    provenance: version.approvedFromChangeRequestId ? {
      baseScopeVersionId: String(version.basedOnScopeVersionId), changeRequestId: String(version.approvedFromChangeRequestId),
      proposalId: String(version.approvedFromProposalId),
      proposalSubmitter: { id: String(version.proposalSubmitterId), displayName: version.proposalSubmitterName },
      approvingClient: { id: String(version.approvingClientId), displayName: version.approvingClientName },
    } : undefined,
    comments: comments.map((comment) => ({
      id: String(comment._id), body: comment.body,
      requirementSnapshotId: comment.requirementSnapshotId ? String(comment.requirementSnapshotId) : undefined,
      author: { id: String(comment.authorId), displayName: comment.authorName, role: comment.authorRole },
      postedAt: comment.postedAt.toISOString(),
    })),
  };
}

export type ComparableVersion = {
  groups: Array<{ id: mongoose.Types.ObjectId | string; name: string }>;
  requirements: Array<{
    snapshotId: mongoose.Types.ObjectId | string; logicalId: mongoose.Types.ObjectId | string;
    groupId?: mongoose.Types.ObjectId | string; title: string; description: string;
    acceptanceCriteria: string[]; order: number;
  }>;
};

export function compareVersions(previous: ComparableVersion | undefined, current: ComparableVersion) {
  if (!previous) return undefined;
  const oldByLogical = new Map(previous.requirements.map((item) => [String(item.logicalId), item]));
  const newByLogical = new Map(current.requirements.map((item) => [String(item.logicalId), item]));
  const oldGroups = new Map(previous.groups.map((item) => [String(item.id), item.name]));
  const newGroups = new Map(current.groups.map((item) => [String(item.id), item.name]));
  const effectiveGroup = (item: ComparableVersion["requirements"][number], groups: Map<string, string>) =>
    item.groupId ? { id: String(item.groupId), name: groups.get(String(item.groupId)) } : undefined;
  const changed = (oldItem: ComparableVersion["requirements"][number], newItem: ComparableVersion["requirements"][number]) =>
    oldItem.title !== newItem.title || oldItem.description !== newItem.description ||
    JSON.stringify(oldItem.acceptanceCriteria) !== JSON.stringify(newItem.acceptanceCriteria) ||
    JSON.stringify(effectiveGroup(oldItem, oldGroups)) !== JSON.stringify(effectiveGroup(newItem, newGroups));
  return {
    added: current.requirements.filter((item) => !oldByLogical.has(String(item.logicalId))).map(requirementView),
    removed: previous.requirements.filter((item) => !newByLogical.has(String(item.logicalId))).map(requirementView),
    contentChanged: current.requirements.filter((item) => {
      const prior = oldByLogical.get(String(item.logicalId));
      return prior ? changed(prior, item) : false;
    }).map(requirementView),
  };
}

export async function readScope(projectId: string, userId: mongoose.Types.ObjectId) {
  const { role } = await projectContext(projectId, userId);
  const [draft, versions, comments] = await Promise.all([
    role === "workspace-owner" || role === "service-team-member" ? ScopeDraft.findOne({ projectId }).lean() : null,
    ScopeVersion.find({ projectId }).sort({ number: -1 }).lean(),
    ScopeComment.find({ projectId }).sort({ postedAt: 1, _id: 1 }).lean(),
  ]);
  const commentsByVersion = new Map<string, Record<string, any>[]>();
  for (const comment of comments) {
    const list = commentsByVersion.get(String(comment.versionId)) ?? [];
    list.push(comment); commentsByVersion.set(String(comment.versionId), list);
  }
  const inReview = versions.find((version) => version.status === "in-review");
  const approved = versions.find((version) => version.status === "approved");
  const source = draft?.sourceVersionId ? versions.find((version) => String(version._id) === String(draft.sourceVersionId)) : undefined;
  const actualState = approved ? "approved" : inReview ? "in-review" : draft ? source?.status ?? "draft" : "not-started";
  const provider = role === "workspace-owner" || role === "service-team-member";
  const state = !provider && actualState === "draft" ? "not-started" : actualState;
  const chronological = [...versions].reverse();
  return {
    state, role,
    permissions: {
      canStartDraft: provider && state === "not-started",
      canEditDraft: provider && Boolean(draft), canSubmit: role === "workspace-owner" && Boolean(draft),
      canWithdraw: role === "workspace-owner" && Boolean(inReview),
      canComment: Boolean(inReview), canDecide: role === "client-approver" && Boolean(inReview),
    },
    pendingAction: role === "client-approver" && inReview ? "decision-required"
      : draft && (role === "workspace-owner" ? "scope-submission" : "scope-editing") || undefined,
    ...(draft ? { draft: draftView(draft) } : {}),
    currentVersionId: inReview ? String(inReview._id) : approved ? String(approved._id) : undefined,
    versions: versions.map((version) => {
      const index = chronological.findIndex((item) => String(item._id) === String(version._id));
      return {
        ...versionView(version, commentsByVersion.get(String(version._id))),
        comparison: compareVersions(index > 0 ? chronological[index - 1] as ComparableVersion : undefined, version as ComparableVersion),
      };
    }),
  };
}

export async function projectScopeSummary(projectId: string | mongoose.Types.ObjectId, role: ProjectRole) {
  const [draft, versions] = await Promise.all([
    ScopeDraft.findOne({ projectId }).select("sourceVersionId").lean(),
    ScopeVersion.find({ projectId }).select("status number").sort({ number: -1 }).lean(),
  ]);
  const inReview = versions.find((version) => version.status === "in-review");
  const approved = versions.find((version) => version.status === "approved");
  const source = draft?.sourceVersionId ? versions.find((version) => String(version._id) === String(draft.sourceVersionId)) : undefined;
  const actualState = approved ? "approved" : inReview ? "in-review" : draft ? source?.status ?? "draft" : "not-started";
  const provider = role === "workspace-owner" || role === "service-team-member";
  const state = !provider && actualState === "draft" ? "not-started" : actualState;
  const pendingAction = role === "client-approver" && inReview ? "decision-required"
    : draft && (role === "workspace-owner" ? "scope-submission" : role === "service-team-member" ? "scope-editing" : undefined) || undefined;
  return { state, pendingAction, currentVersionId: inReview ? String(inReview._id) : approved ? String(approved._id) : undefined };
}

export async function startDraft(projectId: string, actor: Actor) {
  try {
    return await transact(async (session) => {
      const { project, role } = await projectContext(projectId, actor._id, session, true); assertProvider(role);
      const [draft, review, approved] = await Promise.all([
        ScopeDraft.exists({ projectId }).session(session), ScopeVersion.exists({ projectId, status: "in-review" }).session(session),
        ScopeVersion.exists({ projectId, status: "approved" }).session(session),
      ]);
      if (draft || review || approved) throw stale();
      const created = new ScopeDraft({ workspaceId: project.workspaceId, projectId, revisionToken: opaqueToken(), groups: [], requirements: [] });
      await created.save({ session });
      return draftView(created);
    });
  } catch (error) {
    if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) throw stale();
    throw error;
  }
}

export async function updateDraft(projectId: string, actor: Actor, input: DraftContentInput) {
  return transact(async (session) => {
    const { role } = await projectContext(projectId, actor._id, session, true); assertProvider(role);
    const current = await ScopeDraft.findOne({ projectId, revisionToken: input.revisionToken }).session(session);
    if (!current) throw stale();
    const existingGroups = new Set(current.groups.map((group) => String(group.id)));
    const existingRequirements = new Set(current.requirements.map((requirement) => String(requirement.logicalId)));
    if (input.groups.some((group) => group.id && !existingGroups.has(group.id)) ||
        input.requirements.some((requirement) => requirement.logicalId && !existingRequirements.has(requirement.logicalId))) {
      throw new ApiError(400, "VALIDATION_ERROR", "The draft contains an invalid item reference.");
    }
    const groups = input.groups.map((group) => ({ ...group, id: group.id ? new mongoose.Types.ObjectId(group.id) : newId() }));
    const groupIds = new Set(groups.map((group) => String(group.id)));
    const requirements = input.requirements.map((requirement) => ({
      ...requirement, logicalId: requirement.logicalId ? new mongoose.Types.ObjectId(requirement.logicalId) : newId(),
      groupId: requirement.groupId ? new mongoose.Types.ObjectId(requirement.groupId) : undefined,
    }));
    if (requirements.some((requirement) => requirement.groupId && !groupIds.has(String(requirement.groupId)))) {
      throw new ApiError(400, "VALIDATION_ERROR", "Select a group in this draft.");
    }
    const nextToken = opaqueToken();
    const updated = await ScopeDraft.findOneAndUpdate(
      { _id: current._id, revisionToken: input.revisionToken },
      { $set: { groups, requirements, revisionToken: nextToken } }, { returnDocument: "after", session },
    );
    if (!updated) throw stale();
    return draftView(updated);
  });
}

function validatePersistedDraft(draft: InstanceType<typeof ScopeDraft>): void {
  const result = draftContentInput.safeParse({
    revisionToken: draft.revisionToken,
    groups: draft.groups.map(groupView), requirements: draft.requirements.map(requirementView),
  });
  if (!result.success || draft.requirements.length === 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "Complete at least one valid requirement before submission.",
      result.success ? undefined : { fields: result.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) });
  }
}

export async function notificationRecipients(project: ProjectRecord, kind: "approvers" | "providers") {
  if (kind === "approvers") {
    const access = await EffectiveProjectAccess.find({ projectId: project._id, role: "client-approver" }).lean();
    const users = await User.find({ _id: { $in: access.map((item) => item.userId) } }).select("email").lean();
    return [...new Set(users.map((user) => user.email))];
  }
  const workspace = await Workspace.findById(project.workspaceId).lean();
  const assignments = await ProjectAssignment.find({ projectId: project._id, status: "active" }).lean();
  const memberships = await WorkspaceMembership.find({ workspaceId: project.workspaceId, status: "active", userId: { $in: assignments.map((item) => item.userId) } }).lean();
  const users = await User.find({ _id: { $in: [workspace!.ownerId, ...memberships.map((item) => item.userId)] } }).select("email").lean();
  return [...new Set(users.map((user) => user.email))];
}

export async function notify(emailService: EmailService, recipients: string[], category: "scope-review" | "scope-result", subject: string, text: string) {
  const results = await Promise.all(recipients.map(async (to) => {
    try { return await emailService.send({ category, to, subject, text }); } catch { return { delivered: false }; }
  }));
  return results.some((result) => !result.delivered) ? "The action was saved, but some notification email could not be sent." : undefined;
}

export async function submitDraft(projectId: string, actor: Actor, input: { revisionToken: string; revisionSummary?: string }, emailService: EmailService) {
  const result = await transact(async (session) => {
    const { project, role } = await projectContext(projectId, actor._id, session, true); assertOwner(role);
    const draft = await ScopeDraft.findOne({ projectId, revisionToken: input.revisionToken }).session(session);
    if (!draft) throw stale();
    validatePersistedDraft(draft);
    if (draft.sourceVersionId && !input.revisionSummary) {
      throw new ApiError(400, "VALIDATION_ERROR", "Add a revision summary before submitting this version.");
    }
    if (await ScopeVersion.exists({ projectId, status: { $in: ["in-review", "approved"] } }).session(session)) throw stale();
    if (!await EffectiveProjectAccess.findOneAndUpdate(
      { projectId, role: "client-approver" }, { $inc: { authoritySequence: 1 } }, { returnDocument: "after", session },
    )) {
      throw new ApiError(409, "APPROVER_REQUIRED", "Add an active Client Approver before submitting scope.");
    }
    const previous = await ScopeVersion.findOne({ projectId }).sort({ number: -1 }).session(session).lean();
    const submittedAt = new Date();
    const version = new ScopeVersion({
      workspaceId: project.workspaceId, projectId, number: (previous?.number ?? 0) + 1, status: "in-review",
      groups: draft.groups.map((group) => group.toObject()),
      requirements: draft.requirements.map((requirement) => ({ ...requirement.toObject(), snapshotId: newId() })),
      revisionSummary: input.revisionSummary, submitterId: actor._id, submitterName: actor.displayName,
      submitterRole: "workspace-owner", submittedAt,
    });
    await version.save({ session });
    const removed = await ScopeDraft.deleteOne({ _id: draft._id, revisionToken: input.revisionToken }, { session });
    if (removed.deletedCount !== 1) throw stale();
    await projectEvent({ project, actor, action: "scope.version-submitted", context: { versionId: String(version._id), versionNumber: version.number } }, session);
    return { project, version };
  });
  const recipients = await notificationRecipients(result.project, "approvers");
  const warning = await notify(emailService, recipients, "scope-review", `${result.project.name}: scope v${result.version.number} is ready`, `Scope version ${result.version.number} is ready for review in ClientScope.`);
  return { version: versionView(result.version), warning };
}

export async function postComment(projectId: string, versionId: string, actor: Actor, input: { body: string; requirementSnapshotId?: string }) {
  return transact(async (session) => {
    const { project, role } = await projectContext(projectId, actor._id, session, true);
    const version = await ScopeVersion.findOne({ _id: versionId, projectId, status: "in-review" }).session(session);
    if (!version) throw stale();
    if (input.requirementSnapshotId && !version.requirements.some((item) => String(item.snapshotId) === input.requirementSnapshotId)) {
      throw new ApiError(400, "INVALID_COMMENT_TARGET", "Select a requirement in this scope version.");
    }
    const locked = await ScopeVersion.updateOne({ _id: version._id, status: "in-review" }, { $inc: { commentSequence: 1 } }, { session });
    if (locked.modifiedCount !== 1) throw stale();
    const postedAt = new Date();
    const comment = new ScopeComment({
      workspaceId: project.workspaceId, projectId, versionId, body: input.body,
      requirementSnapshotId: input.requirementSnapshotId, authorId: actor._id,
      authorName: actor.displayName, authorRole: role, postedAt,
    });
    await comment.save({ session });
    await projectEvent({ project, actor, action: "scope.comment-posted", context: {
      versionId, versionNumber: version.number, target: input.requirementSnapshotId ? "requirement" : "scope",
    } }, session);
    return { comment: versionView(version, [comment]).comments[0] };
  });
}

function copiedDraft(project: ProjectRecord, version: InstanceType<typeof ScopeVersion>) {
  return new ScopeDraft({
    workspaceId: project.workspaceId, projectId: project._id, sourceVersionId: version._id,
    revisionToken: opaqueToken(), groups: version.groups.map((group) => group.toObject()),
    requirements: version.requirements.map((requirement) => {
      const { snapshotId: _snapshotId, ...copy } = requirement.toObject(); void _snapshotId; return copy;
    }),
  });
}

export async function decideScope(projectId: string, versionId: string, actor: Actor, input: DecisionInput, emailService: EmailService) {
  const result = await transact(async (session) => {
    const { project, role } = await projectContext(projectId, actor._id, session, true);
    if (role !== "client-approver") throw notFound();
    const now = new Date();
    const version = await ScopeVersion.findOneAndUpdate(
      { _id: versionId, projectId, status: "in-review" },
      { $set: { status: input.outcome, terminalActorId: actor._id, terminalActorName: actor.displayName, terminalRole: role, terminalAt: now, terminalNote: input.note } },
      { returnDocument: "after", session },
    );
    if (!version) throw stale();
    const decision = new ScopeDecision({
      workspaceId: project.workspaceId, projectId, versionId, outcome: input.outcome, note: input.note,
      actorId: actor._id, actorName: actor.displayName, actorRole: "client-approver", decidedAt: now,
    });
    await decision.save({ session });
    if (input.outcome === "changes-requested") await copiedDraft(project, version).save({ session });
    await projectEvent({ project, actor, action: input.outcome === "approved" ? "scope.version-approved" : "scope.changes-requested", context: { versionId, versionNumber: version.number, outcome: input.outcome } }, session);
    return { project, version };
  });
  const recipients = await notificationRecipients(result.project, "providers");
  const warning = await notify(emailService, recipients, "scope-result", `${result.project.name}: scope v${result.version.number} ${input.outcome}`, `Scope version ${result.version.number} was ${input.outcome} in ClientScope.`);
  return { version: versionView(result.version), warning };
}

export async function withdrawScope(projectId: string, versionId: string, actor: Actor, reason: string, emailService: EmailService) {
  const result = await transact(async (session) => {
    const { project, role } = await projectContext(projectId, actor._id, session, true); assertOwner(role);
    const now = new Date();
    const version = await ScopeVersion.findOneAndUpdate(
      { _id: versionId, projectId, status: "in-review" },
      { $set: { status: "withdrawn", terminalActorId: actor._id, terminalActorName: actor.displayName, terminalRole: role, terminalAt: now, terminalNote: reason } },
      { returnDocument: "after", session },
    );
    if (!version) throw stale();
    await copiedDraft(project, version).save({ session });
    await projectEvent({ project, actor, action: "scope.review-withdrawn", context: { versionId, versionNumber: version.number, outcome: "withdrawn" } }, session);
    return { project, version };
  });
  const recipients = await notificationRecipients(result.project, "approvers");
  const warning = await notify(emailService, recipients, "scope-review", `${result.project.name}: scope v${result.version.number} withdrawn`, `Scope version ${result.version.number} is no longer awaiting review in ClientScope.`);
  return { version: versionView(result.version), warning };
}
