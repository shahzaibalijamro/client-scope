/* eslint-disable @typescript-eslint/no-explicit-any -- Export records are converted through explicit allow-list projections. */
import PDFDocument from "pdfkit";
import mongoose from "mongoose";

import { ApiError } from "../errors.js";
import { ChangeComment, ChangeDecision, ChangeItem, ChangeProposal, ChangeRequest } from "./change-control-models.js";
import { Deliverable, DeliverableComment, DeliverableOutcome, DeliverableVersion, PrivateAsset } from "./deliverable-models.js";
import { ArchiveLifecycle, CompletionReview } from "./lifecycle-models.js";
import { safeActivityView } from "./lifecycle-service.js";
import { Milestone, MilestoneTransition } from "./milestone-models.js";
import { Activity, Client, EffectiveProjectAccess, User, Workspace } from "./models.js";
import type { PrivateAssetStorage } from "./private-asset-storage.js";
import { BUNDLED_FILE_CAP, EXPORT_SCHEMA_VERSION, exportManifestSchema, newestVersionRounds, uniqueArchivePaths, type ExportManifest, type OmissionReason } from "./project-export-contracts.js";
import { projectContext } from "./scope-service.js";
import { ScopeComment, ScopeDecision, ScopeVersion } from "./scope-models.js";

type Attachment = { attachmentId: string; assetId: string; deliverableNumber: number; deliverableTitle: string; versionNumber: number; order: number; filename: string; mediaType: string; byteSize: number; providerIdentifier?: string };
export type ProjectRecordProjection = { projectId: string; projectName: string; workspaceName: string; clientName: string; description?: string; targetDeadline?: string; lifecycleState: "active" | "completion-in-review" | "completed" | "archived"; generatedAt: string; dataCutoff: string; roster: any[]; scopeVersions: any[]; scopeComments: any[]; scopeDecisions: any[]; changeRequests: any[]; changeProposals: any[]; changeItems: any[]; changeComments: any[]; changeDecisions: any[]; milestones: any[]; milestoneTransitions: any[]; deliverables: any[]; deliverableVersions: any[]; deliverableComments: any[]; deliverableOutcomes: any[]; completionReviews: any[]; archiveHistory: any[]; activity: any[]; attachments: Attachment[] };

const iso = (value: unknown) => value instanceof Date ? value.toISOString() : value ? new Date(String(value)).toISOString() : undefined;
const actor = (record: any, prefix: string) => ({ displayName: record[`${prefix}Name`], role: record[`${prefix}Role`] });
const sharedRequirements = (items: any[]) => items.map((item) => ({ snapshotId: item.snapshotId ? String(item.snapshotId) : undefined, logicalId: String(item.logicalId), groupId: item.groupId ? String(item.groupId) : undefined, title: item.title, description: item.description, acceptanceCriteria: [...item.acceptanceCriteria], order: item.order }));

