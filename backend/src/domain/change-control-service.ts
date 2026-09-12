/* eslint-disable @typescript-eslint/no-explicit-any -- persisted records are serialized through explicit public allow-lists. */
import { randomBytes } from "node:crypto";

import mongoose, { type ClientSession } from "mongoose";

import { ApiError } from "../errors.js";
import { compareTargetScopes, metadataComparison, type TargetScope } from "./change-comparison.js";
import type { ChangeDecisionInput, ChangeDraftInput, ComparisonKind } from "./change-control-contracts.js";
import { changeDraftInput } from "./change-control-contracts.js";
import { ChangeComment, ChangeDecision, ChangeItem, ChangeProposal, ChangeProposalDraft, ChangeRequest } from "./change-control-models.js";
import type { EmailService } from "./email.js";
import { EffectiveProjectAccess } from "./models.js";
import { ScopeVersion } from "./scope-models.js";
import {
  assertOwner, assertProvider, notificationRecipients, notify, projectContext, projectEvent,
  type Actor, type ProjectRecord, type ProjectRole,
} from "./scope-service.js";

const stale = () => new ApiError(409, "STALE_STATE", "The change request changed. Refresh and try again.");
const conflict = (message: string) => new ApiError(409, "CHANGE_REQUEST_CONFLICT", message);
const invalid = (message: string) => new ApiError(400, "VALIDATION_ERROR", message);
const token = () => randomBytes(32).toString("base64url");
const oid = () => new mongoose.Types.ObjectId();

async function transact<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => { result = await work(session); });
    return result as T;
  } finally { await session.endSession(); }
}

function groupView(group: any) { return { id: String(group.id), name: group.name, order: group.order }; }
function requirementView(requirement: any) {
  return {
    ...(requirement.snapshotId ? { snapshotId: String(requirement.snapshotId) } : {}), logicalId: String(requirement.logicalId),
    ...(requirement.groupId ? { groupId: String(requirement.groupId) } : {}), title: requirement.title,
    description: requirement.description, acceptanceCriteria: [...requirement.acceptanceCriteria], order: requirement.order,
  };
}
function targetView(record: any) {
  return {
    groups: [...record.groups].sort((a, b) => a.order - b.order || String(a.id).localeCompare(String(b.id))).map(groupView),
    requirements: [...record.requirements].sort((a, b) => a.order - b.order || String(a.logicalId).localeCompare(String(b.logicalId))).map(requirementView),
  };
}
function actorView(id: unknown, name: unknown, role: unknown) { return { id: String(id), displayName: String(name), role: String(role) }; }
function draftView(draft: any, titleFrozen: boolean) {
  return {
    revisionToken: draft.revisionToken, copiedFromProposalId: draft.copiedFromProposalId ? String(draft.copiedFromProposalId) : undefined,
    title: draft.title, titleFrozen, rationale: draft.rationale, impactSummary: draft.impactSummary,
    revisionSummary: draft.revisionSummary, ...targetView(draft),
  };
}
function itemView(item: any) {
  return {
    id: String(item._id), comparisonKind: item.comparisonKind, entityKind: item.entityKind,
    entityId: String(item.entityId), changeKinds: [...item.changeKinds], before: item.before, after: item.after, position: item.position,
  };
}
function commentView(comment: any) {
  return {
    id: String(comment._id), body: comment.body, comparisonKind: comment.comparisonKind,
    changeItemId: comment.changeItemId ? String(comment.changeItemId) : undefined,
    author: actorView(comment.authorId, comment.authorName, comment.authorRole), postedAt: new Date(comment.postedAt).toISOString(),
  };
}
function proposalView(proposal: any, items: any[], comments: any[], decision?: any) {
  const terminal = proposal.terminalAt ? {
    actor: actorView(proposal.terminalActorId, proposal.terminalActorName, proposal.terminalActorRole),
    at: new Date(proposal.terminalAt).toISOString(), note: proposal.terminalNote,
  } : undefined;
  return {
    id: String(proposal._id), number: proposal.number, outcome: proposal.outcome, title: proposal.title,
    rationale: proposal.rationale, impactSummary: proposal.impactSummary, revisionSummary: proposal.revisionSummary,
    baseScopeVersion: { id: String(proposal.baseScopeVersionId), number: proposal.baseScopeVersionNumber }, ...targetView(proposal),
    comparisons: {
      baseScope: items.filter((item) => item.comparisonKind === "base-scope").map(itemView),
      previousProposal: items.filter((item) => item.comparisonKind === "previous-proposal").map(itemView),
      previousMetadata: proposal.previousMetadata,
    },
    submitter: actorView(proposal.submitterId, proposal.submitterName, proposal.submitterRole),
    submittedAt: new Date(proposal.submittedAt).toISOString(), terminal,
    decision: decision ? { outcome: decision.outcome, note: decision.note, actor: actorView(decision.actorId, decision.actorName, decision.actorRole), decidedAt: new Date(decision.decidedAt).toISOString() } : undefined,
    comments: comments.map(commentView),
  };
}

