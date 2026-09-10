import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { ChangeComment, ChangeDecision, ChangeItem, ChangeProposal, ChangeProposalDraft, ChangeRequest } from "../src/domain/change-control-models.js";
import type { EmailCommand, EmailService } from "../src/domain/email.js";
import { AccountToken, Activity, Client, ClientMembership, EffectiveProjectAccess, Invitation, Project, ProjectAssignment, Session, syncDomainIndexes, Throttle, User, Workspace, WorkspaceMembership } from "../src/domain/models.js";
import { ScopeComment, ScopeDecision, ScopeDraft, ScopeVersion } from "../src/domain/scope-models.js";

process.env.NODE_ENV = "test";
process.env.FRONTEND_ORIGIN = "http://localhost:3000";
process.env.SESSION_SECRET = "test-session-secret-with-at-least-32-characters";
process.env.AUTH_THROTTLE_LIMIT = "1000";

class FakeEmail implements EmailService {
  readonly sent: EmailCommand[] = []; delivered = true; throws = false;
  async send(command: EmailCommand) { this.sent.push(command); if (this.throws) throw new Error("simulated SMTP failure"); return { delivered: this.delivered }; }
  token(to: string) { const value = [...this.sent].reverse().find((item) => item.category === "verification" && item.to === to)?.text.match(/token=([A-Za-z0-9_-]+)/u)?.[1]; if (!value) throw new Error("missing token"); return value; }
}
type Agent = ReturnType<typeof request.agent>;
type Account = { agent: Agent; csrf: string; id: string; email: string };
let database: MongoMemoryReplSet; let email: FakeEmail;
async function signup(address: string, displayName: string): Promise<Account> {
  const agent = request.agent(createApp({ emailService: email }));
  let csrf = (await agent.get("/api/v1/csrf")).body.csrfToken as string;
  const signupResult = await agent.post("/api/v1/auth/signup").set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).send({ email: address, displayName, password: "correct horse battery staple" }).expect(202);
  csrf = signupResult.body.csrfToken;
  const id = (await agent.get("/api/v1/auth/session")).body.user.id as string;
  await agent.post("/api/v1/auth/verify").set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).send({ token: email.token(address) }).expect(200);
  return { agent, csrf, id, email: address };
}
function mutate(account: Account, method: "post" | "put", path: string, body: unknown) { return account.agent[method](path).set("Origin", "http://localhost:3000").set("X-CSRF-Token", account.csrf).send(body as object); }
async function fixture() {
  const owner = await signup("change-owner@example.com", "Owner"); const member = await signup("change-member@example.com", "Member");
  const approver = await signup("change-approver@example.com", "Approver"); const participant = await signup("change-participant@example.com", "Participant"); const outsider = await signup("change-outsider@example.com", "Outsider");
  const workspace = await Workspace.create({ name: "Studio", ownerId: owner.id });
  const client = await Client.create({ workspaceId: workspace._id, name: "Client", projectCount: 1 });
  const project = await Project.create({ workspaceId: workspace._id, clientId: client._id, name: "Website" });
  await WorkspaceMembership.create({ workspaceId: workspace._id, userId: member.id, role: "service-team-member", status: "active", startedAt: new Date() });
  const assignment = await ProjectAssignment.create({ workspaceId: workspace._id, projectId: project._id, userId: member.id, status: "active", startedAt: new Date() });
  const approverMembership = await ClientMembership.create({ workspaceId: workspace._id, projectId: project._id, userId: approver.id, role: "client-approver", status: "active", startedAt: new Date() });
  const participantMembership = await ClientMembership.create({ workspaceId: workspace._id, projectId: project._id, userId: participant.id, role: "client-participant", status: "active", startedAt: new Date() });
  await EffectiveProjectAccess.create([
    { workspaceId: workspace._id, projectId: project._id, userId: member.id, role: "service-team-member", sourceId: assignment._id },
    { workspaceId: workspace._id, projectId: project._id, userId: approver.id, role: "client-approver", sourceId: approverMembership._id },
    { workspaceId: workspace._id, projectId: project._id, userId: participant.id, role: "client-participant", sourceId: participantMembership._id },
  ]);
  const groupId = new mongoose.Types.ObjectId(); const logicalId = new mongoose.Types.ObjectId();
  const base = await ScopeVersion.create({
    workspaceId: workspace._id, projectId: project._id, number: 1, status: "approved", groups: [{ id: groupId, name: "Core", order: 0 }],
    requirements: [{ snapshotId: new mongoose.Types.ObjectId(), logicalId, groupId, title: "Homepage", description: "Original", acceptanceCriteria: ["Mobile"], order: 0 }],
    submitterId: owner.id, submitterName: "Owner", submitterRole: "workspace-owner", submittedAt: new Date(), terminalActorId: approver.id,
    terminalActorName: "Approver", terminalRole: "client-approver", terminalAt: new Date(),
  });
  return { owner, member, approver, participant, outsider, projectId: String(project._id), base, groupId: String(groupId), logicalId: String(logicalId) };
}

