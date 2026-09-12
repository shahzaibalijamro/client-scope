/* eslint-disable @typescript-eslint/no-explicit-any -- persisted records are projected through explicit public allow-lists. */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import mongoose, { type ClientSession } from "mongoose";

import { ApiError } from "../errors.js";
import { ChangeRequest } from "./change-control-models.js";
import { Deliverable, DeliverableVersion } from "./deliverable-models.js";
import type { EmailService } from "./email.js";
import { CompletionReview, ArchiveLifecycle } from "./lifecycle-models.js";
import { Milestone } from "./milestone-models.js";
import {
  Activity, ClientMembership, EffectiveProjectAccess, Project, ProjectAssignment, User, Workspace, WorkspaceMembership,
} from "./models.js";
import { ScopeDraft, ScopeVersion } from "./scope-models.js";
import type { Actor, ProjectRole } from "./scope-service.js";
import type { CompletionDecisionInput } from "./lifecycle-contracts.js";

export type ProjectLifecycleState = "active" | "completion-in-review" | "completed" | "archived";
export type ReadinessBlockerCode =
  | "NO_APPROVED_SCOPE" | "NO_APPROVED_DELIVERABLE" | "NO_ACTIVE_CLIENT_APPROVER"
  | "PENDING_SCOPE_REVIEW" | "ACTIVE_CHANGE_REQUEST" | "OPEN_DELIVERABLE" | "INCOMPLETE_ACTIVE_MILESTONE";

const notFound = () => new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
const noAuthority = () => new ApiError(403, "NO_AUTHORITY", "Your current project role cannot perform this action.");
const stale = () => new ApiError(409, "STALE_LIFECYCLE", "The project lifecycle changed. Refresh and try again.");
const lifecycleConflict = () => new ApiError(409, "LIFECYCLE_CONFLICT", "This action is not available in the project's current lifecycle state.");
const token = () => randomBytes(32).toString("base64url");
const stateOf = (project: any): ProjectLifecycleState => project.lifecycleState ?? "active";

async function transact<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => { result = await work(session); });
    return result as T;
  } finally { await session.endSession(); }
}

export async function materializeProjectLifecycle(projectId: mongoose.Types.ObjectId | string, session?: ClientSession): Promise<void> {
  const stateQuery = Project.updateOne({ _id: projectId, lifecycleState: { $exists: false } }, { $set: { lifecycleState: "active" } });
  const revisionQuery = Project.updateOne({ _id: projectId, lifecycleRevision: { $exists: false } }, { $set: { lifecycleRevision: token() } });
  if (session) { stateQuery.session(session); revisionQuery.session(session); }
  await stateQuery;
  await revisionQuery;
}

async function roleFor(project: any, userId: mongoose.Types.ObjectId, session?: ClientSession, lock = false): Promise<ProjectRole | null> {
  const workspaceQuery = Workspace.findById(project.workspaceId).lean();
  if (session) workspaceQuery.session(session);
  const workspace = await workspaceQuery;
  if (workspace && String(workspace.ownerId) === String(userId)) return "workspace-owner";
  const access = lock && session
    ? await EffectiveProjectAccess.findOneAndUpdate({ projectId: project._id, userId }, { $inc: { authoritySequence: 1 } }, { returnDocument: "after", session }).lean()
    : await (() => { const query = EffectiveProjectAccess.findOne({ projectId: project._id, userId }).lean(); if (session) query.session(session); return query; })();
  return access ? access.role as ProjectRole : null;
}

async function context(projectId: string, userId: mongoose.Types.ObjectId, session?: ClientSession, lock = false) {
  await materializeProjectLifecycle(projectId, session);
  const query = Project.findById(projectId);
  if (session) query.session(session);
  const project = await query;
  if (!project) throw notFound();
  const role = await roleFor(project, userId, session, lock);
  if (!role) throw notFound();
  return { project, role };
}

function actorView(actor: any) {
  return { id: String(actor.id), displayName: actor.displayName, role: actor.role };
}

