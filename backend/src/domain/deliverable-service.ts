/* eslint-disable @typescript-eslint/no-explicit-any -- Records are serialized through explicit allow-list views at this domain boundary. */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import mongoose, { type ClientSession } from "mongoose";

import { ApiError } from "../errors.js";
import {
  DELIVERABLE_LIMIT, deliverablePermissions, filenameMatchesType, previewCapability, submissionReady,
  type AuthorizeUploadInput, type CreateDeliverableInput, type DecisionInput, type DeliverableRole,
  type FinalizeUploadInput, type UpdateDeliverableDraftInput,
} from "./deliverable-contracts.js";
import {
  AssetCleanupWork, Deliverable, DeliverableComment, DeliverableDraft, DeliverableOutcome, DeliverableProjectState,
  DeliverableVersion, PrivateAsset, UploadReservation,
} from "./deliverable-models.js";
import type { EmailService } from "./email.js";
import { sendEmailSafely } from "./email.js";
import { Activity, ClientMembership, ProjectAssignment, User, Workspace, WorkspaceMembership } from "./models.js";
import type { PrivateAssetStorage } from "./private-asset-storage.js";
import { ScopeVersion } from "./scope-models.js";
import { assertProjectContentMutable, assertProvider, projectContext, type Actor, type ProjectRecord } from "./scope-service.js";

const notFound = () => new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
const stale = () => new ApiError(409, "STALE_STATE", "The deliverable changed. Refresh and try again.");
const opaqueToken = () => randomBytes(32).toString("base64url");
const UPLOAD_LIFETIME_MS = 10 * 60 * 1_000;
const DELIVERY_LIFETIME_MS = 5 * 60 * 1_000;

async function transact<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => { result = await work(session); });
    return result as T;
  } finally { await session.endSession(); }
}

function provider(role: DeliverableRole): boolean {
  return role === "workspace-owner" || role === "service-team-member";
}

async function providerContext(projectId: string, actor: Actor, session: ClientSession) {
  const context = await projectContext(projectId, actor._id, session, true);
  assertProvider(context.role);
  return context as { project: ProjectRecord; role: DeliverableRole };
}

async function approvedScope(projectId: mongoose.Types.ObjectId | string, session?: ClientSession) {
  const query = ScopeVersion.findOne({ projectId, status: "approved" }).sort({ number: -1 });
  if (session) query.session(session);
  return query;
}

async function projectActivity(input: { project: ProjectRecord; actor: Actor; role: DeliverableRole; action: string; context: Record<string, unknown>; now: Date }, session: ClientSession) {
  await new Activity({
    workspaceId: input.project.workspaceId, projectId: input.project._id, actorId: input.actor._id, actorName: input.actor.displayName,
    action: input.action, audience: "project", context: { ...input.context, actorRole: input.role }, occurredAt: input.now,
  }).save({ session });
}

function actorView(id: unknown, name: unknown, role: unknown) {
  return { id: String(id), displayName: String(name), role: String(role) };
}

function attachmentView(attachment: any) {
  return {
    id: String(attachment.id ?? attachment._id), filename: String(attachment.filename), mediaType: attachment.mediaType,
    byteSize: Number(attachment.byteSize), order: Number(attachment.order), preview: previewCapability(attachment.mediaType),
  };
}

function versionView(version: any) {
  return {
    id: String(version._id), number: version.number, outcome: version.outcome, title: version.title,
    ...(version.notes ? { notes: version.notes } : {}), ...(version.revisionSummary ? { revisionSummary: version.revisionSummary } : {}),
    links: [...version.links].sort((a, b) => a.order - b.order).map((link) => ({ id: String(link.id), label: link.label, url: link.url, order: link.order })),
    attachments: [...version.attachments].sort((a, b) => a.order - b.order).map(attachmentView),
    scopeVersion: { id: String(version.scopeVersionId), number: version.scopeVersionNumber },
    submitter: actorView(version.submitterId, version.submitterName, version.submitterRole), submittedAt: version.submittedAt.toISOString(),
    ...(version.terminalAt ? { terminal: { actor: actorView(version.terminalActorId, version.terminalActorName, version.terminalActorRole), at: version.terminalAt.toISOString(), ...(version.terminalNote ? { note: version.terminalNote } : {}) } } : {}),
  };
}

async function draftView(draft: any, deliverable: any, session?: ClientSession) {
  const ids = draft.attachments.map((item: any) => item.assetId);
  const query = PrivateAsset.find({ _id: { $in: ids }, lifecycle: "finalized" }).lean();
  if (session) query.session(session);
  const assets = ids.length ? await query : [];
  const byId = new Map(assets.map((asset) => [String(asset._id), asset]));
  return {
    id: String(draft._id), revisionToken: draft.revisionToken,
    ...(draft.copiedFromVersionId ? { copiedFromVersionId: String(draft.copiedFromVersionId) } : {}),
    ...(draft.notes ? { notes: draft.notes } : {}), ...(draft.revisionSummary ? { revisionSummary: draft.revisionSummary } : {}),
    ...(!deliverable.titleFrozen ? { editableTitle: deliverable.title } : {}),
    links: [...draft.links].sort((a: any, b: any) => a.order - b.order).map((link: any) => ({ id: String(link.id), label: link.label, url: link.url, order: link.order })),
    attachments: [...draft.attachments].sort((a: any, b: any) => a.order - b.order).flatMap((reference: any) => {
      const asset = byId.get(String(reference.assetId));
      return asset ? [attachmentView({ id: asset._id, ...asset, order: reference.order })] : [];
    }),
  };
}

