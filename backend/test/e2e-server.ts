import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { fileURLToPath } from "node:url";

import { createApp } from "../src/app.js";
import { syncDomainIndexes } from "../src/domain/models.js";
import type { RequirementStructuringProvider } from "../src/domain/ai-requirement-provider.js";
import type { RequirementQualityReviewProvider } from "../src/domain/ai-requirement-review-provider.js";
import type { FeedbackSummarizationProvider } from "../src/domain/ai-feedback-summary-provider.js";
import { DemoService } from "../src/domain/demo-service.js";
import type { DemoConfig } from "../src/config.js";

process.env.NODE_ENV = "test";
process.env.FRONTEND_ORIGIN = process.env.E2E_FRONTEND_ORIGIN ?? "http://127.0.0.1:4200";
process.env.SESSION_SECRET = "playwright-session-secret-with-at-least-32-characters";
process.env.AUTH_THROTTLE_LIMIT = "1000";
process.env.E2E_TEST_MODE = "1";
process.env.MONGOMS_DOWNLOAD_DIR = fileURLToPath(new URL("../node_modules/.cache/mongodb-memory-server", import.meta.url));

const database = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
await mongoose.connect(database.getUri());
await syncDomainIndexes();

let demoService: DemoService | undefined;
if (process.env.E2E_DEMO_MODE === "1") {
  const demoConfig = {
    state: "enabled", tenantId: "64b000000000000000000333",
    owner: { label: "Workspace Owner", email: "owner@demo.invalid", password: "owner-unique-demo-secret" },
    approver: { label: "Client Approver", email: "approver@demo.invalid", password: "approver-unique-demo-secret" },
    resetSecret: "playwright-reset-secret-with-thirty-two-characters", cloudinaryFolder: "clientscope-demo/playwright",
    quotas: { emailsPerUserHour: 3, aiRequestsPerUserHour: 10, uploadMibPerUserHour: 20, emailsPerDay: 30, aiRequestsPerDay: 100, uploadMibPerDay: 250 },
  } satisfies DemoConfig;
  demoService = new DemoService(demoConfig, () => new Date("2026-09-16T08:00:00.000Z"), "playwright-demo-revision");
  await demoService.initialize();
}

const deterministicAi: RequirementStructuringProvider = {
  available: true,
  async generate(source, capacity) {
    void source;
    return {
      output: {
        groups: capacity.groups > 0 ? [{ key: "experience", name: "Experience" }] : [],
        requirements: [{ key: "contact", ...(capacity.groups > 0 ? { groupKey: "experience" } : {}), title: "Contact page", description: "Provide a contact page for visitors.", acceptanceCriteria: ["Visitors can view contact details."] }],
        warnings: [{ category: "ambiguity", message: "The source does not state a delivery date." }],
      },
      operationId: "playwright-deterministic-operation", providerId: "deterministic-test", modelId: "deterministic-test", durationMs: 1,
    };
  },
};

const deterministicQualityReview: RequirementQualityReviewProvider = {
  available: true,
  async review(input) {
    const target = input.requirements[0]!;
    return {
      output: {
        findings: [
          { key: "vague_title", category: "vagueness", explanation: "The title can state the existing subject more directly.", primaryRequirementId: target.logicalRequirementId },
          { key: "missing_measure", category: "clarification-needed", explanation: "A measurable response target is not stated.", primaryRequirementId: target.logicalRequirementId },
        ],
        suggestions: [{ key: "clear_title", rationale: "This keeps the existing subject while clarifying the wording.", patch: { findingKey: "vague_title", targetRequirementId: target.logicalRequirementId, kind: "replace-title", expectedValue: target.title, proposedValue: `Reviewed ${target.title}` } }],
        clarificationQuestions: [{ findingKey: "missing_measure", requirementIds: [target.logicalRequirementId], question: "What measurable response target should be used?" }],
      },
      operationId: "playwright-quality-review", providerId: "deterministic-test", modelId: "deterministic-test", durationMs: 1,
    };
  },
};

const deterministicFeedbackSummary: FeedbackSummarizationProvider = {
  available: true,
  async summarize(input) {
    const first = input.records[0]!; const last = input.records.at(-1)!;
    return {
      output: {
        themes: [{ text: "Responsive layout feedback appears across the review.", citations: input.records.map(({ feedbackRecordId, versionId }) => ({ feedbackRecordId, versionId })) }],
        requestedActions: [{ text: "Adjust the mobile layout as requested.", citations: [{ feedbackRecordId: first.feedbackRecordId, versionId: first.versionId }] }],
        tensions: [{ text: "The relationship between mobile and desktop spacing needs clarification.", citations: [first, last].map(({ feedbackRecordId, versionId }) => ({ feedbackRecordId, versionId })) }],
      },
      operationId: "playwright-feedback-summary", providerId: "deterministic-test", modelId: "deterministic-test", durationMs: 1,
    };
  },
};

const backendPort = Number(process.env.E2E_BACKEND_PORT ?? 4101);
const server = createApp({ requirementStructuringProvider: deterministicAi, requirementQualityReviewProvider: deterministicQualityReview, feedbackSummarizationProvider: deterministicFeedbackSummary, ...(demoService ? { demoService } : {}) }).listen(backendPort, "127.0.0.1", () => {
  process.stdout.write("ClientScope E2E backend ready\n");
});

async function close() {
  const closing = new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  server.closeAllConnections();
  await closing;
  await mongoose.disconnect();
  await database.stop();
}

function shutdown() {
  const forced = setTimeout(() => process.exit(0), 5_000);
  void close().catch(() => undefined).finally(() => { clearTimeout(forced); process.exit(0); });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
