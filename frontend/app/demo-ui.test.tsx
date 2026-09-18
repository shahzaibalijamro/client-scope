import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthScreen, ClientScopeApp } from "./client-scope-app";

afterEach(() => vi.restoreAllMocks());

function renderApp(authenticated = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}>{authenticated ? <ClientScopeApp /> : <AuthScreen />}</QueryClientProvider>);
}

describe("public demo entry", () => {
  it("offers the two published identities alongside ordinary account access", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/session")) return new Response(JSON.stringify({ user: null }), { status: 200 });
      if (url.endsWith("/api/v1/demo")) return new Response(JSON.stringify({
        enabled: true, status: "ready",
        identities: [
          { label: "Workspace Owner", email: "owner@demo.invalid", password: "owner-unique-demo-secret" },
          { label: "Client Approver", email: "approver@demo.invalid", password: "approver-unique-demo-secret" },
        ],
        reset: { cadenceHours: 6, nextScheduledAt: "2026-09-16T12:00:00.000Z" },
      }), { status: 200 });
      throw new Error(`Unexpected request: ${url}`);
    });
    renderApp();
    await userEvent.click(await screen.findByRole("button", { name: "Use Client Approver" }, { timeout: 5_000 }));
    expect(screen.getByLabelText("Email address")).toHaveValue("approver@demo.invalid");
    expect(screen.getByLabelText("Password")).toHaveValue("approver-unique-demo-secret");
    expect(screen.getByRole("link", { name: "Create account" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Forgot password?" })).toBeVisible();
    expect(screen.getByText(/changes are temporary/i)).toBeInTheDocument();
  });

  it("keeps ordinary signup available when demo mode is disabled", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/session")) return new Response(JSON.stringify({ user: null }), { status: 200 });
      if (url.endsWith("/api/v1/demo")) return new Response(JSON.stringify({ enabled: false }), { status: 200 });
      throw new Error(`Unexpected request: ${url}`);
    });
    renderApp();
    expect(await screen.findByRole("link", { name: "Create account" })).toBeVisible();
    expect(screen.queryByText("Explore the shared demo")).not.toBeInTheDocument();
  });

  it("does not label an ordinary authenticated account as temporary when shared demo entry is enabled", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/session")) return new Response(JSON.stringify({
        user: { id: "personal", email: "person@example.com", displayName: "Personal User", verified: true },
      }), { status: 200 });
      if (url.endsWith("/api/v1/work")) return new Response(JSON.stringify({ invitations: [], workspaces: [] }), { status: 200 });
      if (url.endsWith("/api/v1/demo")) return new Response(JSON.stringify({
        enabled: true, status: "ready",
        identities: [
          { label: "Workspace Owner", email: "owner@demo.invalid", password: "owner-unique-demo-secret" },
          { label: "Client Approver", email: "approver@demo.invalid", password: "approver-unique-demo-secret" },
        ],
        reset: { cadenceHours: 6, nextScheduledAt: "2026-09-16T12:00:00.000Z" },
      }), { status: 200 });
      throw new Error(`Unexpected request: ${url}`);
    });
    renderApp(true);
    expect(await screen.findByRole("heading", { name: /Good to see you, Personal/u })).toBeVisible();
    expect(screen.queryByText(/Shared portfolio demo/u)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit profile" })).toBeVisible();
    expect(screen.getByRole("button", { name: "My Work" })).toHaveAttribute("title", "My Work");
    expect(screen.getByTitle("Switch project")).toHaveAttribute("title", "Switch project");
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toHaveAttribute("title", "Collapse sidebar");
  });
});
