import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { AiRequirementReview } from "../src/domain/ai-requirement-review-models.js";
import type { CanonicalReviewInput } from "../src/domain/ai-requirement-review-contracts.js";
import type { RequirementQualityReviewProvider } from "../src/domain/ai-requirement-review-provider.js";
import { AiGenerationLedger, AiRequirementProposal } from "../src/domain/ai-requirement-models.js";
import { AiProviderError, type RequirementOutputCapacity, type RequirementStructuringProvider } from "../src/domain/ai-requirement-provider.js";
import type { EmailCommand, EmailService } from "../src/domain/email.js";
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

class FakeReviewProvider implements RequirementQualityReviewProvider {
  readonly available = true;
  calls: CanonicalReviewInput[] = [];
  mode: "normal" | "conflict" | "failure" | "empty" = "normal";
  async review(input: CanonicalReviewInput) {
    this.calls.push(input);
    if (this.mode === "failure") throw new AiProviderError("semantic");
    const target = input.requirements[0]!;
    const findings = this.mode === "empty" ? [] : [
      { key: "title_vague", category: "vagueness" as const, explanation: "The title is not specific.", primaryRequirementId: target.logicalRequirementId },
      { key: "description_vague", category: "vagueness" as const, explanation: "The description can be clearer.", primaryRequirementId: target.logicalRequirementId },
      { key: "missing_fact", category: "clarification-needed" as const, explanation: "Timing is not specified.", primaryRequirementId: target.logicalRequirementId },
    ];
    const suggestions = this.mode === "empty" ? [] : [
      { key: "replace_title", rationale: "Clarify existing wording.", patch: { findingKey: "title_vague", targetRequirementId: target.logicalRequirementId, kind: "replace-title" as const, expectedValue: target.title, proposedValue: "Clear existing requirement" } },
      { key: "replace_description", rationale: "Make the existing intent direct.", patch: { findingKey: "description_vague", targetRequirementId: target.logicalRequirementId, kind: "replace-description" as const, expectedValue: target.description, proposedValue: "Preserve this requirement unchanged." } },
      ...(this.mode === "conflict" ? [{ key: "replace_title_again", rationale: "An overlapping title change.", patch: { findingKey: "title_vague", targetRequirementId: target.logicalRequirementId, kind: "replace-title" as const, expectedValue: target.title, proposedValue: "Another title" } }] : []),
    ];
    return {
      output: { findings, suggestions, clarificationQuestions: this.mode === "empty" ? [] : [{ findingKey: "missing_fact", requirementIds: [target.logicalRequirementId], question: "What timing should be observable?" }] },
      operationId: `review-${this.calls.length}`, providerId: "fake", modelId: "fake-model", durationMs: 3,
    };
  }
}

class FakeStructuringProvider implements RequirementStructuringProvider {
  readonly available = true;
  calls = 0;
  async generate(source: string, capacity: RequirementOutputCapacity) {
    void source; void capacity;
    this.calls += 1;
    return { output: { groups: [], requirements: [{ key: `r${this.calls}`, title: "Generated", description: "Generated description.", acceptanceCriteria: ["It works."] }], warnings: [] }, operationId: `structure-${this.calls}`, providerId: "fake", modelId: "fake-model", durationMs: 1 };
  }
}

type Agent = ReturnType<typeof request.agent>;
type Account = { agent: Agent; csrf: string; id: string };
let database: MongoMemoryReplSet;
let email: FakeEmail;
let reviewProvider: FakeReviewProvider;
let structuringProvider: FakeStructuringProvider;

async function csrf(agent: Agent) { return (await agent.get("/api/v1/csrf").expect(200)).body.csrfToken as string; }
function mutate(account: Account, method: "post" | "put", path: string, body: unknown) {
  return account.agent[method](path).set("Origin", "http://localhost:3000").set("X-CSRF-Token", account.csrf).send(body as object);
}
async function signup(address: string, name: string, app: ReturnType<typeof createApp>): Promise<Account> {
  const agent = request.agent(app); let token = await csrf(agent);
  const result = await agent.post("/api/v1/auth/signup").set("Origin", "http://localhost:3000").set("X-CSRF-Token", token)
    .send({ email: address, displayName: name, password: "correct horse battery staple" }).expect(202);
  token = result.body.csrfToken as string;
  const id = (await agent.get("/api/v1/auth/session").expect(200)).body.user.id as string;
  await agent.post("/api/v1/auth/verify").set("Origin", "http://localhost:3000").set("X-CSRF-Token", token).send({ token: email.token(address) }).expect(200);
  return { agent, csrf: token, id };
}