async function aggregateView(record: any, role: DeliverableRole, currentVersion?: any, draft?: any, session?: ClientSession) {
  return {
    id: String(record._id), ...(record.number ? { number: record.number } : {}), title: record.title, state: record.state,
    creator: actorView(record.creatorId, record.creatorName, record.creatorRole), createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString(),
    permissions: deliverablePermissions(role, record.state),
    ...(currentVersion ? { currentVersion: versionView(currentVersion) } : {}),
    ...(provider(role) && draft ? { draft: await draftView(draft, record, session) } : {}),
    ...(record.terminalAt ? { terminal: { actor: actorView(record.terminalActorId, record.terminalActorName, record.terminalActorRole), at: record.terminalAt.toISOString(), ...(record.cancellationReason ? { reason: record.cancellationReason } : {}) } } : {}),
  };
}

async function recordCleanup(assetId: mongoose.Types.ObjectId, reason: string, session: ClientSession): Promise<void> {
  const [draftReference, versionReference, asset] = await Promise.all([
    DeliverableDraft.exists({ "attachments.assetId": assetId }).session(session),
    DeliverableVersion.exists({ "attachments.assetId": assetId }).session(session),
    PrivateAsset.findOne({ _id: assetId, lifecycle: "finalized" }).session(session),
  ]);
  if (draftReference || versionReference || !asset) return;
  asset.lifecycle = "cleanup-pending"; await asset.save({ session });
  await AssetCleanupWork.updateOne(
    { assetId },
    { $setOnInsert: { providerIdentifier: asset.providerIdentifier, reason, idempotencyKey: `asset:${String(assetId)}`, state: "pending", attempts: 0 } },
    { upsert: true, session },
  );
}

export async function processAssetCleanup(storage: PrivateAssetStorage, limit = 5): Promise<void> {
  const records = await AssetCleanupWork.find({ state: { $in: ["pending", "retry"] }, $or: [{ retryAfter: { $exists: false } }, { retryAfter: { $lte: new Date() } }] }).sort({ createdAt: 1 }).limit(limit);
  for (const work of records) {
    const references = await Promise.all([
      DeliverableDraft.exists({ "attachments.assetId": work.assetId }),
      DeliverableVersion.exists({ "attachments.assetId": work.assetId }),
    ]);
    if (references.some(Boolean)) {
      work.state = "skipped"; work.completedAt = new Date(); await work.save(); continue;
    }
    try {
      await storage.delete({ providerIdentifier: work.providerIdentifier, idempotencyKey: work.idempotencyKey });
      await transact(async (session) => {
        const stillReferenced = await Promise.all([
          DeliverableDraft.exists({ "attachments.assetId": work.assetId }).session(session),
          DeliverableVersion.exists({ "attachments.assetId": work.assetId }).session(session),
        ]);
        const current = await AssetCleanupWork.findById(work._id).session(session);
        if (!current) return;
        if (stillReferenced.some(Boolean)) { current.state = "skipped"; current.completedAt = new Date(); await current.save({ session }); return; }
        current.state = "completed"; current.attempts += 1; current.completedAt = new Date(); delete current.retryAfter; delete current.lastFailureCode;
        await current.save({ session }); await PrivateAsset.updateOne({ _id: work.assetId }, { $set: { lifecycle: "deleted" } }, { session });
      });
    } catch {
      work.state = "retry"; work.attempts += 1; work.retryAfter = new Date(Date.now() + Math.min(60 * 60_000, 2 ** work.attempts * 60_000)); work.lastFailureCode = "PROVIDER_UNAVAILABLE"; await work.save();
    }
  }
}

export async function readDeliverables(projectId: string, userId: mongoose.Types.ObjectId) {
  const { project, role } = await projectContext(projectId, userId) as { project: ProjectRecord; role: DeliverableRole };
  const [scope, state, records] = await Promise.all([
    approvedScope(project._id), DeliverableProjectState.findOne({ projectId: project._id }).lean(),
    Deliverable.find({ projectId: project._id, state: { $in: ["draft", "in-review", "revision-draft"] } }).sort({ updatedAt: -1, _id: -1 }).limit(DELIVERABLE_LIMIT).lean(),
  ]);
  const visible = provider(role) ? records : records.filter((record) => record.state !== "draft");
  const versionIds = visible.flatMap((record) => record.currentVersionId ? [record.currentVersionId] : []);
  const draftIds = provider(role) ? visible.flatMap((record) => record.currentDraftId ? [record.currentDraftId] : []) : [];
  const [versions, drafts] = await Promise.all([DeliverableVersion.find({ _id: { $in: versionIds } }).lean(), DeliverableDraft.find({ _id: { $in: draftIds } }).lean()]);
  const versionById = new Map(versions.map((item) => [String(item._id), item])); const draftById = new Map(drafts.map((item) => [String(item._id), item]));
  const mutable = !project.lifecycleState || project.lifecycleState === "active";
  const deliverables = await Promise.all(visible.map((record) => aggregateView(record, role, record.currentVersionId ? versionById.get(String(record.currentVersionId)) : undefined, record.currentDraftId ? draftById.get(String(record.currentDraftId)) : undefined)));
  return {
    available: Boolean(scope), role, openCount: provider(role) ? (state?.openCount ?? records.length) : visible.length, limit: DELIVERABLE_LIMIT,
    permissions: { canCreate: mutable && provider(role) && Boolean(scope) },
    deliverables: deliverables.map((item) => mutable ? item : { ...item, permissions: Object.fromEntries(Object.keys(item.permissions).map((key) => [key, false])) }),
  };
}

