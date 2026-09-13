import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AiRequirementReviewPanel } from "./ai-requirement-review-panel";

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>;
}
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
const requirementId = "507f1f77bcf86cd799439011";
const draft = { id: "507f1f77bcf86cd799439012", revisionToken: "d".repeat(32), groups: [], requirements: [{ logicalId: requirementId, title: "Fast page", description: "The page should be fast.", acceptanceCriteria: ["It loads."], order: 0 }] };
const pending = {
  id: "507f1f77bcf86cd799439013", state: "pending-review" as const, freshness: "fresh" as const,
  binding: { projectId: "507f1f77bcf86cd799439014", draftId: draft.id, baseDraftRevision: draft.revisionToken }, reviewRevision: "r".repeat(32),
  createdAt: "2026-09-13T00:00:00.000Z", generatedAt: "2026-09-13T00:00:01.000Z", expiresAt: "2026-09-14T00:00:01.000Z",
  initiatedBy: { id: "owner", displayName: "Owner" },
  boundDraft: { version: "requirement-quality-review-input-v1" as const, requirements: [{ logicalRequirementId: requirementId, title: "Fast page", description: "The page should be fast.", acceptanceCriteria: ["It loads."] }] },
  original: {
    findings: [
      { key: "vague", category: "vagueness" as const, explanation: "Fast is not measurable.", primaryRequirementId: requirementId },
      { key: "missing", category: "clarification-needed" as const, explanation: "A target is missing.", primaryRequirementId: requirementId },
    ],
    suggestions: [{ key: "title", rationale: "Use the existing page context.", patch: { findingKey: "vague", targetRequirementId: requirementId, kind: "replace-title" as const, expectedValue: "Fast page", proposedValue: "Responsive page" } }],
    clarificationQuestions: [{ findingKey: "missing", requirementIds: [requirementId], question: "What measurable target is required?" }],
  },
  workingSuggestions: [{ key: "title", rationale: "Use the existing page context.", selected: true, patch: { findingKey: "vague", targetRequirementId: requirementId, kind: "replace-title" as const, expectedValue: "Fast page", proposedValue: "Responsive page" } }],
  actions: { canEdit: true, canDiscard: true, canApply: true },
};

afterEach(() => vi.unstubAllGlobals());

describe("Slice 2.2 AI requirement quality review", () => {
  it("keeps manual work available when review is disabled", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ availability: { enabled: false }, runs: [] })));
    render(<AiRequirementReviewPanel projectId={pending.binding.projectId} draft={draft} reloadDraft={vi.fn()} />, { wrapper });
    expect(await screen.findByText(/AI quality review is unavailable/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Review saved draft" })).not.toBeInTheDocument();
  });

  it("discloses bounded processing and requires saved staging plus atomic confirmation", async () => {
    let current = pending;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/csrf")) return response({ csrfToken: "token" });
      if (init?.method === "POST" && path.endsWith("/requirement-reviews")) return response({ review: current }, 201);
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as { suggestions: Array<{ key: string; selected: boolean; proposedValue: string | string[] }> };
        current = { ...current, reviewRevision: "s".repeat(32), workingSuggestions: current.workingSuggestions.map((item) => ({ ...item, selected: body.suggestions[0]!.selected, patch: { ...item.patch, proposedValue: body.suggestions[0]!.proposedValue as string } })) };
        return response({ review: current });
      }
      if (init?.method === "POST" && path.endsWith("/apply")) return response({ review: { id: current.id, state: "applied", appliedAt: "2026-09-13T01:00:00.000Z", draft: { revisionToken: "n".repeat(32) } } });
      return response({ availability: { enabled: true }, runs: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const reload = vi.fn(async () => undefined);
    const user = userEvent.setup();
    render(<AiRequirementReviewPanel projectId={pending.binding.projectId} draft={draft} reloadDraft={reload} />, { wrapper });
    await user.click(await screen.findByRole("button", { name: "Review saved draft" }));
    expect(screen.getByRole("dialog", { name: "Send this saved draft for AI quality review?" })).toHaveTextContent("Only ordered group labels and requirement IDs");
    await user.click(screen.getByRole("button", { name: "Generate private review" }));
    expect(await screen.findByRole("heading", { name: "Review quality findings" })).toHaveFocus();
    expect(screen.getByText("Clarification questions · not applyable")).toBeVisible();
    expect(screen.getByText(/What measurable target is required\?/)).toBeVisible();
    const proposed = screen.getByRole("textbox", { name: "Proposed text" });
    await user.clear(proposed); await user.type(proposed, "Human-reviewed page");
    expect(screen.getByText("Save staging changes before applying.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Apply 1 selected" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save staging" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Apply 1 selected" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Apply 1 selected" }));
    expect(screen.getByRole("dialog", { name: "Apply 1 quality suggestions?" })).toHaveTextContent("validated and applied atomically");
    await user.click(screen.getByRole("button", { name: "Apply selected changes" }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    const generation = fetchMock.mock.calls.find(([input, init]) => String(input).endsWith("/requirement-reviews") && (init as RequestInit).method === "POST");
    expect(JSON.parse(String((generation![1] as RequestInit).body))).toEqual({ expectedDraftId: draft.id, expectedDraftRevision: draft.revisionToken });
    const applyCall = fetchMock.mock.calls.find(([input, init]) => String(input).endsWith("/apply") && (init as RequestInit).method === "POST");
    expect(JSON.parse(String((applyCall![1] as RequestInit).body))).toEqual({ expectedReviewRevision: "s".repeat(32), expectedDraftRevision: draft.revisionToken, confirmed: true });
  });

  it("keeps stale findings readable and disables editing and Apply", async () => {
    const stale = { ...pending, freshness: "stale" as const, actions: { canEdit: false, canDiscard: true, canApply: false } };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input).endsWith(`/requirement-reviews/${stale.id}`) ? response({ review: stale }) : response({ availability: { enabled: true }, runs: [{ id: stale.id, state: "pending-review", freshness: "stale", createdAt: stale.createdAt, generatedAt: stale.generatedAt, expiresAt: stale.expiresAt, initiatedBy: stale.initiatedBy, counts: { findings: 2, suggestions: 1, clarificationQuestions: 1 } }] })));
    const user = userEvent.setup();
    render(<AiRequirementReviewPanel projectId={pending.binding.projectId} draft={draft} reloadDraft={vi.fn()} />, { wrapper });
    await user.click(await screen.findByRole("button", { name: "Open review" }));
    expect(await screen.findByText(/saved draft changed after this review/)).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Proposed text" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Apply 1 selected" })).toBeDisabled();
  });
});
