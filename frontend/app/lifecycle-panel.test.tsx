import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LifecyclePanel } from "./lifecycle-panel";

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>;
}
function response(body: unknown) { return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }); }
const permissions = { canRequestCompletion: false, canWithdrawCompletion: false, canDecideCompletion: false, canArchive: false, canRestore: false };
const activity = { activity: { items: [{ id: "activity-1", type: "project.created", occurredAt: "2026-09-12T10:00:00.000Z", actor: { id: "owner", displayName: "Alex", role: "workspace-owner" }, entity: { projectName: "Website" } }] } };

afterEach(() => vi.unstubAllGlobals());

describe("Slice 1.6 lifecycle interface", () => {
  it("shows every readiness blocker and only the owner's ready action", async () => {
    const lifecycle = { lifecycle: { state: "active", revision: "r".repeat(32), readOnly: false, permissions: { ...permissions, canRequestCompletion: false }, readiness: { ready: false, blockers: [{ code: "NO_APPROVED_DELIVERABLE" }, { code: "OPEN_DELIVERABLE", count: 2 }] }, rounds: [], archiveHistory: [] } };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => response(String(input).includes("/activity") ? activity : lifecycle)));
    render(<LifecyclePanel projectId="project" />, { wrapper });
    expect(await screen.findByRole("heading", { name: "Completion blockers" })).toBeVisible();
    expect(screen.getByText("Approve at least one deliverable.")).toBeVisible();
    expect(screen.getByText("Finish or cancel every open deliverable. (2)")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Request final review" })).not.toBeInTheDocument();
    expect(await screen.findByText("Alex created the project.")).toBeVisible();
  });

  it("gives an approver exact final controls and explains permanent closure", async () => {
    const round = { id: "round-1", number: 1, status: "in-review", revisionToken: "q".repeat(32), requester: { id: "owner", displayName: "Alex", role: "workspace-owner" }, requestedAt: "2026-09-12T10:00:00.000Z", readiness: { scope: { id: "scope", number: 1 }, deliverables: [{ id: "delivery", number: 1, title: "Launch", versionId: "version", versionNumber: 1 }], milestones: [], evaluatedAt: "2026-09-12T10:00:00.000Z" } };
    const lifecycle = { lifecycle: { state: "completion-in-review", revision: "r".repeat(32), readOnly: true, permissions: { ...permissions, canDecideCompletion: true }, currentRoundId: "round-1", rounds: [round], archiveHistory: [] } };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => response(String(input).includes("/activity") ? activity : lifecycle)));
    const user = userEvent.setup(); render(<LifecyclePanel projectId="project" />, { wrapper });
    expect(await screen.findByRole("button", { name: "Approve completion" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Return to active work" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Approve completion" }));
    expect(screen.getByRole("dialog", { name: "Approve final completion?" })).toHaveTextContent("permanently closes ordinary project work");
    expect(screen.getByLabelText("Optional note")).toBeVisible();
  });

  it("communicates that restore remains read-only and requires a reason", async () => {
    const lifecycle = { lifecycle: { state: "archived", revision: "r".repeat(32), readOnly: true, permissions: { ...permissions, canRestore: true }, rounds: [], archiveHistory: [] } };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => response(String(input).includes("/activity") ? activity : lifecycle)));
    const user = userEvent.setup(); render(<LifecyclePanel projectId="project" />, { wrapper });
    await user.click(await screen.findByRole("button", { name: "Restore to completed" }));
    const dialog = screen.getByRole("dialog", { name: "Restore this archived project?" });
    expect(dialog).toHaveTextContent("remains permanently read-only");
    expect(dialog.querySelector("button.primary")).toBeDisabled();
    await user.type(screen.getByLabelText("Reason"), "Needed for reference");
    expect(dialog.querySelector("button.primary")).toBeEnabled();
  });
});
