import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import {
  AssetCleanupWork, Deliverable, DeliverableComment, DeliverableDraft, DeliverableOutcome, DeliverableProjectState,
  DeliverableVersion, PrivateAsset, UploadReservation,
} from "../src/domain/deliverable-models.js";
import type { EmailCommand, EmailService } from "../src/domain/email.js";
import {
  AccountToken, Activity, Client, ClientMembership, EffectiveProjectAccess, Invitation, Project, ProjectAssignment,
  Session, syncDomainIndexes, Throttle, User, Workspace, WorkspaceMembership,
} from "../src/domain/models.js";
import { DeterministicPrivateAssetStorage } from "../src/domain/private-asset-storage.js";
import { ScopeVersion } from "../src/domain/scope-models.js";

process.env.NODE_ENV = "test"; process.env.FRONTEND_ORIGIN = "http://localhost:3000"; process.env.SESSION_SECRET = "test-session-secret-with-at-least-32-characters"; process.env.AUTH_THROTTLE_LIMIT = "1000";

class FakeEmail implements EmailService {
  readonly sent: EmailCommand[] = [];
  async send(command: EmailCommand) { this.sent.push(command); return { delivered: true }; }
  token(to: string) { const token = [...this.sent].reverse().find((item) => item.category === "verification" && item.to === to)?.text.match(/token=([A-Za-z0-9_-]+)/u)?.[1]; if (!token) throw new Error("missing token"); return token; }
}
type Agent = ReturnType<typeof request.agent>; type Account = { agent: Agent; csrf: string; id: string };
let database: MongoMemoryReplSet; let email: FakeEmail; let storage: DeterministicPrivateAssetStorage;
async function signup(address: string, displayName: string): Promise<Account> {
  const agent = request.agent(createApp({ emailService: email, privateAssetStorage: storage })); let csrf = (await agent.get("/api/v1/csrf")).body.csrfToken as string;
  const signupResult = await agent.post("/api/v1/auth/signup").set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).send({ email: address, displayName, password: "correct horse battery staple" }).expect(202); csrf = signupResult.body.csrfToken;
  const id = (await agent.get("/api/v1/auth/session")).body.user.id as string; await agent.post("/api/v1/auth/verify").set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).send({ token: email.token(address) }).expect(200); return { agent, csrf, id };
}
function mutate(account: Account, method: "post" | "put", path: string, body: unknown) { return account.agent[method](path).set("Origin", "http://localhost:3000").set("X-CSRF-Token", account.csrf).send(body as object); }
async function fixture(approved = true) {
  const owner = await signup("delivery-owner@example.com", "Owner"); const member = await signup("delivery-member@example.com", "Member"); const approver = await signup("delivery-approver@example.com", "Approver"); const participant = await signup("delivery-participant@example.com", "Participant"); const outsider = await signup("delivery-outsider@example.com", "Outsider");
  const workspace = await Workspace.create({ name: "Studio", ownerId: owner.id }); const client = await Client.create({ workspaceId: workspace._id, name: "Client", projectCount: 1 }); const project = await Project.create({ workspaceId: workspace._id, clientId: client._id, name: "Website" });
  await WorkspaceMembership.create({ workspaceId: workspace._id, userId: member.id, role: "service-team-member", status: "active", startedAt: new Date() }); const assignment = await ProjectAssignment.create({ workspaceId: workspace._id, projectId: project._id, userId: member.id, status: "active", startedAt: new Date() });
  const approverMembership = await ClientMembership.create({ workspaceId: workspace._id, projectId: project._id, userId: approver.id, role: "client-approver", status: "active", startedAt: new Date() }); const participantMembership = await ClientMembership.create({ workspaceId: workspace._id, projectId: project._id, userId: participant.id, role: "client-participant", status: "active", startedAt: new Date() });
  await EffectiveProjectAccess.create([{ workspaceId: workspace._id, projectId: project._id, userId: member.id, role: "service-team-member", sourceId: assignment._id }, { workspaceId: workspace._id, projectId: project._id, userId: approver.id, role: "client-approver", sourceId: approverMembership._id }, { workspaceId: workspace._id, projectId: project._id, userId: participant.id, role: "client-participant", sourceId: participantMembership._id }]);
  if (approved) await ScopeVersion.create({ workspaceId: workspace._id, projectId: project._id, number: 1, status: "approved", groups: [], requirements: [], submitterId: owner.id, submitterName: "Owner", submitterRole: "workspace-owner", submittedAt: new Date() });
  return { owner, member, approver, participant, outsider, workspace, project };
}