function requestPermissions(role: ProjectRole, state: string, mutable = true) {
  const provider = role === "workspace-owner" || role === "service-team-member";
  return {
    canEditDraft: mutable && provider && (state === "draft" || state === "revision-draft"),
    canSubmit: mutable && role === "workspace-owner" && (state === "draft" || state === "revision-draft"),
    canDiscard: mutable && role === "workspace-owner" && state === "draft",
    canWithdraw: mutable && role === "workspace-owner" && state === "in-review",
    canCancel: mutable && role === "workspace-owner" && state === "revision-draft",
    canComment: mutable && state === "in-review",
    canDecide: mutable && role === "client-approver" && state === "in-review",
  };
}

export function requestTransitionAllowed(from: string, to: string): boolean {
  return (from === "draft" && to === "in-review") || (from === "revision-draft" && (to === "in-review" || to === "canceled")) ||
    (from === "in-review" && ["revision-draft", "approved", "rejected"].includes(to));
}
export function proposalTransitionAllowed(from: string, to: string): boolean {
  return from === "in-review" && ["approved", "changes-requested", "rejected", "withdrawn"].includes(to);
}

export async function readChangeControl(projectId: string, userId: mongoose.Types.ObjectId) {
  const { project, role } = await projectContext(projectId, userId);
  const mutable = !project.lifecycleState || project.lifecycleState === "active";
  const provider = role === "workspace-owner" || role === "service-team-member";
  const requestFilter = provider ? { projectId } : { projectId, number: { $exists: true } };
  const requests = await ChangeRequest.find(requestFilter).sort({ createdAt: -1 }).lean();
  const requestIds = requests.map((request) => request._id);
  const [drafts, proposals, items, comments, decisions, currentScope] = await Promise.all([
    provider ? ChangeProposalDraft.find({ requestId: { $in: requestIds } }).lean() : [],
    ChangeProposal.find({ requestId: { $in: requestIds } }).sort({ number: -1 }).lean(),
    ChangeItem.find({ requestId: { $in: requestIds } }).sort({ position: 1, _id: 1 }).lean(),
    ChangeComment.find({ requestId: { $in: requestIds } }).sort({ postedAt: 1, _id: 1 }).lean(),
    ChangeDecision.find({ requestId: { $in: requestIds } }).lean(),
    ScopeVersion.findOne({ projectId, status: "approved" }).select("number").lean(),
  ]);
  const active = requests.find((request) => request.active);
  const topPermissions = { canStart: provider && !active && Boolean(currentScope) };
  const pendingAction = active && role === "client-approver" && active.state === "in-review" ? "decision-required"
    : active && provider && active.state === "revision-draft" ? "change-revision"
      : active && provider && active.state === "draft" ? (role === "workspace-owner" ? "change-submission" : "change-editing")
        : active && role === "workspace-owner" && active.state === "revision-draft" ? "change-submission" : undefined;
  return {
    role, pendingAction, permissions: topPermissions,
    requests: requests.map((request) => {
      const requestProposals = proposals.filter((proposal) => String(proposal.requestId) === String(request._id));
      const draft = drafts.find((candidate) => String(candidate.requestId) === String(request._id));
      return {
        id: String(request._id), number: request.number, title: request.title, state: request.state,
        baseScopeVersion: { id: String(request.baseScopeVersionId), number: request.baseScopeVersionNumber },
        creator: actorView(request.creatorId, request.creatorName, request.creatorRole), createdAt: new Date(request.createdAt).toISOString(),
        terminal: request.terminalAt ? { actor: actorView(request.terminalActorId, request.terminalActorName, request.terminalActorRole), at: new Date(request.terminalAt).toISOString(), reason: request.terminalReason } : undefined,
        permissions: requestPermissions(role, request.state, mutable), ...(draft ? { draft: draftView(draft, Boolean(request.number)) } : {}),
        proposals: requestProposals.map((proposal) => proposalView(
          proposal,
          items.filter((item) => String(item.proposalId) === String(proposal._id)),
          comments.filter((comment) => String(comment.proposalId) === String(proposal._id)),
          decisions.find((decision) => String(decision.proposalId) === String(proposal._id)),
        )),
      };
    }),
  };
}

