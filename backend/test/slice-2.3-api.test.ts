import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import type { CanonicalFeedbackInput } from "../src/domain/ai-feedback-summary-contracts.js";
import { AiFeedbackSummary } from "../src/domain/ai-feedback-summary-models.js";
import type { FeedbackSummarizationProvider } from "../src/domain/ai-feedback-summary-provider.js";
import { AiGenerationLedger } from "../src/domain/ai-requirement-models.js";
import { AiProviderError } from "../src/domain/ai-requirement-provider.js";
import { Deliverable, DeliverableComment, DeliverableOutcome, DeliverableVersion } from "../src/domain/deliverable-models.js";
import type { EmailCommand, EmailService } from "../src/domain/email.js";
import {
  AccountToken, Activity, Client, ClientMembership, EffectiveProjectAccess, Invitation, Project, ProjectAssignment,
  Session, syncDomainIndexes, Throttle, User, Workspace, WorkspaceMembership,
} from "../src/domain/models.js";

process.env.NODE_ENV = "test"; process.env.FRONTEND_ORIGIN = "http://localhost:3000";
process.env.SESSION_SECRET = "test-session-secret-with-at-least-32-characters"; process.env.AUTH_THROTTLE_LIMIT = "1000";

class FakeEmail implements EmailService {
  readonly sent: EmailCommand[] = [];
  async send(command: EmailCommand) { this.sent.push(command); return { delivered: true }; }
  token(to: string) { const text = [...this.sent].reverse().find((item) => item.category === "verification" && item.to === to)?.text; const token = text?.match(/token=([A-Za-z0-9_-]+)/u)?.[1]; if (!token) throw new Error("No verification token"); return token; }
}
class FakeSummaryProvider implements FeedbackSummarizationProvider {
  readonly available = true; calls: CanonicalFeedbackInput[] = []; mode: "normal" | "failure" | "delay" = "normal";
  async summarize(input: CanonicalFeedbackInput) {
    this.calls.push(input); if (this.mode === "failure") throw new AiProviderError("semantic"); if (this.mode === "delay") await new Promise((resolve) => setTimeout(resolve, 20));
    const first = input.records[0]!; const last = input.records.at(-1)!;
    return { output: {
      themes: [{ text: "The client repeatedly commented on layout.", citations: input.records.map(({ feedbackRecordId, versionId }) => ({ feedbackRecordId, versionId })) }],
      requestedActions: [{ text: "Adjust the requested mobile layout.", citations: [{ feedbackRecordId: first.feedbackRecordId, versionId: first.versionId }] }],
      tensions: [{ text: "The requested mobile and desktop treatments need clarification.", citations: [first, last].map(({ feedbackRecordId, versionId }) => ({ feedbackRecordId, versionId })) }],
    }, operationId: `summary-${this.calls.length}`, providerId: "fake", modelId: "fake-model", durationMs: 2 };
  }
}

type Agent = ReturnType<typeof request.agent>; type Account = { agent: Agent; csrf: string; id: string };
let database: MongoMemoryReplSet; let email: FakeEmail; let provider: FakeSummaryProvider;
async function csrf(agent: Agent) { return (await agent.get("/api/v1/csrf").expect(200)).body.csrfToken as string; }
function mutate(account: Account, path: string, body: unknown) { return account.agent.post(path).set("Origin", "http://localhost:3000").set("X-CSRF-Token", account.csrf).send(body as object); }
async function signup(address: string, name: string, app: ReturnType<typeof createApp>): Promise<Account> {
  const agent = request.agent(app); let token = await csrf(agent);
  const result = await agent.post("/api/v1/auth/signup").set("Origin", "http://localhost:3000").set("X-CSRF-Token", token).send({ email: address, displayName: name, password: "correct horse battery staple" }).expect(202);
  token = result.body.csrfToken as string; const id = (await agent.get("/api/v1/auth/session").expect(200)).body.user.id as string;
  await agent.post("/api/v1/auth/verify").set("Origin", "http://localhost:3000").set("X-CSRF-Token", token).send({ token: email.token(address) }).expect(200);
  return { agent, csrf: token, id };
}