beforeAll(async () => { vi.spyOn(console, "info").mockImplementation(() => undefined); vi.spyOn(console, "warn").mockImplementation(() => undefined); vi.spyOn(console, "error").mockImplementation(() => undefined); database = await MongoMemoryReplSet.create({ replSet: { count: 1 } }); await mongoose.connect(database.getUri()); await syncDomainIndexes(); }, 300_000);
beforeEach(async () => { email = new FakeEmail(); storage = new DeterministicPrivateAssetStorage(); await Promise.all([AccountToken.deleteMany({}), Activity.deleteMany({}), AssetCleanupWork.deleteMany({}), Client.deleteMany({}), ClientMembership.deleteMany({}), Deliverable.deleteMany({}), DeliverableComment.deleteMany({}), DeliverableDraft.deleteMany({}), DeliverableOutcome.deleteMany({}), DeliverableProjectState.deleteMany({}), DeliverableVersion.deleteMany({}), EffectiveProjectAccess.deleteMany({}), Invitation.deleteMany({}), PrivateAsset.deleteMany({}), Project.deleteMany({}), ProjectAssignment.deleteMany({}), ScopeVersion.deleteMany({}), Session.deleteMany({}), Throttle.deleteMany({}), UploadReservation.deleteMany({}), User.deleteMany({}), Workspace.deleteMany({}), WorkspaceMembership.deleteMany({})]); });
afterAll(async () => { await mongoose.disconnect(); await database.stop(); });

