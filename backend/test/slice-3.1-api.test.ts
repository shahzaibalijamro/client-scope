import AdmZip from "adm-zip";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import type { Response as SuperAgentResponse } from "superagent";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { Deliverable, DeliverableVersion, PrivateAsset } from "../src/domain/deliverable-models.js";
import type { EmailCommand, EmailService } from "../src/domain/email.js";
import { AccountToken, Activity, Client, ClientMembership, EffectiveProjectAccess, Project, ProjectAssignment, Session, syncDomainIndexes, Throttle, User, Workspace, WorkspaceMembership } from "../src/domain/models.js";
import { DeterministicPrivateAssetStorage } from "../src/domain/private-asset-storage.js";

process.env.NODE_ENV = "test"; process.env.FRONTEND_ORIGIN = "http://localhost:3000";
process.env.SESSION_SECRET = "test-session-secret-with-at-least-32-characters"; process.env.AUTH_THROTTLE_LIMIT = "1000";

class FakeEmail implements EmailService {
  readonly sent: EmailCommand[] = [];
  async send(command: EmailCommand) { this.sent.push(command); return { delivered: true }; }
  token(to: string) { const text = [...this.sent].reverse().find((item) => item.category === "verification" && item.to === to)?.text; const token = text?.match(/token=([A-Za-z0-9_-]+)/u)?.[1]; if (!token) throw new Error("No verification token"); return token; }
}
class ExportStorage extends DeterministicPrivateAssetStorage {
  beforeRead?: () => Promise<void>; bytes = Buffer.from("approved attachment bytes", "utf8");
  override async read(input: { providerIdentifier: string; byteSize: number; signal?: AbortSignal }) { await this.beforeRead?.(); return this.bytes.subarray(0, input.byteSize); }
}
type Agent = ReturnType<typeof request.agent>; type Account = { agent: Agent; csrf: string; id: string };
let database: MongoMemoryReplSet; let email: FakeEmail; let storage: ExportStorage;
async function csrf(agent: Agent) { return (await agent.get("/api/v1/csrf").expect(200)).body.csrfToken as string; }
async function signup(address: string, name: string, app: ReturnType<typeof createApp>): Promise<Account> {
  const agent = request.agent(app); let token = await csrf(agent); const result = await agent.post("/api/v1/auth/signup").set("Origin", "http://localhost:3000").set("X-CSRF-Token", token).send({ email: address, displayName: name, password: "correct horse battery staple" }).expect(202);
  token = result.body.csrfToken as string; const id = (await agent.get("/api/v1/auth/session").expect(200)).body.user.id as string;
  await agent.post("/api/v1/auth/verify").set("Origin", "http://localhost:3000").set("X-CSRF-Token", token).send({ token: email.token(address) }).expect(200); return { agent, csrf: token, id };
}
function binary(response: SuperAgentResponse, done: (error: Error | null, body: Buffer) => void) { const chunks: Buffer[] = []; response.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk))); response.on("end", () => done(null, Buffer.concat(chunks))); response.on("error", (error: Error) => done(error, Buffer.alloc(0))); }
async function fixture() {
  const app = createApp({ emailService: email, privateAssetStorage: storage });
  const owner = await signup("export-owner@example.com", "Owner", app); const member = await signup("export-member@example.com", "Member", app); const participant = await signup("export-participant@example.com", "Participant", app); const approver = await signup("export-approver@example.com", "Approver", app); const outsider = await signup("export-outsider@example.com", "Outsider", app);
  const workspace = await Workspace.create({ name: "Export Studio", ownerId: owner.id }); const client = await Client.create({ workspaceId: workspace._id, name: "Shared Client", projectCount: 1 }); const project = await Project.create({ workspaceId: workspace._id, clientId: client._id, name: "Portal / Refresh", description: "Shared summary" });
  await WorkspaceMembership.create({ workspaceId: workspace._id, userId: member.id, role: "service-team-member", status: "active", startedAt: new Date() }); const assignment = await ProjectAssignment.create({ workspaceId: workspace._id, projectId: project._id, userId: member.id, status: "active", startedAt: new Date() });
  const participantMembership = await ClientMembership.create({ workspaceId: workspace._id, projectId: project._id, userId: participant.id, role: "client-participant", status: "active", startedAt: new Date() }); const approverMembership = await ClientMembership.create({ workspaceId: workspace._id, projectId: project._id, userId: approver.id, role: "client-approver", status: "active", startedAt: new Date() });
  await EffectiveProjectAccess.create([{ workspaceId: workspace._id, projectId: project._id, userId: member.id, role: "service-team-member", sourceId: assignment._id }, { workspaceId: workspace._id, projectId: project._id, userId: participant.id, role: "client-participant", sourceId: participantMembership._id }, { workspaceId: workspace._id, projectId: project._id, userId: approver.id, role: "client-approver", sourceId: approverMembership._id }]);
  const deliverable = await Deliverable.create({ workspaceId: workspace._id, projectId: project._id, number: 1, title: "Approved package", titleFrozen: true, state: "approved", creatorId: owner.id, creatorName: "Owner", creatorRole: "workspace-owner", nextVersionNumber: 1 }); const assetId = new mongoose.Types.ObjectId(); const attachmentId = new mongoose.Types.ObjectId();
  await DeliverableVersion.create({ workspaceId: workspace._id, projectId: project._id, deliverableId: deliverable._id, number: 1, outcome: "approved", title: deliverable.title, notes: "Shared notes", links: [{ id: new mongoose.Types.ObjectId(), label: "Reference", url: "https://example.com/shared", order: 0 }], attachments: [{ id: attachmentId, assetId, filename: "final/brief.pdf", mediaType: "application/pdf", byteSize: storage.bytes.length, order: 0 }], scopeVersionId: new mongoose.Types.ObjectId(), scopeVersionNumber: 1, submitterId: owner.id, submitterName: "Owner", submitterRole: "workspace-owner", submittedAt: new Date(), commentSequence: 0 });
  await PrivateAsset.create({ _id: assetId, workspaceId: workspace._id, projectId: project._id, deliverableId: deliverable._id, originalDraftId: new mongoose.Types.ObjectId(), providerIdentifier: "private-provider-id", filename: "never-export-provider-name", mediaType: "application/pdf", byteSize: storage.bytes.length, lifecycle: "finalized", finalizedAt: new Date() });
  return { app, project, owner, member, participant, approver, outsider };
}
function download(account: Account, projectId: mongoose.Types.ObjectId) { return account.agent.get(`/api/v1/projects/${projectId}/export`).buffer(true).parse(binary); }

