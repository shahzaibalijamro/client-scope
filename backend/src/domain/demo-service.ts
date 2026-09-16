import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

import mongoose, { type ClientSession } from "mongoose";

import type { DemoConfig } from "../config.js";
import { ApiError } from "../errors.js";
import { logDiagnostic } from "../logger.js";
import { hashPassword, normalizeEmail } from "./security.js";
import {
  AccountToken, Activity, Client, ClientMembership, EffectiveProjectAccess, Invitation, Project,
  ProjectAssignment, User, Workspace, WorkspaceMembership,
} from "./models.js";
import { ScopeComment, ScopeDecision, ScopeDraft, ScopeVersion } from "./scope-models.js";
import { ChangeComment, ChangeDecision, ChangeItem, ChangeProposal, ChangeProposalDraft, ChangeRequest } from "./change-control-models.js";
import { Milestone, MilestoneTimeline, MilestoneTransition } from "./milestone-models.js";
import {
  AssetCleanupWork, Deliverable, DeliverableComment, DeliverableDraft, DeliverableOutcome,
  DeliverableProjectState, DeliverableVersion, PrivateAsset, UploadReservation,
} from "./deliverable-models.js";
import { ArchiveLifecycle, CompletionReview } from "./lifecycle-models.js";
import { AiGenerationLedger, AiRequirementProposal } from "./ai-requirement-models.js";
import { AiRequirementReview } from "./ai-requirement-review-models.js";
import { AiFeedbackSummary } from "./ai-feedback-summary-models.js";
import { DemoAssetCleanup, DemoControl, DemoQuotaLedger } from "./demo-models.js";
import type { PrivateAssetStorage } from "./private-asset-storage.js";

export type DemoCapability = "email" | "ai" | "upload";
export type DemoClock = () => Date;
const SIX_HOURS_MS = 6 * 60 * 60 * 1_000;
const HOUR_MS = 60 * 60 * 1_000;
const MIB = 1024 * 1024;

function id(key: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(createHash("sha256").update(`clientscope-demo:${key}`).digest("hex").slice(0, 24));
}

function at(now: Date, days: number, hours = 0): Date {
  return new Date(now.valueOf() + days * 86_400_000 + hours * 3_600_000);
}

function dateOnly(value: Date): string { return value.toISOString().slice(0, 10); }
function safeEqual(left: string, right: string): boolean {
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}

const tenantModels = [
  Activity, Invitation, WorkspaceMembership, ProjectAssignment, EffectiveProjectAccess, ClientMembership, Client, Project,
  ScopeDraft, ScopeVersion, ScopeComment, ScopeDecision, ChangeRequest, ChangeProposalDraft, ChangeProposal,
  ChangeItem, ChangeComment, ChangeDecision, MilestoneTimeline, Milestone, MilestoneTransition,
  DeliverableProjectState, Deliverable, DeliverableDraft, DeliverableVersion, DeliverableComment, DeliverableOutcome,
  PrivateAsset, UploadReservation, CompletionReview, ArchiveLifecycle, AiRequirementProposal, AiRequirementReview,
  AiFeedbackSummary,
] as const;

export class DemoService {
  private runtimeState: "pending" | "ready" | "invalid" = "pending";

  constructor(
    readonly config: DemoConfig,
    private readonly clock: DemoClock = () => new Date(),
    private readonly sourceCommit = process.env.SOURCE_COMMIT ?? "local",
    private readonly assetStorage?: PrivateAssetStorage,
  ) {}

  get enabled(): boolean { return this.config.state === "enabled" && this.runtimeState !== "invalid"; }

  isCanonicalEmail(email: string): boolean {
    return this.config.state === "enabled" && [this.config.owner.email, this.config.approver.email].includes(normalizeEmail(email));
  }

  async isCanonicalUser(userId: mongoose.Types.ObjectId): Promise<boolean> {
    if (this.config.state !== "enabled") return false;
    const user = await User.findById(userId).select("normalizedEmail").lean();
    return Boolean(user && this.isCanonicalEmail(user.normalizedEmail));
  }

  nextReset(now = this.clock()): Date {
    return new Date(Math.floor(now.valueOf() / SIX_HOURS_MS) * SIX_HOURS_MS + SIX_HOURS_MS);
  }