async function fixture() {
  const app = createApp({ emailService: email, feedbackSummarizationProvider: provider });
  const owner = await signup("feedback-owner@example.com", "Owner", app); const member = await signup("feedback-member@example.com", "Member", app);
  const clientUser = await signup("feedback-client@example.com", "Client", app); const outsider = await signup("feedback-outsider@example.com", "Outsider", app);
  const workspace = await Workspace.create({ name: "Studio", ownerId: owner.id }); const client = await Client.create({ workspaceId: workspace._id, name: "Client", projectCount: 1 });
  const project = await Project.create({ workspaceId: workspace._id, clientId: client._id, name: "Website", workflowSequence: 7 });
  await WorkspaceMembership.create({ workspaceId: workspace._id, userId: member.id, role: "service-team-member", status: "active", startedAt: new Date() });
  const assignment = await ProjectAssignment.create({ workspaceId: workspace._id, projectId: project._id, userId: member.id, status: "active", startedAt: new Date() });
  const membership = await ClientMembership.create({ workspaceId: workspace._id, projectId: project._id, userId: clientUser.id, role: "client-approver", status: "active", startedAt: new Date() });
  await EffectiveProjectAccess.create([{ workspaceId: workspace._id, projectId: project._id, userId: member.id, role: "service-team-member", sourceId: assignment._id }, { workspaceId: workspace._id, projectId: project._id, userId: clientUser.id, role: "client-approver", sourceId: membership._id }]);
  const deliverable = await Deliverable.create({ workspaceId: workspace._id, projectId: project._id, number: 1, title: "Website package", titleFrozen: true, state: "revision-draft", creatorId: owner.id, creatorName: "Owner", creatorRole: "workspace-owner", nextVersionNumber: 2, revisionSequence: 4 });
  const firstVersion = await DeliverableVersion.create({ workspaceId: workspace._id, projectId: project._id, deliverableId: deliverable._id, number: 1, outcome: "changes-requested", title: deliverable.title, links: [], attachments: [], scopeVersionId: new mongoose.Types.ObjectId(), scopeVersionNumber: 1, submitterId: owner.id, submitterName: "Owner", submitterRole: "workspace-owner", submittedAt: new Date("2026-09-12T10:00:00.000Z"), commentSequence: 2 });
  const secondVersion = await DeliverableVersion.create({ workspaceId: workspace._id, projectId: project._id, deliverableId: deliverable._id, number: 2, outcome: "withdrawn", title: deliverable.title, links: [], attachments: [], scopeVersionId: new mongoose.Types.ObjectId(), scopeVersionNumber: 1, submitterId: owner.id, submitterName: "Owner", submitterRole: "workspace-owner", submittedAt: new Date("2026-09-12T12:00:00.000Z"), commentSequence: 1 });
  const eligibleComment = await DeliverableComment.create({ workspaceId: workspace._id, projectId: project._id, deliverableId: deliverable._id, versionId: firstVersion._id, sequence: 1, body: "Increase mobile spacing.", authorId: clientUser.id, authorName: "Client", authorRole: "client-participant", postedAt: new Date("2026-09-12T10:30:00.000Z") });
  await DeliverableComment.create({ workspaceId: workspace._id, projectId: project._id, deliverableId: deliverable._id, versionId: firstVersion._id, sequence: 2, body: "Provider-only discussion must stay out.", authorId: owner.id, authorName: "Owner", authorRole: "workspace-owner", postedAt: new Date("2026-09-12T10:40:00.000Z") });
  const secondComment = await DeliverableComment.create({ workspaceId: workspace._id, projectId: project._id, deliverableId: deliverable._id, versionId: secondVersion._id, sequence: 1, body: "Keep desktop spacing unchanged.", authorId: clientUser.id, authorName: "Client", authorRole: "client-approver", postedAt: new Date("2026-09-12T12:30:00.000Z") });
  const revision = await DeliverableOutcome.create({ workspaceId: workspace._id, projectId: project._id, deliverableId: deliverable._id, versionId: firstVersion._id, kind: "changes-requested", note: "Make the mobile card denser.", actorId: clientUser.id, actorName: "Client", actorRole: "client-approver", occurredAt: new Date("2026-09-12T11:00:00.000Z") });
  return { app, owner, member, clientUser, outsider, project, deliverable, assignment, firstVersion, secondVersion, eligibleComment, secondComment, revision };
}
function endpoint(projectId: unknown, deliverableId: unknown) { return `/api/v1/projects/${String(projectId)}/deliverables/${String(deliverableId)}/feedback-summary`; }

