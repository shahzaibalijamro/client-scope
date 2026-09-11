import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Deliverable } from "./api-schemas";
import { DeliverablePanel } from "./deliverable-panel";

function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>; }
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
const actor = { id: "actor", displayName: "Alex <script>alert(1)</script>", role: "workspace-owner" as const };
const version = {
  id: "version", number: 1, outcome: "in-review" as const, title: "Website package <img src=x>", notes: "Line one\nLine two", links: [{ id: "link", label: "Safe preview", url: "https://example.com/", order: 0 }],
  attachments: [{ id: "attachment", filename: "preview.png", mediaType: "image/png" as const, byteSize: 1024, order: 0, preview: true }], scopeVersion: { id: "scope", number: 2 }, submitter: actor, submittedAt: "2026-09-11T10:00:00.000Z",
};
function permissions(role: "participant" | "approver" | "provider") { return { canView: true, canCreate: role === "provider", canEditDraft: role === "provider", canSubmit: role === "provider", canDiscard: false, canComment: true, canDecide: role === "approver", canWithdraw: role === "provider", canCancel: false }; }
function record(role: "participant" | "approver" | "provider"): Deliverable { return { id: "deliverable", number: 1, title: version.title, state: "in-review", creator: actor, createdAt: "2026-09-11T09:00:00.000Z", updatedAt: "2026-09-11T10:00:00.000Z", permissions: permissions(role), currentVersion: version }; }
function fetchFor(item: Deliverable, role: "client-participant" | "client-approver" | "workspace-owner" = "client-participant") {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/comments")) return response({ history: { comments: [] } });
    if (url.includes("/history")) return response({ history: { deliverables: [] } });
    if (url.includes("/versions")) return response({ history: { versions: [version] } });
    return response({ deliverables: { available: true, role, openCount: 1, limit: 50, permissions: { canCreate: role === "workspace-owner" }, deliverables: [item] } });
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("Slice 1.5 deliverable interface", () => {
  it("renders exact submitted work as inert text and gives Participants discussion without decision controls", async () => {
    vi.stubGlobal("fetch", fetchFor(record("participant"))); render(<DeliverablePanel projectId="project" />, { wrapper });
    expect((await screen.findAllByRole("heading", { name: version.title }))[0]).toBeVisible(); expect(document.querySelector("script, img[src='x']")).toBeNull();
    expect(screen.getByText((_content, element) => element?.textContent === "Line one\nLine two")).toHaveClass("plain-text");
    expect(screen.getByRole("link", { name: /Safe preview/ })).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByLabelText("Comment")).toBeVisible(); expect(screen.queryByRole("button", { name: "Approve exact version" })).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Request revision" })).not.toBeInTheDocument();
  });

  it("shows exact-version decision confirmations only to Approvers", async () => {
    vi.stubGlobal("fetch", fetchFor(record("approver"), "client-approver")); const user = userEvent.setup(); render(<DeliverablePanel projectId="project" />, { wrapper });
    await screen.findByRole("button", { name: "Approve exact version" }); await user.click(screen.getByRole("button", { name: "Request revision" }));
    const dialog = screen.getByRole("dialog", { name: `Request revision for ${version.title}, version 1?` }); expect(dialog).toHaveTextContent("submitted version remains permanently visible"); expect(within(dialog).getByRole("button", { name: "Request revision" })).toBeDisabled();
    await user.type(screen.getByLabelText("Required revision"), "Make the mobile spacing consistent."); expect(within(dialog).getByRole("button", { name: "Request revision" })).toBeEnabled();
  });

  it("keeps copied revision drafts provider-private and requires a revision summary before submission", async () => {
    const { currentVersion: _currentVersion, ...providerRecord } = record("provider"); void _currentVersion;
    const item: Deliverable = { ...providerRecord, state: "revision-draft", permissions: { ...permissions("provider"), canComment: false, canWithdraw: false, canCancel: true }, draft: { id: "draft", revisionToken: "r".repeat(32), copiedFromVersionId: "version", notes: "Copied notes", links: [], attachments: [] } };
    vi.stubGlobal("fetch", fetchFor(item, "workspace-owner")); render(<DeliverablePanel projectId="project" />, { wrapper });
    expect(await screen.findByText("Provider-private draft. Clients cannot see these details until a version is submitted.")).toBeVisible(); expect(screen.getByLabelText("Revision summary")).toBeRequired(); expect(screen.getByRole("button", { name: "Submit revised version" })).toBeDisabled(); expect(screen.getByRole("button", { name: "Cancel deliverable" })).toBeVisible();
  });
});