async function materialProposalDraft(f: Awaited<ReturnType<typeof fixture>>, title = "Material change") {
  const started = await mutate(f.owner, "post", `/api/v1/projects/${f.projectId}/change-requests`, { title }).expect(201);
  const saved = await mutate(f.owner, "put", `/api/v1/projects/${f.projectId}/change-requests/${started.body.requestId}/draft`, {
    revisionToken: started.body.draft.revisionToken, title, rationale: "A material update is required.", groups: started.body.draft.groups,
    requirements: started.body.draft.requirements.map((item: { description: string }) => ({ ...item, description: "Materially changed description." })),
  }).expect(200);
  return { requestId: started.body.requestId as string, revisionToken: saved.body.draft.revisionToken as string };
}

async function submittedMaterialProposal(f: Awaited<ReturnType<typeof fixture>>, title: string) {
  const draft = await materialProposalDraft(f, title);
  const submitted = await mutate(f.owner, "post", `/api/v1/projects/${f.projectId}/change-requests/${draft.requestId}/submissions`, {
    revisionToken: draft.revisionToken, confirmed: true,
  }).expect(201);
  return { requestId: draft.requestId, proposalId: submitted.body.proposalId as string };
}

async function expectApprovalRolledBack(f: Awaited<ReturnType<typeof fixture>>, requestId: string, proposalId: string) {
  expect(await ChangeDecision.countDocuments({ proposalId })).toBe(0);
  expect(await ScopeVersion.countDocuments({ projectId: f.projectId })).toBe(1);
  expect(await ScopeVersion.findById(f.base._id).lean()).toMatchObject({ status: "approved" });
  expect(await ChangeProposal.findById(proposalId).lean()).toMatchObject({ outcome: "in-review", open: true });
  expect(await ChangeRequest.findById(requestId).lean()).toMatchObject({ state: "in-review", active: true });
  expect(await Activity.countDocuments({ projectId: f.projectId, action: "change-request.approved" })).toBe(0);
}

beforeAll(async () => { vi.spyOn(console, "info").mockImplementation(() => undefined); vi.spyOn(console, "warn").mockImplementation(() => undefined); vi.spyOn(console, "error").mockImplementation(() => undefined); database = await MongoMemoryReplSet.create({ replSet: { count: 1 } }); await mongoose.connect(database.getUri()); await syncDomainIndexes(); }, 300_000);
beforeEach(async () => { email = new FakeEmail(); await Promise.all([
  AccountToken.deleteMany({}), Activity.deleteMany({}), Client.deleteMany({}), ClientMembership.deleteMany({}), EffectiveProjectAccess.deleteMany({}), Invitation.deleteMany({}), Project.deleteMany({}), ProjectAssignment.deleteMany({}),
  ScopeComment.deleteMany({}), ScopeDecision.deleteMany({}), ScopeDraft.deleteMany({}), ScopeVersion.deleteMany({}), ChangeComment.deleteMany({}), ChangeDecision.deleteMany({}), ChangeItem.deleteMany({}), ChangeProposal.deleteMany({}), ChangeProposalDraft.deleteMany({}), ChangeRequest.deleteMany({}),
  Session.deleteMany({}), Throttle.deleteMany({}), User.deleteMany({}), Workspace.deleteMany({}), WorkspaceMembership.deleteMany({}),
]); });
afterAll(async () => { await mongoose.disconnect(); await database.stop(); });