  async publicStatus(): Promise<Record<string, unknown>> {
    if (this.config.state !== "enabled" || this.runtimeState !== "ready") return { enabled: false };
    const control = await DemoControl.findOne({ tenantId: this.config.tenantId }).lean();
    const state = !control ? "initializing" : ["preparing", "replacing", "cleaning-assets"].includes(control.state) ? "resetting" : control.state === "failed" ? "degraded-provider" : "ready";
    return {
      enabled: true, status: state,
      identities: [this.config.owner, this.config.approver],
      reset: { cadenceHours: 6, nextScheduledAt: this.nextReset().toISOString() },
    };
  }

  async generationFor(userId: mongoose.Types.ObjectId): Promise<number | undefined> {
    if (!(await this.isCanonicalUser(userId)) || this.config.state !== "enabled") return undefined;
    return (await DemoControl.findOne({ tenantId: this.config.tenantId }).select("generation").lean())?.generation;
  }

  async assertMutationAllowed(workspaceId: mongoose.Types.ObjectId | string): Promise<void> {
    if (this.config.state !== "enabled" || String(workspaceId) !== this.config.tenantId) return;
    const control = await DemoControl.findOne({ tenantId: this.config.tenantId }).select("state leaseUntil").lean();
    if (control && ["preparing", "replacing", "cleaning-assets"].includes(control.state) && control.leaseUntil && control.leaseUntil > this.clock()) {
      const retryAt = control.leaseUntil;
      throw new ApiError(503, "DEMO_RESET_IN_PROGRESS", "The shared demo is refreshing. Refresh shortly to load the canonical data.", { retryAt: retryAt.toISOString() });
    }
  }

  protectedError(): ApiError {
    return new ApiError(409, "DEMO_PROTECTED", "This shared demo record is protected and will be restored by the scheduled reset.");
  }

  assetPrefix(workspaceId: mongoose.Types.ObjectId | string): string {
    return this.config.state === "enabled" && String(workspaceId) === this.config.tenantId ? this.config.cloudinaryFolder : "clientscope";
  }