export async function createDeliverable(projectId: string, actor: Actor, input: CreateDeliverableInput) {
  try {
    return await transact(async (session) => {
      const { project, role } = await providerContext(projectId, actor, session);
      if (!(await approvedScope(project._id, session))) throw new ApiError(409, "SCOPE_NOT_APPROVED", "Approve the project scope before creating a deliverable.");
      const state = await DeliverableProjectState.findOneAndUpdate(
        { projectId: project._id, openCount: { $lt: DELIVERABLE_LIMIT } },
        { $setOnInsert: { workspaceId: project.workspaceId, projectId: project._id, nextDeliverableNumber: 0 }, $inc: { openCount: 1 } },
        { upsert: true, returnDocument: "after", session },
      );
      if (!state) throw new ApiError(409, "DELIVERABLE_LIMIT_REACHED", "This project already has 50 open deliverables. Complete or cancel one before creating another.");
      const deliverable = new Deliverable({
        workspaceId: project.workspaceId, projectId: project._id, title: input.title, titleFrozen: false, state: "draft",
        creatorId: actor._id, creatorName: actor.displayName, creatorRole: role, nextVersionNumber: 0, revisionSequence: 0,
      });
      const draft = new DeliverableDraft({ workspaceId: project.workspaceId, projectId: project._id, deliverableId: deliverable._id, revisionToken: opaqueToken(), links: [], attachments: [] });
      deliverable.currentDraftId = draft._id; await deliverable.save({ session }); await draft.save({ session });
      return { deliverable: await aggregateView(deliverable, role, undefined, draft, session), openCount: state.openCount };
    });
  } catch (error) {
    if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
      const current = await DeliverableProjectState.findOne({ projectId });
      if (current && current.openCount >= DELIVERABLE_LIMIT) throw new ApiError(409, "DELIVERABLE_LIMIT_REACHED", "This project already has 50 open deliverables. Complete or cancel one before creating another.");
      throw stale();
    }
    throw error;
  }
}

export async function updateDeliverableDraft(projectId: string, deliverableId: string, actor: Actor, input: UpdateDeliverableDraftInput) {
  const result = await transact(async (session) => {
    const { project, role } = await providerContext(projectId, actor, session);
    const deliverable = await Deliverable.findOne({ _id: deliverableId, projectId: project._id, state: { $in: ["draft", "revision-draft"] } }).session(session);
    if (!deliverable) throw notFound();
    const draft = await DeliverableDraft.findOne({ _id: deliverable.currentDraftId, deliverableId, revisionToken: input.revisionToken }).session(session);
    if (!draft) throw stale();
    if (deliverable.titleFrozen && input.title !== undefined && input.title !== deliverable.title) throw new ApiError(409, "TITLE_FROZEN", "The deliverable title is frozen after its first submission.");
    const assets = await PrivateAsset.find({ _id: { $in: input.attachmentIds }, projectId: project._id, deliverableId, lifecycle: "finalized" }).session(session);
    if (assets.length !== input.attachmentIds.length) throw new ApiError(422, "INVALID_ATTACHMENT", "One or more attachments are not finalized for this draft.");
    const beforeAssetIds = draft.attachments.map((item) => String(item.assetId));
    const nextTitle = input.title ?? deliverable.title;
    const comparable = { title: nextTitle, notes: input.notes, revisionSummary: input.revisionSummary, links: input.links, attachmentIds: input.attachmentIds };
    const before = { title: deliverable.title, notes: draft.notes ?? undefined, revisionSummary: draft.revisionSummary ?? undefined, links: draft.links.map((link) => ({ id: String(link.id), label: link.label, url: link.url, order: link.order })), attachmentIds: beforeAssetIds };
    if (JSON.stringify(before) === JSON.stringify(comparable)) return { deliverable: await aggregateView(deliverable, role, undefined, draft, session), unchanged: true, removed: [] as mongoose.Types.ObjectId[] };
    deliverable.title = nextTitle; deliverable.revisionSequence += 1; draft.revisionToken = opaqueToken(); draft.notes = input.notes ?? null; draft.revisionSummary = input.revisionSummary ?? null;
    draft.links = input.links as any; draft.attachments = input.attachmentIds.map((assetId, order) => ({ assetId: new mongoose.Types.ObjectId(assetId), order })) as any;
    await deliverable.save({ session }); await draft.save({ session });
    const removed = beforeAssetIds.filter((assetId) => !input.attachmentIds.includes(assetId)).map((assetId) => new mongoose.Types.ObjectId(assetId));
    for (const assetId of removed) await recordCleanup(assetId, "draft-detached", session);
    return { deliverable: await aggregateView(deliverable, role, undefined, draft, session), unchanged: false, removed };
  });
  return { deliverable: result.deliverable, unchanged: result.unchanged };
}