async function fixture() {
  const app = createApp({ emailService: email, requirementStructuringProvider: structuringProvider, requirementQualityReviewProvider: reviewProvider });
  const owner = await signup("quality-owner@example.com", "Owner", app);
  const member = await signup("quality-member@example.com", "Member", app);
  const clientUser = await signup("quality-client@example.com", "Client", app);
  const outsider = await signup("quality-outsider@example.com", "Outsider", app);
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
  return { app, owner, member, clientUser, outsider, projectId: String(project._id), assignment, draft: saved.body.draft };
}

function generate(account: Account, projectId: string, draft: { id: string; revisionToken: string }) {
  return mutate(account, "post", `/api/v1/projects/${projectId}/ai/requirement-reviews`, { expectedDraftId: draft.id, expectedDraftRevision: draft.revisionToken });
}

beforeAll(async () => {
  vi.spyOn(console, "info").mockImplementation(() => undefined); vi.spyOn(console, "warn").mockImplementation(() => undefined); vi.spyOn(console, "error").mockImplementation(() => undefined);
  database = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(database.getUri()); await syncDomainIndexes();
}, 300_000);
beforeEach(async () => {
  email = new FakeEmail(); reviewProvider = new FakeReviewProvider(); structuringProvider = new FakeStructuringProvider();
  await Promise.all([
    AccountToken.deleteMany({}), Activity.deleteMany({}), AiGenerationLedger.deleteMany({}), AiRequirementProposal.deleteMany({}), AiRequirementReview.deleteMany({}),
    Client.deleteMany({}), ClientMembership.deleteMany({}), EffectiveProjectAccess.deleteMany({}), Invitation.deleteMany({}), Project.deleteMany({}), ProjectAssignment.deleteMany({}),
    ScopeDraft.deleteMany({}), Session.deleteMany({}), Throttle.deleteMany({}), User.deleteMany({}), Workspace.deleteMany({}), WorkspaceMembership.deleteMany({}),
  ]);
});
afterAll(async () => { await mongoose.disconnect(); await database.stop(); });