beforeAll(async () => { vi.spyOn(console, "info").mockImplementation(() => undefined); vi.spyOn(console, "warn").mockImplementation(() => undefined); vi.spyOn(console, "error").mockImplementation(() => undefined); database = await MongoMemoryReplSet.create({ replSet: { count: 1 } }); await mongoose.connect(database.getUri()); await syncDomainIndexes(); }, 300_000);
beforeEach(async () => { email = new FakeEmail(); storage = new ExportStorage(); await Promise.all([AccountToken.deleteMany({}), Activity.deleteMany({}), Client.deleteMany({}), ClientMembership.deleteMany({}), Deliverable.deleteMany({}), DeliverableVersion.deleteMany({}), EffectiveProjectAccess.deleteMany({}), PrivateAsset.deleteMany({}), Project.deleteMany({}), ProjectAssignment.deleteMany({}), Session.deleteMany({}), Throttle.deleteMany({}), User.deleteMany({}), Workspace.deleteMany({}), WorkspaceMembership.deleteMany({})]); });
afterAll(async () => { await mongoose.disconnect(); await database.stop(); });

describe("Slice 3.1 project record export API", () => {
  it("returns equivalent, valid archives to every current role in every lifecycle state without mutation", async () => {
    const data = await fixture(); const accounts = [data.owner, data.member, data.participant, data.approver]; const activityBefore = await Activity.countDocuments({ projectId: data.project._id });
    for (const state of ["active", "completion-in-review", "completed", "archived"] as const) {
      await Project.updateOne({ _id: data.project._id }, { $set: { lifecycleState: state } }); let expected: unknown;
      for (const account of accounts) {
        const response = await download(account, data.project._id).expect(200).expect("Content-Type", /application\/zip/u).expect("X-Content-Type-Options", "nosniff").expect("Cache-Control", /no-store/u);
        const zip = new AdmZip(response.body as Buffer); expect(zip.getEntries().map((entry) => entry.entryName)).toEqual(["project-record.pdf", "manifest.json", "attachments/deliverable-1/version-1/0-final-brief.pdf"]); expect(zip.readFile("project-record.pdf")?.subarray(0, 4).toString()).toBe("%PDF"); expect(zip.readFile("attachments/deliverable-1/version-1/0-final-brief.pdf")).toEqual(storage.bytes);
        const manifest = JSON.parse(zip.readAsText("manifest.json")); expect(manifest).toMatchObject({ schemaVersion: "clientscope-project-record-v1", lifecycleState: state, complete: true, includedFileBytes: storage.bytes.length }); expect(JSON.stringify(manifest)).not.toMatch(/provider|storage|email|signed/iu);
        const comparable = { ...manifest, generatedAt: undefined, dataCutoff: undefined }; expected ??= comparable; expect(comparable).toEqual(expected);
      }
    }
    expect(await Activity.countDocuments({ projectId: data.project._id })).toBe(activityBefore); expect(await Project.countDocuments({ _id: data.project._id })).toBe(1);
    await download(data.outsider, data.project._id).expect(404); await request(data.app).get(`/api/v1/projects/${data.project._id}/export`).expect(401); await data.owner.agent.get("/api/v1/projects/not-an-id/export").expect(404);
  }, 60_000);

  it("sends no archive bytes when membership is revoked during preparation", async () => {
    const data = await fixture(); storage.beforeRead = async () => { await EffectiveProjectAccess.deleteOne({ projectId: data.project._id, userId: data.member.id }); };
    const response = await download(data.member, data.project._id).expect(404); expect(response.headers["content-type"]).toMatch(/application\/json/u); expect((response.body as Buffer).subarray(0, 2).toString()).not.toBe("PK"); expect(JSON.parse((response.body as Buffer).toString()).error.code).toBe("NOT_FOUND");
  });

  it("returns a usable incomplete archive when a private file fails integrity verification", async () => {
    const data = await fixture(); storage.bytes = Buffer.from("short", "utf8");
    const response = await download(data.owner, data.project._id).expect(200).expect("X-Project-Export-Complete", "false"); const zip = new AdmZip(response.body as Buffer);
    expect(zip.getEntries().map((entry) => entry.entryName)).toEqual(["project-record.pdf", "manifest.json"]);
    const manifest = JSON.parse(zip.readAsText("manifest.json")); expect(manifest).toMatchObject({ complete: false, includedFileBytes: 0, attachments: [{ status: "omitted", omissionReason: "integrity_failure" }] });
    expect(zip.readFile("project-record.pdf")?.subarray(0, 4).toString()).toBe("%PDF");
  });
});
