import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import type { EmailCommand, EmailService } from "../src/domain/email.js";
import { AiGenerationLedger, AiRequirementProposal } from "../src/domain/ai-requirement-models.js";
import type { RequirementOutputCapacity, RequirementStructuringProvider } from "../src/domain/ai-requirement-provider.js";
import { AiProviderError } from "../src/domain/ai-requirement-provider.js";
import {
  AccountToken, Activity, Client, ClientMembership, EffectiveProjectAccess, Invitation, Project, ProjectAssignment,
  Session, syncDomainIndexes, Throttle, User, Workspace, WorkspaceMembership,
} from "../src/domain/models.js";
import { ScopeDraft } from "../src/domain/scope-models.js";

process.env.NODE_ENV = "test";
process.env.FRONTEND_ORIGIN = "http://localhost:3000";
process.env.SESSION_SECRET = "test-session-secret-with-at-least-32-characters";
process.env.AUTH_THROTTLE_LIMIT = "1000";

class FakeEmail implements EmailService {
  readonly sent: EmailCommand[] = [];
  async send(command: EmailCommand) { this.sent.push(command); return { delivered: true }; }
  token(to: string) {
    const text = [...this.sent].reverse().find((item) => item.category === "verification" && item.to === to)?.text;
    const token = text?.match(/token=([A-Za-z0-9_-]+)/u)?.[1];
    if (!token) throw new Error("No verification token");
    return token;
  }
}

class FakeProvider implements RequirementStructuringProvider {
  readonly available = true;
  calls: Array<{ source: string; capacity: RequirementOutputCapacity }> = [];
  async generate(source: string, capacity: RequirementOutputCapacity) {
    this.calls.push({ source, capacity });
    return {
      output: {
        groups: capacity.groups ? [{ key: "generated_group", name: "Generated core" }] : [],
        requirements: [{ key: "generated_requirement", ...(capacity.groups ? { groupKey: "generated_group" } : {}), title: "Generated homepage", description: "Provide the requested homepage.", acceptanceCriteria: ["The homepage is available."] }],
        warnings: [{ category: "ambiguity" as const, message: "No delivery date was supplied." }],
      },
      operationId: `operation-${this.calls.length}`, providerId: "fake", modelId: "fake-model", durationMs: 2,
    };
  }
}

type Agent = ReturnType<typeof request.agent>;
type Account = { agent: Agent; csrf: string; id: string };
let database: MongoMemoryReplSet;
let email: FakeEmail;
let provider: FakeProvider;

async function csrf(agent: Agent) { return (await agent.get("/api/v1/csrf").expect(200)).body.csrfToken as string; }
function mutate(account: Account, method: "post" | "put", path: string, body: unknown) {
  return account.agent[method](path).set("Origin", "http://localhost:3000").set("X-CSRF-Token", account.csrf).send(body as object);
}
async function signup(address: string, name: string, app = createApp({ emailService: email, requirementStructuringProvider: provider })): Promise<Account> {
  const agent = request.agent(app); let token = await csrf(agent);
  const result = await agent.post("/api/v1/auth/signup").set("Origin", "http://localhost:3000").set("X-CSRF-Token", token)
    .send({ email: address, displayName: name, password: "correct horse battery staple" }).expect(202);
  token = result.body.csrfToken as string;
  const id = (await agent.get("/api/v1/auth/session").expect(200)).body.user.id as string;
  await agent.post("/api/v1/auth/verify").set("Origin", "http://localhost:3000").set("X-CSRF-Token", token).send({ token: email.token(address) }).expect(200);
  return { agent, csrf: token, id };
}

