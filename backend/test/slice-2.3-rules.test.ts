import { describe, expect, it, vi } from "vitest";

import {
  AI_FEEDBACK_INPUT_MAX_BYTES, AI_FEEDBACK_RESPONSE_MAX_BYTES, canonicalizeEligibleFeedback,
  feedbackSummaryOutputSchema, validateGroundedFeedbackSummary,
} from "../src/domain/ai-feedback-summary-contracts.js";
import { FEEDBACK_SUMMARIZATION_PROMPT, GeminiFeedbackSummarizationProvider } from "../src/domain/ai-feedback-summary-provider.js";
import { AiProviderError } from "../src/domain/ai-requirement-provider.js";

const firstId = "507f1f77bcf86cd799439011"; const secondId = "507f1f77bcf86cd799439012";
const firstVersion = "507f1f77bcf86cd799439021"; const secondVersion = "507f1f77bcf86cd799439022"; const authorId = "507f1f77bcf86cd799439031";
const records = [
  { feedbackRecordId: firstId, versionId: firstVersion, kind: "comment" as const, text: "Increase the mobile spacing.", authorId, authorRole: "client-participant" as const, createdAt: "2026-09-12T10:00:00.000Z" },
  { feedbackRecordId: secondId, versionId: secondVersion, kind: "revision-request" as const, text: "Keep the desktop spacing unchanged.", authorId, authorRole: "client-approver" as const, createdAt: "2026-09-12T11:00:00.000Z" },
];
const output = {
  themes: [{ text: "Spacing is the repeated topic.", citations: records.map(({ feedbackRecordId, versionId }) => ({ feedbackRecordId, versionId })) }],
  requestedActions: [{ text: "Increase mobile spacing.", citations: [{ feedbackRecordId: firstId, versionId: firstVersion }] }],
  tensions: [{ text: "Mobile should change while desktop should remain unchanged.", citations: records.map(({ feedbackRecordId, versionId }) => ({ feedbackRecordId, versionId })) }],
};

describe("Slice 2.3 feedback-summary contracts", () => {
  it("orders and fingerprints the exact immutable eligible set deterministically", () => {
    const first = canonicalizeEligibleFeedback(records);
    const reordered = canonicalizeEligibleFeedback([...records].reverse());
    expect(first.value.records.map((record) => record.feedbackRecordId)).toEqual([firstId, secondId]);
    expect(reordered.serialized).toBe(first.serialized); expect(reordered.fingerprint).toBe(first.fingerprint);
    expect(first.byteLength).toBe(Buffer.byteLength(first.serialized, "utf8")); expect(AI_FEEDBACK_INPUT_MAX_BYTES).toBe(262_144);
    expect(canonicalizeEligibleFeedback([{ ...records[0]!, text: "Changed" }, records[1]!]).fingerprint).not.toBe(first.fingerprint);
    expect(first.serialized).not.toContain("attachment"); expect(first.serialized).not.toContain("projectName");
  });

  it("requires bounded nonempty output and exact record-version grounding", () => {
    const input = canonicalizeEligibleFeedback(records).value;
    expect(feedbackSummaryOutputSchema.safeParse(output).success).toBe(true); expect(() => validateGroundedFeedbackSummary(output, input)).not.toThrow();
    expect(feedbackSummaryOutputSchema.safeParse({ themes: [], requestedActions: [], tensions: [] }).success).toBe(false);
    expect(feedbackSummaryOutputSchema.safeParse({ ...output, extra: true }).success).toBe(false);
    expect(feedbackSummaryOutputSchema.safeParse({ ...output, themes: [{ ...output.themes[0], citations: [output.themes[0]!.citations[0], output.themes[0]!.citations[0]] }] }).success).toBe(false);
    expect(() => validateGroundedFeedbackSummary({ ...output, requestedActions: [{ ...output.requestedActions[0]!, citations: [{ feedbackRecordId: firstId, versionId: secondVersion }] }] }, input)).toThrow();
  });
});

describe("Slice 2.3 Gemini boundary", () => {
  it("sends only canonical untrusted feedback and validates exact citations", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(output) }] } }] }), { status: 200 })) as unknown as typeof fetch;
    const provider = new GeminiFeedbackSummarizationProvider("private-key", "test-model", 30_000, fetcher);
    const input = canonicalizeEligibleFeedback(records).value;
    await expect(provider.summarize(input)).resolves.toEqual(expect.objectContaining({ output, providerId: "google-gemini", modelId: "test-model" }));
    const request = JSON.parse(String((vi.mocked(fetcher).mock.calls[0]![1] as RequestInit).body));
    expect(request.systemInstruction.parts[0].text.startsWith(FEEDBACK_SUMMARIZATION_PROMPT)).toBe(true);
    expect(JSON.stringify(request)).toContain(firstId); expect(JSON.stringify(request)).not.toContain("client profile");
    expect((vi.mocked(fetcher).mock.calls[0]![1] as RequestInit).headers).toEqual(expect.objectContaining({ "x-goog-api-key": "private-key" }));
  });

  it("rejects malformed, ungrounded, and oversized output without retry", async () => {
    const input = canonicalizeEligibleFeedback(records).value;
    const invalid = { ...output, themes: [{ ...output.themes[0]!, citations: [{ feedbackRecordId: firstId, versionId: secondVersion }] }] };
    const responses = [
      new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "not-json" }] } }] }), { status: 200 }),
      new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(invalid) }] } }] }), { status: 200 }),
      new Response("x".repeat(AI_FEEDBACK_RESPONSE_MAX_BYTES + 1), { status: 200 }),
    ];
    for (const response of responses) {
      const fetcher = vi.fn(async () => response) as unknown as typeof fetch;
      await expect(new GeminiFeedbackSummarizationProvider("key", "model", 30_000, fetcher).summarize(input)).rejects.toBeInstanceOf(AiProviderError);
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
});