function roundView(round: any) {
  return {
    id: String(round._id), number: round.number, status: round.status, revisionToken: round.revisionToken,
    requester: actorView(round.requester), requestedAt: new Date(round.requestedAt).toISOString(),
    ...(round.requestSummary ? { requestSummary: round.requestSummary } : {}),
    readiness: {
      scope: { id: String(round.readiness.scope.id), number: round.readiness.scope.number },
      deliverables: round.readiness.deliverables.map((item: any) => ({ id: String(item.id), number: item.number, title: item.title, versionId: String(item.versionId), versionNumber: item.versionNumber })),
      milestones: round.readiness.milestones.map((item: any) => ({ id: String(item.id), title: item.title, status: item.status })),
      evaluatedAt: new Date(round.readiness.evaluatedAt).toISOString(),
    },
    ...(round.terminalAt ? {
      terminal: { actor: actorView(round.terminalActor), at: new Date(round.terminalAt).toISOString(), outcome: round.terminalOutcome, ...(round.terminalNote ? { note: round.terminalNote } : {}) },
    } : {}),
  };
}

function archiveView(record: any) {
  return {
    id: String(record._id), action: record.action, actor: actorView(record.actor), occurredAt: new Date(record.occurredAt).toISOString(),
    reason: record.reason, previousState: record.previousState, nextState: record.nextState,
  };
}

async function readiness(projectId: mongoose.Types.ObjectId | string, session?: ClientSession) {
  const withSession = <T>(query: any): Promise<T> => session ? query.session(session) : query;
  const [scope, draft, pendingScope, approvers, activeChange, openDeliverables, approvedDeliverables, incompleteMilestones, activeMilestones] = await Promise.all([
    withSession<any>(ScopeVersion.findOne({ projectId, status: "approved" }).sort({ number: -1 }).lean()),
    withSession<any>(ScopeDraft.findOne({ projectId }).select("_id").lean()),
    withSession<any>(ScopeVersion.findOne({ projectId, status: "in-review" }).select("_id").lean()),
    withSession<any[]>(ClientMembership.find({ projectId, status: "active", role: "client-approver" }).select("_id").lean()),
    withSession<any>(ChangeRequest.findOne({ projectId, state: { $nin: ["approved", "rejected", "canceled"] } }).select("_id state").lean()),
    withSession<any[]>(Deliverable.find({ projectId, state: { $in: ["draft", "in-review", "revision-draft"] } }).select("_id number").lean()),
    withSession<any[]>(Deliverable.find({ projectId, state: "approved" }).select("_id number title").sort({ number: 1 }).lean()),
    withSession<any[]>(Milestone.find({ projectId, active: true, status: { $ne: "completed" } }).select("_id title status").sort({ position: 1 }).lean()),
    withSession<any[]>(Milestone.find({ projectId, active: true }).select("_id title status").sort({ position: 1 }).lean()),
  ]);
  const versions = approvedDeliverables.length
    ? await withSession<any[]>(DeliverableVersion.find({ deliverableId: { $in: approvedDeliverables.map((item) => item._id) }, projectId, outcome: "approved" }).select("deliverableId number").sort({ number: -1 }).lean())
    : [];
  const versionByDeliverable = new Map<string, any>();
  for (const version of versions) if (!versionByDeliverable.has(String(version.deliverableId))) versionByDeliverable.set(String(version.deliverableId), version);
  const blockers: Array<{ code: ReadinessBlockerCode; count?: number; ids?: string[] }> = [];
  if (!scope) blockers.push({ code: "NO_APPROVED_SCOPE" });
  if (!approvedDeliverables.length) blockers.push({ code: "NO_APPROVED_DELIVERABLE" });
  if (!approvers.length) blockers.push({ code: "NO_ACTIVE_CLIENT_APPROVER" });
  if (draft || pendingScope) blockers.push({ code: "PENDING_SCOPE_REVIEW", count: Number(Boolean(draft)) + Number(Boolean(pendingScope)) });
  if (activeChange) blockers.push({ code: "ACTIVE_CHANGE_REQUEST", ids: [String(activeChange._id)] });
  if (openDeliverables.length) blockers.push({ code: "OPEN_DELIVERABLE", count: openDeliverables.length, ids: openDeliverables.map((item) => String(item._id)) });
  if (incompleteMilestones.length) blockers.push({ code: "INCOMPLETE_ACTIVE_MILESTONE", count: incompleteMilestones.length, ids: incompleteMilestones.map((item) => String(item._id)) });
  return {
    ready: blockers.length === 0, blockers,
    snapshot: scope ? {
      scope: { id: scope._id, number: scope.number },
      deliverables: approvedDeliverables.map((item) => {
        const version = versionByDeliverable.get(String(item._id));
        return { id: item._id, number: item.number, title: item.title, versionId: version?._id, versionNumber: version?.number };
      }),
      milestones: activeMilestones.map((item) => ({ id: item._id, title: item.title, status: item.status })),
      evaluatedAt: new Date(),
    } : undefined,
  };
}