async function fixture() {
  const app = createApp({ emailService: email, requirementStructuringProvider: provider });
  const owner = await signup("ai-owner@example.com", "Owner", app);
  const member = await signup("ai-member@example.com", "Member", app);
  const clientUser = await signup("ai-client@example.com", "Client", app);
  const workspace = await Workspace.create({ name: "Studio", ownerId: owner.id });
  const client = await Client.create({ workspaceId: workspace._id, name: "Client", projectCount: 1 });
  const project = await Project.create({ workspaceId: workspace._id, clientId: client._id, name: "Website" });
  await WorkspaceMembership.create({ workspaceId: workspace._id, userId: member.id, role: "service-team-member", status: "active", startedAt: new Date() });
  const assignment = await ProjectAssignment.create({ workspaceId: workspace._id, projectId: project._id, userId: member.id, status: "active", startedAt: new Date() });
  const clientMembership = await ClientMembership.create({ workspaceId: workspace._id, projectId: project._id, userId: clientUser.id, role: "client-approver", status: "active", startedAt: new Date() });
  await EffectiveProjectAccess.create([
    { workspaceId: workspace._id, projectId: project._id, userId: member.id, role: "service-team-member", sourceId: assignment._id },
    { workspaceId: workspace._id, projectId: project._id, userId: clientUser.id, role: "client-approver", sourceId: clientMembership._id },
  ]);
  const started = await mutate(owner, "post", `/api/v1/projects/${project._id}/scope/draft`, {}).expect(201);
  const saved = await mutate(owner, "put", `/api/v1/projects/${project._id}/scope/draft`, {
    revisionToken: started.body.draft.revisionToken, groups: [{ name: "Existing", order: 0 }],
    requirements: [{ title: "Existing requirement", description: "Keep this unchanged.", acceptanceCriteria: ["It remains."], order: 0 }],
  }).expect(200);
  return { app, owner, member, clientUser, projectId: String(project._id), assignment, draft: saved.body.draft };
}

beforeAll(async () => {
  vi.spyOn(console, "info").mockImplementation(() => undefined); vi.spyOn(console, "warn").mockImplementation(() => undefined); vi.spyOn(console, "error").mockImplementation(() => undefined);
  database = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(database.getUri()); await syncDomainIndexes();
}, 300_000);
beforeEach(async () => {
  email = new FakeEmail(); provider = new FakeProvider();
  await Promise.all([
    AccountToken.deleteMany({}), Activity.deleteMany({}), AiGenerationLedger.deleteMany({}), AiRequirementProposal.deleteMany({}),
    Client.deleteMany({}), ClientMembership.deleteMany({}), EffectiveProjectAccess.deleteMany({}), Invitation.deleteMany({}), Project.deleteMany({}), ProjectAssignment.deleteMany({}),
    ScopeDraft.deleteMany({}), Session.deleteMany({}), Throttle.deleteMany({}), User.deleteMany({}), Workspace.deleteMany({}), WorkspaceMembership.deleteMany({}),
  ]);
});
afterAll(async () => { await mongoose.disconnect(); await database.stop(); });

