/* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose records are reduced through explicit allow-list serializers. */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import mongoose, { type ClientSession } from "mongoose";

import { ApiError } from "../errors.js";
import { Activity } from "./models.js";
import type {
  ArchiveMilestoneInput, CreateMilestoneInput, EditMilestoneInput, MilestoneStatus,
  ReorderMilestonesInput, TransitionMilestoneInput,
} from "./milestone-contracts.js";
import { Milestone, MilestoneTimeline, MilestoneTransition } from "./milestone-models.js";
import { ScopeVersion } from "./scope-models.js";
import { assertProvider, projectContext, type Actor, type ProjectRecord, type ProjectRole } from "./scope-service.js";

export const MILESTONE_LIMIT = 50;
const notFound = () => new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
const stale = () => new ApiError(409, "STALE_STATE", "The milestone timeline changed. Refresh and try again.");
const opaqueToken = () => randomBytes(32).toString("base64url");
const secret = () => process.env.SESSION_SECRET ?? "clientscope-development-session-secret";
const sign = (value: string) => createHmac("sha256", secret()).update(value).digest("base64url");
const initialRevision = (projectId: mongoose.Types.ObjectId | string) => sign(`milestone-initial:${String(projectId)}`);

export type Clock = () => Date;
const systemClock: Clock = () => new Date();

export function utcDate(clock: Clock = systemClock): string {
  return clock().toISOString().slice(0, 10);
}

export function isMilestoneOverdue(input: { targetDate?: string | null; status: MilestoneStatus }, today: string): boolean {
  return Boolean(input.targetDate && input.targetDate < today && input.status !== "completed");
}

export function canTransition(from: MilestoneStatus, to: MilestoneStatus): boolean {
  return from !== to;
}

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

function provider(role: ProjectRole): boolean {
  return role === "workspace-owner" || role === "service-team-member";
}

async function mutationContext(projectId: string, actor: Actor, session: ClientSession) {
  const context = await projectContext(projectId, actor._id, session, true);
  assertProvider(context.role);
  const approved = await ScopeVersion.exists({ projectId: context.project._id, status: "approved" }).session(session);
  if (!approved) throw new ApiError(409, "SCOPE_NOT_APPROVED", "Approve the project scope before managing milestones.");
  return context;
}

async function activity(input: {
  project: ProjectRecord; actor: Actor; role: ProjectRole; action: string; context: Record<string, unknown>; now: Date;
}, session: ClientSession) {
  await new Activity({
    workspaceId: input.project.workspaceId, projectId: input.project._id,
    actorId: input.actor._id, actorName: input.actor.displayName,
    action: input.action, audience: "project",
    context: { ...input.context, actorRole: input.role }, occurredAt: input.now,
  }).save({ session });
}

function actorView(id: unknown, name: unknown, role: unknown) {
  return { id: String(id), displayName: String(name), role: String(role) };
}

function transitionView(transition: any) {
  return {
    id: String(transition._id), previousStatus: transition.previousStatus, nextStatus: transition.nextStatus,
    actor: actorView(transition.actorId, transition.actorName, transition.actorRole),
    transitionedAt: transition.transitionedAt.toISOString(), ...(transition.note ? { note: transition.note } : {}),
  };
}

function milestoneView(record: any, latest: any | undefined, today: string) {
  return {
    id: String(record._id), title: record.title, ...(record.description ? { description: record.description } : {}),
    ...(record.targetDate ? { targetDate: record.targetDate } : {}), status: record.status,
    recordState: record.active ? "active" : "archived",
    position: record.active ? record.position : record.formerPosition,
    isOverdue: isMilestoneOverdue(record, today), createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString(),
    ...(latest ? { latestTransition: transitionView(latest) } : {}),
    ...(!record.active && record.archivedAt ? {
      archive: {
        actor: actorView(record.archivedById, record.archivedByName, record.archivedByRole),
        archivedAt: record.archivedAt.toISOString(), reason: record.archiveReason,
      },
    } : {}),
  };
}

async function views(records: any[], today: string, session?: ClientSession) {
  const ids = records.flatMap((record) => record.latestTransitionId ? [record.latestTransitionId] : []);
  const query = MilestoneTransition.find({ _id: { $in: ids } }).lean();
  if (session) query.session(session);
  const transitions = ids.length ? await query : [];
  const byId = new Map(transitions.map((item) => [String(item._id), item]));
  return records.map((record) => milestoneView(record, record.latestTransitionId ? byId.get(String(record.latestTransitionId)) : undefined, today));
}

