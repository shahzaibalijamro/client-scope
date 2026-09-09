import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import type { EmailCommand, EmailService } from "../src/domain/email.js";
import {
  AccountToken, Activity, Client, ClientMembership, EffectiveProjectAccess, Invitation, Project,
  ProjectAssignment, Session, syncDomainIndexes, Throttle, User, Workspace, WorkspaceMembership,
} from "../src/domain/models.js";
import { ScopeComment, ScopeDecision, ScopeDraft, ScopeVersion } from "../src/domain/scope-models.js";

process.env.NODE_ENV = "test";
process.env.FRONTEND_ORIGIN = "http://localhost:3000";
process.env.SESSION_SECRET = "test-session-secret-with-at-least-32-characters";
process.env.AUTH_THROTTLE_LIMIT = "1000";

class FakeEmail implements EmailService {
  readonly sent: EmailCommand[] = [];
  delivered = true;
  readonly failFor = new Set<string>();
  async send(command: EmailCommand) { this.sent.push(command); return { delivered: this.delivered && !this.failFor.has(command.to) }; }
  token(to: string) {
    const text = [...this.sent].reverse().find((item) => item.category === "verification" && item.to === to)?.text;
    const token = text?.match(/token=([A-Za-z0-9_-]+)/u)?.[1];
    if (!token) throw new Error("No verification token");
    return token;
  }
}

type Agent = ReturnType<typeof request.agent>;
type Account = { agent: Agent; csrf: string; id: string; email: string; name: string };
let database: MongoMemoryReplSet;
let email: FakeEmail;

async function csrf(agent: Agent) { return (await agent.get("/api/v1/csrf").expect(200)).body.csrfToken as string; }
function mutate(account: Account, method: "post" | "put" | "patch" | "delete", path: string, body?: unknown) {
  const call = account.agent[method](path).set("Origin", "http://localhost:3000").set("X-CSRF-Token", account.csrf);
  return body === undefined ? call : call.send(body as object);
}
async function signup(emailAddress: string, name: string): Promise<Account> {
  const agent = request.agent(createApp({ emailService: email }));
  let token = await csrf(agent);
  const result = await agent.post("/api/v1/auth/signup").set("Origin", "http://localhost:3000").set("X-CSRF-Token", token)
    .send({ email: emailAddress, displayName: name, password: "correct horse battery staple" }).expect(202);
  token = result.body.csrfToken as string;
  const id = (await agent.get("/api/v1/auth/session").expect(200)).body.user.id as string;
  await agent.post("/api/v1/auth/verify").set("Origin", "http://localhost:3000").set("X-CSRF-Token", token).send({ token: email.token(emailAddress) }).expect(200);
  return { agent, csrf: token, id, email: emailAddress, name };
}
async function fixture() {
  const owner = await signup("owner@example.com", "Owner");
  const approver = await signup("approver@example.com", "Approver");
  const participant = await signup("participant@example.com", "Participant");
  const member = await signup("member@example.com", "Member");
  const outsider = await signup("outsider@example.com", "Outsider");
  const workspace = await Workspace.create({ name: "Studio", ownerId: owner.id });
  const client = await Client.create({ workspaceId: workspace._id, name: "Client", projectCount: 1 });
  const project = await Project.create({ workspaceId: workspace._id, clientId: client._id, name: "Website" });
  const workspaceMembership = await WorkspaceMembership.create({ workspaceId: workspace._id, userId: member.id, role: "service-team-member", status: "active", startedAt: new Date() });
  const assignment = await ProjectAssignment.create({ workspaceId: workspace._id, projectId: project._id, userId: member.id, status: "active", startedAt: new Date() });
  const approverMembership = await ClientMembership.create({ workspaceId: workspace._id, projectId: project._id, userId: approver.id, role: "client-approver", status: "active", startedAt: new Date() });
  const participantMembership = await ClientMembership.create({ workspaceId: workspace._id, projectId: project._id, userId: participant.id, role: "client-participant", status: "active", startedAt: new Date() });
  await EffectiveProjectAccess.create([
    { workspaceId: workspace._id, projectId: project._id, userId: member.id, role: "service-team-member", sourceId: assignment._id },
    { workspaceId: workspace._id, projectId: project._id, userId: approver.id, role: "client-approver", sourceId: approverMembership._id },
    { workspaceId: workspace._id, projectId: project._id, userId: participant.id, role: "client-participant", sourceId: participantMembership._id },
  ]);
  return { owner, approver, participant, member, outsider, workspaceMembership, assignment, approverMembership, projectId: String(project._id) };
}
async function startAndFill(owner: Account, projectId: string) {
  const started = await mutate(owner, "post", `/api/v1/projects/${projectId}/scope/draft`, {}).expect(201);
  const saved = await mutate(owner, "put", `/api/v1/projects/${projectId}/scope/draft`, {
    revisionToken: started.body.draft.revisionToken, groups: [{ name: "Core", order: 0 }],
    requirements: [{ title: "Homepage", description: "Build the public homepage.", acceptanceCriteria: ["Works on mobile"], order: 0 }],
  }).expect(200);
  return saved.body.draft as { revisionToken: string; groups: Array<{ id: string }>; requirements: Array<{ logicalId: string }> };
}