export async function discardDeliverable(projectId: string, deliverableId: string, actor: Actor, revisionToken: string, storage: PrivateAssetStorage) {
  const assetIds = await transact(async (session) => {
    const { project } = await providerContext(projectId, actor, session);
    const deliverable = await Deliverable.findOne({ _id: deliverableId, projectId: project._id, state: "draft", number: { $exists: false }, nextVersionNumber: 0 }).session(session);
    if (!deliverable) throw notFound();
    const draft = await DeliverableDraft.findOne({ _id: deliverable.currentDraftId, revisionToken }).session(session); if (!draft) throw stale();
    const ids = draft.attachments.map((item) => item.assetId);
    await DeliverableDraft.deleteOne({ _id: draft._id }, { session }); await Deliverable.deleteOne({ _id: deliverable._id }, { session });
    const state = await DeliverableProjectState.findOneAndUpdate({ projectId: project._id, openCount: { $gt: 0 } }, { $inc: { openCount: -1 } }, { session, returnDocument: "after" });
    if (!state) throw stale();
    for (const id of ids) await recordCleanup(id, "draft-discarded", session);
    return ids;
  });
  await processAssetCleanup(storage); return { message: "Draft discarded.", cleanupScheduled: assetIds.length > 0 };
}

export async function authorizeDeliverableUpload(projectId: string, deliverableId: string, actor: Actor, input: AuthorizeUploadInput, storage: PrivateAssetStorage) {
  if (!filenameMatchesType(input.filename, input.mediaType)) throw new ApiError(422, "FILE_TYPE_MISMATCH", "The filename extension does not match the selected file type.");
  const initialContext = await projectContext(projectId, actor._id); assertProvider(initialContext.role);
  assertProjectContentMutable(initialContext.project);
  const providerIdentifier = `clientscope/${randomBytes(24).toString("base64url")}${input.mediaType === "application/zip" ? ".zip" : ""}`; const expiresAt = new Date(Date.now() + UPLOAD_LIFETIME_MS);
  const authorization = await storage.authorizeUpload({ providerIdentifier, mediaType: input.mediaType, byteSize: input.byteSize, expiresAt });
  const reservation = await transact(async (session) => {
    const { project } = await providerContext(projectId, actor, session);
    const deliverable = await Deliverable.findOne({ _id: deliverableId, projectId: project._id, state: { $in: ["draft", "revision-draft"] } }).session(session); if (!deliverable) throw notFound();
    const draft = await DeliverableDraft.findOne({ _id: deliverable.currentDraftId, revisionToken: input.revisionToken }).session(session); if (!draft) throw stale();
    if (draft.attachments.length >= 10) throw new ApiError(409, "ATTACHMENT_LIMIT_REACHED", "A deliverable draft can contain at most 10 attachments.");
    const record = new UploadReservation({ workspaceId: project.workspaceId, projectId: project._id, deliverableId: deliverable._id, draftId: draft._id, providerIdentifier, filename: input.filename, mediaType: input.mediaType, byteSize: input.byteSize, expiresAt });
    await record.save({ session }); return record;
  });
  return { reservationId: String(reservation._id), uploadUrl: authorization.uploadUrl, fields: authorization.fields, expiresAt: expiresAt.toISOString() };
}

export async function finalizeDeliverableUpload(projectId: string, deliverableId: string, actor: Actor, input: FinalizeUploadInput, storage: PrivateAssetStorage) {
  const initialContext = await projectContext(projectId, actor._id); assertProvider(initialContext.role);
  assertProjectContentMutable(initialContext.project);
  const reservation = await UploadReservation.findOne({ _id: input.reservationId, projectId, deliverableId, consumedAt: { $exists: false }, expiresAt: { $gt: new Date() } }).lean();
  if (!reservation) throw new ApiError(409, "UPLOAD_RESERVATION_INVALID", "The upload authorization is expired or already used. Start the upload again.");
  const verified = await storage.verifyUpload({ providerIdentifier: reservation.providerIdentifier, mediaType: reservation.mediaType as any, byteSize: reservation.byteSize, providerResult: input.providerResult });
  const result = await transact(async (session) => {
    const { project, role } = await providerContext(projectId, actor, session);
    const claimed = await UploadReservation.findOneAndUpdate({ _id: input.reservationId, projectId: project._id, deliverableId, consumedAt: { $exists: false }, expiresAt: { $gt: new Date() } }, { $set: { consumedAt: new Date() } }, { session, returnDocument: "after" });
    if (!claimed) throw new ApiError(409, "UPLOAD_RESERVATION_INVALID", "The upload authorization is expired or already used. Start the upload again.");
    const asset = new PrivateAsset({ workspaceId: project.workspaceId, projectId: project._id, deliverableId, originalDraftId: claimed.draftId, providerIdentifier: verified.providerIdentifier, filename: claimed.filename, mediaType: verified.mediaType, byteSize: verified.byteSize, lifecycle: "finalized", finalizedAt: new Date() });
    await asset.save({ session });
    const deliverable = await Deliverable.findOne({ _id: deliverableId, projectId: project._id, state: { $in: ["draft", "revision-draft"] }, currentDraftId: claimed.draftId }).session(session);
    const draft = deliverable ? await DeliverableDraft.findOne({ _id: claimed.draftId, revisionToken: input.revisionToken }).session(session) : null;
    if (!deliverable || !draft || draft.attachments.length >= 10) {
      await recordCleanup(asset._id, "unattached-finalization", session);
      return { attached: false as const };
    }
    draft.attachments.push({ assetId: asset._id, order: draft.attachments.length }); draft.revisionToken = opaqueToken(); deliverable.revisionSequence += 1;
    await draft.save({ session }); await deliverable.save({ session });
    return { attached: true as const, deliverable: await aggregateView(deliverable, role, undefined, draft, session) };
  });
  if (!result.attached) { await processAssetCleanup(storage); throw stale(); }
  return { deliverable: result.deliverable };
}

