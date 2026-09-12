import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { ChangeRequest } from "../src/domain/change-control-models.js";
import { Deliverable, DeliverableVersion } from "../src/domain/deliverable-models.js";
import type { EmailCommand, EmailService } from "../src/domain/email.js";
import { ArchiveLifecycle, CompletionReview } from "../src/domain/lifecycle-models.js";
import { Milestone } from "../src/domain/milestone-models.js";
import {
  AccountToken, Activity, Client, ClientMembership, EffectiveProjectAccess, Project, ProjectAssignment,
  Session, syncDomainIndexes, Throttle, User, Workspace, WorkspaceMembership,
} from "../src/domain/models.js";
import { ScopeDraft, ScopeVersion } from "../src/domain/scope-models.js";

process.env.NODE_ENV = "test"; process.env.FRONTEND_ORIGIN = "http://localhost:3000"; process.env.SESSION_SECRET = "slice-1.6-test-secret-with-at-least-32-characters"; process.env.AUTH_THROTTLE_LIMIT = "1000";

class FakeEmail implements EmailService {
  readonly sent: EmailCommand[] = [];
  async send(command: EmailCommand) { this.sent.push(command); return { delivered: true }; }
  token(to: string) { const value = [...this.sent].reverse().find((item) => item.category === "verification" && item.to === to)?.text.match(/token=([A-Za-z0-9_-]+)/u)?.[1]; if (!value) throw new Error("missing token"); return value; }
}
type Agent = ReturnType<typeof request.agent>; type Account = { agent: Agent; csrf: string; id: string };
let database: MongoMemoryReplSet; let email: FakeEmail;
async function signup(address: string, displayName: string): Promise<Account> {
  const agent = request.agent(createApp({ emailService: email })); let csrf = (await agent.get("/api/v1/csrf")).body.csrfToken as string;
  const created = await agent.post("/api/v1/auth/signup").set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).send({ email: address, displayName, password: "correct horse battery staple" }).expect(202); csrf = created.body.csrfToken;
  const id = (await agent.get("/api/v1/auth/session")).body.user.id as string; await agent.post("/api/v1/auth/verify").set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).send({ token: email.token(address) }).expect(200); return { agent, csrf, id };
}
function mutate(account: Account, path: string, body: unknown) { return account.agent.post(path).set("Origin", "http://localhost:3000").set("X-CSRF-Token", account.csrf).send(body as object); }
function patch(account: Account, path: string, body: unknown) { return account.agent.patch(path).set("Origin", "http://localhost:3000").set("X-CSRF-Token", account.csrf).send(body as object); }
async function fixture() {
  const owner = await signup("finish-owner@example.com", "Owner"); const member = await signup("finish-member@example.com", "Member"); const approver = await signup("finish-approver@example.com", "Approver"); const participant = await signup("finish-participant@example.com", "Participant"); const outsider = await signup("finish-outsider@example.com", "Outsider");
  const workspace = await Workspace.create({ name: "Studio", ownerId: owner.id }); const client = await Client.create({ workspaceId: workspace._id, name: "Client", projectCount: 1 }); const project = await Project.create({ workspaceId: workspace._id, clientId: client._id, name: "Website" });
  await WorkspaceMembership.create({ workspaceId: workspace._id, userId: member.id, role: "service-team-member", status: "active", startedAt: new Date() });
  const assignment = await ProjectAssignment.create({ workspaceId: workspace._id, projectId: project._id, userId: member.id, status: "active", startedAt: new Date() });
  const approverMembership = await ClientMembership.create({ workspaceId: workspace._id, projectId: project._id, userId: approver.id, role: "client-approver", status: "active", startedAt: new Date() });
  const participantMembership = await ClientMembership.create({ workspaceId: workspace._id, projectId: project._id, userId: participant.id, role: "client-participant", status: "active", startedAt: new Date() });
  await EffectiveProjectAccess.create([
    { workspaceId: workspace._id, projectId: project._id, userId: member.id, role: "service-team-member", sourceId: assignment._id },
    { workspaceId: workspace._id, projectId: project._id, userId: approver.id, role: "client-approver", sourceId: approverMembership._id },
    { workspaceId: workspace._id, projectId: project._id, userId: participant.id, role: "client-participant", sourceId: participantMembership._id },
  ]);
  const scope = await ScopeVersion.create({ workspaceId: workspace._id, projectId: project._id, number: 1, status: "approved", groups: [], requirements: [], submitterId: owner.id, submitterName: "Owner", submitterRole: "workspace-owner", submittedAt: new Date() });
  const deliverableId = new mongoose.Types.ObjectId(); await DeliverableVersion.create({ workspaceId: workspace._id, projectId: project._id, deliverableId, number: 1, outcome: "approved", title: "Launch package", links: [], attachments: [], scopeVersionId: scope._id, scopeVersionNumber: 1, submitterId: owner.id, submitterName: "Owner", submitterRole: "workspace-owner", submittedAt: new Date(), terminalActorId: approver.id, terminalActorName: "Approver", terminalActorRole: "client-approver", terminalAt: new Date() });
  await Deliverable.create({ _id: deliverableId, workspaceId: workspace._id, projectId: project._id, number: 1, title: "Launch package", titleFrozen: true, state: "approved", creatorId: owner.id, creatorName: "Owner", creatorRole: "workspace-owner", nextVersionNumber: 1, revisionSequence: 0, terminalAt: new Date(), terminalActorId: approver.id, terminalActorName: "Approver", terminalActorRole: "client-approver" });
  return { owner, member, approver, participant, outsider, workspace, project, approverMembership };
}

