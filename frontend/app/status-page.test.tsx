import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { healthQueryOptions } from "./health-query";
import { StatusPage } from "./status-page";

function wrapper({ children }: Readonly<{ children: ReactNode }>) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function mockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("StatusPage", () => {
  it("shows an understandable checking state while the initial request is pending", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    render(<StatusPage />, { wrapper });

    expect(screen.getByRole("heading", { name: "Checking service availability" })).toBeVisible();
    expect(screen.getByText("System status: Checking")).toBeVisible();
  });

  it("shows available after one valid healthy response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({ status: "ok", database: "connected" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<StatusPage />, { wrapper });

    expect(
      await screen.findByRole("heading", { name: "ClientScope is available" }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/health", expect.any(Object));
  });

  it.each([
    ["a 503 response", () => Promise.resolve(mockResponse({ error: { message: "raw detail" } }, 503))],
    ["another HTTP failure", () => Promise.resolve(mockResponse({ internal: "do not show" }, 500))],
    ["a network failure", () => Promise.reject(new Error("connect ECONNREFUSED private-host"))],
    ["a malformed success body", () => Promise.resolve(mockResponse({ status: "ok" }))],
    [
      "an unexpected success body",
      () => Promise.resolve(mockResponse({ status: "ok", database: "connected", host: "private-host" })),
    ],
  ])("shows the same safe unavailable state for %s", async (_label, responseFactory) => {
    vi.stubGlobal("fetch", vi.fn(responseFactory));

    render(<StatusPage />, { wrapper });

    expect(
      await screen.findByRole("heading", {
        name: "ClientScope is temporarily unavailable",
      }),
    ).toBeVisible();
    expect(document.body).not.toHaveTextContent(/raw detail|do not show|ECONNREFUSED|private-host/i);
  });

  it("disables retry, polling, focus refetch, reconnect refetch, and manual retry UI", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    render(<StatusPage />, { wrapper });

    await screen.findByText("System status: Unavailable");
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(healthQueryOptions.retry).toBe(false);
    expect(healthQueryOptions.refetchInterval).toBe(false);
    expect(healthQueryOptions.refetchOnWindowFocus).toBe(false);
    expect(healthQueryOptions.refetchOnReconnect).toBe(false);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