describe("Slice 2.2 requirement quality-review API", () => {
  it("keeps review staging private and applies the selected stable-ID patches once", async () => {
    const { owner, clientUser, outsider, projectId, draft } = await fixture();
    const generated = await generate(owner, projectId, draft).expect(201);
    const review = generated.body.review;
    expect(review.binding).toEqual({ projectId, draftId: draft.id, baseDraftRevision: draft.revisionToken });
    expect(review.original.findings).toHaveLength(3); expect(review.original.clarificationQuestions).toHaveLength(1);
    expect(reviewProvider.calls[0]!.requirements[0]).toEqual({ logicalRequirementId: draft.requirements[0].logicalId, title: "Existing requirement", description: "Keep this unchanged.", acceptanceCriteria: ["It remains."] });
    expect((await ScopeDraft.findById(draft.id).lean())!.revisionToken).toBe(draft.revisionToken);
    await clientUser.agent.get(`/api/v1/projects/${projectId}/ai/requirement-reviews`).expect(404);
    await outsider.agent.get(`/api/v1/projects/${projectId}/ai/requirement-reviews/${review.id}`).expect(404);
    expect(JSON.stringify((await clientUser.agent.get(`/api/v1/projects/${projectId}/scope`).expect(200)).body)).not.toContain("title_vague");

    const changedWorking = review.workingSuggestions.map((item: Record<string, unknown>, index: number) => ({ key: item.key, selected: index === 0, proposedValue: index === 0 ? "Human-confirmed requirement" : (item.patch as { proposedValue: unknown }).proposedValue }));
    const saved = await mutate(owner, "put", `/api/v1/projects/${projectId}/ai/requirement-reviews/${review.id}`, { expectedReviewRevision: review.reviewRevision, suggestions: changedWorking }).expect(200);
    expect(saved.body.review.original.suggestions[0].patch.proposedValue).toBe("Clear existing requirement");
    const beforeActivity = await Activity.countDocuments({ projectId });
    const applied = await mutate(owner, "post", `/api/v1/projects/${projectId}/ai/requirement-reviews/${review.id}/apply`, { expectedReviewRevision: saved.body.review.reviewRevision, expectedDraftRevision: draft.revisionToken, confirmed: true }).expect(200);
    const repeated = await mutate(owner, "post", `/api/v1/projects/${projectId}/ai/requirement-reviews/${review.id}/apply`, { expectedReviewRevision: saved.body.review.reviewRevision, expectedDraftRevision: draft.revisionToken, confirmed: true }).expect(200);
    expect(repeated.body).toEqual(applied.body);
    const finalDraft = await ScopeDraft.findById(draft.id).lean();
    expect(finalDraft!.requirements[0]!.title).toBe("Human-confirmed requirement");
    expect(finalDraft!.requirements[0]!.description).toBe("Keep this unchanged.");
    expect(String(finalDraft!.requirements[0]!.logicalId)).toBe(draft.requirements[0].logicalId);
    expect(finalDraft!.revisionToken).not.toBe(draft.revisionToken);
    expect(await Activity.countDocuments({ projectId })).toBe(beforeActivity);
    const provenance = await owner.agent.get(`/api/v1/projects/${projectId}/ai/requirement-reviews/${review.id}/provenance`).expect(200);
    expect(provenance.body.provenance.original.suggestions[0].patch.proposedValue).toBe("Clear existing requirement");
    expect(provenance.body.provenance.finalSelectedPatches).toHaveLength(1);
    await clientUser.agent.get(`/api/v1/projects/${projectId}/ai/requirement-reviews/${review.id}/provenance`).expect(404);
  });

  it("makes an older review permanently stale while allowing a new review of the latest revision", async () => {
    const { owner, projectId, draft } = await fixture();
    const oldReview = (await generate(owner, projectId, draft).expect(201)).body.review;
    const changed = await mutate(owner, "put", `/api/v1/projects/${projectId}/scope/draft`, { revisionToken: draft.revisionToken, groups: draft.groups, requirements: draft.requirements.map((item: Record<string, unknown>) => ({ ...item, title: "Manual newer title" })) }).expect(200);
    const stale = await owner.agent.get(`/api/v1/projects/${projectId}/ai/requirement-reviews/${oldReview.id}`).expect(200);
    expect(stale.body.review.freshness).toBe("stale"); expect(stale.body.review.actions.canApply).toBe(false);
    await mutate(owner, "put", `/api/v1/projects/${projectId}/ai/requirement-reviews/${oldReview.id}`, { expectedReviewRevision: oldReview.reviewRevision, suggestions: oldReview.workingSuggestions.map((item: Record<string, unknown>) => ({ key: item.key, selected: true, proposedValue: (item.patch as { proposedValue: unknown }).proposedValue })) }).expect(409)
      .expect((response) => expect(response.body.error.code).toBe("AI_DRAFT_STALE"));
    await generate(owner, projectId, changed.body.draft).expect(201);
    expect(reviewProvider.calls).toHaveLength(2);
  });

  it("admits only one active review for a draft revision and rejects conflicting patches atomically", async () => {
    const { owner, member, projectId, draft } = await fixture();
    const [first, second] = await Promise.all([generate(owner, projectId, draft), generate(member, projectId, draft)]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    expect(await AiRequirementReview.countDocuments({ projectId, state: "pending-review" })).toBe(1);
    const pending = first.status === 201 ? first.body.review : second.body.review;
    await mutate(first.status === 201 ? owner : member, "post", `/api/v1/projects/${projectId}/ai/requirement-reviews/${pending.id}/discard`, { expectedReviewRevision: pending.reviewRevision, confirmed: true }).expect(200);
    reviewProvider.mode = "conflict";
    const conflicting = (await generate(owner, projectId, draft).expect(201)).body.review;
    await mutate(owner, "post", `/api/v1/projects/${projectId}/ai/requirement-reviews/${conflicting.id}/apply`, { expectedReviewRevision: conflicting.reviewRevision, expectedDraftRevision: draft.revisionToken, confirmed: true }).expect(409)
      .expect((response) => expect(response.body.error.code).toBe("AI_REVIEW_PATCH_CONFLICT"));
    expect((await ScopeDraft.findById(draft.id).lean())!.revisionToken).toBe(draft.revisionToken);
    expect((await AiRequirementReview.findById(conflicting.id).lean())!.state).toBe("pending-review");
  });

  it("rechecks current assignment and expires temporary review data without activity", async () => {
    const { member, projectId, assignment, draft } = await fixture();
    const review = (await generate(member, projectId, draft).expect(201)).body.review;
    await EffectiveProjectAccess.deleteOne({ projectId, userId: member.id });
    await ProjectAssignment.updateOne({ _id: assignment._id }, { $set: { status: "inactive" } });
    await member.agent.get(`/api/v1/projects/${projectId}/ai/requirement-reviews/${review.id}`).expect(404);
    await EffectiveProjectAccess.create({ workspaceId: assignment.workspaceId, projectId, userId: member.id, role: "service-team-member", sourceId: assignment._id });
    await AiRequirementReview.updateOne({ _id: review.id }, { $set: { expiresAt: new Date(Date.now() - 1_000) } });
    await member.agent.get(`/api/v1/projects/${projectId}/ai/requirement-reviews/${review.id}`).expect(410);
    const expired = await AiRequirementReview.findById(review.id).lean();
    expect(expired!.state).toBe("expired"); expect(expired).not.toHaveProperty("canonicalInput"); expect(expired).not.toHaveProperty("original");
    expect(await Activity.countDocuments({ projectId, action: /^ai\./u })).toBe(0);
  });

  it("shares one rolling provider allowance with structuring and cleans failed review reservations", async () => {
    const { owner, projectId, draft } = await fixture();
    for (let index = 0; index < 9; index += 1) await mutate(owner, "post", `/api/v1/projects/${projectId}/ai/requirement-proposals`, { source: `Input ${index}` }).expect(201);
    await generate(owner, projectId, draft).expect(201);
    await mutate(owner, "post", `/api/v1/projects/${projectId}/ai/requirement-proposals`, { source: "Eleventh shared call" }).expect(429)
      .expect((response) => expect(response.body.error.code).toBe("AI_RATE_LIMITED"));
    expect(structuringProvider.calls).toBe(9); expect(reviewProvider.calls).toHaveLength(1);

    await AiGenerationLedger.deleteMany({}); await AiRequirementReview.deleteMany({});
    reviewProvider.mode = "failure";
    await generate(owner, projectId, draft).expect(502).expect((response) => expect(response.body.error.code).toBe("AI_RESPONSE_INVALID"));
    expect(await AiRequirementReview.countDocuments({ projectId })).toBe(0);
    expect((await ScopeDraft.findById(draft.id).lean())!.revisionToken).toBe(draft.revisionToken);
    const admittedBeforeOversize = (await AiGenerationLedger.findOne({ userId: owner.id }).lean())!.admittedAt.length;
    await ScopeDraft.updateOne({ _id: draft.id }, { $set: { requirements: Array.from({ length: 60 }, (_, order) => ({ logicalId: new mongoose.Types.ObjectId(), title: `Requirement ${order}`, description: "x".repeat(5_000), acceptanceCriteria: ["Complete"], order })) } });
    reviewProvider.mode = "normal";
    await generate(owner, projectId, draft).expect(413).expect((response) => expect(response.body.error.code).toBe("AI_REVIEW_INPUT_TOO_LARGE"));
    expect((await AiGenerationLedger.findOne({ userId: owner.id }).lean())!.admittedAt).toHaveLength(admittedBeforeOversize);
    expect(reviewProvider.calls).toHaveLength(2);
  });
});