function permissions(role: ProjectRole, state: ProjectLifecycleState, ready: boolean) {
  return {
    canRequestCompletion: role === "workspace-owner" && state === "active" && ready,
    canWithdrawCompletion: role === "workspace-owner" && state === "completion-in-review",
    canDecideCompletion: role === "client-approver" && state === "completion-in-review",
    canArchive: role === "workspace-owner" && state === "completed",
    canRestore: role === "workspace-owner" && state === "archived",
  };
}

async function projection(project: any, role: ProjectRole, session?: ClientSession) {
  const state = stateOf(project);
  const provider = role === "workspace-owner" || role === "service-team-member";
  const ready = state === "active" && provider ? await readiness(project._id, session) : undefined;
  const roundsQuery = CompletionReview.find({ projectId: project._id }).sort({ number: -1 }).lean();
  const archiveQuery = ArchiveLifecycle.find({ projectId: project._id }).sort({ occurredAt: -1, _id: -1 }).lean();
  if (session) { roundsQuery.session(session); archiveQuery.session(session); }
  const [rounds, archiveHistory] = await Promise.all([roundsQuery, archiveQuery]);
  return {
    state, revision: project.lifecycleRevision, readOnly: state !== "active",
    permissions: permissions(role, state, Boolean(ready?.ready)),
    ...(ready ? { readiness: { ready: ready.ready, blockers: ready.blockers } } : {}),
    currentRoundId: project.currentCompletionRoundId ? String(project.currentCompletionRoundId) : undefined,
    rounds: rounds.map(roundView), archiveHistory: archiveHistory.map(archiveView),
  };
}

export async function readLifecycle(projectId: string, userId: mongoose.Types.ObjectId) {
  const { project, role } = await context(projectId, userId);
  return projection(project, role);
}

export async function lifecycleSummary(project: any, role: ProjectRole) {
  const state = stateOf(project);
  const provider = role === "workspace-owner" || role === "service-team-member";
  const currentReadiness = state === "active" && provider ? await readiness(project._id) : undefined;
  const pendingAction = state === "completion-in-review"
    ? role === "client-approver" ? "completion-decision" : "completion-pending"
    : state === "active" && role === "workspace-owner" && currentReadiness?.ready ? "completion-ready"
      : undefined;
  return {
    state, readOnly: state !== "active", pendingAction,
    permissions: permissions(role, state, Boolean(currentReadiness?.ready)),
  };
}

async function lifecycleEvent(project: any, actor: Actor, role: ProjectRole, action: string, roundNumber: number | undefined, now: Date, session: ClientSession, roundId?: string) {
  await new Activity({
    workspaceId: project.workspaceId, projectId: project._id, actorId: actor._id, actorName: actor.displayName,
    action, audience: "project", occurredAt: now,
    context: { actorRole: role, projectName: project.name, ...(roundNumber ? { roundNumber } : {}), ...(roundId ? { roundId } : {}) },
  }).save({ session });
}

async function recipients(project: any, kind: "approvers" | "providers") {
  const userIds: mongoose.Types.ObjectId[] = kind === "approvers" ? await (async () => {
    const memberships = await ClientMembership.find({ projectId: project._id, status: "active", role: "client-approver" }).select("userId").lean();
    return memberships.map((item) => item.userId);
  })() : await (async () => {
    const workspace = await Workspace.findById(project.workspaceId).select("ownerId").lean();
    const assignments = await ProjectAssignment.find({ projectId: project._id, status: "active" }).select("userId").lean();
    const activeMembers = await WorkspaceMembership.find({ workspaceId: project.workspaceId, status: "active", userId: { $in: assignments.map((item) => item.userId) } }).select("userId").lean();
    return [...(workspace ? [workspace.ownerId] : []), ...activeMembers.map((item) => item.userId)];
  })();
  const users = await User.find({ _id: { $in: userIds } }).select("email normalizedEmail").lean();
  const unique = new Map(users.map((item) => [item.normalizedEmail, item.email]));
  return [...unique.values()];
}