export async function changeControlSummary(projectId: string | mongoose.Types.ObjectId, role: ProjectRole) {
  const active = await ChangeRequest.findOne({ projectId, active: true }).select("state").lean();
  const provider = role === "workspace-owner" || role === "service-team-member";
  const pendingAction = active?.state === "in-review" && role === "client-approver" ? "decision-required"
    : active?.state === "revision-draft" && provider ? "change-revision"
      : active?.state === "draft" && provider ? (role === "workspace-owner" ? "change-submission" : "change-editing") : undefined;
  return active ? { state: active.state, pendingAction } : undefined;
}

export async function startChangeRequest(projectId: string, actor: Actor, title: string) {
  try {
    return await transact(async (session) => {
      const { project, role } = await projectContext(projectId, actor._id, session, true); assertProvider(role);
      if (await ChangeRequest.exists({ projectId, active: true }).session(session)) throw conflict("Finish the active change request before starting another.");
      const base = await ScopeVersion.findOne({ projectId, status: "approved" }).session(session);
      if (!base) throw conflict("Approve the current scope before starting a change request.");
      const request = new ChangeRequest({
        workspaceId: project.workspaceId, projectId, title, baseScopeVersionId: base._id, baseScopeVersionNumber: base.number,
        state: "draft", active: true, creatorId: actor._id, creatorName: actor.displayName, creatorRole: role,
      });
      await request.save({ session });
      const draft = new ChangeProposalDraft({
        workspaceId: project.workspaceId, projectId, requestId: request._id, revisionToken: token(), title,
        rationale: "", groups: base.groups.map((group) => group.toObject()),
        requirements: base.requirements.map((requirement) => {
          const { snapshotId: _snapshotId, ...value } = requirement.toObject(); void _snapshotId; return value;
        }),
      });
      await draft.save({ session });
      return { requestId: String(request._id), draft: draftView(draft, false) };
    });
  } catch (error) {
    if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) throw conflict("Finish the active change request before starting another.");
    throw error;
  }
}

export async function updateChangeDraft(projectId: string, requestId: string, actor: Actor, input: ChangeDraftInput) {
  return transact(async (session) => {
    const { role } = await projectContext(projectId, actor._id, session, true); assertProvider(role);
    const request = await ChangeRequest.findOne({ _id: requestId, projectId, active: true, state: { $in: ["draft", "revision-draft"] } }).session(session);
    if (!request) throw stale();
    const draft = await ChangeProposalDraft.findOne({ requestId, projectId, revisionToken: input.revisionToken }).session(session);
    if (!draft) throw stale();
    if (request.number && input.title !== request.title) throw invalid("The change request title is frozen after its first submission.");
    const knownGroups = new Set(draft.groups.map((group) => String(group.id)));
    const knownRequirements = new Set(draft.requirements.map((item) => String(item.logicalId)));
    if (input.groups.some((group) => group.id && !knownGroups.has(group.id)) || input.requirements.some((item) => item.logicalId && !knownRequirements.has(item.logicalId))) {
      throw invalid("The proposal contains an invalid item reference.");
    }
    const groups = input.groups.map((group) => ({ ...group, id: group.id ? new mongoose.Types.ObjectId(group.id) : oid() }));
    const validGroups = new Set(groups.map((group) => String(group.id)));
    const requirements = input.requirements.map((item) => ({
      ...item, logicalId: item.logicalId ? new mongoose.Types.ObjectId(item.logicalId) : oid(),
      groupId: item.groupId ? new mongoose.Types.ObjectId(item.groupId) : undefined,
    }));
    if (requirements.some((item) => item.groupId && !validGroups.has(String(item.groupId)))) throw invalid("Select a group in this proposal draft.");
    const nextToken = token();
    const updated = await ChangeProposalDraft.findOneAndUpdate(
      { _id: draft._id, revisionToken: input.revisionToken },
      { $set: { title: request.number ? request.title : input.title, rationale: input.rationale, impactSummary: input.impactSummary, revisionSummary: input.revisionSummary, groups, requirements, revisionToken: nextToken } },
      { returnDocument: "after", session },
    );
    if (!updated) throw stale();
    if (!request.number && request.title !== input.title) await ChangeRequest.updateOne({ _id: request._id, state: "draft" }, { $set: { title: input.title } }, { session });
    return { requestId, draft: draftView(updated, Boolean(request.number)) };
  });
}

