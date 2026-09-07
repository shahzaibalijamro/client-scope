import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import type { EmailCommand, EmailService } from "../src/domain/email.js";
import {
  AccountToken, Activity, Client, ClientMembership, EffectiveProjectAccess, Invitation,
  Project, ProjectAssignment, Session, syncDomainIndexes, Throttle, User, Workspace,
  WorkspaceMembership,
} from "../src/domain/models.js";
import { hashToken, SESSION_COOKIE, SESSION_LIFETIME_MS } from "../src/domain/security.js";

process.env.NODE_ENV = "test";
process.env.FRONTEND_ORIGIN = "http://localhost:3000";
process.env.SESSION_SECRET = "test-session-secret-with-at-least-32-characters";
process.env.AUTH_THROTTLE_LIMIT = "1000";

class FakeEmail implements EmailService {
  readonly sent: EmailCommand[] = [];
  delivered = true;
  throwing = false;

  async send(command: EmailCommand): Promise<{ delivered: boolean }> {
    this.sent.push(command);
    if (this.throwing) throw new Error("controlled provider failure");
    return { delivered: this.delivered };
  }

  token(category: EmailCommand["category"], to: string): string {
    const message = [...this.sent].reverse().find((item) => item.category === category && item.to === to);
    const token = message?.text.match(/(?:token=|\/invite\/)([A-Za-z0-9_-]+)/u)?.[1];
    if (!token) throw new Error(`No ${category} token was sent to ${to}.`);
    return token;
  }
}

type Agent = ReturnType<typeof request.agent>;
type Account = { agent: Agent; csrf: string; id: string; email: string };
let database: MongoMemoryReplSet;
let emailService: FakeEmail;

async function csrf(agent: Agent): Promise<string> {
  const response = await agent.get("/api/v1/csrf").expect(200);
  return response.body.csrfToken as string;
}

function mutation(agent: Agent, token: string, method: "post" | "patch" | "delete", path: string, body?: unknown) {
  const test = agent[method](path).set("Origin", "http://localhost:3000").set("X-CSRF-Token", token);
  return body === undefined ? test : test.send(body as object);
}

async function signup(email: string, displayName: string, verify = true): Promise<Account> {
  const agent = request.agent(createApp({ emailService }));
  let token = await csrf(agent);
  const response = await mutation(agent, token, "post", "/api/v1/auth/signup", {
    email, displayName, password: "correct horse battery staple",
  }).expect(202);
  token = response.body.csrfToken as string;
  const session = await agent.get("/api/v1/auth/session").expect(200);
  if (verify) {
    const verificationToken = emailService.token("verification", email);
    await mutation(agent, token, "post", "/api/v1/auth/verify", { token: verificationToken }).expect(200);
  }
  return { agent, csrf: token, id: session.body.user.id as string, email };
}

async function ownerSetup(owner: Account, suffix = "A") {
  const workspaceResponse = await mutation(owner.agent, owner.csrf, "post", "/api/v1/workspaces", { name: `Studio ${suffix}` }).expect(201);
  const workspaceId = workspaceResponse.body.workspace.id as string;
  const clientResponse = await mutation(owner.agent, owner.csrf, "post", `/api/v1/workspaces/${workspaceId}/clients`, {
    name: `Client ${suffix}`, companyName: `Company ${suffix}`, primaryContactEmail: `client-${suffix.toLowerCase()}@example.com`, internalNotes: `private ${suffix}`,
  }).expect(201);
  const clientId = clientResponse.body.client.id as string;
  const projectResponse = await mutation(owner.agent, owner.csrf, "post", `/api/v1/workspaces/${workspaceId}/projects`, {
    name: `Project ${suffix}`, clientId, description: `Description ${suffix}`, targetDeadline: "2020-02-29",
  }).expect(201);
  return { workspaceId, clientId, projectId: projectResponse.body.project.id as string };
}

async function invite(owner: Account, setup: Awaited<ReturnType<typeof ownerSetup>>, recipient: string, kind: "workspace" | "project", role: "service-team-member" | "client-participant" | "client-approver") {
  const body = kind === "workspace" ? { kind, email: recipient, role } : { kind, email: recipient, role, projectId: setup.projectId };
  const response = await mutation(owner.agent, owner.csrf, "post", `/api/v1/workspaces/${setup.workspaceId}/invitations`, body).expect(201);
  return { id: response.body.invitation.id as string, token: emailService.token("invitation", recipient) };
}