function permissions(role: ProjectRole, available: boolean) {
  const write = provider(role) && available;
  return { canCreate: write, canEdit: write, canTransition: write, canReorder: write, canArchive: write };
}

export async function readMilestones(projectId: string, userId: mongoose.Types.ObjectId, clock: Clock = systemClock) {
  const { project, role } = await projectContext(projectId, userId);
  const [approved, timeline, records] = await Promise.all([
    ScopeVersion.exists({ projectId: project._id, status: "approved" }),
    MilestoneTimeline.findOne({ projectId: project._id }).lean(),
    Milestone.find({ projectId: project._id, active: true }).sort({ position: 1, _id: 1 }).limit(MILESTONE_LIMIT).lean(),
  ]);
  const available = Boolean(approved);
  const today = utcDate(clock);
  return {
    available, activeCount: timeline?.activeCount ?? records.length, limit: MILESTONE_LIMIT,
    permissions: permissions(role, available && (!project.lifecycleState || project.lifecycleState === "active")),
    ...(provider(role) ? { revisionToken: timeline?.revisionToken ?? initialRevision(project._id) } : {}),
    milestones: await views(records, today),
  };
}

async function advanceTimeline(projectId: mongoose.Types.ObjectId, revisionToken: string, session: ClientSession, countDelta = 0) {
  const next = opaqueToken();
  const filter: Record<string, unknown> = { projectId, revisionToken };
  if (countDelta > 0) filter.activeCount = { $lte: MILESTONE_LIMIT - countDelta };
  const timeline = await MilestoneTimeline.findOneAndUpdate(
    filter, { $set: { revisionToken: next }, ...(countDelta ? { $inc: { activeCount: countDelta } } : {}) },
    { returnDocument: "after", session },
  );
  if (!timeline) {
    const existing = await MilestoneTimeline.findOne({ projectId }).session(session);
    if (existing?.revisionToken === revisionToken && existing.activeCount >= MILESTONE_LIMIT) {
      throw new ApiError(409, "MILESTONE_LIMIT_REACHED", "This project already has 50 active milestones. Archive one before creating another.");
    }
    throw stale();
  }
  return timeline;
}

export async function createMilestone(projectId: string, actor: Actor, input: CreateMilestoneInput, clock: Clock = systemClock) {
  try {
    return await transact(async (session) => {
      const { project, role } = await mutationContext(projectId, actor, session);
      let timeline = await MilestoneTimeline.findOne({ projectId: project._id }).session(session);
      if (!timeline) {
        if (input.revisionToken !== initialRevision(project._id)) throw stale();
        timeline = new MilestoneTimeline({ workspaceId: project.workspaceId, projectId: project._id, revisionToken: opaqueToken(), activeCount: 1 });
        await timeline.save({ session });
      } else {
        timeline = await advanceTimeline(project._id, input.revisionToken, session, 1);
      }
      const now = clock();
      const milestone = new Milestone({
        workspaceId: project.workspaceId, projectId: project._id, title: input.title,
        ...(input.description ? { description: input.description } : {}), ...(input.targetDate ? { targetDate: input.targetDate } : {}),
        status: "upcoming", position: timeline.activeCount - 1, active: true, createdAt: now, updatedAt: now,
      });
      await milestone.save({ session, timestamps: false });
      await activity({ project, actor, role, action: "milestone.created", now, context: {
        milestoneId: String(milestone._id), title: milestone.title, description: milestone.description,
        targetDate: milestone.targetDate, status: milestone.status, position: milestone.position,
      } }, session);
      return { milestone: milestoneView(milestone, undefined, utcDate(() => now)), activeCount: timeline.activeCount, revisionToken: timeline.revisionToken };
    });
  } catch (error) {
    if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) throw stale();
    throw error;
  }
}