export async function discardChangeRequest(projectId: string, requestId: string, actor: Actor) {
  return transact(async (session) => {
    const { role } = await projectContext(projectId, actor._id, session, true); assertOwner(role);
    const request = await ChangeRequest.findOne({ _id: requestId, projectId, state: "draft", active: true, number: { $exists: false } }).session(session);
    if (!request || await ChangeProposal.exists({ requestId }).session(session)) throw stale();
    const deletedDraft = await ChangeProposalDraft.deleteOne({ requestId }, { session });
    const deletedRequest = await ChangeRequest.deleteOne({ _id: requestId, state: "draft" }, { session });
    if (deletedDraft.deletedCount !== 1 || deletedRequest.deletedCount !== 1) throw stale();
    return { message: "The private change request draft was discarded." };
  });
}

function validateDraft(draft: any, laterVersion: boolean) {
  const target = targetView(draft);
  const parsed = changeDraftInput.safeParse({
    revisionToken: draft.revisionToken, title: draft.title, rationale: draft.rationale,
    impactSummary: draft.impactSummary, revisionSummary: draft.revisionSummary, ...target,
  });
  if (!parsed.success || draft.requirements.length === 0) throw invalid("Complete the proposal title, rationale, and at least one valid requirement before submission.");
  if (laterVersion && !draft.revisionSummary) throw invalid("Add a revision summary before submitting this proposal version.");
}