  async reserveQuota(
    workspaceId: mongoose.Types.ObjectId | string,
    userId: mongoose.Types.ObjectId,
    capability: DemoCapability,
    amount: number,
    operationId: string = randomUUID(),
    suppliedSession?: ClientSession,
  ): Promise<void> {
    const config = this.config;
    if (config.state !== "enabled" || String(workspaceId) !== config.tenantId) return;
    const run = async (session: ClientSession) => {
      const now = this.clock(); const tenantId = new mongoose.Types.ObjectId(config.tenantId);
      const hourlyLimit = capability === "email" ? config.quotas.emailsPerUserHour : capability === "ai" ? config.quotas.aiRequestsPerUserHour : config.quotas.uploadMibPerUserHour * MIB;
      const dailyLimit = capability === "email" ? config.quotas.emailsPerDay : capability === "ai" ? config.quotas.aiRequestsPerDay : config.quotas.uploadMibPerDay * MIB;
      const cutoff = new Date(now.valueOf() - HOUR_MS);
      const dayKey = now.toISOString().slice(0, 10);
      let hourly = await DemoQuotaLedger.findOne({ tenantId, capability, scope: "identity-hour", userId }).session(session);
      if (!hourly) hourly = new DemoQuotaLedger({ tenantId, capability, scope: "identity-hour", userId, events: [], used: 0 });
      hourly.events = hourly.events.filter((event) => event.occurredAt > cutoff) as typeof hourly.events;
      hourly.used = hourly.events.reduce((total, event) => total + event.amount, 0);
      if (!hourly.events.some((event) => event.operationId === operationId)) {
        if (hourly.used + amount > hourlyLimit) {
          const retryAt = hourly.events.length ? new Date(hourly.events[0]!.occurredAt.valueOf() + HOUR_MS) : new Date(now.valueOf() + HOUR_MS);
          throw new ApiError(429, "DEMO_QUOTA_EXCEEDED", `The shared demo ${capability} allowance is temporarily exhausted.`, { capability, retryAt: retryAt.toISOString() });
        }
        hourly.events.push({ operationId, amount, occurredAt: now }); hourly.used += amount;
      }

      let daily = await DemoQuotaLedger.findOne({ tenantId, capability, scope: "deployment-day", dayKey }).session(session);
      if (!daily) daily = new DemoQuotaLedger({ tenantId, capability, scope: "deployment-day", dayKey, events: [], used: 0 });
      if (!daily.events.some((event) => event.operationId === operationId)) {
        if (daily.used + amount > dailyLimit) {
          const tomorrow = new Date(`${dayKey}T00:00:00.000Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
          throw new ApiError(429, "DEMO_QUOTA_EXCEEDED", `The shared demo ${capability} allowance is temporarily exhausted.`, { capability, retryAt: tomorrow.toISOString() });
        }
        daily.events.push({ operationId, amount, occurredAt: now }); daily.used += amount;
      }
      await hourly.save({ session }); await daily.save({ session });
    };
    if (suppliedSession) { await run(suppliedSession); return; }
    const session = await mongoose.startSession();
    try { await session.withTransaction(() => run(session)); } finally { await session.endSession(); }
  }

  async initialize(): Promise<void> {
    if (this.config.state !== "enabled") return;
    const tenantId = new mongoose.Types.ObjectId(this.config.tenantId);
    const workspace = await Workspace.findById(tenantId).lean();
    const markedWorkspaceCount = await Workspace.countDocuments({ demoTenantId: tenantId });
    if ((workspace && String(workspace.demoTenantId ?? "") !== this.config.tenantId) || markedWorkspaceCount > (workspace ? 1 : 0)) {
      this.runtimeState = "invalid";
      logDiagnostic("error", "demo.initialization_refused", { reason: "tenant-not-marked" });
      return;
    }
    const control = await DemoControl.findOneAndUpdate(
      { tenantId }, { $setOnInsert: { generation: 0, state: "initializing", sourceCommit: this.sourceCommit } },
      { upsert: true, returnDocument: "after" },
    );
    if (!workspace || control.generation === 0) await this.reset("initialization");
    else this.runtimeState = "ready";
  }

  async reset(source: "initialization" | "scheduled" | "manual" = "manual"): Promise<Record<string, unknown>> {
    const config = this.config;
    if (config.state !== "enabled") throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
    const startedAt = this.clock(); const tenantId = new mongoose.Types.ObjectId(config.tenantId);
    const workspace = await Workspace.findById(tenantId).select("demoTenantId").lean();
    const markedWorkspaceCount = await Workspace.countDocuments({ demoTenantId: tenantId });
    const initializationMayCreate = source === "initialization" && !workspace && markedWorkspaceCount === 0;
    const exactMarkedTenant = Boolean(workspace && String(workspace.demoTenantId ?? "") === config.tenantId && markedWorkspaceCount === 1);
    if (!initializationMayCreate && !exactMarkedTenant) {
      if (source === "initialization") this.runtimeState = "invalid";
      logDiagnostic("error", "demo.reset_refused", { source, reason: "tenant-verification-failed" });
      throw new ApiError(409, "DEMO_PROTECTED", "The shared demo reset target could not be verified safely.");
    }
    const runId = randomUUID(); const leaseUntil = new Date(startedAt.valueOf() + 5 * 60_000);
    const control = await DemoControl.findOneAndUpdate(
      { tenantId, $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: startedAt } }] },
      { $set: { state: "preparing", leaseId: runId, leaseUntil, lastRunId: runId, lastStartedAt: startedAt, sourceCommit: this.sourceCommit }, $unset: { lastFailureCode: 1 } },
      { returnDocument: "after" },
    );
    if (!control) throw new ApiError(503, "DEMO_RESET_IN_PROGRESS", "The shared demo reset is already running.", { retryAt: leaseUntil.toISOString() });

    try {
      const owner = await this.reconcileUser(config.owner.email, "Avery Morgan", config.owner.password);
      const approver = await this.reconcileUser(config.approver.email, "Jordan Lee", config.approver.password);
      const generation = control.generation + 1;
      const docs = this.canonicalDocuments(tenantId, owner._id, approver._id, startedAt);
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await DemoControl.updateOne({ tenantId, leaseId: runId }, { $set: { state: "replacing" } }, { session });
          const assets = await PrivateAsset.find({ workspaceId: tenantId }).select("_id providerIdentifier").session(session).lean();
          if (assets.length) {
            await DemoAssetCleanup.bulkWrite(assets.map((asset) => ({ updateOne: {
              filter: { tenantId, providerIdentifier: asset.providerIdentifier },
              update: { $setOnInsert: { folder: config.cloudinaryFolder, state: "pending", attempts: 0 } }, upsert: true,
            } })), { session });
          }
          await AssetCleanupWork.deleteMany({ assetId: { $in: assets.map((asset) => asset._id) } }, { session });
          for (const candidate of tenantModels) {
            const model = candidate as unknown as mongoose.Model<mongoose.AnyObject>;
            await model.deleteMany({ workspaceId: tenantId }, { session });
          }
          await AccountToken.deleteMany({ userId: { $in: [owner._id, approver._id] } }, { session });
          await AiGenerationLedger.deleteMany({ userId: { $in: [owner._id, approver._id] } }, { session });
          for (const entry of docs) if (entry.documents.length) {
            const model = entry.model as unknown as mongoose.Model<mongoose.AnyObject>;
            await model.insertMany(entry.documents as mongoose.AnyObject[], { session });
          }
          await Workspace.findOneAndUpdate(
            { _id: tenantId, $or: [{ demoTenantId: tenantId }, { demoTenantId: { $exists: false } }] },
            { $set: { name: "Northstar Digital Studio", ownerId: owner._id, demoTenantId: tenantId, demoGeneration: generation } },
            { upsert: true, returnDocument: "after", session },
          );
          await DemoQuotaLedger.deleteMany({ tenantId }, { session });
          await DemoControl.updateOne({ tenantId, leaseId: runId }, { $set: { state: "cleaning-assets", generation } }, { session });
        });
      } finally { await session.endSession(); }

      const cleanup = await this.finishCleanup(tenantId);
      const completedAt = this.clock();
      await DemoControl.updateOne({ tenantId, leaseId: runId }, {
        $set: { state: "completed", lastCompletedAt: completedAt }, $unset: { leaseId: 1, leaseUntil: 1 },
      });
      this.runtimeState = "ready";
      const counts = { users: 2, workspaces: 1, projects: 3 };
      logDiagnostic("info", "demo.reset_completed", { runId, source, sourceCommit: this.sourceCommit, durationMs: completedAt.valueOf() - startedAt.valueOf(), ...counts, cleanupPending: cleanup.pending, cleanupCompleted: cleanup.completed });
      return { runId, state: "completed", generation, counts, cleanup, startedAt: startedAt.toISOString(), completedAt: completedAt.toISOString(), sourceCommit: this.sourceCommit };
    } catch (error) {
      await DemoControl.updateOne({ tenantId, leaseId: runId }, { $set: { state: "failed", lastFailureCode: "RESET_FAILED" }, $unset: { leaseId: 1, leaseUntil: 1 } });
      logDiagnostic("error", "demo.reset_failed", { runId, source, sourceCommit: this.sourceCommit, failureClass: error instanceof Error ? error.name : "UnknownError" });
      throw error;
    }
  }

  private async reconcileUser(email: string, displayName: string, password: string) {
    const normalizedEmail = normalizeEmail(email); const passwordHash = await hashPassword(password);
    return User.findOneAndUpdate(
      { normalizedEmail },
      { $set: { email, normalizedEmail, displayName, passwordHash, verifiedAt: this.clock() }, $setOnInsert: { _id: id(`user:${normalizedEmail}`) } },
      { upsert: true, returnDocument: "after" },
    ).then((record) => record!);
  }

  private async finishCleanup(tenantId: mongoose.Types.ObjectId): Promise<{ pending: number; completed: number }> {
    const records = await DemoAssetCleanup.find({ tenantId, state: { $in: ["pending", "retry"] } });
    let completed = 0;
    for (const record of records) {
      if (!this.assetStorage || !this.assetStorage.belongsToFolder || this.config.state !== "enabled") continue;
      if (record.folder !== this.config.cloudinaryFolder || !this.assetStorage.belongsToFolder(record.providerIdentifier, this.config.cloudinaryFolder)) {
        record.state = "retry"; record.attempts += 1; record.lastFailureCode = "UNSAFE_ASSET_SCOPE"; record.retryAfter = new Date(this.clock().valueOf() + SIX_HOURS_MS); await record.save(); continue;
      }
      try {
        await this.assetStorage.delete({ providerIdentifier: record.providerIdentifier, idempotencyKey: `demo-reset:${record._id}` });
        record.state = "completed"; record.attempts += 1; record.set({ lastFailureCode: null, retryAfter: null }); await record.save(); completed += 1;
      } catch {
        record.state = "retry"; record.attempts += 1; record.lastFailureCode = "PROVIDER_UNAVAILABLE"; record.retryAfter = new Date(this.clock().valueOf() + SIX_HOURS_MS); await record.save();
      }
    }
    const pending = await DemoAssetCleanup.countDocuments({ tenantId, state: { $in: ["pending", "retry"] } });
    return { pending, completed };
  }

  private canonicalDocuments(tenantId: mongoose.Types.ObjectId, ownerId: mongoose.Types.ObjectId, approverId: mongoose.Types.ObjectId, now: Date) {
    const projects = ["active", "completed", "archived"].map((key) => id(`project:${key}`));
    const clients = ["active", "completed", "archived"].map((key) => id(`client:${key}`));
    const scopeIds = projects.map((_, index) => id(`scope:${index}`));
    const baseScopeIds = projects.map((_, index) => id(`scope-base:${index}`));
    const requirementIds = projects.map((_, index) => id(`requirement:${index}`));
    const milestoneIds = projects.map((_, index) => id(`milestone:${index}`));
    const deliverableIds = projects.map((_, index) => id(`deliverable:${index}`));
    const versionIds = projects.map((_, index) => id(`deliverable-version:${index}`));
    const priorVersionIds = projects.map((_, index) => id(`deliverable-version-prior:${index}`));
    const projectNames = ["Harbor Website Launch", "Atlas Client Portal", "Cedar Brand Archive"];
    const lifecycle = ["active", "completed", "archived"] as const;
    const role = "client-approver";
    const group = id("scope-group:core");
    const projectDocs = projects.map((projectId, index) => ({
      _id: projectId, workspaceId: tenantId, clientId: clients[index], name: projectNames[index],
      description: index === 0 ? "An active website launch awaiting client review." : index === 1 ? "A completed portal with a preserved delivery history." : "An archived identity project retained as a read-only record.",
      targetDeadline: dateOnly(at(now, index === 0 ? 18 : -30 - index * 15)), lifecycleState: lifecycle[index],
      lifecycleRevision: `demo-lifecycle-${index}`, currentCompletionRoundId: index ? id(`completion:${index}`) : undefined,
      nextCompletionRoundNumber: index ? 1 : 0, workflowSequence: 20 + index,
    }));
    const scopeDocs = projects.map((projectId, index) => ({
      _id: scopeIds[index]!, workspaceId: tenantId, projectId, number: index < 2 ? 2 : 1, status: "approved", groups: [{ id: group, name: "Core experience", order: 0 }],
      requirements: [{ snapshotId: id(`snapshot:${index}`), logicalId: requirementIds[index], groupId: group, title: index === 0 ? "Responsive marketing site" : "Secure client experience", description: "Deliver a polished, accessible experience across current desktop and mobile browsers.", acceptanceCriteria: ["The primary journey works at 390px and 1440px.", "Keyboard focus remains visible throughout."], order: 0 }],
      submitterId: ownerId, submitterName: "Avery Morgan", submitterRole: "workspace-owner", submittedAt: at(now, -45 - index * 10),
      terminalActorId: approverId, terminalActorName: "Jordan Lee", terminalRole: role, terminalAt: at(now, -43 - index * 10), terminalNote: "Approved for delivery.", commentSequence: 0,
      ...(index < 2 ? { basedOnScopeVersionId: baseScopeIds[index], approvedFromChangeRequestId: id(`change-request:${index}`), approvedFromProposalId: id(`change-proposal:${index}`), approvingClientId: approverId, approvingClientName: "Jordan Lee" } : {}),
    }));
    const baseScopeDocs = [0, 1].map((index) => ({
      _id: baseScopeIds[index], workspaceId: tenantId, projectId: projects[index], number: 1, status: "superseded",
      groups: [{ id: group, name: "Core experience", order: 0 }],
      requirements: [{ snapshotId: id(`base-snapshot:${index}`), logicalId: requirementIds[index], groupId: group, title: "Responsive client experience", description: "Deliver the initial approved client experience.", acceptanceCriteria: ["The primary journey works on desktop and mobile."], order: 0 }],
      submitterId: ownerId, submitterName: "Avery Morgan", submitterRole: "workspace-owner", submittedAt: at(now, -55 - index * 10),
      terminalActorId: approverId, terminalActorName: "Jordan Lee", terminalRole: role, terminalAt: at(now, -53 - index * 10), terminalNote: "Initial scope approved.",
      supersededAt: at(now, -43 - index * 10), supersededByChangeRequestId: id(`change-request:${index}`), supersededByProposalId: id(`change-proposal:${index}`), successorScopeVersionId: scopeIds[index], commentSequence: 0,
    }));
    const deliverableDocs = projects.map((projectId, index) => ({
      _id: deliverableIds[index], workspaceId: tenantId, projectId, number: 1, title: index === 0 ? "Homepage review build" : "Final release package", titleFrozen: true,
      state: index === 0 ? "in-review" : "approved", creatorId: ownerId, creatorName: "Avery Morgan", creatorRole: "workspace-owner",
      currentVersionId: index === 0 ? versionIds[index] : undefined, nextVersionNumber: index < 2 ? 2 : 1, revisionSequence: index < 2 ? 2 : 1,
    }));
    const versionDocs = projects.map((projectId, index) => ({
      _id: versionIds[index], workspaceId: tenantId, projectId, deliverableId: deliverableIds[index], number: index < 2 ? 2 : 1,
      outcome: index === 0 ? "in-review" : "approved", title: deliverableDocs[index]!.title, notes: "Review the supplied release notes and responsive implementation.",
      revisionSummary: index === 0 ? "Updated navigation and mobile spacing from version one feedback." : "Final approved release.",
      links: [{ id: id(`link:${index}`), label: "Review environment", url: `https://example.com/demo/${index + 1}`, order: 0 }], attachments: [],
      scopeVersionId: scopeIds[index], scopeVersionNumber: index < 2 ? 2 : 1, submitterId: ownerId, submitterName: "Avery Morgan", submitterRole: "workspace-owner", submittedAt: at(now, -10 - index * 20),
      terminalActorId: index ? approverId : undefined, terminalActorName: index ? "Jordan Lee" : undefined, terminalActorRole: index ? role : undefined,
      terminalAt: index ? at(now, -8 - index * 20) : undefined, terminalNote: index ? "Approved after revision review." : undefined, commentSequence: index === 0 ? 2 : 0,
    }));
    const priorVersionDocs = [0, 1].map((index) => ({
      _id: priorVersionIds[index], workspaceId: tenantId, projectId: projects[index], deliverableId: deliverableIds[index], number: 1,
      outcome: "changes-requested", title: deliverableDocs[index]!.title, notes: "Initial review build.", links: [{ id: id(`prior-link:${index}`), label: "Initial review environment", url: `https://example.com/demo/${index + 1}/v1`, order: 0 }], attachments: [],
      scopeVersionId: scopeIds[index], scopeVersionNumber: 2, submitterId: ownerId, submitterName: "Avery Morgan", submitterRole: "workspace-owner", submittedAt: at(now, -16 - index * 20),
      terminalActorId: approverId, terminalActorName: "Jordan Lee", terminalActorRole: role, terminalAt: at(now, -14 - index * 20), terminalNote: "Please refine mobile navigation and spacing.", commentSequence: 1,
    }));
    const completionDocs = [1, 2].map((index) => ({
      _id: id(`completion:${index}`), workspaceId: tenantId, projectId: projects[index], number: 1, status: "approved", current: true,
      revisionToken: `demo-completion-${index}`, requester: { id: ownerId, displayName: "Avery Morgan", role: "workspace-owner" }, requestedAt: at(now, -7 - index * 20),
      requestSummary: "All agreed work has been delivered and approved.", readiness: { scope: { id: scopeIds[index], number: index < 2 ? 2 : 1 }, deliverables: [{ id: deliverableIds[index], number: 1, title: deliverableDocs[index]!.title, versionId: versionIds[index], versionNumber: index < 2 ? 2 : 1 }], milestones: [{ id: milestoneIds[index], title: "Launch", status: "completed" }], evaluatedAt: at(now, -7 - index * 20) },
      terminalActor: { id: approverId, displayName: "Jordan Lee", role }, terminalAt: at(now, -6 - index * 20), terminalOutcome: "approved", terminalNote: "Completion approved.",
    }));
    const activityDocs = projects.flatMap((projectId, index) => [
      { _id: id(`activity:${index}:scope`), workspaceId: tenantId, projectId, actorId: approverId, actorName: "Jordan Lee", action: "scope.approved", audience: "project", context: { versionId: String(scopeIds[index]), versionNumber: index < 2 ? 2 : 1 }, occurredAt: at(now, -43 - index * 10) },
      ...(index < 2 ? [{ _id: id(`activity:${index}:change`), workspaceId: tenantId, projectId, actorId: approverId, actorName: "Jordan Lee", action: "change.approved", audience: "project", context: { requestId: String(id(`change-request:${index}`)), proposalId: String(id(`change-proposal:${index}`)) }, occurredAt: at(now, -43 - index * 10, 1) }] : []),
      { _id: id(`activity:${index}:delivery`), workspaceId: tenantId, projectId, actorId: ownerId, actorName: "Avery Morgan", action: "deliverable.submitted", audience: "project", context: { deliverableId: String(deliverableIds[index]), versionId: String(versionIds[index]) }, occurredAt: at(now, -10 - index * 20) },
      ...(index ? [{ _id: id(`activity:${index}:completion`), workspaceId: tenantId, projectId, actorId: approverId, actorName: "Jordan Lee", action: "project.completion-approved", audience: "project", context: { roundId: String(id(`completion:${index}`)) }, occurredAt: at(now, -6 - index * 20) }] : []),
    ]);
    return [
      { model: Client, documents: clients.map((clientId, index) => ({ _id: clientId, workspaceId: tenantId, name: ["Harbor & Co.", "Atlas Advisory", "Cedar Goods"][index], companyName: ["Harbor & Co.", "Atlas Advisory", "Cedar Goods"][index], primaryContactEmail: `client-${index + 1}@example.invalid`, internalNotes: "Synthetic demo client.", projectCount: 1 })) },
      { model: Project, documents: projectDocs },
      { model: ClientMembership, documents: projects.map((projectId) => ({ _id: id(`membership:${projectId}`), workspaceId: tenantId, projectId, userId: approverId, role, status: "active", startedAt: at(now, -90) })) },
      { model: EffectiveProjectAccess, documents: projects.map((projectId) => ({ _id: id(`access:${projectId}`), workspaceId: tenantId, projectId, userId: approverId, role, sourceId: id(`membership:${projectId}`), authoritySequence: 1 })) },
      { model: ScopeVersion, documents: [...baseScopeDocs, ...scopeDocs] },
      { model: ScopeDecision, documents: scopeDocs.map((scope, index) => ({ _id: id(`scope-decision:${index}`), workspaceId: tenantId, projectId: projects[index], versionId: scope._id, outcome: "approved", note: "Approved for delivery.", actorId: approverId, actorName: "Jordan Lee", actorRole: role, decidedAt: scope.terminalAt })) },
      { model: ChangeRequest, documents: [0, 1].map((index) => ({ _id: id(`change-request:${index}`), workspaceId: tenantId, projectId: projects[index], number: 1, title: "Improve responsive navigation", baseScopeVersionId: baseScopeIds[index], baseScopeVersionNumber: 1, state: "approved", active: false, creatorId: ownerId, creatorName: "Avery Morgan", creatorRole: "workspace-owner", terminalActorId: approverId, terminalActorName: "Jordan Lee", terminalActorRole: role, terminalAt: at(now, -43 - index * 10) })) },
      { model: ChangeProposal, documents: [0, 1].map((index) => ({ _id: id(`change-proposal:${index}`), workspaceId: tenantId, projectId: projects[index], requestId: id(`change-request:${index}`), number: 1, outcome: "approved", open: false, title: "Improve responsive navigation", rationale: "Client review identified a clearer mobile navigation pattern.", impactSummary: "Navigation and acceptance details were refined without changing the delivery date.", baseScopeVersionId: baseScopeIds[index], baseScopeVersionNumber: 1, groups: scopeDocs[index]!.groups, requirements: scopeDocs[index]!.requirements, submitterId: ownerId, submitterName: "Avery Morgan", submitterRole: "workspace-owner", submittedAt: at(now, -46 - index * 10), terminalActorId: approverId, terminalActorName: "Jordan Lee", terminalActorRole: role, terminalAt: at(now, -43 - index * 10), terminalNote: "Accepted for the current release.", commentSequence: 1 })) },
      { model: ChangeDecision, documents: [0, 1].map((index) => ({ _id: id(`change-decision:${index}`), workspaceId: tenantId, projectId: projects[index], requestId: id(`change-request:${index}`), proposalId: id(`change-proposal:${index}`), outcome: "approved", note: "Accepted for the current release.", actorId: approverId, actorName: "Jordan Lee", actorRole: role, decidedAt: at(now, -43 - index * 10) })) },
      { model: MilestoneTimeline, documents: projects.map((projectId, index) => ({ _id: id(`timeline:${index}`), workspaceId: tenantId, projectId, revisionToken: `demo-milestones-${index}`, activeCount: index === 0 ? 3 : 1 })) },
      { model: Milestone, documents: projects.flatMap((projectId, index) => index === 0 ? [
        { _id: milestoneIds[index], workspaceId: tenantId, projectId, title: "Discovery", status: "completed", position: 0, active: true, targetDate: dateOnly(at(now, -14)) },
        { _id: id("milestone:active:build"), workspaceId: tenantId, projectId, title: "Build and review", status: "in-progress", position: 1, active: true, targetDate: dateOnly(at(now, 7)) },
        { _id: id("milestone:active:launch"), workspaceId: tenantId, projectId, title: "Launch", status: "upcoming", position: 2, active: true, targetDate: dateOnly(at(now, 18)) },
      ] : [{ _id: milestoneIds[index], workspaceId: tenantId, projectId, title: "Launch", status: "completed", position: 0, active: true, targetDate: dateOnly(at(now, -20 - index * 20)) }]) },
      { model: DeliverableProjectState, documents: projects.map((projectId) => ({ _id: id(`deliverable-state:${projectId}`), workspaceId: tenantId, projectId, openCount: projectId.equals(projects[0]) ? 1 : 0, nextDeliverableNumber: 1 })) },
      { model: Deliverable, documents: deliverableDocs },
      { model: DeliverableVersion, documents: [...priorVersionDocs, ...versionDocs] },
      { model: DeliverableComment, documents: [
        { _id: id("comment:active:1"), workspaceId: tenantId, projectId: projects[0], deliverableId: deliverableIds[0], versionId: versionIds[0], sequence: 1, body: "The mobile navigation now feels clear.", authorId: approverId, authorName: "Jordan Lee", authorRole: role, postedAt: at(now, -3) },
        { _id: id("comment:active:2"), workspaceId: tenantId, projectId: projects[0], deliverableId: deliverableIds[0], versionId: versionIds[0], sequence: 2, body: "Please confirm the launch date before approval.", authorId: approverId, authorName: "Jordan Lee", authorRole: role, postedAt: at(now, -2) },
      ] },
      { model: DeliverableOutcome, documents: [
        ...[0, 1].map((index) => ({ _id: id(`prior-outcome:${index}`), workspaceId: tenantId, projectId: projects[index], deliverableId: deliverableIds[index], versionId: priorVersionIds[index], kind: "changes-requested", note: "Please refine mobile navigation and spacing.", actorId: approverId, actorName: "Jordan Lee", actorRole: role, occurredAt: at(now, -14 - index * 20) })),
        ...[1, 2].map((index) => ({ _id: id(`outcome:${index}`), workspaceId: tenantId, projectId: projects[index], deliverableId: deliverableIds[index], versionId: versionIds[index], kind: "approved", note: "Approved after revision review.", actorId: approverId, actorName: "Jordan Lee", actorRole: role, occurredAt: at(now, -8 - index * 20) })),
      ] },
      { model: CompletionReview, documents: completionDocs },
      { model: ArchiveLifecycle, documents: [{ _id: id("archive:2"), workspaceId: tenantId, projectId: projects[2], action: "archived", actor: { id: ownerId, displayName: "Avery Morgan", role: "workspace-owner" }, occurredAt: at(now, -20), reason: "Retained as the completed client record.", previousState: "completed", nextState: "archived" }] },
      { model: Activity, documents: activityDocs },
    ];
  }

  verifyResetSecret(presented: string | undefined): boolean {
    return this.config.state === "enabled" && Boolean(presented) && safeEqual(presented!, this.config.resetSecret);
  }
}
