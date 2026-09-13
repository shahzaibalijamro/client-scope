import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AiRequirementPanel } from "./ai-requirement-panel";

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>;
}
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
const draft = { id: "draft", revisionToken: "d".repeat(32), groups: [], requirements: [] };
const pending = {
  id: "proposal", state: "pending" as const,
  binding: { projectId: "project", draftId: "draft", baseDraftRevision: "d".repeat(32) },
  proposalRevision: "p".repeat(32), expiresAt: "2026-09-14T00:00:00.000Z", createdAt: "2026-09-13T00:00:00.000Z",
  initiatedBy: { id: "owner", displayName: "Owner" }, rawSource: "Need a homepage",
  original: { groups: [], requirements: [{ key: "home", title: "Homepage", description: "Provide a homepage.", acceptanceCriteria: ["It is available."] }], warnings: [{ category: "ambiguity" as const, message: "No date was supplied." }] },
  working: { groups: [], requirements: [{ key: "home", title: "Homepage", description: "Provide a homepage.", acceptanceCriteria: ["It is available."], selected: true }] },
  warnings: [{ category: "ambiguity" as const, message: "No date was supplied." }], actions: { canEdit: true, canDiscard: true, canApply: true },
};

afterEach(() => vi.unstubAllGlobals());

describe("Slice 2.1 AI requirement staging", () => {
  it("keeps the complete manual workflow available when AI is disabled", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ availability: { enabled: false }, runs: [] })));
    render(<AiRequirementPanel projectId="project" draft={draft} reloadDraft={vi.fn()} />, { wrapper });
    expect(await screen.findByText(/AI structuring is unavailable/)).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Messy requirement notes" })).not.toBeInTheDocument();
  });

  it("requires saved human review and explicit append confirmation", async () => {
    let current = pending;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/csrf")) return response({ csrfToken: "token" });
      if (init?.method === "POST" && path.endsWith("/requirement-proposals")) return response({ proposal: current }, 201);
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as { working: typeof pending.working };
        current = { ...current, proposalRevision: "q".repeat(32), working: body.working };
        return response({ proposal: current });
      }
      if (init?.method === "POST" && path.endsWith("/apply")) return response({ proposal: { id: "proposal", state: "applied", appliedAt: "2026-09-13T01:00:00.000Z", draft: { revisionToken: "n".repeat(32) }, appended: { groupIds: [], requirementIds: ["requirement"] } } });
      return response({ availability: { enabled: true }, runs: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const reload = vi.fn(async () => undefined);
    const user = userEvent.setup();
    render(<AiRequirementPanel projectId="project" draft={draft} reloadDraft={reload} />, { wrapper });
    await user.type(await screen.findByRole("textbox", { name: "Messy requirement notes" }), "Need a homepage");
    await user.click(screen.getByRole("button", { name: "Generate private proposal" }));
    expect(await screen.findByRole("heading", { name: "Review before adding to the draft" })).toHaveFocus();
    expect(screen.getByText(/No date was supplied/)).toBeVisible();
    const title = screen.getByRole("textbox", { name: "Title" });
    await user.clear(title); await user.type(title, "Reviewed homepage");
    expect(screen.getByText("Save staging changes before applying.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Apply 1 selected" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save staging" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Apply 1 selected" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Apply 1 selected" }));
    expect(screen.getByRole("dialog", { name: "Append selected requirements?" })).toHaveTextContent("Existing groups and requirements will not be changed");
    await user.click(screen.getByRole("button", { name: "Append to draft" }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    const applyCall = fetchMock.mock.calls.find(([input, init]) => String(input).endsWith("/apply") && (init as RequestInit).method === "POST");
    expect(JSON.parse(String((applyCall![1] as RequestInit).body)).selection.requirements[0].title).toBe("Reviewed homepage");
  });
});