async function capture(userId: mongoose.Types.ObjectId, projectId: string, now: Date): Promise<ProjectRecordProjection> {
  const session = await mongoose.startSession();
  try {
    let projection: ProjectRecordProjection | undefined;
    await session.withTransaction(async () => {
      const { project } = await projectContext(projectId, userId, session);
      const [workspace, client, access, scopeVersions, scopeComments, scopeDecisions, changeRequests, changeProposals, changeItems, changeComments, changeDecisions, milestones, milestoneTransitions, deliverables, versions, deliverableComments, deliverableOutcomes, completionReviews, archiveHistory, activities] = await Promise.all([
        Workspace.findById(project.workspaceId).session(session).lean(), Client.findById((project as any).clientId).session(session).lean(),
        EffectiveProjectAccess.find({ projectId: project._id }).session(session).sort({ role: 1, userId: 1 }).lean(),
        ScopeVersion.find({ projectId: project._id, createdAt: { $lte: now } }).session(session).sort({ number: 1 }).lean(),
        ScopeComment.find({ projectId: project._id, postedAt: { $lte: now } }).session(session).sort({ postedAt: 1, _id: 1 }).lean(), ScopeDecision.find({ projectId: project._id, decidedAt: { $lte: now } }).session(session).sort({ decidedAt: 1 }).lean(),
        ChangeRequest.find({ projectId: project._id, number: { $exists: true }, createdAt: { $lte: now } }).session(session).sort({ number: 1 }).lean(), ChangeProposal.find({ projectId: project._id, submittedAt: { $lte: now } }).session(session).sort({ requestId: 1, number: 1 }).lean(),
        ChangeItem.find({ projectId: project._id, createdAt: { $lte: now } }).session(session).sort({ proposalId: 1, position: 1, _id: 1 }).lean(), ChangeComment.find({ projectId: project._id, postedAt: { $lte: now } }).session(session).sort({ postedAt: 1, _id: 1 }).lean(), ChangeDecision.find({ projectId: project._id, decidedAt: { $lte: now } }).session(session).sort({ decidedAt: 1 }).lean(),
        Milestone.find({ projectId: project._id, createdAt: { $lte: now } }).session(session).sort({ active: -1, position: 1, archivedAt: 1, _id: 1 }).lean(), MilestoneTransition.find({ projectId: project._id, transitionedAt: { $lte: now } }).session(session).sort({ transitionedAt: 1, _id: 1 }).lean(),
        Deliverable.find({ projectId: project._id, number: { $exists: true }, createdAt: { $lte: now } }).session(session).sort({ number: 1 }).lean(), DeliverableVersion.find({ projectId: project._id, submittedAt: { $lte: now } }).session(session).sort({ deliverableId: 1, number: 1 }).lean(),
        DeliverableComment.find({ projectId: project._id, postedAt: { $lte: now } }).session(session).sort({ postedAt: 1, _id: 1 }).lean(), DeliverableOutcome.find({ projectId: project._id, occurredAt: { $lte: now } }).session(session).sort({ occurredAt: 1 }).lean(),
        CompletionReview.find({ projectId: project._id, requestedAt: { $lte: now } }).session(session).sort({ number: 1 }).lean(), ArchiveLifecycle.find({ projectId: project._id, occurredAt: { $lte: now } }).session(session).sort({ occurredAt: 1, _id: 1 }).lean(), Activity.find({ projectId: project._id, audience: "project", occurredAt: { $lte: now } }).session(session).sort({ occurredAt: 1, _id: 1 }).lean(),
      ]);
      if (!workspace || !client) throw new ApiError(500, "EXPORT_GENERATION_FAILED", "The project record could not be prepared. Try again.");
      const owner = await User.findById(workspace.ownerId).session(session).lean();
      const accessUsers = await User.find({ _id: { $in: access.map((item) => item.userId) } }).session(session).lean();
      const names = new Map(accessUsers.map((item) => [String(item._id), item.displayName]));
      const roster = [{ displayName: owner?.displayName ?? "Workspace owner", role: "workspace-owner" }, ...access.map((item) => ({ displayName: names.get(String(item.userId)) ?? "Project member", role: item.role }))];
      const deliverableById = new Map(deliverables.map((item) => [String(item._id), item]));
      const rawAttachments: Attachment[] = versions.flatMap((version) => (version.attachments ?? []).map((item: any) => ({ attachmentId: String(item.id), assetId: String(item.assetId), deliverableNumber: deliverableById.get(String(version.deliverableId))?.number ?? 0, deliverableTitle: version.title, versionNumber: version.number, order: item.order, filename: item.filename, mediaType: item.mediaType, byteSize: item.byteSize })));
      const assets = await PrivateAsset.find({ projectId: project._id, _id: { $in: rawAttachments.map((item) => item.assetId) }, lifecycle: "finalized" }).session(session).lean();
      const assetMap = new Map(assets.map((item) => [String(item._id), item.providerIdentifier]));
      const attachments = newestVersionRounds(rawAttachments).map((item) => { const providerIdentifier = assetMap.get(item.assetId); return { ...item, ...(providerIdentifier ? { providerIdentifier } : {}) }; });
      projection = {
        projectId: String(project._id), projectName: project.name, workspaceName: workspace.name, clientName: client.name, description: (project as any).description, targetDeadline: (project as any).targetDeadline,
        lifecycleState: (project.lifecycleState ?? "active") as ProjectRecordProjection["lifecycleState"], generatedAt: now.toISOString(), dataCutoff: now.toISOString(), roster,
        scopeVersions: scopeVersions.map((v) => ({ number: v.number, status: v.status, groups: v.groups.map((g) => ({ name: g.name, order: g.order })), requirements: sharedRequirements(v.requirements), revisionSummary: v.revisionSummary, submittedBy: actor(v, "submitter"), submittedAt: iso(v.submittedAt), terminalBy: actor(v, "terminalActor"), terminalAt: iso(v.terminalAt), terminalNote: v.terminalNote })),
        scopeComments: scopeComments.map((c) => ({ versionId: String(c.versionId), requirementSnapshotId: c.requirementSnapshotId ? String(c.requirementSnapshotId) : undefined, body: c.body, author: actor(c, "author"), postedAt: iso(c.postedAt) })), scopeDecisions: scopeDecisions.map((d) => ({ versionId: String(d.versionId), outcome: d.outcome, note: d.note, actor: actor(d, "actor"), decidedAt: iso(d.decidedAt) })),
        changeRequests: changeRequests.map((r) => ({ number: r.number, title: r.title, baseScopeVersionNumber: r.baseScopeVersionNumber, state: r.state, creator: actor(r, "creator"), terminalActor: actor(r, "terminalActor"), terminalAt: iso(r.terminalAt), terminalReason: r.terminalReason })),
        changeProposals: changeProposals.map((p) => ({ requestId: String(p.requestId), number: p.number, outcome: p.outcome, title: p.title, rationale: p.rationale, impactSummary: p.impactSummary, revisionSummary: p.revisionSummary, baseScopeVersionNumber: p.baseScopeVersionNumber, groups: p.groups.map((g) => ({ name: g.name, order: g.order })), requirements: sharedRequirements(p.requirements), submitter: actor(p, "submitter"), submittedAt: iso(p.submittedAt), terminalActor: actor(p, "terminalActor"), terminalAt: iso(p.terminalAt), terminalNote: p.terminalNote })),
        changeItems: changeItems.map((i) => ({ proposalId: String(i.proposalId), comparisonKind: i.comparisonKind, entityKind: i.entityKind, changeKinds: [...i.changeKinds], before: i.before, after: i.after, position: i.position })), changeComments: changeComments.map((c) => ({ proposalId: String(c.proposalId), comparisonKind: c.comparisonKind, body: c.body, author: actor(c, "author"), postedAt: iso(c.postedAt) })), changeDecisions: changeDecisions.map((d) => ({ proposalId: String(d.proposalId), outcome: d.outcome, note: d.note, actor: actor(d, "actor"), decidedAt: iso(d.decidedAt) })),
        milestones: milestones.map((m) => ({ title: m.title, description: m.description, targetDate: m.targetDate, status: m.status, position: m.position, active: m.active, archivedAt: iso(m.archivedAt), archivedBy: actor(m, "archivedBy"), archiveReason: m.archiveReason })), milestoneTransitions: milestoneTransitions.map((t) => ({ previousStatus: t.previousStatus, nextStatus: t.nextStatus, actor: actor(t, "actor"), transitionedAt: iso(t.transitionedAt), note: t.note })),
        deliverables: deliverables.map((d) => ({ number: d.number, title: d.title, state: d.state, creator: actor(d, "creator"), terminalActor: actor(d, "terminalActor"), terminalAt: iso(d.terminalAt), cancellationReason: d.cancellationReason })),
        deliverableVersions: versions.map((v) => ({ deliverableNumber: deliverableById.get(String(v.deliverableId))?.number, number: v.number, outcome: v.outcome, title: v.title, notes: v.notes, revisionSummary: v.revisionSummary, links: v.links.map((l) => ({ label: l.label, url: l.url, order: l.order })), attachments: v.attachments.map((a) => ({ id: String(a.id), filename: a.filename, mediaType: a.mediaType, byteSize: a.byteSize, order: a.order })), scopeVersionNumber: v.scopeVersionNumber, submitter: actor(v, "submitter"), submittedAt: iso(v.submittedAt), terminalActor: actor(v, "terminalActor"), terminalAt: iso(v.terminalAt), terminalNote: v.terminalNote })), deliverableComments: deliverableComments.map((c) => ({ versionId: String(c.versionId), sequence: c.sequence, body: c.body, author: actor(c, "author"), postedAt: iso(c.postedAt) })), deliverableOutcomes: deliverableOutcomes.map((o) => ({ versionId: String(o.versionId), kind: o.kind, note: o.note, actor: actor(o, "actor"), occurredAt: iso(o.occurredAt) })),
        completionReviews: completionReviews.map((r) => ({ number: r.number, status: r.status, requester: r.requester, requestedAt: iso(r.requestedAt), requestSummary: r.requestSummary, readiness: r.readiness, terminalActor: r.terminalActor, terminalAt: iso(r.terminalAt), terminalOutcome: r.terminalOutcome, terminalNote: r.terminalNote })), archiveHistory: archiveHistory.map((a) => ({ action: a.action, actor: a.actor, occurredAt: iso(a.occurredAt), reason: a.reason, previousState: a.previousState, nextState: a.nextState })),
        activity: activities.map(safeActivityView), attachments,
      };
    }, { readConcern: { level: "snapshot" } });
    return projection!;
  } finally { await session.endSession(); }
}