export async function editMilestone(projectId: string, milestoneId: string, actor: Actor, input: EditMilestoneInput, clock: Clock = systemClock) {
  return transact(async (session) => {
    const { project, role } = await mutationContext(projectId, actor, session);
    const milestone = await Milestone.findOne({ _id: milestoneId, projectId: project._id, active: true }).session(session);
    if (!milestone) throw notFound();
    const before = { title: milestone.title, description: milestone.description ?? undefined, targetDate: milestone.targetDate ?? undefined };
    const after = { title: input.title, description: input.description, targetDate: input.targetDate };
    if (JSON.stringify(before) === JSON.stringify(after)) {
      const timeline = await MilestoneTimeline.findOne({ projectId: project._id, revisionToken: input.revisionToken }).session(session);
      if (!timeline) throw stale();
      const latest = milestone.latestTransitionId ? await MilestoneTransition.findById(milestone.latestTransitionId).session(session) : undefined;
      return { milestone: milestoneView(milestone, latest, utcDate(clock)), revisionToken: timeline.revisionToken, unchanged: true };
    }
    const timeline = await advanceTimeline(project._id, input.revisionToken, session);
    milestone.title = input.title;
    milestone.set("description", input.description);
    milestone.set("targetDate", input.targetDate);
    await milestone.save({ session });
    const changedFields = Object.keys(after).filter((key) => before[key as keyof typeof before] !== after[key as keyof typeof after]);
    await activity({ project, actor, role, action: "milestone.edited", now: milestone.updatedAt, context: {
      milestoneId: String(milestone._id), changedFields,
      before: Object.fromEntries(changedFields.map((key) => [key, before[key as keyof typeof before] ?? null])),
      after: Object.fromEntries(changedFields.map((key) => [key, after[key as keyof typeof after] ?? null])),
    } }, session);
    const latest = milestone.latestTransitionId ? await MilestoneTransition.findById(milestone.latestTransitionId).session(session) : undefined;
    return { milestone: milestoneView(milestone, latest, utcDate(() => milestone.updatedAt)), revisionToken: timeline.revisionToken, unchanged: false };
  });
}

export async function transitionMilestone(projectId: string, milestoneId: string, actor: Actor, input: TransitionMilestoneInput, clock: Clock = systemClock) {
  return transact(async (session) => {
    const { project, role } = await mutationContext(projectId, actor, session);
    const milestone = await Milestone.findOne({ _id: milestoneId, projectId: project._id, active: true }).session(session);
    if (!milestone) throw notFound();
    const timeline = await MilestoneTimeline.findOne({ projectId: project._id, revisionToken: input.revisionToken }).session(session);
    if (!timeline) throw stale();
    if (milestone.status === input.status) sameStatusError();
    const advanced = await advanceTimeline(project._id, input.revisionToken, session);
    const now = clock(); const previousStatus = milestone.status as MilestoneStatus;
    const transition = new MilestoneTransition({
      workspaceId: project.workspaceId, projectId: project._id, milestoneId: milestone._id,
      previousStatus, nextStatus: input.status, actorId: actor._id, actorName: actor.displayName,
      actorRole: role, transitionedAt: now, ...(input.note ? { note: input.note } : {}),
    });
    await transition.save({ session });
    milestone.status = input.status; milestone.latestTransitionId = transition._id; milestone.updatedAt = now;
    await milestone.save({ session, timestamps: false });
    await activity({ project, actor, role, action: "milestone.status-transitioned", now, context: {
      milestoneId: String(milestone._id), transitionId: String(transition._id), previousStatus,
      nextStatus: input.status, ...(input.note ? { note: input.note } : {}),
    } }, session);
    return { milestone: milestoneView(milestone, transition, utcDate(() => now)), revisionToken: advanced.revisionToken, unchanged: false };
  });
}

function sameStatusError(): never {
  throw new ApiError(409, "UNCHANGED", "The milestone already has that status.");
}