beforeAll(async () => { vi.spyOn(console, "info").mockImplementation(() => undefined); vi.spyOn(console, "warn").mockImplementation(() => undefined); vi.spyOn(console, "error").mockImplementation(() => undefined); database = await MongoMemoryReplSet.create({ replSet: { count: 1 } }); await mongoose.connect(database.getUri()); await syncDomainIndexes(); }, 300_000);
beforeEach(async () => {
  email = new FakeEmail(); provider = new FakeSummaryProvider();
  await Promise.all([AccountToken.deleteMany({}), Activity.deleteMany({}), AiFeedbackSummary.deleteMany({}), AiGenerationLedger.deleteMany({}), Client.deleteMany({}), ClientMembership.deleteMany({}), Deliverable.deleteMany({}), DeliverableComment.deleteMany({}), DeliverableOutcome.deleteMany({}), DeliverableVersion.deleteMany({}), EffectiveProjectAccess.deleteMany({}), Invitation.deleteMany({}), Project.deleteMany({}), ProjectAssignment.deleteMany({}), Session.deleteMany({}), Throttle.deleteMany({}), User.deleteMany({}), Workspace.deleteMany({}), WorkspaceMembership.deleteMany({})]);
});
afterAll(async () => { await mongoose.disconnect(); await database.stop(); });