export async function detachDeliverableAttachment(projectId: string, deliverableId: string, attachmentId: string, actor: Actor, revisionToken: string, storage: PrivateAssetStorage) {
  const result = await transact(async (session) => {
    const { project, role } = await providerContext(projectId, actor, session);
    const deliverable = await Deliverable.findOne({ _id: deliverableId, projectId: project._id, state: { $in: ["draft", "revision-draft"] } }).session(session); if (!deliverable) throw notFound();
    const draft = await DeliverableDraft.findOne({ _id: deliverable.currentDraftId, revisionToken, "attachments.assetId": attachmentId }).session(session); if (!draft) throw stale();
    draft.attachments = draft.attachments.filter((item) => String(item.assetId) !== attachmentId).map((item, order) => ({ assetId: item.assetId, order })) as any; draft.revisionToken = opaqueToken(); deliverable.revisionSequence += 1;
    await draft.save({ session }); await deliverable.save({ session }); await recordCleanup(new mongoose.Types.ObjectId(attachmentId), "draft-detached", session);
    return { deliverable: await aggregateView(deliverable, role, undefined, draft, session) };
  });
  await processAssetCleanup(storage); return result;
}

async function clientRecipients(projectId: mongoose.Types.ObjectId) {
  const memberships = await ClientMembership.find({ projectId, status: "active" }).select("userId").lean();
  return User.find({ _id: { $in: [...new Set(memberships.map((item) => String(item.userId)))] } }).select("email").lean();
}

async function providerRecipients(project: ProjectRecord) {
  const workspace = await Workspace.findById(project.workspaceId).select("ownerId").lean();
  const assignments = await ProjectAssignment.find({ projectId: project._id, status: "active" }).select("userId").lean();
  const activeMembers = await WorkspaceMembership.find({ workspaceId: project.workspaceId, userId: { $in: assignments.map((item) => item.userId) }, status: "active" }).select("userId").lean();
  const ids = [...new Set([String(workspace?.ownerId ?? ""), ...activeMembers.map((item) => String(item.userId))].filter(Boolean))];
  return User.find({ _id: { $in: ids } }).select("email").lean();
}

async function notify(service: EmailService, recipients: Array<{ email: string }>, command: Omit<Parameters<EmailService["send"]>[0], "to">): Promise<string | undefined> {
  const results = await Promise.all([...new Set(recipients.map((item) => item.email))].map((to) => sendEmailSafely(service, { ...command, to })));
  return results.some((result) => !result.delivered) ? "The change was saved, but one or more email notifications could not be delivered." : undefined;
}

export async function submitDeliverable(projectId: string, deliverableId: string, actor: Actor, revisionToken: string, email: EmailService) {
  const result = await transact(async (session) => {
    const { project, role } = await providerContext(projectId, actor, session);
    const deliverable = await Deliverable.findOne({ _id: deliverableId, projectId: project._id, state: { $in: ["draft", "revision-draft"] } }).session(session); if (!deliverable) throw notFound();
    const draft = await DeliverableDraft.findOne({ _id: deliverable.currentDraftId, revisionToken }).session(session); if (!draft) throw stale();
    const scope = await approvedScope(project._id, session); if (!scope) throw new ApiError(409, "SCOPE_NOT_APPROVED", "Approve the project scope before submitting a deliverable.");
    if (!(await ClientMembership.exists({ projectId: project._id, role: "client-approver", status: "active" }).session(session))) throw new ApiError(409, "APPROVER_REQUIRED", "Assign an active Client Approver before submitting a deliverable.");
    const nextVersion = deliverable.nextVersionNumber + 1;
    if (!submissionReady({ links: draft.links, attachments: draft.attachments, versionNumber: nextVersion, ...(draft.revisionSummary ? { revisionSummary: draft.revisionSummary } : {}) })) throw new ApiError(422, "DELIVERABLE_NOT_READY", nextVersion > 1 && !draft.revisionSummary ? "Add a revision summary before submitting this version." : "Add a valid link or finalized attachment before submitting.");
    const assetIds = draft.attachments.map((item) => item.assetId); const assets = await PrivateAsset.find({ _id: { $in: assetIds }, projectId: project._id, deliverableId, lifecycle: "finalized" }).session(session);
    if (assets.length !== assetIds.length) throw new ApiError(422, "INVALID_ATTACHMENT", "One or more attachments are no longer finalized for this draft.");
    const byId = new Map(assets.map((asset) => [String(asset._id), asset]));
    let number = deliverable.number;
    if (!number) {
      const counter = await DeliverableProjectState.findOneAndUpdate({ projectId: project._id }, { $inc: { nextDeliverableNumber: 1 } }, { session, returnDocument: "after" }); if (!counter) throw stale(); number = counter.nextDeliverableNumber;
    }
    const now = new Date(); const version = new DeliverableVersion({
      workspaceId: project.workspaceId, projectId: project._id, deliverableId: deliverable._id, number: nextVersion, outcome: "in-review", title: deliverable.title,
      ...(draft.notes ? { notes: draft.notes } : {}), ...(nextVersion > 1 ? { revisionSummary: draft.revisionSummary } : {}), links: draft.links,
      attachments: draft.attachments.map((reference) => { const asset = byId.get(String(reference.assetId))!; return { id: new mongoose.Types.ObjectId(), assetId: asset._id, filename: asset.filename, mediaType: asset.mediaType, byteSize: asset.byteSize, order: reference.order }; }),
      scopeVersionId: scope._id, scopeVersionNumber: scope.number, submitterId: actor._id, submitterName: actor.displayName, submitterRole: role, submittedAt: now, commentSequence: 0,
    });
    await version.save({ session }); const removed = await DeliverableDraft.deleteOne({ _id: draft._id, revisionToken }, { session }); if (removed.deletedCount !== 1) throw stale();
    deliverable.number = number ?? null; deliverable.titleFrozen = true; deliverable.state = "in-review"; deliverable.currentDraftId = null; deliverable.currentVersionId = version._id; deliverable.nextVersionNumber = nextVersion; deliverable.revisionSequence += 1;
    await deliverable.save({ session }); await projectActivity({ project, actor, role, action: "deliverable.submitted", now, context: { deliverableId: String(deliverable._id), deliverableNumber: number, versionId: String(version._id), versionNumber: nextVersion, scopeVersionId: String(scope._id), scopeVersionNumber: scope.number } }, session);
    return { project, deliverable, version };
  });
  const warning = await notify(email, await clientRecipients(result.project._id), { category: "deliverable-review", subject: `Deliverable ${result.deliverable.number} is ready for review`, text: `${result.project.name}: Deliverable ${result.deliverable.number}, “${result.deliverable.title}”, version ${result.version.number} is ready for review. Open ClientScope to review it.` });
  return { version: versionView(result.version), ...(warning ? { warning } : {}) };
}