describe("Slice 1.3 formal change-control API", () => {
  it("keeps drafts private, preserves dual comparisons, and atomically succeeds scope", async () => {
    const f = await fixture();
    const started = await mutate(f.member, "post", `/api/v1/projects/${f.projectId}/change-requests`, { title: "Add contact workflow" }).expect(201);
    const requestId = started.body.requestId as string;
    expect(started.body.draft.requirements[0].logicalId).toBe(f.logicalId);
    expect((await f.approver.agent.get(`/api/v1/projects/${f.projectId}/change-requests`).expect(200)).body.changeControl.requests).toHaveLength(0);
    const saved = await mutate(f.member, "put", `/api/v1/projects/${f.projectId}/change-requests/${requestId}/draft`, {
      revisionToken: started.body.draft.revisionToken, title: "Add contact workflow", rationale: "Clients need a contact path.", impactSummary: "One new requirement.",
      groups: started.body.draft.groups, requirements: [...started.body.draft.requirements, { title: "Contact", description: "Contact form", acceptanceCriteria: ["Sends"], order: 1 }],
    }).expect(200);
    await mutate(f.member, "post", `/api/v1/projects/${f.projectId}/change-requests/${requestId}/submissions`, { revisionToken: saved.body.draft.revisionToken, confirmed: true }).expect(404);
    const submitted = await mutate(f.owner, "post", `/api/v1/projects/${f.projectId}/change-requests/${requestId}/submissions`, { revisionToken: saved.body.draft.revisionToken, confirmed: true }).expect(201);
    expect(submitted.body).toMatchObject({ requestNumber: 1, proposalNumber: 1 });
    const proposalId = submitted.body.proposalId as string;
    const review = (await f.participant.agent.get(`/api/v1/projects/${f.projectId}/change-requests`).expect(200)).body.changeControl.requests[0];
    expect(review).not.toHaveProperty("draft"); expect(review.proposals[0].comparisons.baseScope.some((item: { changeKinds: string[] }) => item.changeKinds.includes("added"))).toBe(true);
    const item = review.proposals[0].comparisons.baseScope[0];
    await mutate(f.participant, "post", `/api/v1/projects/${f.projectId}/change-requests/${requestId}/proposals/${proposalId}/comments`, { body: "Please confirm.", comparisonKind: item.comparisonKind, changeItemId: item.id }).expect(201);
    await mutate(f.approver, "post", `/api/v1/projects/${f.projectId}/change-requests/${requestId}/proposals/${proposalId}/decisions`, { outcome: "changes-requested", confirmed: true, note: "Clarify the original too." }).expect(200);
    const revision = (await f.owner.agent.get(`/api/v1/projects/${f.projectId}/change-requests`).expect(200)).body.changeControl.requests[0].draft;
    const revised = await mutate(f.owner, "put", `/api/v1/projects/${f.projectId}/change-requests/${requestId}/draft`, {
      revisionToken: revision.revisionToken, title: "Add contact workflow", rationale: "Clearer rationale.", impactSummary: "One new requirement.", revisionSummary: "Clarified rationale.",
      groups: revision.groups, requirements: revision.requirements,
    }).expect(200);
    const v2 = await mutate(f.owner, "post", `/api/v1/projects/${f.projectId}/change-requests/${requestId}/submissions`, { revisionToken: revised.body.draft.revisionToken, confirmed: true }).expect(201);
    const v2Review = (await f.approver.agent.get(`/api/v1/projects/${f.projectId}/change-requests`).expect(200)).body.changeControl.requests[0].proposals[0];
    expect(v2Review.number).toBe(2); expect(v2Review.comparisons.previousMetadata.rationaleChanged).toBe(true);
    const approved = await mutate(f.approver, "post", `/api/v1/projects/${f.projectId}/change-requests/${requestId}/proposals/${v2.body.proposalId}/decisions`, { outcome: "approved", confirmed: true }).expect(200);
    expect(approved.body.successorScopeVersionNumber).toBe(2);
    const scopes = await ScopeVersion.find({ projectId: f.projectId }).sort({ number: 1 }).lean();
    expect(scopes.map((scope) => scope.status)).toEqual(["superseded", "approved"]);
    expect(scopes[1]!.requirements.map((entry) => String(entry.logicalId))).toEqual(v2Review.requirements.map((entry: { logicalId: string }) => entry.logicalId));
    expect(await ChangeDecision.countDocuments({ requestId })).toBe(2);
    expect(await ChangeComment.countDocuments({ requestId })).toBe(1);
    await mutate(f.approver, "post", `/api/v1/projects/${f.projectId}/change-requests/${requestId}/proposals/${v2.body.proposalId}/comments`, { body: "Too late" }).expect(409);
  });

  it("rejects no-op submission and supports discard, withdrawal, and cancellation boundaries", async () => {
    const f = await fixture();
    const first = await mutate(f.owner, "post", `/api/v1/projects/${f.projectId}/change-requests`, { title: "No-op" }).expect(201);
    const noOp = await mutate(f.owner, "put", `/api/v1/projects/${f.projectId}/change-requests/${first.body.requestId}/draft`, {
      revisionToken: first.body.draft.revisionToken, title: "No-op", rationale: "Only ordering.", groups: first.body.draft.groups.map((group: object) => ({ ...group, order: 9 })), requirements: first.body.draft.requirements.map((item: object) => ({ ...item, order: 8 })),
    }).expect(200);
    await mutate(f.owner, "post", `/api/v1/projects/${f.projectId}/change-requests/${first.body.requestId}/submissions`, { revisionToken: noOp.body.draft.revisionToken, confirmed: true }).expect(409);
    expect((await ChangeRequest.findById(first.body.requestId).lean())!.number).toBeUndefined();
    await mutate(f.owner, "post", `/api/v1/projects/${f.projectId}/change-requests/${first.body.requestId}/discard`, { confirmed: true }).expect(200);
    expect(await ChangeRequest.countDocuments()).toBe(0);

    const second = await mutate(f.owner, "post", `/api/v1/projects/${f.projectId}/change-requests`, { title: "Withdraw me" }).expect(201);
    const changed = await mutate(f.owner, "put", `/api/v1/projects/${f.projectId}/change-requests/${second.body.requestId}/draft`, {
      revisionToken: second.body.draft.revisionToken, title: "Withdraw me", rationale: "Rename.", groups: second.body.draft.groups,
      requirements: second.body.draft.requirements.map((item: { title: string }) => ({ ...item, title: "Renamed" })),
    }).expect(200);
    const submitted = await mutate(f.owner, "post", `/api/v1/projects/${f.projectId}/change-requests/${second.body.requestId}/submissions`, { revisionToken: changed.body.draft.revisionToken, confirmed: true }).expect(201);
    await mutate(f.owner, "post", `/api/v1/projects/${f.projectId}/change-requests/${second.body.requestId}/proposals/${submitted.body.proposalId}/withdrawal`, { confirmed: true, reason: "Provider review." }).expect(200);
    await mutate(f.member, "post", `/api/v1/projects/${f.projectId}/change-requests/${second.body.requestId}/cancellation`, { confirmed: true, reason: "No longer needed." }).expect(404);
    await mutate(f.owner, "post", `/api/v1/projects/${f.projectId}/change-requests/${second.body.requestId}/cancellation`, { confirmed: true, reason: "No longer needed." }).expect(200);
    expect((await ChangeRequest.findById(second.body.requestId).lean())!.state).toBe("canceled");
    expect(await ChangeProposalDraft.countDocuments({ requestId: second.body.requestId })).toBe(0);
    expect(await ChangeProposal.countDocuments({ requestId: second.body.requestId, outcome: "withdrawn" })).toBe(1);
    await f.outsider.agent.get(`/api/v1/projects/${f.projectId}/change-requests`).expect(404);
  });

  it("commits only the first competing terminal action", async () => {
    const f = await fixture();
    const started = await mutate(f.owner, "post", `/api/v1/projects/${f.projectId}/change-requests`, { title: "Competing decisions" }).expect(201);
    const changed = await mutate(f.owner, "put", `/api/v1/projects/${f.projectId}/change-requests/${started.body.requestId}/draft`, {
      revisionToken: started.body.draft.revisionToken, title: "Competing decisions", rationale: "Change content.", groups: started.body.draft.groups,
      requirements: started.body.draft.requirements.map((item: { description: string }) => ({ ...item, description: "Changed description" })),
    }).expect(200);
    const submitted = await mutate(f.owner, "post", `/api/v1/projects/${f.projectId}/change-requests/${started.body.requestId}/submissions`, { revisionToken: changed.body.draft.revisionToken, confirmed: true }).expect(201);
    const path = `/api/v1/projects/${f.projectId}/change-requests/${started.body.requestId}/proposals/${submitted.body.proposalId}/decisions`;
    const [approval, rejection] = await Promise.all([
      mutate(f.approver, "post", path, { outcome: "approved", confirmed: true }),
      mutate(f.approver, "post", path, { outcome: "rejected", confirmed: true, note: "Not acceptable." }),
    ]);
    expect([approval.status, rejection.status].sort()).toEqual([200, 409]);
    expect(await ChangeDecision.countDocuments({ proposalId: submitted.body.proposalId })).toBe(1);
    expect(await ScopeVersion.countDocuments({ projectId: f.projectId, status: "approved" })).toBe(1);
    expect(await ChangeProposal.countDocuments({ _id: submitted.body.proposalId, open: true })).toBe(0);
  });

  it("rolls back a failed submission without consuming history or numbering", async () => {
    const f = await fixture(); const draft = await materialProposalDraft(f, "Submission rollback");
    const activityBefore = await Activity.countDocuments({ projectId: f.projectId });
    const failure = vi.spyOn(ChangeItem, "insertMany").mockRejectedValueOnce(new Error("injected comparison failure"));
    try {
      await mutate(f.owner, "post", `/api/v1/projects/${f.projectId}/change-requests/${draft.requestId}/submissions`, { revisionToken: draft.revisionToken, confirmed: true }).expect(500);
    } finally { failure.mockRestore(); }
    expect(await ChangeProposal.countDocuments({ requestId: draft.requestId })).toBe(0);
    expect(await ChangeItem.countDocuments({ requestId: draft.requestId })).toBe(0);
    expect(await ChangeProposalDraft.countDocuments({ requestId: draft.requestId, revisionToken: draft.revisionToken })).toBe(1);
    expect(await ChangeRequest.findById(draft.requestId).lean()).toMatchObject({ state: "draft", active: true });
    expect((await ChangeRequest.findById(draft.requestId).lean())!.number).toBeUndefined();
    expect(await Activity.countDocuments({ projectId: f.projectId })).toBe(activityBefore);
    const retry = await mutate(f.owner, "post", `/api/v1/projects/${f.projectId}/change-requests/${draft.requestId}/submissions`, { revisionToken: draft.revisionToken, confirmed: true }).expect(201);
    expect(retry.body).toMatchObject({ requestNumber: 1, proposalNumber: 1 });
  });

  it("rolls back copied-draft and successor failures before a terminal outcome can escape", async () => {
    const f = await fixture(); const first = await materialProposalDraft(f, "Copied draft rollback");
    const submitted = await mutate(f.owner, "post", `/api/v1/projects/${f.projectId}/change-requests/${first.requestId}/submissions`, { revisionToken: first.revisionToken, confirmed: true }).expect(201);
    const copiedDraftFailure = vi.spyOn(ChangeProposalDraft.prototype, "save").mockRejectedValueOnce(new Error("injected copied draft failure"));
    try {
      await mutate(f.approver, "post", `/api/v1/projects/${f.projectId}/change-requests/${first.requestId}/proposals/${submitted.body.proposalId}/decisions`, { outcome: "changes-requested", confirmed: true, note: "Revise this." }).expect(500);
    } finally { copiedDraftFailure.mockRestore(); }
    expect(await ChangeDecision.countDocuments({ proposalId: submitted.body.proposalId })).toBe(0);
    expect(await ChangeProposalDraft.countDocuments({ requestId: first.requestId })).toBe(0);
    expect(await ChangeProposal.findById(submitted.body.proposalId).lean()).toMatchObject({ outcome: "in-review", open: true });
    expect(await ChangeRequest.findById(first.requestId).lean()).toMatchObject({ state: "in-review", active: true });

    const approvalFailure = vi.spyOn(ScopeVersion.prototype, "save").mockRejectedValueOnce(new Error("injected successor failure"));
    try {
      await mutate(f.approver, "post", `/api/v1/projects/${f.projectId}/change-requests/${first.requestId}/proposals/${submitted.body.proposalId}/decisions`, { outcome: "approved", confirmed: true }).expect(500);
    } finally { approvalFailure.mockRestore(); }
    expect(await ChangeDecision.countDocuments({ proposalId: submitted.body.proposalId })).toBe(0);
    expect(await ScopeVersion.countDocuments({ projectId: f.projectId })).toBe(1);
    expect(await ScopeVersion.findById(f.base._id).lean()).toMatchObject({ status: "approved" });
    expect(await ChangeProposal.findById(submitted.body.proposalId).lean()).toMatchObject({ outcome: "in-review", open: true });
    expect(await ChangeRequest.findById(first.requestId).lean()).toMatchObject({ state: "in-review", active: true });
  });

  it("keeps committed state authoritative when notification delivery fails", async () => {
    const f = await fixture(); const draft = await materialProposalDraft(f, "Email failure"); email.throws = true;
    const submitted = await mutate(f.owner, "post", `/api/v1/projects/${f.projectId}/change-requests/${draft.requestId}/submissions`, { revisionToken: draft.revisionToken, confirmed: true }).expect(201);
    expect(submitted.body.warning).toMatch(/saved/iu);
    expect(await ChangeProposal.findById(submitted.body.proposalId).lean()).toMatchObject({ outcome: "in-review", open: true });
    expect(await ChangeRequest.findById(draft.requestId).lean()).toMatchObject({ state: "in-review", active: true, number: 1 });
    expect(email.sent.filter((item) => item.category === "scope-review").map((item) => item.to)).toEqual([f.approver.email]);
    expect(email.sent.filter((item) => item.category === "scope-review").some((item) => item.to === f.participant.email || item.to === f.outsider.email)).toBe(false);
  });

  it("rejects stale draft writes, foreign item targets, and authority removed before action", async () => {
    const f = await fixture(); const draft = await materialProposalDraft(f, "Current authority");
    const current = await f.owner.agent.get(`/api/v1/projects/${f.projectId}/change-requests`).expect(200);
    const savedDraft = current.body.changeControl.requests[0].draft;
    await mutate(f.owner, "put", `/api/v1/projects/${f.projectId}/change-requests/${draft.requestId}/draft`, {
      revisionToken: savedDraft.revisionToken, title: "Current authority", rationale: savedDraft.rationale, groups: savedDraft.groups,
      requirements: savedDraft.requirements.map((item: { title: string }) => ({ ...item, title: "First writer" })),
    }).expect(200);
    await mutate(f.owner, "put", `/api/v1/projects/${f.projectId}/change-requests/${draft.requestId}/draft`, {
      revisionToken: savedDraft.revisionToken, title: "Current authority", rationale: savedDraft.rationale, groups: savedDraft.groups, requirements: savedDraft.requirements,
    }).expect(409);
    const latest = (await f.owner.agent.get(`/api/v1/projects/${f.projectId}/change-requests`).expect(200)).body.changeControl.requests[0].draft;
    const submitted = await mutate(f.owner, "post", `/api/v1/projects/${f.projectId}/change-requests/${draft.requestId}/submissions`, { revisionToken: latest.revisionToken, confirmed: true }).expect(201);
    await mutate(f.participant, "post", `/api/v1/projects/${f.projectId}/change-requests/${draft.requestId}/proposals/${submitted.body.proposalId}/comments`, {
      body: "Invalid target", comparisonKind: "base-scope", changeItemId: String(new mongoose.Types.ObjectId()),
    }).expect(400);
    await EffectiveProjectAccess.deleteOne({ projectId: f.projectId, userId: f.approver.id });
    await mutate(f.approver, "post", `/api/v1/projects/${f.projectId}/change-requests/${draft.requestId}/proposals/${submitted.body.proposalId}/decisions`, { outcome: "approved", confirmed: true }).expect(404);
    expect(await ChangeDecision.countDocuments({ proposalId: submitted.body.proposalId })).toBe(0);
    expect(await ScopeVersion.findById(f.base._id).lean()).toMatchObject({ status: "approved" });
  });

  it("rolls back approval when decision persistence fails", async () => {
    const f = await fixture(); const submitted = await submittedMaterialProposal(f, "Decision rollback");
    const failure = vi.spyOn(ChangeDecision.prototype, "save").mockRejectedValueOnce(new Error("injected decision failure"));
    try {
      await mutate(f.approver, "post", `/api/v1/projects/${f.projectId}/change-requests/${submitted.requestId}/proposals/${submitted.proposalId}/decisions`, { outcome: "approved", confirmed: true }).expect(500);
    } finally { failure.mockRestore(); }
    await expectApprovalRolledBack(f, submitted.requestId, submitted.proposalId);
  });

  it("rolls back approval when scope-number allocation fails", async () => {
    const f = await fixture(); const submitted = await submittedMaterialProposal(f, "Number rollback");
    const baseQuery = ScopeVersion.findOne({ _id: f.base._id, projectId: f.projectId, status: "approved" });
    const failure = vi.spyOn(ScopeVersion, "findOne")
      .mockImplementationOnce(() => baseQuery)
      .mockImplementationOnce(() => { throw new Error("injected scope-number failure"); });
    try {
      await mutate(f.approver, "post", `/api/v1/projects/${f.projectId}/change-requests/${submitted.requestId}/proposals/${submitted.proposalId}/decisions`, { outcome: "approved", confirmed: true }).expect(500);
    } finally { failure.mockRestore(); }
    await expectApprovalRolledBack(f, submitted.requestId, submitted.proposalId);
  });

  it("rolls back approval when base supersession fails", async () => {
    const f = await fixture(); const submitted = await submittedMaterialProposal(f, "Supersession rollback");
    const failure = vi.spyOn(ScopeVersion, "updateOne").mockRejectedValueOnce(new Error("injected supersession failure"));
    try {
      await mutate(f.approver, "post", `/api/v1/projects/${f.projectId}/change-requests/${submitted.requestId}/proposals/${submitted.proposalId}/decisions`, { outcome: "approved", confirmed: true }).expect(500);
    } finally { failure.mockRestore(); }
    await expectApprovalRolledBack(f, submitted.requestId, submitted.proposalId);
  });

  it("rolls back approval when proposal or request closure fails", async () => {
    const f = await fixture(); const proposalFailureCase = await submittedMaterialProposal(f, "Proposal closure rollback");
    const proposalFailure = vi.spyOn(ChangeProposal, "updateOne").mockRejectedValueOnce(new Error("injected proposal closure failure"));
    try {
      await mutate(f.approver, "post", `/api/v1/projects/${f.projectId}/change-requests/${proposalFailureCase.requestId}/proposals/${proposalFailureCase.proposalId}/decisions`, { outcome: "approved", confirmed: true }).expect(500);
    } finally { proposalFailure.mockRestore(); }
    await expectApprovalRolledBack(f, proposalFailureCase.requestId, proposalFailureCase.proposalId);

    const requestFailure = vi.spyOn(ChangeRequest, "updateOne").mockRejectedValueOnce(new Error("injected request closure failure"));
    try {
      await mutate(f.approver, "post", `/api/v1/projects/${f.projectId}/change-requests/${proposalFailureCase.requestId}/proposals/${proposalFailureCase.proposalId}/decisions`, { outcome: "approved", confirmed: true }).expect(500);
    } finally { requestFailure.mockRestore(); }
    await expectApprovalRolledBack(f, proposalFailureCase.requestId, proposalFailureCase.proposalId);
  });

  it("rolls back approval when activity persistence fails and succeeds exactly on retry", async () => {
    const f = await fixture(); const submitted = await submittedMaterialProposal(f, "Activity rollback");
    const failure = vi.spyOn(Activity.prototype, "save").mockRejectedValueOnce(new Error("injected activity failure"));
    try {
      await mutate(f.approver, "post", `/api/v1/projects/${f.projectId}/change-requests/${submitted.requestId}/proposals/${submitted.proposalId}/decisions`, { outcome: "approved", confirmed: true }).expect(500);
    } finally { failure.mockRestore(); }
    await expectApprovalRolledBack(f, submitted.requestId, submitted.proposalId);
    await mutate(f.approver, "post", `/api/v1/projects/${f.projectId}/change-requests/${submitted.requestId}/proposals/${submitted.proposalId}/decisions`, { outcome: "approved", confirmed: true }).expect(200);
    const scopes = await ScopeVersion.find({ projectId: f.projectId }).sort({ number: 1 }).lean();
    expect(scopes).toHaveLength(2);
    expect(scopes[0]).toMatchObject({ status: "superseded", successorScopeVersionId: scopes[1]!._id, supersededByChangeRequestId: new mongoose.Types.ObjectId(submitted.requestId), supersededByProposalId: new mongoose.Types.ObjectId(submitted.proposalId) });
    expect(scopes[1]).toMatchObject({ status: "approved", basedOnScopeVersionId: f.base._id, approvedFromChangeRequestId: new mongoose.Types.ObjectId(submitted.requestId), approvedFromProposalId: new mongoose.Types.ObjectId(submitted.proposalId) });
    expect(await ChangeDecision.countDocuments({ proposalId: submitted.proposalId })).toBe(1);
    expect(await Activity.countDocuments({ projectId: f.projectId, action: "change-request.approved" })).toBe(1);
  });
});
