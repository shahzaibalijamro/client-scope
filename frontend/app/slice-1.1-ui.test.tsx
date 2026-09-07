import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ClientScopeApp } from "./client-scope-app";
import { ConfirmDialog } from "./confirm-dialog";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function response(body: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("Slice 1.1 UI workflows", () => {
  it("keeps duplicate-signup guidance neutral when no session is created", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/auth/session")) return response({ user: null });
      if (path.endsWith("/csrf")) return response({ csrfToken: "csrf-token" });
      if (path.endsWith("/auth/signup") && init?.method === "POST") {
        return response({ message: "Check your email for the next step.", csrfToken: "rotated-token" }, 202);
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ClientScopeApp />, { wrapper });

    await user.click(await screen.findByRole("button", { name: "Create account" }));
    await user.type(screen.getByLabelText("Display name"), "Existing Person");
    await user.type(screen.getByLabelText("Email address"), "existing@example.com");
    await user.type(screen.getByLabelText("Password"), "correct horse battery staple");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Check your email for the next step."));
    expect(screen.queryByText(/already exists/u)).not.toBeInTheDocument();
  });

  it("loads only the verification experience for an unverified session", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/auth/session")) return response({ user: { id: "user", email: "pending@example.com", displayName: "Pending", verified: false } });
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ClientScopeApp />, { wrapper });

    expect(await screen.findByRole("heading", { name: "Verify your email" })).toBeVisible();
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/work"))).toBe(false);
  });

  it("renders client-only accessible work with role, client, and deadline context", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/auth/session")) return response({ user: { id: "client", email: "client@example.com", displayName: "Client Person", verified: true } });
      if (path.endsWith("/work")) return response({ invitations: [], workspaces: [{ id: "workspace", name: "Provider Studio", relationship: "client", projects: [{ id: "project", workspaceId: "workspace", name: "Website", client: { id: "client-record", name: "Acme" }, targetDeadline: "2026-10-01", role: "client-approver" }] }] });
      throw new Error(`Unexpected request: ${path}`);
    }));
    render(<ClientScopeApp />, { wrapper });

    expect(await screen.findByRole("heading", { name: "Provider Studio" })).toBeVisible();
    expect(screen.getByText(/Acme · 2026-10-01/u)).toBeVisible();
    expect(screen.getByText("client approver")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Manage workspace" })).not.toBeInTheDocument();
  });

  it("shows an explicit cancellable project-leave confirmation and does not mutate on cancel", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      const path = String(input);
      if (path.endsWith("/auth/session")) return response({ user: { id: "client", email: "client@example.com", displayName: "Client", verified: true } });
      if (path.endsWith("/work")) return response({ invitations: [], workspaces: [{ id: "workspace", name: "Studio", relationship: "client", projects: [{ id: "project", workspaceId: "workspace", name: "Website", client: { id: "client-record", name: "Acme" }, role: "client-participant" }] }] });
      if (path.endsWith("/projects/project")) return response({ project: { id: "project", workspaceId: "workspace", name: "Website", client: { id: "client-record", name: "Acme" }, role: "client-participant" } });
      if (path.endsWith("/projects/project/members")) return response({ members: [{ id: "owner", displayName: "Owner", role: "workspace-owner" }, { id: "client", displayName: "Client", role: "client-participant" }] });
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ClientScopeApp />, { wrapper });
    await user.click(await screen.findByRole("button", { name: /Website/u }));
    await user.click(await screen.findByRole("button", { name: "Leave project" }));
    expect(screen.getByRole("dialog", { name: "Leave Website?" })).toBeVisible();
    expect(screen.getByText(/requires a new invitation/u)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST")).toHaveLength(0);
  });

  it("renders owner client editing and complete active/inactive access administration", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/auth/session")) return response({ user: { id: "owner", email: "owner@example.com", displayName: "Owner", verified: true } });
      if (path.endsWith("/work")) return response({ invitations: [], workspaces: [{ id: "workspace", name: "Studio", relationship: "owner", projects: [{ id: "project", workspaceId: "workspace", name: "Website", client: { id: "client-record", name: "Acme" }, role: "workspace-owner" }] }] });
      if (path.endsWith("/workspaces/workspace/clients")) return response({ clients: [{ id: "client-record", name: "Acme", companyName: "Acme Ltd", primaryContactEmail: "contact@example.com", internalNotes: "Owner only" }] });
      if (path.endsWith("/workspaces/workspace/access")) return response({
        workspaceMemberships: [{ id: "wm", userId: "member", displayName: "Team Member", email: "member@example.com", role: "service-team-member", status: "active", startedAt: "2026-09-01T00:00:00.000Z" }],
        assignments: [{ id: "assignment", projectId: "project", userId: "member", displayName: "Team Member", status: "active", startedAt: "2026-09-02T00:00:00.000Z" }],
        clientMemberships: [{ id: "cm-old", projectId: "project", userId: "client", displayName: "Client", email: "client@example.com", role: "client-participant", status: "inactive", startedAt: "2026-09-01T00:00:00.000Z", endedAt: "2026-09-03T00:00:00.000Z", endReason: "role-changed" }, { id: "cm", projectId: "project", userId: "client", displayName: "Client", email: "client@example.com", role: "client-approver", status: "active", startedAt: "2026-09-03T00:00:00.000Z" }],
        invitations: [{ id: "invite", projectId: "project", kind: "project", email: "pending@example.com", role: "client-participant", status: "pending", deliveryStatus: "failed", expiresAt: "2026-09-09T00:00:00.000Z" }],
      });
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ClientScopeApp />, { wrapper });
    await user.click(await screen.findByRole("button", { name: "Manage workspace" }));
    expect(await screen.findByText("Owner only")).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Delete" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Access" }));
    expect(await screen.findByText(/member@example.com · active/u)).toBeVisible();
    expect(screen.getByRole("button", { name: "Unassign" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Change role" })).toBeVisible();
    expect(screen.getByText(/client participant · inactive · role-changed/u)).toBeVisible();
    expect(screen.getByText(/pending · delivery failed/u)).toBeVisible();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Replace" })).toBeVisible();
  });

  it("moves focus into confirmation and returns it to the invoking control", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return <><button onClick={() => setOpen(true)}>Open confirmation</button>{open && <ConfirmDialog title="Confirm action" description="This changes access." confirmLabel="Confirm" onCancel={() => setOpen(false)} onConfirm={() => undefined} />}</>;
    }
    const React = await import("react");
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open confirmation" });
    await user.click(opener);
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(opener).toHaveFocus();
  });

  it("traps keyboard focus inside a confirmation and supports Escape cancellation", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return <><button onClick={() => setOpen(true)}>Open dialog</button>{open && <ConfirmDialog title="Confirm access" description="This changes access." confirmLabel="Confirm change" onCancel={() => setOpen(false)} onConfirm={() => undefined} />}<button>Outside action</button></>;
    }
    const React = await import("react");
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open dialog" });
    await user.click(opener);
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Confirm change" });
    await waitFor(() => expect(cancel).toHaveFocus());
    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
