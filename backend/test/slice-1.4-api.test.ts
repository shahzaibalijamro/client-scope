import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { ChangeRequest } from "../src/domain/change-control-models.js";
import type { EmailCommand, EmailService } from "../src/domain/email.js";
import { Milestone, MilestoneTimeline, MilestoneTransition } from "../src/domain/milestone-models.js";
import {
  AccountToken, Activity, Client, ClientMembership, EffectiveProjectAccess, Invitation, Project,
  ProjectAssignment, Session, syncDomainIndexes, Throttle, User, Workspace, WorkspaceMembership,
} from "../src/domain/models.js";
import { ScopeVersion } from "../src/domain/scope-models.js";

process.env.NODE_ENV = "test";
process.env.FRONTEND_ORIGIN = "http://localhost:3000";
process.env.SESSION_SECRET = "test-session-secret-with-at-least-32-characters";
process.env.AUTH_THROTTLE_LIMIT = "1000";

class FakeEmail implements EmailService {
  readonly sent: EmailCommand[] = [];
  async send(command: EmailCommand) { this.sent.push(command); return { delivered: true }; }
  token(to: string) { const token = [...this.sent].reverse().find((item) => item.category === "verification" && item.to === to)?.text.match(/token=([A-Za-z0-9_-]+)/u)?.[1]; if (!token) throw new Error("missing token"); return token; }
}
type Agent = ReturnType<typeof request.agent>;
type Account = { agent: Agent; csrf: string; id: string };
let database: MongoMemoryReplSet; let email: FakeEmail;
const fixedClock = () => new Date("2026-09-11T00:30:00.000Z");

async function signup(address: string, displayName: string): Promise<Account> {
  const agent = request.agent(createApp({ emailService: email, clock: fixedClock }));
  let csrf = (await agent.get("/api/v1/csrf")).body.csrfToken as string;
  const result = await agent.post("/api/v1/auth/signup").set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).send({ email: address, displayName, password: "correct horse battery staple" }).expect(202);
  csrf = result.body.csrfToken;
  const id = (await agent.get("/api/v1/auth/session")).body.user.id as string;
  await agent.post("/api/v1/auth/verify").set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).send({ token: email.token(address) }).expect(200);
  return { agent, csrf, id };
}

function mutate(account: Account, method: "post" | "patch" | "put", path: string, body: unknown) {
  return account.agent[method](path).set("Origin", "http://localhost:3000").set("X-CSRF-Token", account.csrf).send(body as object);
}

async function fixture(approved = true) {
  const owner = await signup("milestone-owner@example.com", "Owner");
  const member = await signup("milestone-member@example.com", "Member");
  const approver = await signup("milestone-approver@example.com", "Approver");
  const participant = await signup("milestone-participant@example.com", "Participant");
  const outsider = await signup("milestone-outsider@example.com", "Outsider");
  const workspace = await Workspace.create({ name: "Studio", ownerId: owner.id });
  const client = await Client.create({ workspaceId: workspace._id, name: "Client", projectCount: 1 });
  const project = await Project.create({ workspaceId: workspace._id, clientId: client._id, name: "Website" });
  await WorkspaceMembership.create({ workspaceId: workspace._id, userId: member.id, role: "service-team-member", status: "active", startedAt: fixedClock() });
  const assignment = await ProjectAssignment.create({ workspaceId: workspace._id, projectId: project._id, userId: member.id, status: "active", startedAt: fixedClock() });
  const approverMembership = await ClientMembership.create({ workspaceId: workspace._id, projectId: project._id, userId: approver.id, role: "client-approver", status: "active", startedAt: fixedClock() });
  const participantMembership = await ClientMembership.create({ workspaceId: workspace._id, projectId: project._id, userId: participant.id, role: "client-participant", status: "active", startedAt: fixedClock() });
  await EffectiveProjectAccess.create([
    { workspaceId: workspace._id, projectId: project._id, userId: member.id, role: "service-team-member", sourceId: assignment._id },
    { workspaceId: workspace._id, projectId: project._id, userId: approver.id, role: "client-approver", sourceId: approverMembership._id },
    { workspaceId: workspace._id, projectId: project._id, userId: participant.id, role: "client-participant", sourceId: participantMembership._id },
  ]);
  if (approved) await ScopeVersion.create({
    workspaceId: workspace._id, projectId: project._id, number: 1, status: "approved", groups: [], requirements: [],
    submitterId: owner.id, submitterName: "Owner", submitterRole: "workspace-owner", submittedAt: fixedClock(),
  });
  return { owner, member, approver, participant, outsider, workspace, project, assignment };
}