export async function submitChangeProposal(projectId: string, requestId: string, actor: Actor, revisionToken: string, emailService: EmailService) {
  const result = await transact(async (session) => {
    const { project, role } = await projectContext(projectId, actor._id, session, true); assertOwner(role);
    const request = await ChangeRequest.findOne({ _id: requestId, projectId, active: true, state: { $in: ["draft", "revision-draft"] } }).session(session);
    const draft = await ChangeProposalDraft.findOne({ requestId, projectId, revisionToken }).session(session);
    if (!request || !draft) throw stale();
    const previous = await ChangeProposal.findOne({ requestId }).sort({ number: -1 }).session(session);
    validateDraft(draft, Boolean(previous));
    const base = await ScopeVersion.findOne({ _id: request.baseScopeVersionId, projectId, status: "approved" }).session(session);
    if (!base) throw stale();
    const approver = await EffectiveProjectAccess.findOneAndUpdate(
      { projectId: project._id, role: "client-approver" }, { $inc: { authoritySequence: 1 } }, { returnDocument: "after", session },
    );
    if (!approver) throw new ApiError(409, "APPROVER_REQUIRED", "Add an active Client Approver before submitting this proposal.");
    const proposalTarget = targetView(draft) as TargetScope;
    const baseItems = compareTargetScopes(targetView(base) as TargetScope, proposalTarget, "base-scope");
    if (!baseItems.length) throw new ApiError(409, "NO_MATERIAL_CHANGE", "Change at least one scope group or requirement before submission.");
    const previousItems = previous ? compareTargetScopes(targetView(previous) as TargetScope, proposalTarget, "previous-proposal") : [];
    const requestNumber = request.number ?? ((await ChangeRequest.findOne({ projectId, number: { $exists: true } }).sort({ number: -1 }).session(session).lean())?.number ?? 0) + 1;
    const proposalNumber = (previous?.number ?? 0) + 1;
    const submittedAt = new Date();
    const proposal = new ChangeProposal({
      workspaceId: project.workspaceId, projectId, requestId, number: proposalNumber, outcome: "in-review", open: true,
      title: request.title, rationale: draft.rationale, impactSummary: draft.impactSummary, revisionSummary: draft.revisionSummary,
      baseScopeVersionId: request.baseScopeVersionId, baseScopeVersionNumber: request.baseScopeVersionNumber,
      groups: draft.groups.map((group) => group.toObject()), requirements: draft.requirements.map((item) => ({ ...item.toObject(), snapshotId: oid() })),
      previousMetadata: previous ? metadataComparison(previous, draft) : undefined,
      submitterId: actor._id, submitterName: actor.displayName, submitterRole: "workspace-owner", submittedAt,
    });
    await proposal.save({ session });
    await ChangeItem.insertMany([...baseItems, ...previousItems].map((item) => ({
      ...item, workspaceId: project.workspaceId, projectId, requestId, proposalId: proposal._id, entityId: new mongoose.Types.ObjectId(item.entityId),
    })), { session });
    const removed = await ChangeProposalDraft.deleteOne({ _id: draft._id, revisionToken }, { session });
    const closed = await ChangeRequest.updateOne({ _id: requestId, state: request.state, active: true }, { $set: { number: requestNumber, state: "in-review", title: request.title } }, { session });
    if (removed.deletedCount !== 1 || closed.modifiedCount !== 1) throw stale();
    await projectEvent({ project, actor, role, action: "change-request.proposal-submitted", context: { requestId, requestNumber, proposalId: String(proposal._id), proposalNumber, baseScopeVersionNumber: request.baseScopeVersionNumber } }, session);
    return { project, requestNumber, proposalNumber, proposalId: String(proposal._id) };
  });
  const warning = await notify(emailService, await notificationRecipients(result.project, "approvers"), "scope-review", `${result.project.name}: change request ${result.requestNumber} is ready`, `Change request ${result.requestNumber}, proposal ${result.proposalNumber}, is ready for review in ClientScope.`);
  return { ...result, warning };
}

export async function postChangeComment(projectId: string, requestId: string, proposalId: string, actor: Actor, input: { body: string; comparisonKind?: ComparisonKind; changeItemId?: string }) {
  return transact(async (session) => {
    const { project, role } = await projectContext(projectId, actor._id, session, true);
    const proposal = await ChangeProposal.findOne({ _id: proposalId, requestId, projectId, open: true, outcome: "in-review" }).session(session);
    if (!proposal) throw stale();
    if (input.changeItemId) {
      const item = await ChangeItem.exists({ _id: input.changeItemId, proposalId, requestId, projectId, comparisonKind: input.comparisonKind! }).session(session);
      if (!item) throw new ApiError(400, "INVALID_COMMENT_TARGET", "Select a change item from this exact proposal comparison.");
    }
    const locked = await ChangeProposal.updateOne({ _id: proposalId, open: true, outcome: "in-review" }, { $inc: { commentSequence: 1 } }, { session });
    if (locked.modifiedCount !== 1) throw stale();
    const comment = new ChangeComment({
      workspaceId: project.workspaceId, projectId, requestId, proposalId, body: input.body,
      comparisonKind: input.comparisonKind, changeItemId: input.changeItemId, authorId: actor._id, authorName: actor.displayName, authorRole: role, postedAt: new Date(),
    });
    await comment.save({ session });
    await projectEvent({ project, actor, role, action: "change-request.comment-posted", context: { requestId, proposalId, proposalNumber: proposal.number, target: input.changeItemId ? "change-item" : "proposal", comparisonKind: input.comparisonKind } }, session);
    return { comment: commentView(comment) };
  });
}

