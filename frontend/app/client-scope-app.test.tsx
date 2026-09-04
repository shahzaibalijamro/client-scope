import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ClientScopeApp } from "./client-scope-app";

function renderApp(body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ClientScopeApp /></QueryClientProvider>);
}

afterEach(() => vi.unstubAllGlobals());

describe("ClientScope application gate", () => {
  it("shows account entry when there is no session", async () => {
    renderApp({ user: null });
    expect(await screen.findByRole("heading", { name: "Sign in to your work" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
  });

  it("keeps an unverified session in the verification-only experience", async () => {
    renderApp({ user: { id: "1", email: "person@example.com", displayName: "Person", verified: false } });
    expect(await screen.findByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
    expect(screen.queryByText("Your work")).not.toBeInTheDocument();
    expect(screen.getByText("person@example.com")).toBeInTheDocument();
  });
});