describe("Slice 2.3 client feedback-summary API", () => {
  it("selects only eligible historical client records and keeps the result provider-private and read-only", async () => {
    const data = await fixture(); const path = endpoint(data.project._id, data.deliverable._id);
    const availability = await data.owner.agent.get(path).expect(200); expect(availability.body.availability).toEqual({ enabled: true, eligibleCount: 3, minimumRequired: 2, canGenerate: true });
    await mutate(data.owner, path, { callerFeedback: "not allowed" }).expect(400); expect(provider.calls).toHaveLength(0);
    const beforeProject = (await Project.findById(data.project._id).lean())!; const beforeActivity = await Activity.countDocuments({ projectId: data.project._id });
    const generated = await mutate(data.owner, path, {}).expect(201); expect(generated.body.summary.freshness).toBe("current"); expect(generated.body.summary.sourceReferences).toHaveLength(3);
    expect(provider.calls[0]!.records.map((record) => record.feedbackRecordId)).toEqual([String(data.eligibleComment._id), String(data.revision._id), String(data.secondComment._id)]);
    expect(JSON.stringify(provider.calls[0])).not.toContain("Provider-only discussion"); expect(JSON.stringify(provider.calls[0])).not.toContain("attachment");
    expect(await Activity.countDocuments({ projectId: data.project._id })).toBe(beforeActivity); expect((await Project.findById(data.project._id).lean())!.workflowSequence).toBe(beforeProject.workflowSequence);
    expect(await DeliverableComment.countDocuments({ deliverableId: data.deliverable._id })).toBe(3); expect(await DeliverableOutcome.countDocuments({ deliverableId: data.deliverable._id })).toBe(1);
    await data.clientUser.agent.get(path).expect(404); await data.outsider.agent.get(path).expect(404);
    expect(JSON.stringify((await data.clientUser.agent.get(`/api/v1/projects/${data.project._id}/deliverables`).expect(200)).body)).not.toMatch(/summary|fingerprint|ai-/iu);
  });

  it("derives freshness only from eligible sources and atomically retains the last success on failure", async () => {
    const data = await fixture(); const path = endpoint(data.project._id, data.deliverable._id); const first = (await mutate(data.owner, path, {}).expect(201)).body.summary;
    await Project.updateOne({ _id: data.project._id }, { $set: { name: "Renamed project" } }); await Deliverable.updateOne({ _id: data.deliverable._id }, { $set: { revisionSequence: 99 } });
    expect((await data.owner.agent.get(path).expect(200)).body.summary.freshness).toBe("current");
    await DeliverableComment.create({ workspaceId: data.project.workspaceId, projectId: data.project._id, deliverableId: data.deliverable._id, versionId: data.secondVersion._id, sequence: 2, body: "Also increase tap target spacing.", authorId: data.clientUser.id, authorName: "Client", authorRole: "client-participant", postedAt: new Date("2026-09-12T13:00:00.000Z") });
    expect((await data.owner.agent.get(path).expect(200)).body.summary.freshness).toBe("outdated");
    provider.mode = "failure"; await mutate(data.owner, path, {}).expect(502).expect((response) => expect(response.body.error.code).toBe("AI_RESPONSE_INVALID"));
    const retained = (await data.owner.agent.get(path).expect(200)).body.summary; expect(retained.id).toBe(first.id); expect(retained.generatedAt).toBe(first.generatedAt); expect(retained.freshness).toBe("outdated");
    provider.mode = "normal"; const replacement = (await mutate(data.owner, path, {}).expect(201)).body.summary; expect(replacement.id).toBe(first.id); expect(replacement.freshness).toBe("current"); expect(replacement.sourceReferences).toHaveLength(4); expect(await AiFeedbackSummary.countDocuments({ deliverableId: data.deliverable._id })).toBe(1);
  });

  it("rechecks provider access and permits retained reads but not generation after completion or archival", async () => {
    const data = await fixture(); const path = endpoint(data.project._id, data.deliverable._id); await mutate(data.member, path, {}).expect(201);
    await EffectiveProjectAccess.deleteOne({ projectId: data.project._id, userId: data.member.id }); await ProjectAssignment.updateOne({ _id: data.assignment._id }, { $set: { status: "inactive" } });
    await data.member.agent.get(path).expect(404); await mutate(data.member, path, {}).expect(404);
    await Project.updateOne({ _id: data.project._id }, { $set: { lifecycleState: "completed" } });
    const completed = await data.owner.agent.get(path).expect(200); expect(completed.body.summary).toBeDefined(); expect(completed.body.availability.unavailableReason).toBe("project-locked");
    const calls = provider.calls.length; await mutate(data.owner, path, {}).expect(409).expect((response) => expect(response.body.error.code).toBe("PROJECT_LOCKED")); expect(provider.calls).toHaveLength(calls);
    await Project.updateOne({ _id: data.project._id }, { $set: { lifecycleState: "archived" } }); await data.owner.agent.get(path).expect(200); await mutate(data.owner, path, {}).expect(409); expect(provider.calls).toHaveLength(calls);
  });

  it("rejects insufficient feedback before admission and uses the shared Phase 2 allowance", async () => {
    const data = await fixture(); const path = endpoint(data.project._id, data.deliverable._id);
    await DeliverableComment.deleteMany({ _id: { $in: [data.eligibleComment._id, data.secondComment._id] } }); await DeliverableOutcome.deleteMany({ _id: data.revision._id });
    await mutate(data.owner, path, {}).expect(409).expect((response) => expect(response.body.error.code).toBe("AI_FEEDBACK_INSUFFICIENT")); expect(provider.calls).toHaveLength(0); expect(await AiGenerationLedger.countDocuments({ userId: data.owner.id })).toBe(0);
    await DeliverableComment.create([{ workspaceId: data.project.workspaceId, projectId: data.project._id, deliverableId: data.deliverable._id, versionId: data.firstVersion._id, sequence: 3, body: "First", authorId: data.clientUser.id, authorName: "Client", authorRole: "client-participant", postedAt: new Date() }, { workspaceId: data.project.workspaceId, projectId: data.project._id, deliverableId: data.deliverable._id, versionId: data.secondVersion._id, sequence: 3, body: "Second", authorId: data.clientUser.id, authorName: "Client", authorRole: "client-approver", postedAt: new Date(Date.now() + 1) }]);
    await AiGenerationLedger.create({ userId: data.owner.id, admittedAt: Array.from({ length: 10 }, (_, index) => new Date(Date.now() - index * 1_000)), sequence: 10 });
    await mutate(data.owner, path, {}).expect(429).expect((response) => expect(response.body.error.code).toBe("AI_RATE_LIMITED")); expect(provider.calls).toHaveLength(0);
  });

  it("allows only one concurrent replacement to win while preserving one coherent latest run", async () => {
    const data = await fixture(); const path = endpoint(data.project._id, data.deliverable._id); provider.mode = "delay";
    const [ownerResult, memberResult] = await Promise.all([mutate(data.owner, path, {}), mutate(data.member, path, {})]);
    expect([ownerResult.status, memberResult.status].sort()).toEqual([201, 409]); expect(await AiFeedbackSummary.countDocuments({ deliverableId: data.deliverable._id })).toBe(1);
    const saved = (await data.owner.agent.get(path).expect(200)).body.summary; expect(saved.output.themes).toHaveLength(1); expect(saved.sourceReferences).toHaveLength(3);
  });
});
