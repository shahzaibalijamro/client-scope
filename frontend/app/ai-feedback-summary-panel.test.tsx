import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AiFeedbackSummaryPanel } from "./ai-feedback-summary-panel";

function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>; }
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
const sourceOne = { feedbackRecordId: "feedback-one", versionId: "version-one", versionNumber: 1, kind: "comment" as const, author: { id: "client", displayName: "Client", role: "client-participant" as const }, createdAt: "2026-09-13T10:00:00.000Z" };
const sourceTwo = { feedbackRecordId: "feedback-two", versionId: "version-two", versionNumber: 2, kind: "revision-request" as const, author: { id: "approver", displayName: "Approver", role: "client-approver" as const }, createdAt: "2026-09-13T11:00:00.000Z" };
const citations = [sourceOne, sourceTwo].map(({ feedbackRecordId, versionId }) => ({ feedbackRecordId, versionId }));
const summary = {
  id: "summary", deliverableId: "deliverable", freshness: "current" as const, generatedAt: "2026-09-13T12:00:00.000Z", generatedBy: { id: "owner", displayName: "Owner" }, sourceFingerprint: "fingerprint", sourceReferences: [sourceOne, sourceTwo],
  output: { themes: [{ text: "Layout is the repeated theme.", citations }], requestedActions: [{ text: "Adjust mobile spacing.", citations: [citations[0]!] }], tensions: [{ text: "Desktop behavior needs clarification.", citations }] },
  provenance: { promptVersion: "client-feedback-summary-v1", schemaVersion: "client-feedback-summary-output-v1", operationId: "operation", provider: { id: "fake", model: "fake-model" }, execution: { durationMs: 2 } },
};

afterEach(() => vi.unstubAllGlobals());

describe("Slice 2.3 feedback-summary interface", () => {
  it("keeps original feedback available when AI is disabled or feedback is insufficient", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ availability: { enabled: false, eligibleCount: 1, minimumRequired: 2, canGenerate: false, unavailableReason: "insufficient-feedback" } })));
    render(<AiFeedbackSummaryPanel projectId="project" deliverableId="deliverable" />, { wrapper });
    expect(await screen.findByText(/At least two eligible client feedback records/)).toBeVisible(); expect(screen.queryByRole("button", { name: "Generate summary" })).not.toBeInTheDocument();
    expect(screen.getByText(/Original client comments and formal revision requests remain the sole source of truth/)).toBeVisible();
  });

  it("discloses the provider boundary and renders all grounded sections with exact record references", async () => {
    let saved: typeof summary | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input); if (path.endsWith("/csrf")) return response({ csrfToken: "token" });
      if (init?.method === "POST") { saved = summary; return response({ summary }, 201); }
      return response({ availability: { enabled: true, eligibleCount: 2, minimumRequired: 2, canGenerate: true }, ...(saved ? { summary: saved } : {}) });
    });
    vi.stubGlobal("fetch", fetchMock); const user = userEvent.setup(); render(<AiFeedbackSummaryPanel projectId="project" deliverableId="deliverable" />, { wrapper });
    await user.click(await screen.findByRole("button", { name: "Generate summary" }));
    const dialog = screen.getByRole("dialog", { name: "Generate a private feedback summary?" }); expect(dialog).toHaveTextContent("Only eligible client-authored comments and formal revision-request notes");
    await user.click(within(dialog).getByRole("button", { name: "Generate summary" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Summarize client feedback" })).toHaveFocus());
    expect(screen.getByRole("heading", { name: "Themes" })).toBeVisible(); expect(screen.getByRole("heading", { name: "Requested actions" })).toBeVisible(); expect(screen.getByRole("heading", { name: "Tensions or unclear points" })).toBeVisible();
    expect(screen.getAllByText("feedback-one").length).toBeGreaterThan(0); expect(screen.getByText("Private feedback summary generated.")).toHaveAttribute("role", "status");
    const generation = fetchMock.mock.calls.find(([input, init]) => String(input).includes("feedback-summary") && (init as RequestInit).method === "POST"); expect(JSON.parse(String((generation![1] as RequestInit).body))).toEqual({});
  });

  it("keeps an outdated result readable and requires explicit regeneration", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ availability: { enabled: true, eligibleCount: 3, minimumRequired: 2, canGenerate: true }, summary: { ...summary, freshness: "outdated" } })));
    const user = userEvent.setup(); render(<AiFeedbackSummaryPanel projectId="project" deliverableId="deliverable" />, { wrapper });
    expect(await screen.findByText(/Eligible client feedback changed after this run/)).toBeVisible(); expect(screen.getByText("Layout is the repeated theme.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Regenerate summary" })); expect(screen.getByRole("dialog", { name: "Regenerate the private feedback summary?" })).toBeVisible();
  });
});
