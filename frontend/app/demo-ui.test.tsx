import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ClientScopeApp } from "./client-scope-app";

afterEach(() => vi.restoreAllMocks());

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ClientScopeApp /></QueryClientProvider>);
}

describe("public demo entry", () => {
  it("offers only the two published identities and fills the selected sign-in credentials", async () => {
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
    expect(screen.queryByRole("button", { name: "Create account" })).not.toBeInTheDocument();
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
    expect(await screen.findByRole("button", { name: "Create account" })).toBeVisible();
    expect(screen.queryByText("Explore the shared demo")).not.toBeInTheDocument();
  });
});
