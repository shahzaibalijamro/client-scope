import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import type { DemoConfig } from "../src/config.js";
import { syncDomainIndexes, User, Workspace } from "../src/domain/models.js";
import { DemoService } from "../src/domain/demo-service.js";

const now = new Date("2026-09-16T08:00:00.000Z");
const config = {
  state: "enabled",
  tenantId: "64b000000000000000000333",
  owner: { label: "Workspace Owner", email: "owner@demo.invalid", password: "owner-unique-demo-secret" },
  approver: { label: "Client Approver", email: "approver@demo.invalid", password: "approver-unique-demo-secret" },
  resetSecret: "reset-secret-with-at-least-thirty-two-characters",
  cloudinaryFolder: "clientscope-demo/test",
  quotas: { emailsPerUserHour: 3, aiRequestsPerUserHour: 10, uploadMibPerUserHour: 20, emailsPerDay: 30, aiRequestsPerDay: 100, uploadMibPerDay: 250 },
} satisfies DemoConfig;

let database: MongoMemoryReplSet;
let demo: DemoService;

async function signedIn() {
  const agent = request.agent(createApp({ demoService: demo }));
  const csrf = (await agent.get("/api/v1/csrf")).body.csrfToken as string;
  await agent.post("/api/v1/auth/signin").set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf)
    .send({ email: config.owner.email, password: config.owner.password }).expect(200);
  return { agent, csrf: (await agent.get("/api/v1/csrf")).body.csrfToken as string };
}

beforeAll(async () => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  database = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(database.getUri()); await syncDomainIndexes();
}, 300_000);

beforeEach(async () => {
  await mongoose.connection.db!.dropDatabase(); await syncDomainIndexes();
  demo = new DemoService(config, () => new Date(now), "0123456789abcdef");
  await demo.initialize();
}, 300_000);

afterAll(async () => { await mongoose.disconnect(); await database.stop(); });