beforeAll(async () => { vi.spyOn(console, "info").mockImplementation(() => undefined); vi.spyOn(console, "warn").mockImplementation(() => undefined); vi.spyOn(console, "error").mockImplementation(() => undefined); database = await MongoMemoryReplSet.create({ replSet: { count: 1 } }); await mongoose.connect(database.getUri()); await syncDomainIndexes(); }, 300_000);
beforeEach(async () => { email = new FakeEmail(); await Promise.all([AccountToken.deleteMany({}), Activity.deleteMany({}), ArchiveLifecycle.deleteMany({}), ChangeRequest.deleteMany({}), Client.deleteMany({}), ClientMembership.deleteMany({}), CompletionReview.deleteMany({}), Deliverable.deleteMany({}), DeliverableVersion.deleteMany({}), EffectiveProjectAccess.deleteMany({}), Milestone.deleteMany({}), Project.deleteMany({}), ProjectAssignment.deleteMany({}), ScopeDraft.deleteMany({}), ScopeVersion.deleteMany({}), Session.deleteMany({}), Throttle.deleteMany({}), User.deleteMany({}), Workspace.deleteMany({}), WorkspaceMembership.deleteMany({})]); });
afterAll(async () => { await mongoose.disconnect(); await database.stop(); });

describe("Slice 1.6 completion lifecycle API", () => {
  it("materializes legacy projects as active without changing their workflow records", async () => {
    const f = await fixture(); const projectId = String(f.project._id);
    await Project.collection.updateOne({ _id: f.project._id }, { $unset: { lifecycleState: "", lifecycleRevision: "", nextCompletionRoundNumber: "", workflowSequence: "" } });
    const first = await f.owner.agent.get(`/api/v1/projects/${projectId}/lifecycle`).expect(200); const second = await f.owner.agent.get(`/api/v1/projects/${projectId}/lifecycle`).expect(200);
    expect(first.body.lifecycle).toMatchObject({ state: "active", readiness: { ready: true } }); expect(second.body.lifecycle.revision).toBe(first.body.lifecycle.revision);
    expect(await ScopeVersion.countDocuments({ projectId, status: "approved" })).toBe(1); expect(await Deliverable.countDocuments({ projectId, state: "approved" })).toBe(1);
  });

  it("evaluates readiness authoritatively without exposing provider detail to clients", async () => {
    const f = await fixture(); const projectId = String(f.project._id);
    const ownerRead = await f.owner.agent.get(`/api/v1/projects/${projectId}/lifecycle`).expect(200);
    expect(ownerRead.body.lifecycle).toMatchObject({ state: "active", readiness: { ready: true, blockers: [] }, permissions: { canRequestCompletion: true } });
    const participantRead = await f.participant.agent.get(`/api/v1/projects/${projectId}/lifecycle`).expect(200);
    expect(participantRead.body.lifecycle).not.toHaveProperty("readiness"); expect(participantRead.body.lifecycle.permissions.canDecideCompletion).toBe(false);
    await f.outsider.agent.get(`/api/v1/projects/${projectId}/lifecycle`).expect(404);
    await ScopeDraft.create({ workspaceId: f.workspace._id, projectId, revisionToken: "draft-token-with-enough-characters", groups: [], requirements: [] });
    await ChangeRequest.create({ workspaceId: f.workspace._id, projectId, title: "Pending", baseScopeVersionId: new mongoose.Types.ObjectId(), baseScopeVersionNumber: 1, state: "draft", active: true, creatorId: f.owner.id, creatorName: "Owner", creatorRole: "workspace-owner" });
    await Milestone.create({ workspaceId: f.workspace._id, projectId, title: "QA", status: "in-progress", position: 0, active: true });
    const blocked = await f.owner.agent.get(`/api/v1/projects/${projectId}/lifecycle`).expect(200);
    expect(blocked.body.lifecycle.readiness.blockers.map((item: { code: string }) => item.code)).toEqual(["PENDING_SCOPE_REVIEW", "ACTIVE_CHANGE_REQUEST", "INCOMPLETE_ACTIVE_MILESTONE"]);
  });

  it("preserves numbered rounds, locks work, approves once, and archives/restores without reopening", async () => {
    const f = await fixture(); const projectId = String(f.project._id); const firstRead = await f.owner.agent.get(`/api/v1/projects/${projectId}/lifecycle`).expect(200);
    const requested = await mutate(f.owner, `/api/v1/projects/${projectId}/completion-requests`, { confirmed: true, lifecycleRevision: firstRead.body.lifecycle.revision, summary: " Ready for acceptance. " }).expect(201);
    expect(requested.body.lifecycle).toMatchObject({ state: "completion-in-review", rounds: [{ number: 1, status: "in-review", requestSummary: "Ready for acceptance." }] });
    expect(email.sent.filter((item) => item.category === "completion-review")).toHaveLength(1);
    await mutate(f.owner, `/api/v1/projects/${projectId}/deliverables`, { title: "Late mutation" }).expect(409);
    const participant = await f.participant.agent.get(`/api/v1/projects/${projectId}/lifecycle`).expect(200); expect(participant.body.lifecycle.permissions.canDecideCompletion).toBe(false);
    const current = requested.body.lifecycle; const roundId = current.currentRoundId;
    const [winner, loser] = await Promise.all([
      mutate(f.approver, `/api/v1/projects/${projectId}/completion-rounds/${roundId}/decisions`, { confirmed: true, lifecycleRevision: current.revision, outcome: "approved", note: "Accepted." }),
      mutate(f.approver, `/api/v1/projects/${projectId}/completion-rounds/${roundId}/decisions`, { confirmed: true, lifecycleRevision: current.revision, outcome: "approved", note: "Accepted again." }),
    ]);
    expect([winner.status, loser.status].sort()).toEqual([200, 409]);
    const completed = (await f.owner.agent.get(`/api/v1/projects/${projectId}/lifecycle`).expect(200)).body.lifecycle;
    expect(completed.state).toBe("completed");
    expect(completed.rounds[0]).toMatchObject({ number: 1, status: "approved", terminal: { outcome: "approved" } });
    const archived = await mutate(f.owner, `/api/v1/projects/${projectId}/archive`, { confirmed: true, lifecycleRevision: completed.revision, reason: "Move to historical records." }).expect(200);
    expect(archived.body.lifecycle).toMatchObject({ state: "archived", readOnly: true, archiveHistory: [{ action: "archived" }] });
    const archivedWork = await f.participant.agent.get("/api/v1/work").expect(200); const clientWorkspace = archivedWork.body.workspaces.find((item: { id: string }) => item.id === String(f.workspace._id));
    expect(clientWorkspace.projects).toHaveLength(0); expect(clientWorkspace.completedProjects).toHaveLength(0); expect(clientWorkspace.archivedProjects[0].id).toBe(projectId);
    const restored = await mutate(f.owner, `/api/v1/projects/${projectId}/restore`, { confirmed: true, lifecycleRevision: archived.body.lifecycle.revision, reason: "Make the record easier to find." }).expect(200);
    expect(restored.body.lifecycle).toMatchObject({ state: "completed", readOnly: true });
    expect(await CompletionReview.countDocuments({ projectId })).toBe(1); expect(await ArchiveLifecycle.countDocuments({ projectId })).toBe(2);
    expect(email.sent.filter((item) => item.category === "completion-review")).toHaveLength(1);
    expect(email.sent.filter((item) => item.category === "completion-result")).toHaveLength(2);
  });

  it("returns deterministic redacted activity pages and rejects malformed continuations", async () => {
    const f = await fixture(); const projectId = String(f.project._id); const lifecycle = (await f.owner.agent.get(`/api/v1/projects/${projectId}/lifecycle`).expect(200)).body.lifecycle;
    await mutate(f.owner, `/api/v1/projects/${projectId}/completion-requests`, { confirmed: true, lifecycleRevision: lifecycle.revision, summary: "private summary" }).expect(201);
    await Activity.create({ workspaceId: f.workspace._id, projectId, actorId: f.owner.id, actorName: "Owner", action: "deliverable.submitted", audience: "project", occurredAt: new Date(Date.now() - 1_000), context: { actorRole: "workspace-owner", deliverableNumber: 1, versionNumber: 1, storageIdentifier: "secret", note: "private" } });
    const first = await f.participant.agent.get(`/api/v1/projects/${projectId}/activity?limit=1`).expect(200); expect(first.body.activity.items).toHaveLength(1); expect(JSON.stringify(first.body)).not.toContain("private summary"); expect(JSON.stringify(first.body)).not.toContain("secret");
    const second = await f.participant.agent.get(`/api/v1/projects/${projectId}/activity?limit=1&cursor=${encodeURIComponent(first.body.activity.nextCursor)}`).expect(200); expect(second.body.activity.items[0].id).not.toBe(first.body.activity.items[0].id);
    await mutate(f.owner, `/api/v1/projects/${projectId}/completion-rounds/${(await f.owner.agent.get(`/api/v1/projects/${projectId}/lifecycle`)).body.lifecycle.currentRoundId}/withdrawal`, { confirmed: true, lifecycleRevision: (await f.owner.agent.get(`/api/v1/projects/${projectId}/lifecycle`)).body.lifecycle.revision, reason: "Pause review." }).expect(200);
    await f.participant.agent.get(`/api/v1/projects/${projectId}/activity?cursor=tampered`).expect(400);
  });

  it("allows authority revocation during review and allocates a new round after withdrawal", async () => {
    const f = await fixture(); const projectId = String(f.project._id); const initial = (await f.owner.agent.get(`/api/v1/projects/${projectId}/lifecycle`).expect(200)).body.lifecycle;
    const first = (await mutate(f.owner, `/api/v1/projects/${projectId}/completion-requests`, { confirmed: true, lifecycleRevision: initial.revision, summary: "First review" }).expect(201)).body.lifecycle;
    await patch(f.owner, `/api/v1/projects/${projectId}/client-members/${String(f.approverMembership._id)}/role`, { confirmed: true, role: "client-participant" }).expect(200);
    await mutate(f.approver, `/api/v1/projects/${projectId}/completion-rounds/${first.currentRoundId}/decisions`, { confirmed: true, lifecycleRevision: first.revision, outcome: "approved", note: "Stale authority" }).expect(403);
    const withdrawn = (await mutate(f.owner, `/api/v1/projects/${projectId}/completion-rounds/${first.currentRoundId}/withdrawal`, { confirmed: true, lifecycleRevision: first.revision, reason: "Approver access changed." }).expect(200)).body.lifecycle;
    expect(withdrawn).toMatchObject({ state: "active", rounds: [{ number: 1, status: "withdrawn" }] });
    const access = (await f.owner.agent.get(`/api/v1/workspaces/${String(f.workspace._id)}/access`).expect(200)).body; const activeMembership = access.clientMemberships.find((item: { userId: string; status: string }) => item.userId === f.approver.id && item.status === "active");
    await patch(f.owner, `/api/v1/projects/${projectId}/client-members/${activeMembership.id}/role`, { confirmed: true, role: "client-approver" }).expect(200);
    const refreshed = (await f.owner.agent.get(`/api/v1/projects/${projectId}/lifecycle`).expect(200)).body.lifecycle;
    const second = (await mutate(f.owner, `/api/v1/projects/${projectId}/completion-requests`, { confirmed: true, lifecycleRevision: refreshed.revision, summary: "Second review" }).expect(201)).body.lifecycle;
    expect(second.rounds.map((round: { number: number; status: string }) => [round.number, round.status])).toEqual([[2, "in-review"], [1, "withdrawn"]]);
  });
});