export async function postDeliverableComment(projectId: string, deliverableId: string, versionId: string, actor: Actor, body: string) {
  return transact(async (session) => {
    const { project, role } = await projectContext(projectId, actor._id, session, true) as { project: ProjectRecord; role: DeliverableRole };
    const deliverable = await Deliverable.findOne({ _id: deliverableId, projectId: project._id }).session(session); if (!deliverable) throw notFound();
    if (deliverable.state !== "in-review" || String(deliverable.currentVersionId) !== versionId) throw stale();
    const version = await DeliverableVersion.findOneAndUpdate({ _id: versionId, deliverableId, outcome: "in-review" }, { $inc: { commentSequence: 1 } }, { session, returnDocument: "after" }); if (!version) throw stale();
    const now = new Date(); const comment = new DeliverableComment({ workspaceId: project.workspaceId, projectId: project._id, deliverableId, versionId, sequence: version.commentSequence, body, authorId: actor._id, authorName: actor.displayName, authorRole: role, postedAt: now });
    await comment.save({ session }); await projectActivity({ project, actor, role, action: "deliverable.commented", now, context: { deliverableId, deliverableNumber: deliverable.number, versionId, versionNumber: version.number, commentId: String(comment._id) } }, session);
    return { comment: commentView(comment) };
  });
}

function commentView(comment: any) {
  return { id: String(comment._id), sequence: comment.sequence, body: comment.body, author: actorView(comment.authorId, comment.authorName, comment.authorRole), postedAt: comment.postedAt.toISOString() };
}

async function copiedDraft(project: ProjectRecord, deliverable: any, version: any, session: ClientSession) {
  const draft = new DeliverableDraft({ workspaceId: project.workspaceId, projectId: project._id, deliverableId: deliverable._id, revisionToken: opaqueToken(), copiedFromVersionId: version._id, ...(version.notes ? { notes: version.notes } : {}), links: version.links, attachments: version.attachments.map((item: any) => ({ assetId: item.assetId, order: item.order })) });
  await draft.save({ session }); return draft;
}

export async function decideDeliverable(projectId: string, deliverableId: string, versionId: string, actor: Actor, input: DecisionInput, email: EmailService) {
  const result = await transact(async (session) => {
    const { project, role } = await projectContext(projectId, actor._id, session, true) as { project: ProjectRecord; role: DeliverableRole };
    if (role !== "client-approver") throw notFound();
    const deliverable = await Deliverable.findOne({ _id: deliverableId, projectId: project._id }).session(session); if (!deliverable) throw notFound();
    if (deliverable.state !== "in-review" || String(deliverable.currentVersionId) !== versionId) throw stale();
    const now = new Date(); const version = await DeliverableVersion.findOneAndUpdate({ _id: versionId, deliverableId, outcome: "in-review" }, { $set: { outcome: input.outcome, terminalActorId: actor._id, terminalActorName: actor.displayName, terminalActorRole: role, terminalAt: now, ...(input.note ? { terminalNote: input.note } : {}) } }, { session, returnDocument: "after" }); if (!version) throw stale();
    await new DeliverableOutcome({ workspaceId: project.workspaceId, projectId: project._id, deliverableId, versionId, kind: input.outcome, ...(input.note ? { note: input.note } : {}), actorId: actor._id, actorName: actor.displayName, actorRole: role, occurredAt: now }).save({ session });
    let draft;
    if (input.outcome === "changes-requested") { draft = await copiedDraft(project, deliverable, version, session); deliverable.state = "revision-draft"; deliverable.currentDraftId = draft._id; }
    else {
      deliverable.state = "approved"; deliverable.terminalAt = now; deliverable.terminalActorId = actor._id; deliverable.terminalActorName = actor.displayName; deliverable.terminalActorRole = role;
      const state = await DeliverableProjectState.findOneAndUpdate({ projectId: project._id, openCount: { $gt: 0 } }, { $inc: { openCount: -1 } }, { session, returnDocument: "after" }); if (!state) throw stale();
    }
    deliverable.currentVersionId = null; deliverable.revisionSequence += 1; await deliverable.save({ session });
    await projectActivity({ project, actor, role, action: input.outcome === "approved" ? "deliverable.approved" : "deliverable.revision-requested", now, context: { deliverableId, deliverableNumber: deliverable.number, versionId, versionNumber: version.number, outcome: input.outcome } }, session);
    return { project, deliverable, version };
  });
  const warning = await notify(email, await providerRecipients(result.project), { category: "deliverable-result", subject: `Deliverable ${result.deliverable.number} review updated`, text: `${result.project.name}: Deliverable ${result.deliverable.number}, “${result.deliverable.title}”, version ${result.version.number} was ${input.outcome === "approved" ? "approved" : "returned for revision"}. Open ClientScope for the current record.` });
  return { outcome: input.outcome, version: versionView(result.version), ...(warning ? { warning } : {}) };
}