describe("Slice 3.3 public demo", () => {
  it("publishes only the intentional entry metadata and seeds the three canonical projects", async () => {
    const app = createApp({ demoService: demo });
    const status = await request(app).get("/api/v1/demo").expect(200);
    expect(status.body).toEqual({
      enabled: true, status: "ready", identities: [config.owner, config.approver],
      reset: { cadenceHours: 6, nextScheduledAt: "2026-09-16T12:00:00.000Z" },
    });
    const { agent } = await signedIn();
    const work = await agent.get("/api/v1/work").expect(200);
    expect(work.headers["x-clientscope-demo-generation"]).toBe("1");
    expect(work.body.workspaces).toHaveLength(1);
    expect([
      ...work.body.workspaces[0].projects,
      ...work.body.workspaces[0].completedProjects,
      ...work.body.workspaces[0].archivedProjects,
    ]).toHaveLength(3);
    const activeProjectId = work.body.workspaces[0].projects[0].id as string;
    const scope = await agent.get(`/api/v1/projects/${activeProjectId}/scope`).expect(200);
    expect(scope.body.scope.versions[0].provenance).toMatchObject({
      proposalSubmitter: { displayName: "Avery Morgan" },
      approvingClient: { displayName: "Jordan Lee" },
    });
    expect(scope.body.scope.versions[0].provenance.proposalSubmitter.id).toMatch(/^[a-f\d]{24}$/u);
    const activity = await agent.get(`/api/v1/projects/${activeProjectId}/activity`).expect(200);
    expect(activity.body.activity.items.map((item: { type: string }) => item.type)).toEqual([
      "deliverable.submitted", "change-request.approved", "scope.version-approved",
    ]);
  });

  it("keeps ordinary signup available while protecting canonical identity and workspace boundaries", async () => {
    const app = createApp({ demoService: demo });
    const anonymous = request.agent(app); const anonymousCsrf = (await anonymous.get("/api/v1/csrf")).body.csrfToken;
    await anonymous.post("/api/v1/auth/signup").set("Origin", "http://localhost:3000").set("X-CSRF-Token", anonymousCsrf)
      .send({ email: "visitor@example.com", password: "correct horse battery staple", displayName: "Visitor" })
      .expect(202);
    await User.updateOne({ normalizedEmail: "visitor@example.com" }, { $set: { verifiedAt: now } });
    const visitor = request.agent(app); let visitorCsrf = (await visitor.get("/api/v1/csrf")).body.csrfToken;
    const visitorSignin = await visitor.post("/api/v1/auth/signin").set("Origin", "http://localhost:3000").set("X-CSRF-Token", visitorCsrf)
      .send({ email: "visitor@example.com", password: "correct horse battery staple" }).expect(200);
    visitorCsrf = visitorSignin.body.csrfToken;
    const visitorWorkspace = await visitor.post("/api/v1/workspaces").set("Origin", "http://localhost:3000").set("X-CSRF-Token", visitorCsrf)
      .send({ name: "Visitor workspace" }).expect(201);
    await demo.reset("manual");
    expect(await Workspace.findById(visitorWorkspace.body.workspace.id).lean()).toMatchObject({ name: "Visitor workspace" });
    expect(await User.findOne({ normalizedEmail: "visitor@example.com" }).lean()).not.toBeNull();
    await anonymous.post("/api/v1/auth/forgot-password").set("Origin", "http://localhost:3000").set("X-CSRF-Token", anonymousCsrf)
      .send({ email: config.owner.email }).expect(409);
    const { agent, csrf } = await signedIn();
    await agent.patch("/api/v1/account").set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).send({ displayName: "Changed" }).expect(409);
    await agent.post("/api/v1/workspaces").set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf).send({ name: "Persistent workspace" }).expect(409);
    const canonicalOwner = await User.findOne({ normalizedEmail: config.owner.email }).lean();
    await agent.delete(`/api/v1/workspaces/${config.tenantId}/members/${canonicalOwner!._id}`).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf)
      .send({ confirmed: true }).expect(409).expect(({ body }) => expect(body.error.code).toBe("DEMO_PROTECTED"));
  });

  it("keeps the canonical session while atomically restoring the demo generation", async () => {
    const { agent } = await signedIn();
    const before = await agent.get("/api/v1/auth/session").expect(200);
    const reset = await demo.reset("manual");
    expect(reset).toMatchObject({ state: "completed", generation: 2, counts: { users: 2, workspaces: 1, projects: 3 } });
    const after = await agent.get("/api/v1/auth/session").expect(200);
    expect(after.body.user.id).toBe(before.body.user.id);
    expect(after.headers["x-clientscope-demo-generation"]).toBe("2");
  });

  it("enforces independent hourly quota and the authenticated reset contract", async () => {
    const owner = await User.findOne({ normalizedEmail: config.owner.email }).lean();
    for (let index = 0; index < 3; index += 1) await demo.reserveQuota(config.tenantId, owner!._id, "email", 1, `email-${index}`);
    await expect(demo.reserveQuota(config.tenantId, owner!._id, "email", 1, "email-4")).rejects.toMatchObject({ status: 429, code: "DEMO_QUOTA_EXCEEDED" });
    const app = createApp({ demoService: demo });
    await request(app).post("/api/v1/internal/demo/reset").set("Authorization", "Bearer wrong").expect(404);
    await request(app).post("/api/v1/internal/demo/reset").set("Authorization", `Bearer ${config.resetSecret}`).expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ state: "completed", sourceCommit: "0123456789abcdef" }));
  });

  it("fails closed when the configured tenant loses its immutable demo marker", async () => {
    await Workspace.updateOne({ _id: config.tenantId }, { $unset: { demoTenantId: 1 } });
    const unsafe = new DemoService(config, () => new Date(now), "0123456789abcdef");
    await unsafe.initialize();
    expect(await unsafe.publicStatus()).toEqual({ enabled: false });
    await expect(unsafe.reset("manual")).rejects.toMatchObject({ status: 409, code: "DEMO_PROTECTED" });
  });
});