describe("Slice 1.5 deliverable API", () => {
  it("keeps drafts private and completes link submission, participant comment, revision, resubmission, and terminal approval", async () => {
    const f = await fixture(); const projectId = String(f.project._id);
    const created = await mutate(f.owner, "post", `/api/v1/projects/${projectId}/deliverables`, { title: " Homepage package " }).expect(201); const id = created.body.deliverable.id as string; const token = created.body.deliverable.draft.revisionToken as string;
    expect(created.body.deliverable).toMatchObject({ state: "draft", title: "Homepage package" }); expect(created.body.deliverable).not.toHaveProperty("number");
    const clientBefore = await f.participant.agent.get(`/api/v1/projects/${projectId}/deliverables`).expect(200); expect(clientBefore.body.deliverables.deliverables).toEqual([]);
    const linkId = new mongoose.Types.ObjectId().toString(); const saved = await mutate(f.member, "put", `/api/v1/projects/${projectId}/deliverables/${id}/draft`, { revisionToken: token, title: "Homepage final", notes: "Review the responsive page.", revisionSummary: "", links: [{ id: linkId, label: "Staging", url: "https://example.com/staging", order: 0 }], attachmentIds: [] }).expect(200);
    const submitted = await mutate(f.owner, "post", `/api/v1/projects/${projectId}/deliverables/${id}/submissions`, { revisionToken: saved.body.deliverable.draft.revisionToken, confirmed: true }).expect(201);
    expect(submitted.body.version).toMatchObject({ number: 1, outcome: "in-review", title: "Homepage final", scopeVersion: { number: 1 } }); expect(email.sent.filter((item) => item.category === "deliverable-review")).toHaveLength(2);
    const clientRead = await f.participant.agent.get(`/api/v1/projects/${projectId}/deliverables`).expect(200); const clientItem = clientRead.body.deliverables.deliverables[0]; expect(clientItem).not.toHaveProperty("draft"); expect(clientItem.permissions).toMatchObject({ canComment: true, canDecide: false });
    await mutate(f.participant, "post", `/api/v1/projects/${projectId}/deliverables/${id}/versions/${submitted.body.version.id}/comments`, { body: "Please increase the mobile spacing." }).expect(201);
    await mutate(f.participant, "post", `/api/v1/projects/${projectId}/deliverables/${id}/versions/${submitted.body.version.id}/decisions`, { confirmed: true, outcome: "approved", note: "" }).expect(404);
    await mutate(f.approver, "post", `/api/v1/projects/${projectId}/deliverables/${id}/versions/${submitted.body.version.id}/decisions`, { confirmed: true, outcome: "changes-requested", note: "Increase spacing around the mobile call to action." }).expect(200);
    const revision = (await f.member.agent.get(`/api/v1/projects/${projectId}/deliverables`).expect(200)).body.deliverables.deliverables[0]; expect(revision).toMatchObject({ state: "revision-draft", number: 1, draft: { copiedFromVersionId: submitted.body.version.id, notes: "Review the responsive page." } });
    const clientRevision = (await f.participant.agent.get(`/api/v1/projects/${projectId}/deliverables`).expect(200)).body.deliverables.deliverables[0]; expect(clientRevision).not.toHaveProperty("draft"); expect(clientRevision.state).toBe("revision-draft");
    const revisionSaved = await mutate(f.member, "put", `/api/v1/projects/${projectId}/deliverables/${id}/draft`, { revisionToken: revision.draft.revisionToken, notes: "Updated responsive page.", revisionSummary: "Increased mobile spacing.", links: revision.draft.links, attachmentIds: [] }).expect(200);
    const second = await mutate(f.member, "post", `/api/v1/projects/${projectId}/deliverables/${id}/submissions`, { revisionToken: revisionSaved.body.deliverable.draft.revisionToken, confirmed: true }).expect(201); expect(second.body.version.number).toBe(2);
    const decisionPath = `/api/v1/projects/${projectId}/deliverables/${id}/versions/${second.body.version.id}/decisions`;
    const [winningDecision, losingDecision] = await Promise.all([
      mutate(f.approver, "post", decisionPath, { confirmed: true, outcome: "approved", note: "Ready to ship." }),
      mutate(f.approver, "post", decisionPath, { confirmed: true, outcome: "approved", note: "Ready to ship." }),
    ]);
    expect([winningDecision.status, losingDecision.status].sort()).toEqual([200, 409]);
    const terminal = await f.owner.agent.get(`/api/v1/projects/${projectId}/deliverables/history`).expect(200); expect(terminal.body.history.deliverables[0]).toMatchObject({ number: 1, state: "approved", title: "Homepage final" }); expect(terminal.body.history.deliverables[0].permissions).toMatchObject({ canCancel: false, canWithdraw: false });
    const versions = await f.owner.agent.get(`/api/v1/projects/${projectId}/deliverables/${id}/versions`).expect(200); expect(versions.body.history.versions.map((item: { number: number }) => item.number)).toEqual([2, 1]); expect(versions.body.history.versions[1]).toMatchObject({ outcome: "changes-requested", notes: "Review the responsive page." });
    const comments = await f.owner.agent.get(`/api/v1/projects/${projectId}/deliverables/${id}/versions/${submitted.body.version.id}/comments`).expect(200); expect(comments.body.history.comments).toHaveLength(1);
    expect(await Activity.countDocuments({ projectId, action: { $in: ["deliverable.submitted", "deliverable.commented", "deliverable.revision-requested", "deliverable.approved"] } })).toBe(5);
    await f.outsider.agent.get(`/api/v1/projects/${projectId}/deliverables`).expect(404);
  });

  it("verifies a private upload, preserves historical references, and requires withdrawal before cancellation", async () => {
    const f = await fixture(); const projectId = String(f.project._id); const created = await mutate(f.owner, "post", `/api/v1/projects/${projectId}/deliverables`, { title: "Source bundle" }).expect(201); const id = created.body.deliverable.id; let token = created.body.deliverable.draft.revisionToken;
    const auth = await mutate(f.owner, "post", `/api/v1/projects/${projectId}/deliverables/${id}/uploads/authorization`, { revisionToken: token, filename: "preview.png", mediaType: "image/png", byteSize: 1024 }).expect(201);
    const finalized = await mutate(f.owner, "post", `/api/v1/projects/${projectId}/deliverables/${id}/uploads/finalization`, { revisionToken: token, reservationId: auth.body.reservationId, providerResult: { token: auth.body.fields.token, private: true, mediaType: "image/png", byteSize: 1024 } }).expect(201); token = finalized.body.deliverable.draft.revisionToken;
    await mutate(f.owner, "post", `/api/v1/projects/${projectId}/deliverables/${id}/uploads/finalization`, { revisionToken: token, reservationId: auth.body.reservationId, providerResult: { token: auth.body.fields.token, private: true, mediaType: "image/png", byteSize: 1024 } }).expect(409);
    const submitted = await mutate(f.owner, "post", `/api/v1/projects/${projectId}/deliverables/${id}/submissions`, { revisionToken: token, confirmed: true }).expect(201); const attachment = submitted.body.version.attachments[0]; expect(attachment).toMatchObject({ filename: "preview.png", preview: true }); expect(JSON.stringify(submitted.body)).not.toContain("providerIdentifier");
    const access = await mutate(f.participant, "post", `/api/v1/projects/${projectId}/deliverables/${id}/versions/${submitted.body.version.id}/attachments/${attachment.id}/access`, {}).expect(200); expect(access.body).toMatchObject({ preview: true, filename: "preview.png" });
    await mutate(f.outsider, "post", `/api/v1/projects/${projectId}/deliverables/${id}/versions/${submitted.body.version.id}/attachments/${attachment.id}/access`, {}).expect(404);
    await mutate(f.owner, "post", `/api/v1/projects/${projectId}/deliverables/${id}/cancellation`, { confirmed: true, reason: "Not needed." }).expect(409);
    await mutate(f.owner, "post", `/api/v1/projects/${projectId}/deliverables/${id}/versions/${submitted.body.version.id}/withdrawal`, { confirmed: true, reason: "Replacing the package." }).expect(200);
    const revision = (await f.owner.agent.get(`/api/v1/projects/${projectId}/deliverables`).expect(200)).body.deliverables.deliverables[0]; expect(revision.draft.attachments).toHaveLength(1);
    await mutate(f.owner, "post", `/api/v1/projects/${projectId}/deliverables/${id}/attachments/${revision.draft.attachments[0].id}/detach`, { revisionToken: revision.draft.revisionToken }).expect(200);
    await mutate(f.owner, "post", `/api/v1/projects/${projectId}/deliverables/${id}/cancellation`, { confirmed: true, reason: "Delivery moved outside the project." }).expect(200);
    expect(await PrivateAsset.countDocuments({ lifecycle: "finalized" })).toBe(1); expect(await AssetCleanupWork.countDocuments()).toBe(0);
    await mutate(f.participant, "post", `/api/v1/projects/${projectId}/deliverables/${id}/versions/${submitted.body.version.id}/attachments/${attachment.id}/access`, {}).expect(200);
  });

  it("enforces the approved-scope gate, optimistic tokens, limit, and atomic activity writes", async () => {
    const noScope = await fixture(false); const noScopeId = String(noScope.project._id); const read = await noScope.owner.agent.get(`/api/v1/projects/${noScopeId}/deliverables`).expect(200); expect(read.body.deliverables).toMatchObject({ available: false, openCount: 0 }); await mutate(noScope.owner, "post", `/api/v1/projects/${noScopeId}/deliverables`, { title: "Blocked" }).expect(409);
    await Promise.all([User.deleteMany({}), Workspace.deleteMany({}), Client.deleteMany({}), Project.deleteMany({}), WorkspaceMembership.deleteMany({}), ProjectAssignment.deleteMany({}), ClientMembership.deleteMany({}), EffectiveProjectAccess.deleteMany({}), ScopeVersion.deleteMany({}), Session.deleteMany({}), AccountToken.deleteMany({}), Deliverable.deleteMany({}), DeliverableDraft.deleteMany({}), DeliverableProjectState.deleteMany({})]); email = new FakeEmail(); const f = await fixture(); const projectId = String(f.project._id);
    const created = await mutate(f.owner, "post", `/api/v1/projects/${projectId}/deliverables`, { title: "Concurrency" }).expect(201); const id = created.body.deliverable.id; const token = created.body.deliverable.draft.revisionToken; const payload = { revisionToken: token, title: "Updated", notes: "", revisionSummary: "", links: [], attachmentIds: [] };
    const [first, second] = await Promise.all([mutate(f.owner, "put", `/api/v1/projects/${projectId}/deliverables/${id}/draft`, payload), mutate(f.member, "put", `/api/v1/projects/${projectId}/deliverables/${id}/draft`, payload)]); expect([first.status, second.status].sort()).toEqual([200, 409]);
    const failure = vi.spyOn(Activity.prototype, "save").mockRejectedValueOnce(new Error("injected")); const current = (await f.owner.agent.get(`/api/v1/projects/${projectId}/deliverables`).expect(200)).body.deliverables.deliverables[0]; const linkId = new mongoose.Types.ObjectId().toString(); const saved = await mutate(f.owner, "put", `/api/v1/projects/${projectId}/deliverables/${id}/draft`, { revisionToken: current.draft.revisionToken, title: "Updated", notes: "", revisionSummary: "", links: [{ id: linkId, label: "Review", url: "https://example.com", order: 0 }], attachmentIds: [] }).expect(200);
    try { await mutate(f.owner, "post", `/api/v1/projects/${projectId}/deliverables/${id}/submissions`, { revisionToken: saved.body.deliverable.draft.revisionToken, confirmed: true }).expect(500); } finally { failure.mockRestore(); }
    expect(await DeliverableVersion.countDocuments({ deliverableId: id })).toBe(0); expect((await Deliverable.findById(id))!.number).toBeUndefined(); expect((await DeliverableProjectState.findOne({ projectId }))!.nextDeliverableNumber).toBe(0);
    await DeliverableProjectState.updateOne({ projectId }, { $set: { openCount: 49 } });
    const [lastSlot, overLimit] = await Promise.all([
      mutate(f.owner, "post", `/api/v1/projects/${projectId}/deliverables`, { title: "Last slot A" }),
      mutate(f.member, "post", `/api/v1/projects/${projectId}/deliverables`, { title: "Last slot B" }),
    ]);
    expect([lastSlot.status, overLimit.status].sort()).toEqual([201, 409]);
    expect((await DeliverableProjectState.findOne({ projectId }))!.openCount).toBe(50);
  });
});