export async function withdrawDeliverable(projectId: string, deliverableId: string, versionId: string, actor: Actor, reason: string) {
  return transact(async (session) => {
    const { project, role } = await providerContext(projectId, actor, session);
    const deliverable = await Deliverable.findOne({ _id: deliverableId, projectId: project._id }).session(session); if (!deliverable) throw notFound();
    if (deliverable.state !== "in-review" || String(deliverable.currentVersionId) !== versionId) throw stale();
    const now = new Date(); const version = await DeliverableVersion.findOneAndUpdate({ _id: versionId, deliverableId, outcome: "in-review" }, { $set: { outcome: "withdrawn", terminalActorId: actor._id, terminalActorName: actor.displayName, terminalActorRole: role, terminalAt: now, terminalNote: reason } }, { session, returnDocument: "after" }); if (!version) throw stale();
    await new DeliverableOutcome({ workspaceId: project.workspaceId, projectId: project._id, deliverableId, versionId, kind: "withdrawn", note: reason, actorId: actor._id, actorName: actor.displayName, actorRole: role, occurredAt: now }).save({ session });
    const draft = await copiedDraft(project, deliverable, version, session); deliverable.state = "revision-draft"; deliverable.currentVersionId = null; deliverable.currentDraftId = draft._id; deliverable.revisionSequence += 1; await deliverable.save({ session });
    await projectActivity({ project, actor, role, action: "deliverable.withdrawn", now, context: { deliverableId, deliverableNumber: deliverable.number, versionId, versionNumber: version.number, outcome: "withdrawn" } }, session);
    return { outcome: "withdrawn", version: versionView(version) };
  });
}

export async function cancelDeliverable(projectId: string, deliverableId: string, actor: Actor, reason: string, storage: PrivateAssetStorage) {
  const result = await transact(async (session) => {
    const { project, role } = await providerContext(projectId, actor, session);
    const deliverable = await Deliverable.findOne({ _id: deliverableId, projectId: project._id }).session(session); if (!deliverable) throw notFound();
    if (deliverable.state !== "revision-draft") throw new ApiError(409, "INVALID_DELIVERABLE_TRANSITION", deliverable.state === "in-review" ? "Withdraw the current review before canceling this deliverable." : "This deliverable cannot be canceled from its current state.");
    const draft = await DeliverableDraft.findOne({ _id: deliverable.currentDraftId }).session(session); if (!draft) throw stale();
    const assetIds = draft.attachments.map((item) => item.assetId); const removed = await DeliverableDraft.deleteOne({ _id: draft._id }, { session }); if (removed.deletedCount !== 1) throw stale();
    const now = new Date(); deliverable.state = "canceled"; deliverable.currentDraftId = null; deliverable.terminalAt = now; deliverable.terminalActorId = actor._id; deliverable.terminalActorName = actor.displayName; deliverable.terminalActorRole = role; deliverable.cancellationReason = reason; deliverable.revisionSequence += 1; await deliverable.save({ session });
    for (const id of assetIds) await recordCleanup(id, "deliverable-canceled", session);
    const state = await DeliverableProjectState.findOneAndUpdate({ projectId: project._id, openCount: { $gt: 0 } }, { $inc: { openCount: -1 } }, { session, returnDocument: "after" }); if (!state) throw stale();
    await projectActivity({ project, actor, role, action: "deliverable.canceled", now, context: { deliverableId, deliverableNumber: deliverable.number, outcome: "canceled" } }, session);
    return { deliverable, role };
  });
  await processAssetCleanup(storage); return { deliverable: await aggregateView(result.deliverable, result.role) };
}