function encodeCursor(projectId: string, archivedAt: string, id: string) {
  const payload = Buffer.from(JSON.stringify({ projectId, archivedAt, id })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decodeCursor(cursor: string, projectId: string): { archivedAt: Date; id: mongoose.Types.ObjectId } {
  try {
    const [payload, signature, extra] = cursor.split(".");
    if (!payload || !signature || extra) throw new Error("shape");
    const expected = Buffer.from(sign(payload)); const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new Error("signature");
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    if (parsed.projectId !== projectId || typeof parsed.archivedAt !== "string" || typeof parsed.id !== "string" || !mongoose.isValidObjectId(parsed.id)) throw new Error("context");
    const archivedAt = new Date(parsed.archivedAt);
    if (Number.isNaN(archivedAt.valueOf()) || archivedAt.toISOString() !== parsed.archivedAt) throw new Error("date");
    return { archivedAt, id: new mongoose.Types.ObjectId(parsed.id) };
  } catch {
    throw new ApiError(400, "INVALID_CURSOR", "The archive cursor is invalid. Refresh the archive and try again.");
  }
}

export async function readArchivedMilestones(projectId: string, userId: mongoose.Types.ObjectId, input: { cursor?: string; limit: number }, clock: Clock = systemClock) {
  const { project } = await projectContext(projectId, userId);
  const after = input.cursor ? decodeCursor(input.cursor, String(project._id)) : undefined;
  const filter: Record<string, unknown> = { projectId: project._id, active: false };
  if (after) filter.$or = [{ archivedAt: { $lt: after.archivedAt } }, { archivedAt: after.archivedAt, _id: { $lt: after.id } }];
  const records = await Milestone.find(filter).sort({ archivedAt: -1, _id: -1 }).limit(input.limit + 1).lean();
  const page = records.slice(0, input.limit); const more = records.length > input.limit; const last = page.at(-1);
  return {
    milestones: await views(page, utcDate(clock)),
    ...(more && last?.archivedAt ? { nextCursor: encodeCursor(String(project._id), last.archivedAt.toISOString(), String(last._id)) } : {}),
  };
}

export async function reorderMilestones(projectId: string, actor: Actor, input: ReorderMilestonesInput, clock: Clock = systemClock) {
  return transact(async (session) => {
    const { project, role } = await mutationContext(projectId, actor, session);
    const timeline = await MilestoneTimeline.findOne({ projectId: project._id, revisionToken: input.revisionToken }).session(session);
    if (!timeline) throw stale();
    const records = await Milestone.find({ projectId: project._id, active: true }).sort({ position: 1, _id: 1 }).session(session);
    const before = records.map((item) => String(item._id));
    if (input.milestoneIds.length !== records.length || input.milestoneIds.some((id) => !before.includes(id))) {
      throw new ApiError(409, "INVALID_MILESTONE_ORDER", "The milestone list changed. Refresh and reorder the complete active list.");
    }
    if (before.every((id, index) => id === input.milestoneIds[index])) return { revisionToken: timeline.revisionToken, unchanged: true, milestoneIds: before };
    const advanced = await advanceTimeline(project._id, input.revisionToken, session);
    await Promise.all(records.map((record, index) => Milestone.updateOne({ _id: record._id }, { $set: { position: -1 - index } }, { session, timestamps: false })));
    await Promise.all(input.milestoneIds.map((id, index) => Milestone.updateOne({ _id: id, projectId: project._id, active: true }, { $set: { position: index } }, { session, timestamps: false })));
    const now = clock();
    await activity({ project, actor, role, action: "milestone.reordered", now, context: { before, after: input.milestoneIds } }, session);
    return { revisionToken: advanced.revisionToken, unchanged: false, milestoneIds: input.milestoneIds };
  });
}

export async function archiveMilestone(projectId: string, milestoneId: string, actor: Actor, input: ArchiveMilestoneInput, clock: Clock = systemClock) {
  return transact(async (session) => {
    const { project, role } = await mutationContext(projectId, actor, session);
    const milestone = await Milestone.findOne({ _id: milestoneId, projectId: project._id, active: true }).session(session);
    if (!milestone) throw notFound();
    const advanced = await advanceTimeline(project._id, input.revisionToken, session, -1);
    const now = clock(); const formerPosition = milestone.position;
    milestone.active = false; milestone.formerPosition = formerPosition; milestone.position = -1;
    milestone.archivedAt = now; milestone.archivedById = actor._id; milestone.archivedByName = actor.displayName;
    milestone.archivedByRole = role; milestone.archiveReason = input.reason;
    await milestone.save({ session, timestamps: false });
    await Milestone.updateMany(
      { projectId: project._id, active: true, position: { $gt: formerPosition } }, { $inc: { position: -1 } }, { session, timestamps: false },
    );
    await activity({ project, actor, role, action: "milestone.archived", now, context: {
      milestoneId: String(milestone._id), title: milestone.title, description: milestone.description,
      targetDate: milestone.targetDate, status: milestone.status, formerPosition, reason: input.reason,
    } }, session);
    const latest = milestone.latestTransitionId ? await MilestoneTransition.findById(milestone.latestTransitionId).session(session) : undefined;
    return { milestone: milestoneView(milestone, latest, utcDate(() => now)), activeCount: advanced.activeCount, revisionToken: advanced.revisionToken };
  });
}