function copiedProposalDraft(project: ProjectRecord, request: any, proposal: any) {
  return new ChangeProposalDraft({
    workspaceId: project.workspaceId, projectId: project._id, requestId: request._id, revisionToken: token(), copiedFromProposalId: proposal._id,
    title: request.title, rationale: proposal.rationale, impactSummary: proposal.impactSummary,
    groups: proposal.groups.map((group: any) => group.toObject()), requirements: proposal.requirements.map((item: any) => {
      const value = item.toObject(); delete value.snapshotId; return value;
    }),
  });
}

async function approveProposal(project: ProjectRecord, request: any, proposal: any, actor: Actor, note: string | undefined, now: Date, session: ClientSession) {
  const base = await ScopeVersion.findOne({ _id: request.baseScopeVersionId, projectId: project._id, status: "approved" }).session(session);
  if (!base) throw stale();
  const nextNumber = ((await ScopeVersion.findOne({ projectId: project._id }).sort({ number: -1 }).session(session).lean())?.number ?? 0) + 1;
  const successorId = oid();
  const superseded = await ScopeVersion.updateOne({ _id: base._id, projectId: project._id, status: "approved" }, { $set: {
    status: "superseded", supersededAt: now, supersededByChangeRequestId: request._id, supersededByProposalId: proposal._id, successorScopeVersionId: successorId,
  } }, { session });
  if (superseded.modifiedCount !== 1) throw stale();
  const successor = new ScopeVersion({
    _id: successorId, workspaceId: project.workspaceId, projectId: project._id, number: nextNumber, status: "approved",
    groups: proposal.groups.map((group: any) => group.toObject()), requirements: proposal.requirements.map((item: any) => item.toObject()),
    revisionSummary: proposal.revisionSummary, submitterId: proposal.submitterId, submitterName: proposal.submitterName,
    submitterRole: "workspace-owner", submittedAt: proposal.submittedAt,
    terminalActorId: actor._id, terminalActorName: actor.displayName, terminalRole: "client-approver", terminalAt: now, terminalNote: note,
    basedOnScopeVersionId: base._id, approvedFromChangeRequestId: request._id, approvedFromProposalId: proposal._id,
    proposalSubmitterId: proposal.submitterId, proposalSubmitterName: proposal.submitterName,
    approvingClientId: actor._id, approvingClientName: actor.displayName,
  });
  await successor.save({ session });
  return { successor, base, now };
}

export async function decideChangeProposal(projectId: string, requestId: string, proposalId: string, actor: Actor, input: ChangeDecisionInput, emailService: EmailService) {
  const result = await transact(async (session) => {
    const { project, role } = await projectContext(projectId, actor._id, session, true);
    if (role !== "client-approver") throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
    const request = await ChangeRequest.findOne({ _id: requestId, projectId, state: "in-review", active: true }).session(session);
    const proposal = await ChangeProposal.findOne({ _id: proposalId, requestId, projectId, outcome: "in-review", open: true }).session(session);
    if (!request || !proposal) throw stale();
    const now = new Date();
    let successor: any;
    if (input.outcome === "approved") ({ successor } = await approveProposal(project, request, proposal, actor, input.note, now, session));
    const locked = await ChangeProposal.updateOne({ _id: proposalId, outcome: "in-review", open: true }, { $set: {
      outcome: input.outcome, open: false, terminalActorId: actor._id, terminalActorName: actor.displayName, terminalActorRole: role, terminalAt: now, terminalNote: input.note,
    } }, { session });
    if (locked.modifiedCount !== 1) throw stale();
    await new ChangeDecision({
      workspaceId: project.workspaceId, projectId, requestId, proposalId, outcome: input.outcome, note: input.note,
      actorId: actor._id, actorName: actor.displayName, actorRole: "client-approver", decidedAt: now,
    }).save({ session });
    if (input.outcome === "changes-requested") await copiedProposalDraft(project, request, proposal).save({ session });
    const nextState = input.outcome === "changes-requested" ? "revision-draft" : input.outcome;
    const requestUpdate: Record<string, unknown> = { state: nextState, active: input.outcome === "changes-requested" };
    if (input.outcome !== "changes-requested") Object.assign(requestUpdate, { terminalActorId: actor._id, terminalActorName: actor.displayName, terminalActorRole: role, terminalAt: now, terminalReason: input.note });
    const closed = await ChangeRequest.updateOne({ _id: requestId, state: "in-review", active: true }, { $set: requestUpdate }, { session });
    if (closed.modifiedCount !== 1) throw stale();
    await projectEvent({ project, actor, role, action: input.outcome === "approved" ? "change-request.approved" : input.outcome === "rejected" ? "change-request.rejected" : "change-request.changes-requested", context: {
      requestId, requestNumber: request.number, proposalId, proposalNumber: proposal.number,
      ...(successor ? { baseScopeVersionNumber: request.baseScopeVersionNumber, successorScopeVersionNumber: successor.number } : {}),
    } }, session);
    return { project, requestNumber: request.number!, proposalNumber: proposal.number, outcome: input.outcome, successorScopeVersionNumber: successor?.number };
  });
  const warning = await notify(emailService, await notificationRecipients(result.project, "providers"), "scope-result", `${result.project.name}: change request ${result.requestNumber} ${result.outcome}`, `Change request ${result.requestNumber}, proposal ${result.proposalNumber}, was ${result.outcome} in ClientScope.`);
  return { ...result, warning };
}