function pdfBuffer(record: ProjectRecordProjection, manifest: ExportManifest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: "A4", margin: 48, info: { Title: `${record.projectName} project record`, Author: "ClientScope" } });
    const chunks: Buffer[] = []; document.on("data", (chunk) => chunks.push(Buffer.from(chunk))); document.on("end", () => resolve(Buffer.concat(chunks))); document.on("error", reject);
    const text = (value: unknown) => document.text([...String(value ?? "—")].filter((character) => { const code = character.codePointAt(0) ?? 0; return code > 31 || character === "\n" || character === "\t"; }).filter((character) => { const code = character.codePointAt(0) ?? 0; return !(code >= 127 && code <= 159) && !(code >= 0x202a && code <= 0x202e) && !(code >= 0x2066 && code <= 0x2069); }).join(""));
    const section = (title: string, value: unknown) => { document.moveDown(); document.fontSize(15).fillColor("#17324d").text(title); document.fontSize(9).fillColor("#1f2937"); const items = Array.isArray(value) ? value : [value]; if (!items.length) document.text("No shared records."); else items.forEach((item) => text(JSON.stringify(item, null, 2))); };
    document.fontSize(22).fillColor("#17324d").text("ClientScope project record"); document.fontSize(14).text(record.projectName); document.fontSize(9).fillColor("#1f2937");
    text(`Workspace: ${record.workspaceName}\nClient: ${record.clientName}\nLifecycle: ${record.lifecycleState}\nGenerated: ${record.generatedAt}\nData cutoff: ${record.dataCutoff}`);
    document.moveDown().fontSize(10).fillColor("#8a4b08").text("Informational point-in-time snapshot only. This export is not certified, legally authoritative, an electronic signature, or compliance-grade. ClientScope remains the source of truth.");
    if (!manifest.complete) document.moveDown().fillColor("#9b1c1c").text(`Attachment set incomplete. Consult manifest.json. Omissions: ${JSON.stringify(manifest.attachments.filter((a) => a.status === "omitted").reduce<Record<string, number>>((all, a) => ({ ...all, [a.omissionReason!]: (all[a.omissionReason!] ?? 0) + 1 }), {}))}`);
    section("Project summary", { description: record.description, targetDeadline: record.targetDeadline }); section("Current roster", record.roster); section("Scope history", [...record.scopeVersions, ...record.scopeComments, ...record.scopeDecisions]); section("Change control", [...record.changeRequests, ...record.changeProposals, ...record.changeItems, ...record.changeComments, ...record.changeDecisions]); section("Milestones", [...record.milestones, ...record.milestoneTransitions]); section("Deliverables and feedback", [...record.deliverables, ...record.deliverableVersions, ...record.deliverableComments, ...record.deliverableOutcomes]); section("Completion and archive history", [...record.completionReviews, ...record.archiveHistory]); section("Project activity", record.activity); section("Attachment inventory", manifest.attachments);
    document.end();
  });
}