function secret() { return process.env.SESSION_SECRET ?? "clientscope-development-session-secret"; }
function sign(value: string) { return createHmac("sha256", secret()).update(value).digest("base64url"); }
function encodeCursor(kind: string, projectId: string, at: string, id: string) { const payload = Buffer.from(JSON.stringify({ kind, projectId, at, id })).toString("base64url"); return `${payload}.${sign(payload)}`; }
function decodeCursor(cursor: string, kind: string, projectId: string): { at: Date; id: mongoose.Types.ObjectId } {
  try {
    const [payload, signature, extra] = cursor.split("."); if (!payload || !signature || extra) throw new Error("shape"); const a = Buffer.from(sign(payload)); const b = Buffer.from(signature); if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("signature");
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as any; if (parsed.kind !== kind || parsed.projectId !== projectId || !mongoose.isValidObjectId(parsed.id)) throw new Error("context"); const at = new Date(parsed.at); if (at.toISOString() !== parsed.at) throw new Error("date"); return { at, id: new mongoose.Types.ObjectId(parsed.id) };
  } catch { throw new ApiError(400, "INVALID_CURSOR", "The page cursor is invalid. Refresh and try again."); }
}

export async function readTerminalDeliverables(projectId: string, userId: mongoose.Types.ObjectId, input: { cursor?: string; limit: number }) {
  const { project, role } = await projectContext(projectId, userId) as { project: ProjectRecord; role: DeliverableRole }; const after = input.cursor ? decodeCursor(input.cursor, "terminal", String(project._id)) : undefined;
  const filter: any = { projectId: project._id, state: { $in: ["approved", "canceled"] } }; if (after) filter.$or = [{ terminalAt: { $lt: after.at } }, { terminalAt: after.at, _id: { $lt: after.id } }];
  const records = await Deliverable.find(filter).sort({ terminalAt: -1, _id: -1 }).limit(input.limit + 1).lean(); const page = records.slice(0, input.limit); const last = page.at(-1);
  return { deliverables: await Promise.all(page.map((item) => aggregateView(item, role))), ...(records.length > input.limit && last?.terminalAt ? { nextCursor: encodeCursor("terminal", String(project._id), last.terminalAt.toISOString(), String(last._id)) } : {}) };
}

export async function readDeliverableVersions(projectId: string, deliverableId: string, userId: mongoose.Types.ObjectId, input: { cursor?: string; limit: number }) {
  const { project } = await projectContext(projectId, userId); const deliverable = await Deliverable.findOne({ _id: deliverableId, projectId: project._id, number: { $exists: true } }).lean(); if (!deliverable) throw notFound();
  const after = input.cursor ? decodeCursor(input.cursor, `versions:${deliverableId}`, String(project._id)) : undefined; const filter: any = { projectId: project._id, deliverableId }; if (after) filter.$or = [{ submittedAt: { $lt: after.at } }, { submittedAt: after.at, _id: { $lt: after.id } }];
  const records = await DeliverableVersion.find(filter).sort({ submittedAt: -1, _id: -1 }).limit(input.limit + 1).lean(); const page = records.slice(0, input.limit); const last = page.at(-1);
  return { versions: page.map(versionView), ...(records.length > input.limit && last ? { nextCursor: encodeCursor(`versions:${deliverableId}`, String(project._id), last.submittedAt.toISOString(), String(last._id)) } : {}) };
}

export async function readDeliverableComments(projectId: string, deliverableId: string, versionId: string, userId: mongoose.Types.ObjectId, input: { cursor?: string; limit: number }) {
  const { project } = await projectContext(projectId, userId); const version = await DeliverableVersion.findOne({ _id: versionId, deliverableId, projectId: project._id }).lean(); if (!version) throw notFound();
  const after = input.cursor ? decodeCursor(input.cursor, `comments:${versionId}`, String(project._id)) : undefined; const filter: any = { projectId: project._id, deliverableId, versionId }; if (after) filter.$or = [{ postedAt: { $gt: after.at } }, { postedAt: after.at, _id: { $gt: after.id } }];
  const records = await DeliverableComment.find(filter).sort({ postedAt: 1, _id: 1 }).limit(input.limit + 1).lean(); const page = records.slice(0, input.limit); const last = page.at(-1);
  return { comments: page.map(commentView), ...(records.length > input.limit && last ? { nextCursor: encodeCursor(`comments:${versionId}`, String(project._id), last.postedAt.toISOString(), String(last._id)) } : {}) };
}

export async function authorizeAttachmentAccess(projectId: string, deliverableId: string, versionId: string, attachmentId: string, userId: mongoose.Types.ObjectId, storage: PrivateAssetStorage) {
  const { project } = await projectContext(projectId, userId); const version = await DeliverableVersion.findOne({ _id: versionId, deliverableId, projectId: project._id, "attachments.id": attachmentId }).lean(); if (!version) throw notFound();
  const attachment = version.attachments.find((item) => String(item.id) === attachmentId); if (!attachment) throw notFound(); const asset = await PrivateAsset.findOne({ _id: attachment.assetId, projectId: project._id, lifecycle: "finalized" }).lean(); if (!asset) throw notFound();
  const expiresAt = new Date(Date.now() + DELIVERY_LIFETIME_MS); const preview = previewCapability(attachment.mediaType as any); const access = await storage.authorizeDelivery({ providerIdentifier: asset.providerIdentifier, filename: attachment.filename, preview, expiresAt });
  return { url: access.url, expiresAt: access.expiresAt.toISOString(), preview, filename: attachment.filename };
}

export async function deliverableSummary(projectId: mongoose.Types.ObjectId | string, role: DeliverableRole) {
  const state = provider(role) ? "revision-draft" : "in-review"; const pendingCount = await Deliverable.countDocuments({ projectId, state });
  return { pendingCount, ...(pendingCount > 0 ? { pendingAction: provider(role) ? "revision-required" : role === "client-approver" ? "decision-required" : "review-requested" } : {}) };
}
