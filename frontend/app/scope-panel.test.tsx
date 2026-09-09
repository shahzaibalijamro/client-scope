import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ScopePanel } from "./scope-panel";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
const actor = (role: string) => ({ id: "actor", displayName: "Alex", role });
const requirement = { snapshotId: "snapshot", logicalId: "logical", title: "Homepage <script>alert(1)</script>", description: "Line one\nLine two", acceptanceCriteria: ["Works on mobile"], order: 0 };
function reviewedScope(role: "client-participant" | "client-approver") {
  return { scope: {
    state: "in-review", role, pendingAction: role === "client-approver" ? "decision-required" : undefined,
    currentVersionId: "version", permissions: { canStartDraft: false, canEditDraft: false, canSubmit: false, canWithdraw: false, canComment: true, canDecide: role === "client-approver" },
    versions: [{ id: "version", number: 1, status: "in-review", groups: [], requirements: [requirement], submitter: actor("workspace-owner"), submittedAt: "2026-09-09T00:00:00.000Z", comments: [] }],
  } };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("Slice 1.2 scope interface", () => {
  it("shows client discussion without approval controls to a participant and renders content as text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(reviewedScope("client-participant"))));
    render(<ScopePanel projectId="project" />, { wrapper });
    expect(await screen.findByRole("heading", { name: "Homepage <script>alert(1)</script>" })).toBeVisible();
    expect(screen.getByText((_content, element) => element?.textContent === "Line one\nLine two")).toHaveClass("plain-text");
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByRole("button", { name: "Post comment" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Approve scope" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request changes" })).not.toBeInTheDocument();
  });

  it("gives an approver an exact-version confirmation and refreshes after the decision", async () => {
    let approved = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/csrf")) return response({ csrfToken: "token" });
      if (path.endsWith("/decisions") && init?.method === "POST") {
        approved = true;
        return response({ version: { ...reviewedScope("client-approver").scope.versions[0], status: "approved", terminal: { actor: actor("client-approver"), at: "2026-09-09T01:00:00.000Z" } } });
      }
      return response(approved ? { scope: { ...reviewedScope("client-approver").scope, state: "approved", pendingAction: undefined, currentVersionId: "version", permissions: { canStartDraft: false, canEditDraft: false, canSubmit: false, canWithdraw: false, canComment: false, canDecide: false }, versions: [{ ...reviewedScope("client-approver").scope.versions[0], status: "approved", terminal: { actor: actor("client-approver"), at: "2026-09-09T01:00:00.000Z" } }] } } : reviewedScope("client-approver"));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ScopePanel projectId="project" />, { wrapper });
    await user.click(await screen.findByRole("button", { name: "Approve scope" }));
    expect(screen.getByRole("dialog", { name: "Approve scope v1?" })).toHaveTextContent("immutable version as the agreed scope");
    await user.click(screen.getByRole("dialog").getElementsByTagName("button")[1]!);
    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith("/decisions") && (init as RequestInit).method === "POST")).toBe(true));
  });

  it("supports keyboard-visible draft operations and preserves local input on a stale save", async () => {
    const initial = { scope: {
      state: "draft", role: "service-team-member", pendingAction: "scope-editing",
      permissions: { canStartDraft: false, canEditDraft: true, canSubmit: false, canWithdraw: false, canComment: false, canDecide: false },
      draft: { revisionToken: "r".repeat(32), groups: [], requirements: [{ logicalId: "logical", title: "Homepage", description: "Description", acceptanceCriteria: ["Done"], order: 0 }] }, versions: [],
    } };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/csrf")) return response({ csrfToken: "token" });
      if (init?.method === "PUT") return response({ error: { code: "STALE_STATE", message: "The scope changed. Refresh and try again." } }, 409);
      return response(initial);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ScopePanel projectId="project" />, { wrapper });
    const title = await screen.findByLabelText("Title");
    await user.clear(title); await user.type(title, "Local unsaved title");
    expect(screen.getByRole("button", { name: "Move up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move down" })).toBeDisabled();
    expect(screen.getByText(/workspace owner submits/u)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText(/unsaved fields are still here/u)).toBeVisible();
    expect(screen.getByLabelText("Title")).toHaveValue("Local unsaved title");
  });
});