async function accept(account: Account, invitationId: string) {
  return mutation(account.agent, account.csrf, "post", `/api/v1/invitations/${invitationId}/accept`).expect(200);
}

beforeAll(async () => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  database = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(database.getUri());
  await syncDomainIndexes();
}, 300_000);

beforeEach(async () => {
  emailService = new FakeEmail();
  await Promise.all([
    AccountToken.deleteMany({}), Activity.deleteMany({}), Client.deleteMany({}),
    ClientMembership.deleteMany({}), EffectiveProjectAccess.deleteMany({}), Invitation.deleteMany({}),
    Project.deleteMany({}), ProjectAssignment.deleteMany({}), Session.deleteMany({}), Throttle.deleteMany({}),
    User.deleteMany({}), Workspace.deleteMany({}), WorkspaceMembership.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await database.stop();
});

describe("Slice 1.1 API acceptance", () => {
  it("issues a fixed seven-day host-only API cookie and applies email plus network throttles", async () => {
    const agent = request.agent(createApp({ emailService }));
    let token = await csrf(agent);
    const created = await mutation(agent, token, "post", "/api/v1/auth/signup", {
      email: "cookie@example.com", displayName: "Cookie User", password: "correct horse battery staple",
    }).expect(202);
    token = created.body.csrfToken as string;
    const cookies = created.headers["set-cookie"] as unknown as string[];
    const sessionCookie = cookies.find((item) => item.startsWith(`${SESSION_COOKIE}=`));
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("Path=/api");
    expect(sessionCookie).toContain("SameSite=Lax");
    expect(sessionCookie).not.toContain("Domain=");
    expect(sessionCookie).not.toContain("Secure");
    const record = await Session.findOne({}).lean();
    const rawSessionToken = sessionCookie!.split(";", 1)[0]!.slice(`${SESSION_COOKIE}=`.length);
    expect(record!.tokenHash).toBe(hashToken(rawSessionToken));
    expect(JSON.stringify(created.body)).not.toContain(rawSessionToken);
    expect(record!.expiresAt.valueOf() - record!.createdAt.valueOf()).toBeGreaterThanOrEqual(SESSION_LIFETIME_MS - 50);
    expect(record!.expiresAt.valueOf() - record!.createdAt.valueOf()).toBeLessThanOrEqual(SESSION_LIFETIME_MS);
    const fixedExpiry = record!.expiresAt.valueOf();
    await agent.get("/api/v1/auth/session").expect(200);
    expect((await Session.findById(record!._id).lean())!.expiresAt.valueOf()).toBe(fixedExpiry);

    await Throttle.deleteMany({});
    process.env.AUTH_THROTTLE_LIMIT = "1";
    try {
      const throttled = await Promise.all([
        mutation(agent, token, "post", "/api/v1/auth/signin", {
          email: "unknown@example.com", password: "correct horse battery staple",
        }),
        mutation(agent, token, "post", "/api/v1/auth/signin", {
          email: "another@example.com", password: "correct horse battery staple",
        }),
      ]);
      expect(throttled.map((item) => item.status).sort()).toEqual([401, 429]);
      const throttleKeys = (await Throttle.find({}).lean()).map((item) => item.key);
      expect(throttleKeys.some((key) => key.startsWith("signin:email:"))).toBe(true);
      expect(throttleKeys.some((key) => key.startsWith("signin:network:"))).toBe(true);
    } finally {
      process.env.AUTH_THROTTLE_LIMIT = "1000";
    }
  });

  it("marks session and CSRF cookies Secure in production-like HTTPS configuration", async () => {
    process.env.NODE_ENV = "production";
    try {
      const app = createApp({ emailService });
      const bootstrap = await request(app).get("/api/v1/csrf").expect(200);
      const bootstrapCookies = bootstrap.headers["set-cookie"] as unknown as string[];
      const csrfCookie = bootstrapCookies.find((item) => item.startsWith("clientscope_csrf_context="))!.split(";", 1)[0]!;
      expect(bootstrapCookies.find((item) => item.startsWith("clientscope_csrf_context="))).toContain("Secure");
      const created = await request(app).post("/api/v1/auth/signup")
        .set("Origin", "http://localhost:3000")
        .set("X-CSRF-Token", bootstrap.body.csrfToken as string)
        .set("Cookie", csrfCookie)
        .send({ email: "secure@example.com", displayName: "Secure User", password: "correct horse battery staple" })
        .expect(202);
      const cookies = created.headers["set-cookie"] as unknown as string[];
      expect(cookies.find((item) => item.startsWith(`${SESSION_COOKIE}=`))).toContain("Secure");
    } finally {
      process.env.NODE_ENV = "test";
    }
  });

  it("logs out only the current session and rejects an expired fixed session", async () => {
    const account = await signup("sessions@example.com", "Session User");
    const second = request.agent(createApp({ emailService }));
    const secondCsrf = await csrf(second);
    await mutation(second, secondCsrf, "post", "/api/v1/auth/signin", {
      email: account.email, password: "correct horse battery staple",
    }).expect(200);
    await mutation(account.agent, account.csrf, "post", "/api/v1/auth/logout").expect(200);
    expect((await account.agent.get("/api/v1/auth/session").expect(200)).body.user).toBeNull();
    expect((await second.get("/api/v1/auth/session").expect(200)).body.user.id).toBe(account.id);

    const activeSecondSession = await Session.findOne({ userId: account.id, revokedAt: { $exists: false } }).sort({ createdAt: -1 });
    activeSecondSession!.expiresAt = new Date(Date.now() - 1_000);
    await activeSecondSession!.save();
    expect((await second.get("/api/v1/auth/session").expect(200)).body.user).toBeNull();
  });

  it("keeps concurrent duplicate signup neutral while creating one account and one session", async () => {
    const first = request.agent(createApp({ emailService }));
    const second = request.agent(createApp({ emailService }));
    const [firstCsrf, secondCsrf] = await Promise.all([csrf(first), csrf(second)]);
    const payload = { email: "same@example.com", displayName: "Same Person", password: "correct horse battery staple" };
    const responses = await Promise.all([
      mutation(first, firstCsrf, "post", "/api/v1/auth/signup", payload),
      mutation(second, secondCsrf, "post", "/api/v1/auth/signup", payload),
    ]);

    expect(responses.map((item) => item.status)).toEqual([202, 202]);
    expect(responses.map((item) => item.body.message)).toEqual([
      "Check your email for the next step.", "Check your email for the next step.",
    ]);
    expect(await User.countDocuments({ normalizedEmail: "same@example.com" })).toBe(1);
    expect(await AccountToken.countDocuments({ type: "verification", active: true })).toBe(1);
    expect(await Session.countDocuments({})).toBe(1);
    expect(emailService.sent.map((item) => item.category).sort()).toEqual(["duplicate-signup", "verification"]);
  });

  it("enforces replacement, expiry, and single use for verification links without creating a session", async () => {
    const account = await signup("verify@example.com", "Verify Me", false);
    const firstToken = emailService.token("verification", account.email);
    await mutation(account.agent, account.csrf, "post", "/api/v1/auth/verification/reissue").expect(200);
    const replacementToken = emailService.token("verification", account.email);
    const redeemer = request.agent(createApp({ emailService }));
    const redeemerCsrf = await csrf(redeemer);

    await mutation(redeemer, redeemerCsrf, "post", "/api/v1/auth/verify", { token: firstToken }).expect(410);
    const verified = await mutation(redeemer, redeemerCsrf, "post", "/api/v1/auth/verify", { token: replacementToken }).expect(200);
    expect(verified.body.signedIn).toBe(false);
    await mutation(redeemer, redeemerCsrf, "post", "/api/v1/auth/verify", { token: replacementToken }).expect(410);
    expect((await redeemer.get("/api/v1/auth/session").expect(200)).body.user).toBeNull();
    expect((await account.agent.get("/api/v1/auth/session").expect(200)).body.user.verified).toBe(true);

    const expiredAccount = await signup("expired@example.com", "Expired", false);
    const expiredToken = emailService.token("verification", expiredAccount.email);
    await AccountToken.updateOne({ tokenHash: { $exists: true }, userId: expiredAccount.id, active: true }, { $set: { expiresAt: new Date(Date.now() - 1_000) } });
    await mutation(redeemer, redeemerCsrf, "post", "/api/v1/auth/verify", { token: expiredToken }).expect(410);
  });

  it("replaces reset links, revokes every session, leaves the reset browser signed out, and preserves verification state", async () => {
    const account = await signup("reset@example.com", "Reset Me", false);
    const second = request.agent(createApp({ emailService }));
    const secondCsrf = await csrf(second);
    await mutation(second, secondCsrf, "post", "/api/v1/auth/signin", {
      email: account.email, password: "correct horse battery staple",
    }).expect(200);

    const requester = request.agent(createApp({ emailService }));
    const requesterCsrf = await csrf(requester);
    await mutation(requester, requesterCsrf, "post", "/api/v1/auth/forgot-password", { email: account.email }).expect(202);
    const firstToken = emailService.token("password-reset", account.email);
    await mutation(requester, requesterCsrf, "post", "/api/v1/auth/forgot-password", { email: account.email }).expect(202);
    const replacementToken = emailService.token("password-reset", account.email);

    const resetter = request.agent(createApp({ emailService }));
    const resetterCsrf = await csrf(resetter);
    await mutation(resetter, resetterCsrf, "post", "/api/v1/auth/reset-password", {
      token: firstToken, password: "a new secure password", confirmation: "a new secure password",
    }).expect(410);
    await mutation(resetter, resetterCsrf, "post", "/api/v1/auth/reset-password", {
      token: replacementToken, password: "a new secure password", confirmation: "a new secure password",
    }).expect(200);

    expect((await account.agent.get("/api/v1/auth/session").expect(200)).body.user).toBeNull();
    expect((await second.get("/api/v1/auth/session").expect(200)).body.user).toBeNull();
    expect((await resetter.get("/api/v1/auth/session").expect(200)).body.user).toBeNull();
    await mutation(requester, requesterCsrf, "post", "/api/v1/auth/signin", {
      email: account.email, password: "correct horse battery staple",
    }).expect(401);
    const freshSignin = await mutation(requester, requesterCsrf, "post", "/api/v1/auth/signin", {
      email: account.email, password: "a new secure password",
    }).expect(200);
    expect(freshSignin.body.user.verified).toBe(false);
  });

  it("enforces the unverified gate, CSRF/origin boundary, neutral duplicate signup, and profile snapshots", async () => {
    const account = await signup("owner@example.com", "Original Owner", false);
    await account.agent.get("/api/v1/work").expect(403);
    await account.agent.post("/api/v1/auth/logout").set("X-CSRF-Token", account.csrf).expect(403);
    const duplicate = await mutation(account.agent, account.csrf, "post", "/api/v1/auth/signup", {
      email: "OWNER@example.com", displayName: "Other", password: "another secure password",
    }).expect(202);
    account.csrf = duplicate.body.csrfToken as string;

    await mutation(account.agent, account.csrf, "post", "/api/v1/auth/verify", {
      token: emailService.token("verification", account.email),
    }).expect(200);
    await mutation(account.agent, account.csrf, "post", "/api/v1/workspaces", { name: "Snapshot Studio" }).expect(201);
    await mutation(account.agent, account.csrf, "patch", "/api/v1/account", { displayName: "Updated Owner" }).expect(200);
    expect(await Activity.findOne({ action: "workspace.created" }).lean()).toMatchObject({ actorName: "Original Owner" });
  });

  it("shows accepted client projects in Your work without owner-only client data", async () => {
    const ownerAccount = await signup("owner@example.com", "Owner");
    const setup = await ownerSetup(ownerAccount);
    const clientAccount = await signup("approver@example.com", "Approver");
    const invitation = await invite(ownerAccount, setup, clientAccount.email, "project", "client-approver");

    const anonymous = request(createApp({ emailService }));
    await anonymous.get(`/api/v1/invitation-links/${invitation.token}`).expect(401);
    await accept(clientAccount, invitation.id);

    const work = await clientAccount.agent.get("/api/v1/work").expect(200);
    expect(work.body.workspaces).toHaveLength(1);
    expect(work.body.workspaces[0]).toMatchObject({ relationship: "client", projects: [{ id: setup.projectId, role: "client-approver", client: { name: "Client A" } }] });
    expect(JSON.stringify(work.body)).not.toContain("private A");
    expect(JSON.stringify(work.body)).not.toContain("Company A");

    const members = await clientAccount.agent.get(`/api/v1/projects/${setup.projectId}/members`).expect(200);
    expect(members.body.members).toEqual(expect.arrayContaining([
      expect.objectContaining({ displayName: "Owner", role: "workspace-owner" }),
      expect.objectContaining({ displayName: "Approver", role: "client-approver" }),
    ]));
    expect(JSON.stringify(members.body)).not.toContain("@example.com");
    await clientAccount.agent.get(`/api/v1/workspaces/${setup.workspaceId}/clients`).expect(404);
    await mutation(clientAccount.agent, clientAccount.csrf, "post", `/api/v1/workspaces/${setup.workspaceId}/invitations`, {
      kind: "workspace", email: "forbidden@example.com", role: "service-team-member",
    }).expect(404);

    const otherOwner = await signup("other@example.com", "Other Owner");
    await otherOwner.agent.get(`/api/v1/projects/${setup.projectId}`).expect(404);
    await otherOwner.agent.get(`/api/v1/workspaces/${setup.workspaceId}/clients`).expect(404);
    await mutation(otherOwner.agent, otherOwner.csrf, "post", `/api/v1/workspaces/${setup.workspaceId}/clients`, { name: "Cross tenant" }).expect(404);
  });

  it("keeps client edits unversioned, trims optional fields, and guards deletion with safe history", async () => {
    const ownerAccount = await signup("owner@example.com", "Owner");
    const workspace = await mutation(ownerAccount.agent, ownerAccount.csrf, "post", "/api/v1/workspaces", { name: "Client Studio" }).expect(201);
    const workspaceId = workspace.body.workspace.id as string;
    const created = await mutation(ownerAccount.agent, ownerAccount.csrf, "post", `/api/v1/workspaces/${workspaceId}/clients`, {
      name: "Disposable Client", companyName: "Company", primaryContactEmail: "contact@example.com", internalNotes: "private value",
    }).expect(201);
    const clientId = created.body.client.id as string;
    await mutation(ownerAccount.agent, ownerAccount.csrf, "patch", `/api/v1/workspaces/${workspaceId}/clients/${clientId}`, {
      name: "Disposable Client", companyName: "   ", primaryContactEmail: "", internalNotes: "  ",
    }).expect(200);
    const stored = await Client.findById(clientId).lean();
    expect(stored).not.toHaveProperty("companyName");
    expect(stored).not.toHaveProperty("primaryContactEmail");
    expect(stored).not.toHaveProperty("internalNotes");
    expect(await Activity.countDocuments({ action: { $regex: /^client\./u } })).toBe(1);

    await mutation(ownerAccount.agent, ownerAccount.csrf, "delete", `/api/v1/workspaces/${workspaceId}/clients/${clientId}`, { confirmation: "Wrong name" }).expect(400);
    await mutation(ownerAccount.agent, ownerAccount.csrf, "delete", `/api/v1/workspaces/${workspaceId}/clients/${clientId}`, { confirmation: "Disposable Client" }).expect(204);
    const deletion = await Activity.findOne({ action: "client.deleted" }).lean();
    expect(deletion).toMatchObject({ audience: "owner", actorName: "Owner", context: { clientName: "Disposable Client" } });
    expect(JSON.stringify(deletion)).not.toContain("private value");
  });

  it("grants only assigned service projects and immediately revokes stale-session access", async () => {
    const ownerAccount = await signup("owner@example.com", "Owner");
    const setup = await ownerSetup(ownerAccount);
    const secondClient = await mutation(ownerAccount.agent, ownerAccount.csrf, "post", `/api/v1/workspaces/${setup.workspaceId}/clients`, { name: "Second client" }).expect(201);
    const secondProject = await mutation(ownerAccount.agent, ownerAccount.csrf, "post", `/api/v1/workspaces/${setup.workspaceId}/projects`, { name: "Second project", clientId: secondClient.body.client.id }).expect(201);
    const member = await signup("member@example.com", "Member");
    const invitation = await invite(ownerAccount, setup, member.email, "workspace", "service-team-member");
    await accept(member, invitation.id);

    let work = await member.agent.get("/api/v1/work").expect(200);
    expect(work.body.workspaces[0].projects).toEqual([]);
    await member.agent.get(`/api/v1/workspaces/${setup.workspaceId}/clients`).expect(404);
    await mutation(member.agent, member.csrf, "post", `/api/v1/projects/${setup.projectId}/assignments`, { userId: member.id }).expect(404);
    const assigned = await mutation(ownerAccount.agent, ownerAccount.csrf, "post", `/api/v1/projects/${setup.projectId}/assignments`, { userId: member.id }).expect(201);
    const sentAfterAssignment = emailService.sent.length;
    await mutation(ownerAccount.agent, ownerAccount.csrf, "post", `/api/v1/projects/${setup.projectId}/assignments`, { userId: member.id }).expect(409);
    expect(emailService.sent).toHaveLength(sentAfterAssignment);
    work = await member.agent.get("/api/v1/work").expect(200);
    expect(work.body.workspaces[0].projects.map((item: { id: string }) => item.id)).toEqual([setup.projectId]);
    expect(work.body.workspaces[0].projects[0].client).toMatchObject({
      name: "Client A", companyName: "Company A", primaryContactEmail: "client-a@example.com",
    });
    expect(JSON.stringify(work.body)).not.toContain("private A");
    expect(JSON.stringify(work.body)).not.toContain(secondProject.body.project.id);

    await mutation(ownerAccount.agent, ownerAccount.csrf, "delete", `/api/v1/projects/${setup.projectId}/assignments/${assigned.body.assignment.id}`, { confirmed: true }).expect(200);
    await member.agent.get(`/api/v1/projects/${setup.projectId}`).expect(404);
    expect(await WorkspaceMembership.countDocuments({ workspaceId: setup.workspaceId, userId: member.id, status: "active" })).toBe(1);

    await mutation(ownerAccount.agent, ownerAccount.csrf, "post", `/api/v1/projects/${setup.projectId}/assignments`, { userId: member.id }).expect(201);
    await mutation(ownerAccount.agent, ownerAccount.csrf, "delete", `/api/v1/workspaces/${setup.workspaceId}/members/${member.id}`, { confirmed: true }).expect(200);
    await member.agent.get(`/api/v1/projects/${setup.projectId}`).expect(404);
    expect(await ProjectAssignment.countDocuments({ userId: member.id, status: "inactive" })).toBe(2);
    expect(await EffectiveProjectAccess.countDocuments({ userId: member.id })).toBe(0);
  });

  it("accepts an invitation exactly once and keeps membership, role claim, and history atomic", async () => {
    const ownerAccount = await signup("owner@example.com", "Owner");
    const setup = await ownerSetup(ownerAccount);
    const clientAccount = await signup("client@example.com", "Client");
    const invitation = await invite(ownerAccount, setup, clientAccount.email, "project", "client-participant");

    const outcomes = await Promise.all([
      mutation(clientAccount.agent, clientAccount.csrf, "post", `/api/v1/invitations/${invitation.id}/accept`),
      mutation(clientAccount.agent, clientAccount.csrf, "post", `/api/v1/invitations/${invitation.id}/accept`),
    ]);
    expect(outcomes.map((item) => item.status).sort()).toEqual([200, 409]);
    expect(await ClientMembership.countDocuments({ projectId: setup.projectId, userId: clientAccount.id, status: "active" })).toBe(1);
    expect(await EffectiveProjectAccess.countDocuments({ projectId: setup.projectId, userId: clientAccount.id })).toBe(1);
    expect(await Activity.countDocuments({ projectId: setup.projectId, action: "client.joined" })).toBe(1);
  });

  it("discovers, replaces, invalidates, and revokes invitations without exposing stale details", async () => {
    const ownerAccount = await signup("owner@example.com", "Owner");
    const setup = await ownerSetup(ownerAccount);
    const clientAccount = await signup("CLIENT@example.com", "Client");
    const first = await invite(ownerAccount, setup, "client@example.com", "project", "client-participant");
    const pendingWork = await clientAccount.agent.get("/api/v1/work").expect(200);
    expect(pendingWork.body.invitations).toEqual([
      expect.objectContaining({ id: first.id, role: "client-participant", projectName: "Project A", clientName: "Client A" }),
    ]);
    const firstRecord = await Invitation.findById(first.id).lean();
    expect(firstRecord!.expiresAt.valueOf() - firstRecord!.createdAt.valueOf()).toBeGreaterThanOrEqual(3 * 24 * 60 * 60 * 1_000 - 50);

    const replacement = await invite(ownerAccount, setup, "client@example.com", "project", "client-approver");
    const replacedRecord = await Invitation.findById(first.id).lean();
    expect(replacedRecord).toMatchObject({ status: "revoked" });
    expect(String(replacedRecord!.replacedBy)).toBe(replacement.id);
    await clientAccount.agent.get(`/api/v1/invitation-links/${first.token}`).expect(404);
    await mutation(clientAccount.agent, clientAccount.csrf, "post", `/api/v1/invitations/${first.id}/accept`).expect(404);
    await accept(clientAccount, replacement.id);
    expect(await ClientMembership.findOne({ projectId: setup.projectId, userId: clientAccount.id, status: "active" }).lean()).toMatchObject({ role: "client-approver" });

    const futureRecipient = await signup("future@example.com", "Future Client");
    const revocable = await invite(ownerAccount, setup, futureRecipient.email, "project", "client-participant");
    await mutation(ownerAccount.agent, ownerAccount.csrf, "post", `/api/v1/workspaces/${setup.workspaceId}/invitations/${revocable.id}/revoke`).expect(200);
    await futureRecipient.agent.get(`/api/v1/invitation-links/${revocable.token}`).expect(404);
  });

  it("resolves concurrent client acceptance and service assignment to one effective role", async () => {
    const ownerAccount = await signup("owner@example.com", "Owner");
    const setup = await ownerSetup(ownerAccount);
    const member = await signup("mixed@example.com", "Mixed Role");
    const workspaceInvitation = await invite(ownerAccount, setup, member.email, "workspace", "service-team-member");
    await accept(member, workspaceInvitation.id);
    const projectInvitation = await invite(ownerAccount, setup, member.email, "project", "client-participant");

    const outcomes = await Promise.all([
      mutation(ownerAccount.agent, ownerAccount.csrf, "post", `/api/v1/projects/${setup.projectId}/assignments`, { userId: member.id }),
      mutation(member.agent, member.csrf, "post", `/api/v1/invitations/${projectInvitation.id}/accept`),
    ]);
    expect(outcomes.filter((item) => item.status >= 200 && item.status < 300)).toHaveLength(1);
    expect(outcomes.filter((item) => item.status === 409)).toHaveLength(1);
    expect(await EffectiveProjectAccess.countDocuments({ projectId: setup.projectId, userId: member.id })).toBe(1);
    const activeRecords = await Promise.all([
      ProjectAssignment.countDocuments({ projectId: setup.projectId, userId: member.id, status: "active" }),
      ClientMembership.countDocuments({ projectId: setup.projectId, userId: member.id, status: "active" }),
    ]);
    expect(activeRecords[0] + activeRecords[1]).toBe(1);
  });

  it("cannot race client deletion into a dangling project reference", async () => {
    const ownerAccount = await signup("owner@example.com", "Owner");
    const workspace = await mutation(ownerAccount.agent, ownerAccount.csrf, "post", "/api/v1/workspaces", { name: "Race Studio" }).expect(201);
    const workspaceId = workspace.body.workspace.id as string;
    const client = await mutation(ownerAccount.agent, ownerAccount.csrf, "post", `/api/v1/workspaces/${workspaceId}/clients`, { name: "Race Client" }).expect(201);
    const clientId = client.body.client.id as string;

    const outcomes = await Promise.all([
      mutation(ownerAccount.agent, ownerAccount.csrf, "post", `/api/v1/workspaces/${workspaceId}/projects`, { clientId, name: "Race Project" }),
      mutation(ownerAccount.agent, ownerAccount.csrf, "delete", `/api/v1/workspaces/${workspaceId}/clients/${clientId}`, { confirmation: "Race Client" }),
    ]);
    expect(outcomes.filter((item) => item.status < 300)).toHaveLength(1);
    const savedClient = await Client.findById(clientId).lean();
    const savedProject = await Project.findOne({ clientId }).lean();
    expect(Boolean(savedClient)).toBe(Boolean(savedProject));
  });

  it("preserves client role periods and requires a new invitation after leaving", async () => {
    const ownerAccount = await signup("owner@example.com", "Owner");
    const setup = await ownerSetup(ownerAccount);
    const clientAccount = await signup("client@example.com", "Client");
    const invitation = await invite(ownerAccount, setup, clientAccount.email, "project", "client-participant");
    await accept(clientAccount, invitation.id);
    const original = await ClientMembership.findOne({ projectId: setup.projectId, userId: clientAccount.id, status: "active" }).lean();

    await mutation(ownerAccount.agent, ownerAccount.csrf, "patch", `/api/v1/projects/${setup.projectId}/client-members/${String(original!._id)}/role`, { role: "client-approver", confirmed: true }).expect(200);
    const periods = await ClientMembership.find({ projectId: setup.projectId, userId: clientAccount.id }).sort({ startedAt: 1 }).lean();
    expect(periods).toHaveLength(2);
    expect(periods[0]).toMatchObject({ role: "client-participant", status: "inactive", endReason: "role-changed" });
    expect(periods[1]).toMatchObject({ role: "client-approver", status: "active" });

    await mutation(clientAccount.agent, clientAccount.csrf, "post", `/api/v1/projects/${setup.projectId}/leave`, { confirmed: true }).expect(200);
    await clientAccount.agent.get(`/api/v1/projects/${setup.projectId}`).expect(404);
    expect(await EffectiveProjectAccess.countDocuments({ projectId: setup.projectId, userId: clientAccount.id })).toBe(0);
    const restoredInvitation = await invite(ownerAccount, setup, clientAccount.email, "project", "client-approver");
    await accept(clientAccount, restoredInvitation.id);
    expect(await ClientMembership.countDocuments({ projectId: setup.projectId, userId: clientAccount.id })).toBe(3);
  });

  it("rolls back a domain write when required activity persistence fails", async () => {
    const ownerAccount = await signup("owner@example.com", "Owner");
    vi.spyOn(Activity.prototype, "save").mockRejectedValueOnce(new Error("controlled activity failure"));
    await mutation(ownerAccount.agent, ownerAccount.csrf, "post", "/api/v1/workspaces", { name: "Must roll back" }).expect(500);
    expect(await Workspace.countDocuments({ name: "Must roll back" })).toBe(0);
  });

  it("records authoritative invitation expiry and preserves notification-failure domain actions", async () => {
    const ownerAccount = await signup("owner@example.com", "Owner");
    const setup = await ownerSetup(ownerAccount);
    const member = await signup("member@example.com", "Member");
    const workspaceInvitation = await invite(ownerAccount, setup, member.email, "workspace", "service-team-member");
    await Invitation.updateOne({ _id: workspaceInvitation.id }, { $set: { expiresAt: new Date(Date.now() - 1_000) } });
    await ownerAccount.agent.get(`/api/v1/workspaces/${setup.workspaceId}/access`).expect(200);
    expect(await Invitation.findById(workspaceInvitation.id).lean()).toMatchObject({ status: "expired" });
    const expiryEvent = await Activity.findOne({ action: "invitation.expired", workspaceId: setup.workspaceId }).lean();
    expect(expiryEvent).toMatchObject({
      audience: "owner",
      context: { systemReason: "expired-at-authoritative-time" },
    });
    expect(expiryEvent?.actorId).toBeUndefined();
    expect(expiryEvent?.actorName).toBeUndefined();

    const activeInvitation = await invite(ownerAccount, setup, member.email, "workspace", "service-team-member");
    await accept(member, activeInvitation.id);
    emailService.throwing = true;
    const assignment = await mutation(ownerAccount.agent, ownerAccount.csrf, "post", `/api/v1/projects/${setup.projectId}/assignments`, { userId: member.id }).expect(201);
    expect(assignment.body.warning).toMatch(/notification email failed/u);
    expect(await EffectiveProjectAccess.countDocuments({ projectId: setup.projectId, userId: member.id })).toBe(1);

    const client = await signup("client@example.com", "Client");
    const clientInvitation = await invite(ownerAccount, setup, client.email, "project", "client-participant");
    await accept(client, clientInvitation.id);
    const originalMembership = await ClientMembership.findOne({ projectId: setup.projectId, userId: client.id, status: "active" }).lean();
    const roleChange = await mutation(ownerAccount.agent, ownerAccount.csrf, "patch", `/api/v1/projects/${setup.projectId}/client-members/${String(originalMembership!._id)}/role`, {
      role: "client-approver", confirmed: true,
    }).expect(200);
    expect(roleChange.body.warning).toMatch(/notification email failed/u);
    expect(await EffectiveProjectAccess.findOne({ projectId: setup.projectId, userId: client.id }).lean()).toMatchObject({ role: "client-approver" });
    const currentMembership = await ClientMembership.findOne({ projectId: setup.projectId, userId: client.id, status: "active" }).lean();
    const removal = await mutation(ownerAccount.agent, ownerAccount.csrf, "delete", `/api/v1/projects/${setup.projectId}/client-members/${String(currentMembership!._id)}`, { confirmed: true }).expect(200);
    expect(removal.body.warning).toMatch(/notification email failed/u);
    expect(await EffectiveProjectAccess.countDocuments({ projectId: setup.projectId, userId: client.id })).toBe(0);
    await mutation(ownerAccount.agent, ownerAccount.csrf, "post", "/api/v1/auth/forgot-password", { email: "unknown@example.com" }).expect(202);
  });
});