beforeAll(async () => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  database = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(database.getUri()); await syncDomainIndexes();
}, 300_000);
beforeEach(async () => {
  email = new FakeEmail();
  await Promise.all([
    AccountToken.deleteMany({}), Activity.deleteMany({}), Client.deleteMany({}), ClientMembership.deleteMany({}),
    EffectiveProjectAccess.deleteMany({}), Invitation.deleteMany({}), Project.deleteMany({}), ProjectAssignment.deleteMany({}),
    ScopeComment.deleteMany({}), ScopeDecision.deleteMany({}), ScopeDraft.deleteMany({}), ScopeVersion.deleteMany({}),
    Session.deleteMany({}), Throttle.deleteMany({}), User.deleteMany({}), Workspace.deleteMany({}), WorkspaceMembership.deleteMany({}),
  ]);
});
afterAll(async () => { await mongoose.disconnect(); await database.stop(); });

describe("Slice 1.2 scope API", () => {
  it("keeps drafts provider-only and prevents stale overwrites", async () => {
    const { owner, member, approver, outsider, projectId } = await fixture();
    const draft = await startAndFill(owner, projectId);
    const memberRead = await member.agent.get(`/api/v1/projects/${projectId}/scope`).expect(200);
    expect(memberRead.body.scope.draft.requirements[0].title).toBe("Homepage");
    const clientRead = await approver.agent.get(`/api/v1/projects/${projectId}/scope`).expect(200);
    expect(clientRead.body.scope).not.toHaveProperty("draft");
    expect(clientRead.body.scope.state).toBe("not-started");
    expect(clientRead.body.scope.permissions.canEditDraft).toBe(false);
    expect(JSON.stringify(clientRead.body)).not.toContain(draft.revisionToken);
    await outsider.agent.get(`/api/v1/projects/${projectId}/scope`).expect(404);

    await mutate(member, "put", `/api/v1/projects/${projectId}/scope/draft`, {
      revisionToken: draft.revisionToken, groups: [{ ...draft.groups[0], name: "Core", order: 0 }],
      requirements: [{ ...draft.requirements[0], title: "Updated", description: "Build the public homepage.", acceptanceCriteria: ["Works on mobile"], order: 0 }],
    }).expect(200);
    await mutate(owner, "put", `/api/v1/projects/${projectId}/scope/draft`, {
      revisionToken: draft.revisionToken, groups: [], requirements: [],
    }).expect(409).expect((response) => expect(response.body.error.code).toBe("STALE_STATE"));
    expect((await ScopeDraft.findOne({ projectId }).lean())!.requirements[0]!.title).toBe("Updated");
    expect(await Activity.countDocuments({ projectId, action: /^scope\./u })).toBe(0);
  });

  it("submits immutable scope, comments contextually, and commits one terminal decision", async () => {
    const { owner, member, approver, participant, projectId } = await fixture();
    const draft = await startAndFill(owner, projectId);
    await mutate(member, "post", `/api/v1/projects/${projectId}/scope/submissions`, { revisionToken: draft.revisionToken, confirmed: true }).expect(404);
    const submitted = await mutate(owner, "post", `/api/v1/projects/${projectId}/scope/submissions`, { revisionToken: draft.revisionToken, confirmed: true }).expect(201);
    const versionId = submitted.body.version.id as string;
    expect(submitted.body.version.number).toBe(1);
    expect(await ScopeDraft.countDocuments({ projectId })).toBe(0);
    expect(email.sent.filter((item) => item.category === "scope-review").map((item) => item.to)).toEqual([approver.email]);
    expect(email.sent.find((item) => item.category === "scope-review")!.text).not.toContain("Homepage");
    const pendingWork = await approver.agent.get("/api/v1/work").expect(200);
    expect(pendingWork.body.workspaces[0].projects[0].scope).toMatchObject({ state: "in-review", pendingAction: "decision-required" });

    const review = await participant.agent.get(`/api/v1/projects/${projectId}/scope`).expect(200);
    const snapshotId = review.body.scope.versions[0].requirements[0].snapshotId as string;
    await mutate(participant, "post", `/api/v1/projects/${projectId}/scope/versions/${versionId}/comments`, { body: "Please confirm this detail.", requirementSnapshotId: snapshotId }).expect(201);
    await mutate(participant, "post", `/api/v1/projects/${projectId}/scope/versions/${versionId}/decisions`, { outcome: "approved", confirmed: true }).expect(404);

    const decisions = await Promise.all([
      mutate(approver, "post", `/api/v1/projects/${projectId}/scope/versions/${versionId}/decisions`, { outcome: "changes-requested", confirmed: true, note: "Clarify the mobile layout." }),
      mutate(approver, "post", `/api/v1/projects/${projectId}/scope/versions/${versionId}/decisions`, { outcome: "approved", confirmed: true }),
    ]);
    expect(decisions.filter((result) => result.status === 200)).toHaveLength(1);
    expect(decisions.filter((result) => result.status === 409)).toHaveLength(1);
    expect(await ScopeDecision.countDocuments({ versionId })).toBe(1);
    const terminal = await ScopeVersion.findById(versionId).lean();
    expect(["approved", "changes-requested"]).toContain(terminal!.status);
    expect(await ScopeDraft.countDocuments({ projectId })).toBe(terminal!.status === "changes-requested" ? 1 : 0);
    await mutate(owner, "post", `/api/v1/projects/${projectId}/scope/versions/${versionId}/comments`, { body: "Too late" }).expect(409);
    expect(await ScopeComment.countDocuments({ versionId })).toBe(1);
    expect(await Activity.countDocuments({ projectId, action: /^scope\./u })).toBe(3);
  });

  it("preserves logical identities, comparison, terminal numbers, and email-failure state", async () => {
    const { owner, approver, projectId } = await fixture();
    const firstDraft = await startAndFill(owner, projectId);
    const v1 = await mutate(owner, "post", `/api/v1/projects/${projectId}/scope/submissions`, { revisionToken: firstDraft.revisionToken, confirmed: true }).expect(201);
    await mutate(approver, "post", `/api/v1/projects/${projectId}/scope/versions/${v1.body.version.id}/decisions`, {
      outcome: "changes-requested", confirmed: true, note: "Add contact details.",
    }).expect(200);
    const copied = (await owner.agent.get(`/api/v1/projects/${projectId}/scope`).expect(200)).body.scope.draft;
    expect(copied.requirements[0].logicalId).toBe(firstDraft.requirements[0]!.logicalId);
    const edited = await mutate(owner, "put", `/api/v1/projects/${projectId}/scope/draft`, {
      revisionToken: copied.revisionToken, groups: copied.groups,
      requirements: [
        { ...copied.requirements[0], title: "Homepage updated", order: 1 },
        { title: "Contact", description: "Add a contact form.", acceptanceCriteria: ["Messages can be sent"], order: 0 },
      ],
    }).expect(200);
    await mutate(owner, "post", `/api/v1/projects/${projectId}/scope/submissions`, { revisionToken: edited.body.draft.revisionToken, confirmed: true }).expect(400);
    const v2 = await mutate(owner, "post", `/api/v1/projects/${projectId}/scope/submissions`, {
      revisionToken: edited.body.draft.revisionToken, revisionSummary: "Clarified homepage and added contact.", confirmed: true,
    }).expect(201);
    expect(v2.body.version.number).toBe(2);
    await mutate(owner, "post", `/api/v1/projects/${projectId}/scope/versions/${v2.body.version.id}/withdrawal`, { confirmed: true, reason: "Need one more provider review." }).expect(200);
    const afterWithdrawal = (await owner.agent.get(`/api/v1/projects/${projectId}/scope`).expect(200)).body.scope;
    const revision = afterWithdrawal.draft;
    email.delivered = false;
    const v3 = await mutate(owner, "post", `/api/v1/projects/${projectId}/scope/submissions`, {
      revisionToken: revision.revisionToken, revisionSummary: "Provider review complete.", confirmed: true,
    }).expect(201);
    expect(v3.body.version.number).toBe(3);
    expect(v3.body.warning).toMatch(/saved/u);
    const history = (await approver.agent.get(`/api/v1/projects/${projectId}/scope`).expect(200)).body.scope;
    expect(history.versions.map((version: { number: number; status: string }) => [version.number, version.status])).toEqual([
      [3, "in-review"], [2, "withdrawn"], [1, "changes-requested"],
    ]);
    expect(history.versions[1].comparison.contentChanged).toHaveLength(1);
    expect(history.versions[1].comparison.added).toHaveLength(1);
    expect(history).not.toHaveProperty("draft");
  });

  it("rechecks current access and does not reveal cross-project identifiers", async () => {
    const { owner, approver, approverMembership, projectId } = await fixture();
    const draft = await startAndFill(owner, projectId);
    const submitted = await mutate(owner, "post", `/api/v1/projects/${projectId}/scope/submissions`, { revisionToken: draft.revisionToken, confirmed: true }).expect(201);
    await EffectiveProjectAccess.deleteOne({ projectId, userId: approver.id });
    await ClientMembership.updateOne({ _id: approverMembership._id }, { $set: { status: "inactive", endedAt: new Date(), endReason: "removed" } });
    await approver.agent.get(`/api/v1/projects/${projectId}/scope`).expect(404);
    await mutate(approver, "post", `/api/v1/projects/${projectId}/scope/versions/${submitted.body.version.id}/decisions`, { outcome: "approved", confirmed: true }).expect(404);
    expect((await ScopeVersion.findById(submitted.body.version.id).lean())!.status).toBe("in-review");
  });

  it("keeps approval authoritative when one provider notification fails", async () => {
    const { owner, member, approver, projectId } = await fixture();
    const draft = await startAndFill(owner, projectId);
    const submitted = await mutate(owner, "post", `/api/v1/projects/${projectId}/scope/submissions`, { revisionToken: draft.revisionToken, confirmed: true }).expect(201);
    email.failFor.add(member.email);
    const approved = await mutate(approver, "post", `/api/v1/projects/${projectId}/scope/versions/${submitted.body.version.id}/decisions`, {
      outcome: "approved", confirmed: true, note: "Private decision note",
    }).expect(200);
    expect(approved.body.warning).toMatch(/saved/u);
    expect((await ScopeVersion.findById(submitted.body.version.id).lean())!.status).toBe("approved");
    const results = email.sent.filter((item) => item.category === "scope-result");
    expect(results.map((item) => item.to).sort()).toEqual([member.email, owner.email].sort());
    expect(results.every((item) => !item.text.includes("Private decision note"))).toBe(true);
  });
});
