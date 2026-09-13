import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { fileURLToPath } from "node:url";

import { createApp } from "../src/app.js";
import { syncDomainIndexes } from "../src/domain/models.js";
import type { RequirementStructuringProvider } from "../src/domain/ai-requirement-provider.js";
import type { RequirementQualityReviewProvider } from "../src/domain/ai-requirement-review-provider.js";

process.env.NODE_ENV = "test";
process.env.FRONTEND_ORIGIN = "http://127.0.0.1:4200";
process.env.SESSION_SECRET = "playwright-session-secret-with-at-least-32-characters";
process.env.AUTH_THROTTLE_LIMIT = "1000";
process.env.E2E_TEST_MODE = "1";
process.env.MONGOMS_DOWNLOAD_DIR = fileURLToPath(new URL("../node_modules/.cache/mongodb-memory-server", import.meta.url));

const database = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
await mongoose.connect(database.getUri());
await syncDomainIndexes();

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

const server = createApp({ requirementStructuringProvider: deterministicAi, requirementQualityReviewProvider: deterministicQualityReview }).listen(4101, "127.0.0.1", () => {
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