async function notify(email: EmailService, to: string[], category: "completion-review" | "completion-result", subject: string, text: string) {
  const results = await Promise.all(to.map(async (recipient) => {
    try { return await email.send({ category, to: recipient, subject, text }); } catch { return { delivered: false }; }
  }));
  return results.some((item) => !item.delivered) ? "The action was saved, but some notification email could not be sent." : undefined;
}

export async function requestCompletion(projectId: string, actor: Actor, input: { lifecycleRevision: string; summary?: string }, email: EmailService) {
  const result = await transact(async (session) => {
    const { project: visible, role } = await context(projectId, actor._id, session, true);
    if (role !== "workspace-owner") throw noAuthority();
    const nextRevision = token();
    const project = await Project.findOneAndUpdate(
      { _id: visible._id, lifecycleRevision: input.lifecycleRevision, $or: [{ lifecycleState: "active" }, { lifecycleState: { $exists: false } }] },
      { $set: { lifecycleState: "completion-in-review", lifecycleRevision: nextRevision }, $inc: { nextCompletionRoundNumber: 1, workflowSequence: 1 } },
      { returnDocument: "after", session },
    );
    if (!project) {
      const current = await Project.findById(visible._id).session(session).lean();
      if (current && stateOf(current) !== "active") throw lifecycleConflict();
      throw stale();
    }
    const currentReadiness = await readiness(project._id, session);
    if (!currentReadiness.ready || !currentReadiness.snapshot) {
      throw new ApiError(409, "COMPLETION_NOT_READY", "Resolve every completion blocker before requesting final review.", { blockers: currentReadiness.blockers });
    }
    const now = new Date();
    const round = new CompletionReview({
      workspaceId: project.workspaceId, projectId: project._id, number: project.nextCompletionRoundNumber,
      status: "in-review", current: true, revisionToken: token(),
      requester: { id: actor._id, displayName: actor.displayName, role }, requestedAt: now,
      requestSummary: input.summary, readiness: { ...currentReadiness.snapshot, evaluatedAt: now },
    });
    await round.save({ session });
    project.currentCompletionRoundId = round._id; await project.save({ session });
    await lifecycleEvent(project, actor, role, "project.completion-requested", round.number, now, session, String(round._id));
    return { project, role, round };
  });
  const warning = await notify(email, await recipients(result.project, "approvers"), "completion-review", `${result.project.name}: final review requested`, `Completion round ${result.round.number} is ready for your decision in ClientScope.`);
  return { lifecycle: await projection(result.project, result.role), warning };
}

async function endRound(projectId: string, roundId: string, actor: Actor, lifecycleRevision: string, outcome: "approved" | "returned" | "withdrawn", note: string | undefined, email: EmailService) {
  const result = await transact(async (session) => {
    const { project: visible, role } = await context(projectId, actor._id, session, true);
    if (outcome === "withdrawn" ? role !== "workspace-owner" : role !== "client-approver") throw noAuthority();
    if (String(visible.currentCompletionRoundId) !== roundId || visible.lifecycleRevision !== lifecycleRevision) throw stale();
    if (stateOf(visible) !== "completion-in-review") throw lifecycleConflict();
    const now = new Date();
    const nextState = outcome === "approved" ? "completed" : "active";
    const project = await Project.findOneAndUpdate(
      { _id: visible._id, lifecycleState: "completion-in-review", lifecycleRevision, currentCompletionRoundId: roundId },
      { $set: { lifecycleState: nextState, lifecycleRevision: token() }, $unset: { currentCompletionRoundId: 1 }, $inc: { workflowSequence: 1 } },
      { returnDocument: "after", session },
    );
    if (!project) throw stale();
    const round = await CompletionReview.findOneAndUpdate(
      { _id: roundId, projectId: project._id, status: "in-review", current: true },
      { $set: { status: outcome, current: false, terminalActor: { id: actor._id, displayName: actor.displayName, role }, terminalAt: now, terminalOutcome: outcome, terminalNote: note, revisionToken: token() } },
      { returnDocument: "after", session },
    );
    if (!round) throw stale();
    const action = outcome === "approved" ? "project.completion-approved" : outcome === "returned" ? "project.completion-returned" : "project.completion-withdrawn";
    await lifecycleEvent(project, actor, role, action, round.number, now, session, String(round._id));
    return { project, role, round };
  });
  const kind = outcome === "withdrawn" ? "approvers" : "providers";
  const warning = await notify(email, await recipients(result.project, kind), outcome === "withdrawn" ? "completion-review" : "completion-result", `${result.project.name}: completion ${outcome}`, `Completion round ${result.round.number} was ${outcome} in ClientScope.`);
  return { lifecycle: await projection(result.project, result.role), warning };
}

