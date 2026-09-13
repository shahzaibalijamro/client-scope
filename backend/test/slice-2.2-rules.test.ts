import { describe, expect, it, vi } from "vitest";

import {
  AI_REVIEW_INPUT_MAX_BYTES, AI_REVIEW_RESPONSE_MAX_BYTES, canonicalizeRequirementDraft,
  requirementQualityReviewOutputSchema, updateWorkingReviewInput, validateGroundedReview,
} from "../src/domain/ai-requirement-review-contracts.js";
import {
  GeminiRequirementQualityReviewProvider, REQUIREMENT_QUALITY_REVIEW_PROMPT,
} from "../src/domain/ai-requirement-review-provider.js";
import { AiProviderError } from "../src/domain/ai-requirement-provider.js";

const logicalId = "507f1f77bcf86cd799439011";
const input = {
  version: "requirement-quality-review-input-v1" as const,
  requirements: [{ logicalRequirementId: logicalId, groupLabel: "Core", title: "Fast page", description: "The page should be fast.", acceptanceCriteria: ["The page loads."] }],
};
const output = {
  findings: [{ key: "vague_speed", category: "vagueness" as const, explanation: "Fast is not objectively measurable.", primaryRequirementId: logicalId }],
  suggestions: [{ key: "clarify_copy", rationale: "This preserves the stated behavior while making the wording direct.", patch: { findingKey: "vague_speed", targetRequirementId: logicalId, kind: "replace-description" as const, expectedValue: "The page should be fast.", proposedValue: "The page must load quickly." } }],
  clarificationQuestions: [],
};

describe("Slice 2.2 quality-review contracts", () => {
  it("serializes only ordered bounded draft content deterministically and measures UTF-8 bytes", () => {
    const draft = {
      groups: [{ id: "group-1", name: "Core", order: 0 }],
      requirements: [{ logicalId, groupId: "group-1", title: "Fast page", description: "The page should be fast. 🚀", acceptanceCriteria: ["The page loads."], order: 0 }],
    };
    const first = canonicalizeRequirementDraft(draft);
    const second = canonicalizeRequirementDraft({ ...draft, requirements: [...draft.requirements] });
    expect(first.serialized).toBe(second.serialized);
    expect(first.byteLength).toBe(Buffer.byteLength(first.serialized, "utf8"));
    expect(first.byteLength).toBeGreaterThan(first.serialized.length);
    expect(first.serialized).not.toContain("project");
    expect(first.value.requirements[0]).toEqual({ logicalRequirementId: logicalId, groupLabel: "Core", title: "Fast page", description: "The page should be fast. 🚀", acceptanceCriteria: ["The page loads."] });
    expect(AI_REVIEW_INPUT_MAX_BYTES).toBe(262_144);
    const emptySize = canonicalizeRequirementDraft({ ...draft, requirements: [{ ...draft.requirements[0]!, description: "" }] }).byteLength;
    const exact = canonicalizeRequirementDraft({ ...draft, requirements: [{ ...draft.requirements[0]!, description: "x".repeat(AI_REVIEW_INPUT_MAX_BYTES - emptySize) }] });
    const over = canonicalizeRequirementDraft({ ...draft, requirements: [{ ...draft.requirements[0]!, description: `${exact.value.requirements[0]!.description}x` }] });
    expect(exact.byteLength).toBe(AI_REVIEW_INPUT_MAX_BYTES);
    expect(over.byteLength).toBe(AI_REVIEW_INPUT_MAX_BYTES + 1);
  });

  it("rejects unknown fields, references, duplicate keys, guessed clarification patches, and immutable working-shape changes", () => {
    expect(requirementQualityReviewOutputSchema.safeParse(output).success).toBe(true);
    expect(() => validateGroundedReview(output, input)).not.toThrow();
    expect(requirementQualityReviewOutputSchema.safeParse({ ...output, extra: true }).success).toBe(false);
    expect(requirementQualityReviewOutputSchema.safeParse({ ...output, findings: [...output.findings, output.findings[0]] }).success).toBe(false);
    expect(() => validateGroundedReview({ ...output, suggestions: [{ ...output.suggestions[0]!, patch: { ...output.suggestions[0]!.patch, targetRequirementId: "507f191e810c19729de860ea" } }] }, input)).toThrow();
    expect(requirementQualityReviewOutputSchema.safeParse({
      findings: [{ key: "missing", category: "clarification-needed", explanation: "A fact is missing.", primaryRequirementId: logicalId }],
      suggestions: [{ ...output.suggestions[0], patch: { ...output.suggestions[0]!.patch, findingKey: "missing" } }], clarificationQuestions: [],
    }).success).toBe(false);
    expect(updateWorkingReviewInput.safeParse({ expectedReviewRevision: "r".repeat(32), suggestions: [{ key: "one", selected: true, proposedValue: "Text", targetRequirementId: logicalId }] }).success).toBe(false);
  });
});

describe("Slice 2.2 Gemini quality-review boundary", () => {
  it("sends fixed instructions and canonical draft data, then validates stable-ID grounding", async () => {
    const fetcher = vi.fn(async (...args: Parameters<typeof fetch>) => { void args; return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(output) }] } }] }), { status: 200 }); });
    const provider = new GeminiRequirementQualityReviewProvider("private-key", "test-model", 30_000, fetcher);
    await expect(provider.review(input)).resolves.toEqual(expect.objectContaining({ output, providerId: "google-gemini", modelId: "test-model" }));
    const request = JSON.parse(String((fetcher.mock.calls[0]![1] as RequestInit).body));
    expect(request.systemInstruction.parts[0].text.startsWith(REQUIREMENT_QUALITY_REVIEW_PROMPT)).toBe(true);
    expect(JSON.stringify(request)).toContain(logicalId);
    expect(JSON.stringify(request)).not.toContain("clientName");
    expect(JSON.stringify(request)).not.toContain("additionalProperties");
    expect(JSON.stringify(request)).not.toContain("minItems");
    expect(JSON.stringify(request)).not.toContain("maxItems");
    expect((fetcher.mock.calls[0]![1] as RequestInit).headers).toEqual(expect.objectContaining({ "x-goog-api-key": "private-key" }));
  });

  it("rejects malformed, semantically ungrounded, and oversized responses without retry", async () => {
    const cases = [
      new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "not-json" }] } }] }), { status: 200 }),
      new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ ...output, suggestions: [{ ...output.suggestions[0], patch: { ...output.suggestions[0]!.patch, expectedValue: "wrong" } }] }) }] } }] }), { status: 200 }),
      new Response("x".repeat(AI_REVIEW_RESPONSE_MAX_BYTES + 1), { status: 200 }),
    ];
    for (const response of cases) {
      const fetcher = vi.fn(async () => response) as unknown as typeof fetch;
      await expect(new GeminiRequirementQualityReviewProvider("key", "model", 30_000, fetcher).review(input)).rejects.toBeInstanceOf(AiProviderError);
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
});