export async function withdrawChangeProposal(projectId: string, requestId: string, proposalId: string, actor: Actor, reason: string, emailService: EmailService) {
  const result = await transact(async (session) => {
    const { project, role } = await projectContext(projectId, actor._id, session, true); assertOwner(role);
    const request = await ChangeRequest.findOne({ _id: requestId, projectId, state: "in-review", active: true }).session(session);
    const proposal = await ChangeProposal.findOneAndUpdate({ _id: proposalId, requestId, projectId, outcome: "in-review", open: true }, { $set: {
      outcome: "withdrawn", open: false, terminalActorId: actor._id, terminalActorName: actor.displayName, terminalActorRole: role, terminalAt: new Date(), terminalNote: reason,
    } }, { returnDocument: "after", session });
    if (!request || !proposal) throw stale();
    await copiedProposalDraft(project, request, proposal).save({ session });
    const updated = await ChangeRequest.updateOne({ _id: requestId, state: "in-review", active: true }, { $set: { state: "revision-draft" } }, { session });
    if (updated.modifiedCount !== 1) throw stale();
    await projectEvent({ project, actor, role, action: "change-request.proposal-withdrawn", context: { requestId, requestNumber: request.number, proposalId, proposalNumber: proposal.number } }, session);
    return { project, requestNumber: request.number!, proposalNumber: proposal.number, outcome: "withdrawn" as const };
  });
  const warning = await notify(emailService, await notificationRecipients(result.project, "approvers"), "scope-review", `${result.project.name}: change request ${result.requestNumber} withdrawn`, `Change request ${result.requestNumber}, proposal ${result.proposalNumber}, is no longer awaiting review in ClientScope.`);
  return { ...result, warning };
}

export async function cancelChangeRequest(projectId: string, requestId: string, actor: Actor, reason: string, emailService: EmailService) {
  const result = await transact(async (session) => {
    const { project, role } = await projectContext(projectId, actor._id, session, true); assertOwner(role);
    const now = new Date();
    const request = await ChangeRequest.findOneAndUpdate({ _id: requestId, projectId, state: "revision-draft", active: true, number: { $exists: true } }, { $set: {
      state: "canceled", active: false, terminalActorId: actor._id, terminalActorName: actor.displayName, terminalActorRole: role, terminalAt: now, terminalReason: reason,
    } }, { returnDocument: "after", session });
    if (!request) throw stale();
    const removed = await ChangeProposalDraft.deleteOne({ requestId }, { session });
    if (removed.deletedCount !== 1) throw stale();
    await projectEvent({ project, actor, role, action: "change-request.canceled", context: { requestId, requestNumber: request.number } }, session);
    return { project, requestNumber: request.number! };
  });
  const warning = await notify(emailService, await notificationRecipients(result.project, "approvers"), "scope-review", `${result.project.name}: change request ${result.requestNumber} canceled`, `Change request ${result.requestNumber} was canceled in ClientScope.`);
  return { requestNumber: result.requestNumber, warning };
}