describe("Slice 2.1 AI requirement API", () => {
  it("keeps generation private and applies one append-only, idempotent selection", async () => {
    const { owner, clientUser, projectId, draft } = await fixture();
    const generated = await mutate(owner, "post", `/api/v1/projects/${projectId}/ai/requirement-proposals`, { source: "Need a homepage. Date is not decided." }).expect(201);
    const proposal = generated.body.proposal;
    expect(proposal.binding.baseDraftRevision).toBe(draft.revisionToken);
    expect(provider.calls).toEqual([{ source: "Need a homepage. Date is not decided.", capacity: { groups: 10, requirements: 25 } }]);
    expect((await ScopeDraft.findOne({ projectId }).lean())!.requirements).toHaveLength(1);
    expect(await Activity.countDocuments({ projectId, action: /^ai\./u })).toBe(0);
    await clientUser.agent.get(`/api/v1/projects/${projectId}/ai/requirement-proposals`).expect(404);
    expect(JSON.stringify((await clientUser.agent.get(`/api/v1/projects/${projectId}/scope`).expect(200)).body)).not.toContain("Date is not decided");

    const working = { ...proposal.working, requirements: proposal.working.requirements.map((item: Record<string, unknown>) => ({ ...item, title: "Reviewed homepage" })) };
    const saved = await mutate(owner, "put", `/api/v1/projects/${projectId}/ai/requirement-proposals/${proposal.id}`, { expectedProposalRevision: proposal.proposalRevision, working }).expect(200);
    const current = saved.body.proposal;
    const requirements = current.working.requirements.map((item: Record<string, unknown>) => ({ key: item.key, groupKey: item.groupKey, title: item.title, description: item.description, acceptanceCriteria: item.acceptanceCriteria }));
    const applyBody = { expectedProposalRevision: current.proposalRevision, expectedDraftRevision: current.binding.baseDraftRevision, selection: { groups: current.working.groups, requirements }, confirmed: true };
    const applied = await mutate(owner, "post", `/api/v1/projects/${projectId}/ai/requirement-proposals/${proposal.id}/apply`, applyBody).expect(200);
    const repeated = await mutate(owner, "post", `/api/v1/projects/${projectId}/ai/requirement-proposals/${proposal.id}/apply`, applyBody).expect(200);
    expect(repeated.body).toEqual(applied.body);
    const finalDraft = await ScopeDraft.findOne({ projectId }).lean();
    expect(finalDraft!.groups.map((item) => item.name)).toEqual(["Existing", "Generated core"]);
    expect(finalDraft!.requirements.map((item) => item.title)).toEqual(["Existing requirement", "Reviewed homepage"]);
    expect(String(finalDraft!.requirements[0]!.logicalId)).toBe(draft.requirements[0].logicalId);
    const provenance = await owner.agent.get(`/api/v1/projects/${projectId}/ai/requirement-proposals/${proposal.id}/provenance`).expect(200);
    expect(provenance.body.provenance.rawSource).toBe("Need a homepage. Date is not decided.");
    expect(provenance.body.provenance.original.requirements[0].title).toBe("Generated homepage");
    expect(provenance.body.provenance.finalSelection.requirements[0].title).toBe("Reviewed homepage");
    await clientUser.agent.get(`/api/v1/projects/${projectId}/ai/requirement-proposals/${proposal.id}/provenance`).expect(404);
  });

  it("refuses stale drafts and immediately honors loss of project authority", async () => {
    const { owner, member, projectId, assignment, draft } = await fixture();
    const generated = await mutate(member, "post", `/api/v1/projects/${projectId}/ai/requirement-proposals`, { source: "Need a homepage." }).expect(201);
    const proposal = generated.body.proposal;
    await mutate(owner, "put", `/api/v1/projects/${projectId}/scope/draft`, {
      revisionToken: draft.revisionToken, groups: draft.groups, requirements: draft.requirements.map((item: Record<string, unknown>) => ({ ...item, title: "Manual change" })),
    }).expect(200);
    const requirements = proposal.working.requirements.map((item: Record<string, unknown>) => ({ key: item.key, groupKey: item.groupKey, title: item.title, description: item.description, acceptanceCriteria: item.acceptanceCriteria }));
    await mutate(member, "post", `/api/v1/projects/${projectId}/ai/requirement-proposals/${proposal.id}/apply`, {
      expectedProposalRevision: proposal.proposalRevision, expectedDraftRevision: proposal.binding.baseDraftRevision,
      selection: { groups: proposal.working.groups, requirements }, confirmed: true,
    }).expect(409).expect((response) => expect(response.body.error.code).toBe("AI_DRAFT_STALE"));
    expect((await AiRequirementProposal.findById(proposal.id).lean())!.state).toBe("pending");
    await EffectiveProjectAccess.deleteOne({ projectId, userId: member.id });
    await ProjectAssignment.updateOne({ _id: assignment._id }, { $set: { status: "inactive" } });
    await member.agent.get(`/api/v1/projects/${projectId}/ai/requirement-proposals/${proposal.id}`).expect(404);
  });

  it("counts admitted calls in a rolling user limit and leaves the manual draft untouched", async () => {
    const { owner, projectId } = await fixture();
    for (let index = 0; index < 10; index += 1) {
      await mutate(owner, "post", `/api/v1/projects/${projectId}/ai/requirement-proposals`, { source: `Request ${index}` }).expect(201);
    }
    await mutate(owner, "post", `/api/v1/projects/${projectId}/ai/requirement-proposals`, { source: "Eleventh" }).expect(429)
      .expect((response) => expect(response.body.error.code).toBe("AI_RATE_LIMITED"));
    expect(provider.calls).toHaveLength(10);
    expect((await ScopeDraft.findOne({ projectId }).lean())!.requirements).toHaveLength(1);
  });

  it("expires temporary private content authoritatively and creates no project activity", async () => {
    const { owner, projectId } = await fixture();
    const generated = await mutate(owner, "post", `/api/v1/projects/${projectId}/ai/requirement-proposals`, { source: "Temporary private notes" }).expect(201);
    await AiRequirementProposal.updateOne({ _id: generated.body.proposal.id }, { $set: { expiresAt: new Date(Date.now() - 1_000) } });
    await owner.agent.get(`/api/v1/projects/${projectId}/ai/requirement-proposals/${generated.body.proposal.id}`).expect(410);
    const expired = await AiRequirementProposal.findById(generated.body.proposal.id).lean();
    expect(expired!.state).toBe("expired");
    expect(expired).not.toHaveProperty("rawSource");
    expect(expired).not.toHaveProperty("working");
    expect(await Activity.countDocuments({ projectId, action: /^ai\./u })).toBe(0);
  });

  it("lets one concurrent Apply win without duplicate draft or provenance", async () => {
    const { owner, projectId } = await fixture();
    const generated = await mutate(owner, "post", `/api/v1/projects/${projectId}/ai/requirement-proposals`, { source: "Need a homepage." }).expect(201);
    const proposal = generated.body.proposal;
    const requirements = proposal.working.requirements.map((item: Record<string, unknown>) => ({ key: item.key, groupKey: item.groupKey, title: item.title, description: item.description, acceptanceCriteria: item.acceptanceCriteria }));
    const body = { expectedProposalRevision: proposal.proposalRevision, expectedDraftRevision: proposal.binding.baseDraftRevision, selection: { groups: proposal.working.groups, requirements }, confirmed: true };
    const [first, second] = await Promise.all([
      mutate(owner, "post", `/api/v1/projects/${projectId}/ai/requirement-proposals/${proposal.id}/apply`, body),
      mutate(owner, "post", `/api/v1/projects/${projectId}/ai/requirement-proposals/${proposal.id}/apply`, body),
    ]);
    expect([first.status, second.status]).toContain(200);
    expect([first.status, second.status].every((status) => status === 200 || status === 409)).toBe(true);
    expect((await ScopeDraft.findOne({ projectId }).lean())!.requirements).toHaveLength(2);
    expect(await AiRequirementProposal.countDocuments({ _id: proposal.id, state: "applied" })).toBe(1);
  });

  it("maps provider failure safely, consumes admission, and retains no proposal or draft mutation", async () => {
    const { owner, projectId } = await fixture();
    provider.generate = async () => { throw new AiProviderError("timeout"); };
    await mutate(owner, "post", `/api/v1/projects/${projectId}/ai/requirement-proposals`, { source: "Need a homepage." }).expect(504)
      .expect((response) => expect(response.body.error).toEqual({ code: "AI_TIMEOUT", message: expect.not.stringContaining("Gemini") }));
    expect(await AiRequirementProposal.countDocuments({ projectId })).toBe(0);
    expect((await AiGenerationLedger.findOne({ userId: owner.id }).lean())!.admittedAt).toHaveLength(1);
    expect((await ScopeDraft.findOne({ projectId }).lean())!.requirements).toHaveLength(1);
  });
});
