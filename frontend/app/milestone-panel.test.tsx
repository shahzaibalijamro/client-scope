import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Milestone, MilestoneTimeline } from "./api-schemas";
import { MilestonePanel } from "./milestone-panel";

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>;
}
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
const active: Milestone = {
  id: "milestone-one", title: "Design <script>alert(1)</script>", description: "Line one\nLine two",
  targetDate: "2099-01-01", status: "completed", recordState: "active", position: 0, isOverdue: true,
  createdAt: "2026-09-10T00:00:00.000Z", updatedAt: "2026-09-10T02:00:00.000Z",
  latestTransition: {
    id: "transition-one", previousStatus: "in-progress", nextStatus: "completed",
    actor: { id: "owner", displayName: "Alex", role: "workspace-owner" }, transitionedAt: "2026-09-10T02:00:00.000Z", note: "Ready for review.",
  },
};
function timeline(provider: boolean): { timeline: MilestoneTimeline } {
  return { timeline: {
    available: true, activeCount: 1, limit: 50,
    permissions: { canCreate: provider, canEdit: provider, canTransition: provider, canReorder: provider, canArchive: provider },
    ...(provider ? { revisionToken: "r".repeat(32) } : {}), milestones: [active],
  } };
}
const archived = (id: string): Milestone => ({
  ...active, id, title: `Archived ${id}`, recordState: "archived", position: 2, isOverdue: false,
  archive: { actor: { id: "owner", displayName: "Alex", role: "workspace-owner" }, archivedAt: "2026-09-10T03:00:00.000Z", reason: "No longer part of the delivery sequence." },
});

afterEach(() => vi.unstubAllGlobals());

describe("Slice 1.4 milestone interface", () => {
  it("renders the server overdue value and shared history without client mutation controls", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input).includes("/archive") ? response({ archive: { milestones: [archived("old")] } }) : response(timeline(false))));
    render(<MilestonePanel projectId="project" />, { wrapper });
    expect(await screen.findByRole("heading", { name: "Design <script>alert(1)</script>" })).toBeVisible();
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText("Overdue")).toBeVisible();
    expect(screen.getAllByText((_content, element) => element?.textContent === "Line one\nLine two")[0]).toHaveClass("plain-text");
    expect(screen.getAllByText("Ready for review.")[0]).toBeVisible();
    expect(await screen.findByRole("heading", { name: "Archived old" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit details" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change status" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
  });

  it("keeps completed milestones editable, reopenable, keyboard-orderable, and explicitly archivable", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input).includes("/archive") ? response({ archive: { milestones: [] } }) : response(timeline(true))));
    const user = userEvent.setup(); render(<MilestonePanel projectId="project" />, { wrapper });
    expect(await screen.findByRole("button", { name: "Edit details" })).toBeVisible();
    expect(screen.getByRole("button", { name: `Move ${active.title} up` })).toBeDisabled();
    expect(screen.getByRole("button", { name: `Move ${active.title} down` })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Change status" }));
    const statusDialog = screen.getByRole("dialog", { name: `Change status for ${active.title}?` });
    expect(statusDialog).toHaveTextContent("permanent status event");
    expect(screen.getByLabelText("New status")).toHaveValue("in-progress");
    expect(screen.getByLabelText("Transition note (optional)")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Archive" }));
    expect(screen.getByRole("dialog", { name: `Archive ${active.title}?` })).toHaveTextContent("permanently");
    expect(screen.getByRole("button", { name: "Archive milestone" })).toBeDisabled();
    await user.type(screen.getByLabelText("Archive reason"), "Combined with launch");
    expect(screen.getByRole("button", { name: "Archive milestone" })).toBeEnabled();
  });

  it("appends older archive pages through a bounded load-more action", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes("/archive")) return response(timeline(false));
      return url.includes("cursor=")
        ? response({ archive: { milestones: [archived("older")] } })
        : response({ archive: { milestones: [archived("newer")], nextCursor: "opaque.cursor" } });
    });
    vi.stubGlobal("fetch", fetch); const user = userEvent.setup(); render(<MilestonePanel projectId="project" />, { wrapper });
    expect(await screen.findByRole("heading", { name: "Archived newer" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Load older milestones" }));
    expect(await screen.findByRole("heading", { name: "Archived older" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Archived newer" })).toBeVisible();
  });
});