beforeAll(async () => {
  vi.spyOn(console, "info").mockImplementation(() => undefined); vi.spyOn(console, "warn").mockImplementation(() => undefined); vi.spyOn(console, "error").mockImplementation(() => undefined);
  database = await MongoMemoryReplSet.create({ replSet: { count: 1 } }); await mongoose.connect(database.getUri()); await syncDomainIndexes();
}, 300_000);
beforeEach(async () => {
  email = new FakeEmail();
  await Promise.all([
    AccountToken.deleteMany({}), Activity.deleteMany({}), Client.deleteMany({}), ClientMembership.deleteMany({}),
    EffectiveProjectAccess.deleteMany({}), Invitation.deleteMany({}), Milestone.deleteMany({}), MilestoneTimeline.deleteMany({}), MilestoneTransition.deleteMany({}),
    Project.deleteMany({}), ProjectAssignment.deleteMany({}), ScopeVersion.deleteMany({}), Session.deleteMany({}), Throttle.deleteMany({}), User.deleteMany({}), Workspace.deleteMany({}), WorkspaceMembership.deleteMany({}), ChangeRequest.deleteMany({}),
  ]);
});
afterAll(async () => { await mongoose.disconnect(); await database.stop(); });

describe("Slice 1.4 client-facing milestone API", () => {
  it("exposes an empty read without persistence and enforces the approved-scope prerequisite", async () => {
    const f = await fixture(false); const projectId = String(f.project._id);
    const read = await f.owner.agent.get(`/api/v1/projects/${projectId}/milestones`).expect(200);
    expect(read.body.timeline).toMatchObject({ available: false, activeCount: 0, limit: 50, milestones: [], permissions: { canCreate: false } });
    expect(read.body.timeline.revisionToken).toEqual(expect.any(String));
    expect(await MilestoneTimeline.countDocuments()).toBe(0);
    await mutate(f.owner, "post", `/api/v1/projects/${projectId}/milestones`, { revisionToken: read.body.timeline.revisionToken, title: "Discovery" }).expect(409);
    expect(await Milestone.countDocuments()).toBe(0); expect(await MilestoneTimeline.countDocuments()).toBe(0);
  });

  it("shares progress read-only with clients while preserving transitions, reorder, and terminal archive", async () => {
    const f = await fixture(); const projectId = String(f.project._id);
    const initial = (await f.owner.agent.get(`/api/v1/projects/${projectId}/milestones`).expect(200)).body.timeline;
    const created = await mutate(f.owner, "post", `/api/v1/projects/${projectId}/milestones`, { revisionToken: initial.revisionToken, title: "  Design review  ", description: "  Shared\ncontext  ", targetDate: "2026-09-10" }).expect(201);
    expect(created.body.milestone).toMatchObject({ title: "Design review", status: "upcoming", position: 0, isOverdue: true });
    const clientRead = (await f.participant.agent.get(`/api/v1/projects/${projectId}/milestones`).expect(200)).body.timeline;
    expect(clientRead).not.toHaveProperty("revisionToken"); expect(clientRead.permissions).toEqual({ canCreate: false, canEdit: false, canTransition: false, canReorder: false, canArchive: false });
    await mutate(f.approver, "post", `/api/v1/projects/${projectId}/milestones`, { revisionToken: created.body.revisionToken, title: "Forbidden" }).expect(404);

    const memberRead = (await f.member.agent.get(`/api/v1/projects/${projectId}/milestones`).expect(200)).body.timeline;
    const completed = await mutate(f.member, "post", `/api/v1/projects/${projectId}/milestones/${created.body.milestone.id}/transitions`, { revisionToken: memberRead.revisionToken, status: "completed", note: "  Client accepted the stage.  " }).expect(200);
    expect(completed.body.milestone).toMatchObject({ status: "completed", isOverdue: false, latestTransition: { previousStatus: "upcoming", nextStatus: "completed", note: "Client accepted the stage." } });
    await mutate(f.member, "post", `/api/v1/projects/${projectId}/milestones/${created.body.milestone.id}/transitions`, { revisionToken: completed.body.revisionToken, status: "completed" }).expect(409);
    await mutate(f.owner, "patch", `/api/v1/projects/${projectId}/milestones/${created.body.milestone.id}`, { revisionToken: created.body.revisionToken, title: "Stale edit", description: "", targetDate: "" }).expect(409);
    const current = (await f.owner.agent.get(`/api/v1/projects/${projectId}/milestones`).expect(200)).body.timeline;
    const edited = await mutate(f.owner, "patch", `/api/v1/projects/${projectId}/milestones/${created.body.milestone.id}`, { revisionToken: current.revisionToken, title: "Design sign-off", description: "Updated", targetDate: "2026-09-10" }).expect(200);
    const noOp = await mutate(f.owner, "patch", `/api/v1/projects/${projectId}/milestones/${created.body.milestone.id}`, { revisionToken: edited.body.revisionToken, title: "Design sign-off", description: "Updated", targetDate: "2026-09-10" }).expect(200);
    expect(noOp.body.unchanged).toBe(true);
    const second = await mutate(f.owner, "post", `/api/v1/projects/${projectId}/milestones`, { revisionToken: noOp.body.revisionToken, title: "Launch" }).expect(201);
    await mutate(f.owner, "put", `/api/v1/projects/${projectId}/milestones/order`, { revisionToken: second.body.revisionToken, milestoneIds: [created.body.milestone.id] }).expect(409);
    const reordered = await mutate(f.owner, "put", `/api/v1/projects/${projectId}/milestones/order`, { revisionToken: second.body.revisionToken, milestoneIds: [second.body.milestone.id, created.body.milestone.id] }).expect(200);
    expect(reordered.body.unchanged).toBe(false);
    await ChangeRequest.create({ workspaceId: f.workspace._id, projectId: f.project._id, title: "Open change", baseScopeVersionId: (await ScopeVersion.findOne({ projectId }))!._id, baseScopeVersionNumber: 1, state: "draft", active: true, creatorId: f.owner.id, creatorName: "Owner", creatorRole: "workspace-owner" });
    const reopened = await mutate(f.owner, "post", `/api/v1/projects/${projectId}/milestones/${created.body.milestone.id}/transitions`, { revisionToken: reordered.body.revisionToken, status: "in-progress", note: "Reopened for polish." }).expect(200);
    expect(reopened.body.milestone).toMatchObject({ status: "in-progress", isOverdue: true });
    const archived = await mutate(f.owner, "post", `/api/v1/projects/${projectId}/milestones/${created.body.milestone.id}/archive`, { revisionToken: reopened.body.revisionToken, confirmed: true, reason: "Combined with launch." }).expect(200);
    expect(archived.body).toMatchObject({ activeCount: 1, milestone: { status: "in-progress", position: 1, archive: { reason: "Combined with launch." } } });
    const archivedLaunch = await mutate(f.owner, "post", `/api/v1/projects/${projectId}/milestones/${second.body.milestone.id}/archive`, { revisionToken: archived.body.revisionToken, confirmed: true, reason: "Launch completed elsewhere." }).expect(200);
    expect(archivedLaunch.body.activeCount).toBe(0);
    const firstPage = (await f.approver.agent.get(`/api/v1/projects/${projectId}/milestones/archive?limit=1`).expect(200)).body.archive;
    expect(firstPage.milestones[0]).toMatchObject({ id: second.body.milestone.id, status: "upcoming" }); expect(firstPage.nextCursor).toEqual(expect.any(String));
    const secondPage = (await f.approver.agent.get(`/api/v1/projects/${projectId}/milestones/archive?limit=1&cursor=${encodeURIComponent(firstPage.nextCursor)}`).expect(200)).body.archive;
    expect(secondPage.milestones[0]).toMatchObject({ id: created.body.milestone.id, status: "in-progress" }); expect(secondPage).not.toHaveProperty("nextCursor");
    await f.approver.agent.get(`/api/v1/projects/${projectId}/milestones/archive?cursor=not-a-valid-cursor`).expect(400);
    expect(await MilestoneTransition.countDocuments({ milestoneId: created.body.milestone.id })).toBe(2);
    expect(await Activity.countDocuments({ projectId, action: { $in: ["milestone.created", "milestone.edited", "milestone.status-transitioned", "milestone.reordered", "milestone.archived"] } })).toBe(8);
    expect(email.sent.filter((item) => item.category !== "verification")).toHaveLength(0);
    await f.outsider.agent.get(`/api/v1/projects/${projectId}/milestones`).expect(404);
  });

  it("serializes competing creates at the active limit", async () => {
    const f = await fixture(); const projectId = String(f.project._id); const revisionToken = "r".repeat(40);
    await MilestoneTimeline.create({ workspaceId: f.workspace._id, projectId, revisionToken, activeCount: 49 });
    await Milestone.insertMany(Array.from({ length: 49 }, (_, position) => ({ workspaceId: f.workspace._id, projectId, title: `Milestone ${position}`, status: "upcoming", position, active: true })));
    const [ownerResult, memberResult] = await Promise.all([
      mutate(f.owner, "post", `/api/v1/projects/${projectId}/milestones`, { revisionToken, title: "Owner candidate" }),
      mutate(f.member, "post", `/api/v1/projects/${projectId}/milestones`, { revisionToken, title: "Member candidate" }),
    ]);
    expect([ownerResult.status, memberResult.status].sort()).toEqual([201, 409]);
    const records = await Milestone.find({ projectId, active: true }).sort({ position: 1 }).lean();
    expect(records).toHaveLength(50); expect(records.map((item) => item.position)).toEqual(Array.from({ length: 50 }, (_, index) => index));
    expect(await Activity.countDocuments({ projectId, action: "milestone.created" })).toBe(1);
  });

  it("rolls a failed activity write back and revokes live access authoritatively", async () => {
    const f = await fixture(); const projectId = String(f.project._id);
    const initial = (await f.owner.agent.get(`/api/v1/projects/${projectId}/milestones`).expect(200)).body.timeline;
    const failure = vi.spyOn(Activity.prototype, "save").mockRejectedValueOnce(new Error("injected activity failure"));
    try {
      await mutate(f.owner, "post", `/api/v1/projects/${projectId}/milestones`, { revisionToken: initial.revisionToken, title: "Rollback" }).expect(500);
    } finally {
      failure.mockRestore();
    }
    expect(await Milestone.countDocuments({ projectId })).toBe(0); expect(await MilestoneTimeline.countDocuments({ projectId })).toBe(0);
    const created = await mutate(f.owner, "post", `/api/v1/projects/${projectId}/milestones`, { revisionToken: initial.revisionToken, title: "Committed" }).expect(201);
    await EffectiveProjectAccess.deleteOne({ projectId, userId: f.member.id });
    await mutate(f.member, "patch", `/api/v1/projects/${projectId}/milestones/${created.body.milestone.id}`, { revisionToken: created.body.revisionToken, title: "No access", description: "", targetDate: "" }).expect(404);
    expect((await Milestone.findById(created.body.milestone.id).lean())!.title).toBe("Committed");
  });
});