export function decideCompletion(projectId: string, roundId: string, actor: Actor, input: CompletionDecisionInput, email: EmailService) {
  return endRound(projectId, roundId, actor, input.lifecycleRevision, input.outcome, input.outcome === "approved" ? input.note : input.reason, email);
}

export function withdrawCompletion(projectId: string, roundId: string, actor: Actor, input: { lifecycleRevision: string; reason: string }, email: EmailService) {
  return endRound(projectId, roundId, actor, input.lifecycleRevision, "withdrawn", input.reason, email);
}

export async function transitionArchive(projectId: string, actor: Actor, input: { lifecycleRevision: string; reason: string }, action: "archived" | "restored") {
  return transact(async (session) => {
    const { project: visible, role } = await context(projectId, actor._id, session, true);
    if (role !== "workspace-owner") throw noAuthority();
    const previousState = action === "archived" ? "completed" : "archived";
    const nextState = action === "archived" ? "archived" : "completed";
    if (stateOf(visible) !== previousState) throw lifecycleConflict();
    const now = new Date();
    const project = await Project.findOneAndUpdate(
      { _id: visible._id, lifecycleState: previousState, lifecycleRevision: input.lifecycleRevision },
      { $set: { lifecycleState: nextState, lifecycleRevision: token() }, $inc: { workflowSequence: 1 } },
      { returnDocument: "after", session },
    );
    if (!project) throw stale();
    await new ArchiveLifecycle({ workspaceId: project.workspaceId, projectId: project._id, action, actor: { id: actor._id, displayName: actor.displayName, role }, occurredAt: now, reason: input.reason, previousState, nextState }).save({ session });
    await lifecycleEvent(project, actor, role, `project.${action}`, undefined, now, session);
    return { lifecycle: await projection(project, role, session) };
  });
}