function omission(error: unknown): OmissionReason {
  if (error instanceof ApiError && error.code === "ASSET_NOT_FOUND") return "not_found";
  if (error instanceof ApiError && error.code === "ASSET_ACCESS_DENIED") return "access_denied";
  return "storage_unavailable";
}

export async function prepareProjectExport(userId: mongoose.Types.ObjectId, projectId: string, storage: PrivateAssetStorage, signal?: AbortSignal, now = new Date()) {
  const record = await capture(userId, projectId, now); const paths = uniqueArchivePaths(record.attachments); let includedFileBytes = 0;
  const files: Array<{ path: string; bytes: Buffer }> = []; const entries: ExportManifest["attachments"] = [];
  for (const [index, item] of record.attachments.entries()) {
    const base = { attachmentId: item.attachmentId, deliverableNumber: item.deliverableNumber, deliverableTitle: item.deliverableTitle, versionNumber: item.versionNumber, order: item.order, filename: item.filename, mediaType: item.mediaType, byteSize: item.byteSize };
    if (item.byteSize > BUNDLED_FILE_CAP || includedFileBytes + item.byteSize > BUNDLED_FILE_CAP) { entries.push({ ...base, status: "omitted", omissionReason: "size_limit" }); continue; }
    if (!item.providerIdentifier) { entries.push({ ...base, status: "omitted", omissionReason: "not_found" }); continue; }
    try {
      const bytes = await storage.read({ providerIdentifier: item.providerIdentifier, byteSize: item.byteSize, ...(signal ? { signal } : {}) });
      if (bytes.byteLength !== item.byteSize) { entries.push({ ...base, status: "omitted", omissionReason: "integrity_failure" }); continue; }
      includedFileBytes += bytes.byteLength; files.push({ path: paths[index]!, bytes }); entries.push({ ...base, status: "included", path: paths[index] });
    } catch (error) { if (signal?.aborted) throw error; entries.push({ ...base, status: "omitted", omissionReason: omission(error) }); }
  }
  const manifest = exportManifestSchema.parse({ schemaVersion: EXPORT_SCHEMA_VERSION, projectId: record.projectId, projectName: record.projectName, generatedAt: record.generatedAt, dataCutoff: record.dataCutoff, lifecycleState: record.lifecycleState, bundledFileCap: BUNDLED_FILE_CAP, includedFileBytes, complete: entries.every((entry) => entry.status === "included"), attachments: entries });
  return { record, manifest, pdf: await pdfBuffer(record, manifest), files };
}

export async function recheckProjectExportAccess(userId: mongoose.Types.ObjectId, projectId: string): Promise<void> { await projectContext(projectId, userId); }
