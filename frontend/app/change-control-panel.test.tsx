import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChangeControlPanel } from "./change-control-panel";
import type { ChangeControl } from "./api-schemas";

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>;
}
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
const actor = (role: "workspace-owner" | "service-team-member" | "client-participant" | "client-approver") => ({ id: `${role}-id`, displayName: "Alex", role });
const requirement = { snapshotId: "snapshot", logicalId: "logical", title: "Contact <script>alert(1)</script>", description: "Line one\nLine two", acceptanceCriteria: ["Sends"], order: 0 };
function review(role: ChangeControl["role"]): { changeControl: ChangeControl } {
  return { changeControl: {
    role, pendingAction: role === "client-approver" ? "decision-required" : undefined, permissions: { canStart: false },
    requests: [{
      id: "request", number: 1, title: "Add contact", state: "in-review", baseScopeVersion: { id: "base", number: 1 },
      creator: actor("workspace-owner"), createdAt: "2026-09-10T00:00:00.000Z",
      permissions: { canEditDraft: false, canSubmit: false, canDiscard: false, canWithdraw: false, canCancel: false, canComment: true, canDecide: role === "client-approver" },
      proposals: [{
        id: "proposal", number: 1, outcome: "in-review", title: "Add contact", rationale: "Clients need contact.", baseScopeVersion: { id: "base", number: 1 },
        groups: [], requirements: [requirement], comparisons: { baseScope: [{ id: "item", comparisonKind: "base-scope", entityKind: "requirement", entityId: "logical", changeKinds: ["added"], after: requirement, position: 0 }], previousProposal: [] },
        submitter: actor("workspace-owner"), submittedAt: "2026-09-10T01:00:00.000Z", comments: [],
      }],
    }],
  } };
}

afterEach(() => vi.unstubAllGlobals());

describe("Slice 1.3 change-control interface", () => {
  it("lets a participant review and comment without presenting binding decisions", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(review("client-participant"))));
    render(<ChangeControlPanel projectId="project" />, { wrapper });
    expect(await screen.findByRole("heading", { name: "Contact <script>alert(1)</script>" })).toBeVisible();
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText((_content, element) => element?.textContent === "Line one\nLine two")).toHaveClass("plain-text");
    expect(screen.getByRole("button", { name: "Post comment" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Approve proposal" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject proposal" })).not.toBeInTheDocument();
  });

  it("shows three distinct decisions only to an approver with an exact-proposal confirmation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(review("client-approver"))));
    const user = userEvent.setup(); render(<ChangeControlPanel projectId="project" />, { wrapper });
    expect(await screen.findByText("decision required")).toBeVisible();
    expect(screen.getByRole("button", { name: "Request changes" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject proposal" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Approve proposal" }));
    expect(screen.getByRole("dialog", { name: /approve change request 1, proposal v1/iu })).toHaveTextContent("supersedes scope v1");
  });

  it("keeps a revision draft editable for a team member but hides owner-only actions", async () => {
    const value = review("client-participant");
    value.changeControl = {
      role: "service-team-member", pendingAction: "change-revision", permissions: { canStart: false }, requests: [{
        ...value.changeControl.requests[0]!, state: "revision-draft", permissions: { canEditDraft: true, canSubmit: false, canDiscard: false, canWithdraw: false, canCancel: false, canComment: false, canDecide: false },
        draft: { revisionToken: "r".repeat(32), copiedFromProposalId: "proposal", title: "Add contact", titleFrozen: true, rationale: "Clients need contact.", groups: [], requirements: [requirement] },
      }],
    };
    vi.stubGlobal("fetch", vi.fn(async () => response(value)));
    render(<ChangeControlPanel projectId="project" />, { wrapper });
    expect(await screen.findByDisplayValue("Add contact")).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Save proposal" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Submit for client review" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel change request" })).not.toBeInTheDocument();
  });
});