const activityFields: Record<string, string[]> = {
  "project.created": ["projectName", "clientName"], "client.joined": ["membershipId", "role"],
  "service-member.assigned": ["assignmentId", "memberName"], "service-member.unassigned": ["assignmentId", "memberName"], "service-member.workspace-access-ended": ["assignmentId", "memberName", "reason"],
  "client-member.role-changed": ["membershipId", "memberName", "previousRole", "role"], "client-member.left": ["membershipId", "memberName", "role"], "client-member.removed": ["membershipId", "memberName", "role"],
  "scope.version-submitted": ["versionId", "versionNumber"], "scope.comment-posted": ["versionId", "versionNumber", "target"], "scope.version-approved": ["versionId", "versionNumber", "outcome"],
  "scope.changes-requested": ["versionId", "versionNumber", "outcome"], "scope.review-withdrawn": ["versionId", "versionNumber", "outcome"],
  "change-request.proposal-submitted": ["requestId", "requestNumber", "proposalId", "proposalNumber", "baseScopeVersionNumber"], "change-request.comment-posted": ["requestId", "proposalId", "proposalNumber", "target", "comparisonKind"],
  "change-request.approved": ["requestId", "requestNumber", "proposalId", "proposalNumber", "outcome"], "change-request.rejected": ["requestId", "requestNumber", "proposalId", "proposalNumber", "outcome"],
  "change-request.changes-requested": ["requestId", "requestNumber", "proposalId", "proposalNumber", "outcome"], "change-request.proposal-withdrawn": ["requestId", "requestNumber", "proposalId", "proposalNumber"], "change-request.canceled": ["requestId", "requestNumber"],
  "milestone.created": ["milestoneId", "title", "status"], "milestone.edited": ["milestoneId"], "milestone.status-transitioned": ["milestoneId", "previousStatus", "nextStatus"],
  "milestone.reordered": [], "milestone.archived": ["milestoneId", "title", "status"],
  "deliverable.submitted": ["deliverableId", "deliverableNumber", "versionId", "versionNumber", "scopeVersionNumber"], "deliverable.commented": ["deliverableId", "deliverableNumber", "versionId", "versionNumber"],
  "deliverable.approved": ["deliverableId", "deliverableNumber", "versionId", "versionNumber", "outcome"], "deliverable.revision-requested": ["deliverableId", "deliverableNumber", "versionId", "versionNumber", "outcome"],
  "deliverable.withdrawn": ["deliverableId", "deliverableNumber", "versionId", "versionNumber", "outcome"], "deliverable.canceled": ["deliverableId", "deliverableNumber", "outcome"],
  "project.completion-requested": ["projectName", "roundId", "roundNumber"], "project.completion-approved": ["projectName", "roundId", "roundNumber"],
  "project.completion-returned": ["projectName", "roundId", "roundNumber"], "project.completion-withdrawn": ["projectName", "roundId", "roundNumber"],
  "project.archived": ["projectName"], "project.restored": ["projectName"],
};

const cursorSecret = () => process.env.SESSION_SECRET ?? "clientscope-development-session-secret";
const sign = (value: string) => createHmac("sha256", cursorSecret()).update(value).digest("base64url");
function encodeCursor(projectId: string, occurredAt: Date, id: mongoose.Types.ObjectId) {
  const payload = Buffer.from(JSON.stringify({ projectId, occurredAt: occurredAt.toISOString(), id: String(id) })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
function decodeCursor(value: string, projectId: string) {
  try {
    const [payload, signature, extra] = value.split(".");
    if (!payload || !signature || extra || !timingSafeEqual(Buffer.from(signature), Buffer.from(sign(payload)))) throw new Error();
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (parsed.projectId !== projectId || !mongoose.isValidObjectId(parsed.id) || Number.isNaN(new Date(parsed.occurredAt).valueOf())) throw new Error();
    return { occurredAt: new Date(parsed.occurredAt), id: new mongoose.Types.ObjectId(parsed.id) };
  } catch { throw new ApiError(400, "INVALID_CURSOR", "The activity cursor is invalid."); }
}

function activityView(record: any) {
  const keys = activityFields[record.action] ?? [];
  const entity = Object.fromEntries(keys.flatMap((key) => record.context?.[key] === undefined ? [] : [[key, record.context[key]]]));
  const role = typeof record.context?.actorRole === "string" ? record.context.actorRole : undefined;
  return {
    id: String(record._id), type: record.action, occurredAt: new Date(record.occurredAt).toISOString(),
    ...(record.actorId && record.actorName ? { actor: { id: String(record.actorId), displayName: record.actorName, ...(role ? { role } : {}) } } : {}),
    entity,
  };
}

export async function readActivity(projectId: string, userId: mongoose.Types.ObjectId, input: { cursor?: string; limit: number }) {
  const { project } = await context(projectId, userId);
  const after = input.cursor ? decodeCursor(input.cursor, String(project._id)) : undefined;
  const filter: any = { projectId: project._id, audience: "project", action: { $in: Object.keys(activityFields) } };
  if (after) filter.$or = [{ occurredAt: { $lt: after.occurredAt } }, { occurredAt: after.occurredAt, _id: { $lt: after.id } }];
  const records = await Activity.find(filter).sort({ occurredAt: -1, _id: -1 }).limit(input.limit + 1).lean();
  const page = records.slice(0, input.limit);
  const last = page.at(-1);
  return { items: page.map(activityView), nextCursor: records.length > input.limit && last ? encodeCursor(String(project._id), last.occurredAt, last._id) : undefined };
}
