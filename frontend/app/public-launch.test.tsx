import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicHome } from "./public-home";
import { publicMedia, projectPublicMedia } from "./public-media";
import { PublicEntry } from "./public-entry";
import { AuthScreen } from "./client-scope-app";
import { SignInRedirect } from "./sign-in-redirect";
import { authMode, hasDemoIntent, pendingDestination, rememberDestination, safePendingDestination } from "./public-routes";
import { publicMetadata } from "./public-metadata";
import { validatePublicOrigin } from "./public-origin";
import manifest from "../../portfolio/media-manifest.json";

const { router } = vi.hoisted(() => ({ router: { replace: vi.fn(), push: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/sign-in", useSearchParams: () => new URLSearchParams() }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); router.replace.mockReset(); sessionStorage.clear(); });
function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
const readyDemo = {
  enabled: true, status: "ready", identities: [
    { label: "Workspace Owner", email: "owner@demo.invalid", password: "owner-unique-demo-secret" },
    { label: "Client Approver", email: "approver@demo.invalid", password: "approver-unique-demo-secret" },
  ], reset: { cadenceHours: 6, nextScheduledAt: "2026-09-18T12:00:00.000Z" },
};

describe("public contract and security", () => {
  it.each(["", "intent=other", "intent=Demo", "intent=demo&intent=demo", "intent=demo&intent=evil", "intent=%3Cscript%3E", "returnTo=/projects/anything"])("falls back to ordinary sign-in for %s", (search) => {
    expect(hasDemoIntent(new URLSearchParams(search))).toBe(false);
  });
  it("recognizes one exact demo intent and durable auth modes", () => {
    expect(hasDemoIntent(new URLSearchParams("intent=demo"))).toBe(true);
    expect(authMode("/sign-in")).toBe("signin");
    expect(authMode("/sign-up")).toBe("signup");
    expect(authMode("/forgot-password")).toBe("forgot");
  });
  it("retains only visited allow-listed destinations through verification and consumes them after sign-in", () => {
    const path = `/invite/${"a".repeat(43)}`;
    rememberDestination(path);
    expect(pendingDestination()).toBe(path);
    expect(pendingDestination(true)).toBe(path);
    expect(pendingDestination()).toBeUndefined();
    expect(safePendingDestination("/projects/64b000000000000000000333/scope")).toBeDefined();
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/invite/../sign-in", `/invite/${"a".repeat(43)}\n`, "/projects/%2e%2e/scope", "/work?returnTo=evil", "/sign-in", "/projects/64b000000000000000000333/scope?token=secret"])("rejects stored or query-selected destination %s", (path) => {
    sessionStorage.setItem("clientscope:returnTo", path);
    expect(pendingDestination()).toBeUndefined();
  });
  it.each([undefined, "http://example.com", "https://u:p@example.com", "https://example.com/", "https://example.com/path", "https://example.com?token=secret", "https://example.com#token", "javascript:alert(1)"])("rejects unsafe public origin %s", (origin) => {
    expect(() => validatePublicOrigin(origin, "production")).toThrow();
  });
  it("uses configured origins and distinct stable metadata without query/token data", () => {
    vi.stubEnv("FRONTEND_ORIGIN", "https://clientscope.example");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("HTTP_HOST", "evil.example");
    const paths = ["/", "/sign-in", "/sign-up", "/forgot-password", "/verify", "/reset-password"] as const;
    const metadata = paths.map((path) => publicMetadata(path));
    expect(new Set(metadata.map((item) => item.title)).size).toBe(paths.length);
    for (const [index, item] of metadata.entries()) {
      expect(item.alternates?.canonical).toBe(`https://clientscope.example${paths[index]}`);
      expect(JSON.stringify(item)).not.toMatch(/evil\.example|token=|demo-secret/u);
      expect(item.referrer).toBe("no-referrer");
    }
    expect(validatePublicOrigin("http://localhost:3000", "test")).toBe("http://localhost:3000");
  });
  it("projects exactly the approved media and rejects malformed or duplicate source assets", () => {
    expect(publicMedia.map((item) => item.id)).toEqual(["agreed-scope", "formal-changes", "deliverable-review"]);
    const selected = manifest.assets.find((item) => item.id === "agreed-scope")!;
    expect(publicMedia[0].alt).toBe(selected.alt);
    expect(() => projectPublicMedia({ ...manifest, assets: [...manifest.assets, selected] })).toThrow();
    expect(() => projectPublicMedia({ ...manifest, assets: [] })).toThrow();
    for (const url of ["http://example.com/a.png", "https://u:p@example.com/a.png", "https://example.com/a.png?signature=secret", "not a url"]) {
      expect(() => projectPublicMedia({ ...manifest, assets: manifest.assets.map((asset) => asset.id === selected.id ? { ...asset, url } : asset) })).toThrow();
    }
  });
});

describe("public presentation and auth entry", () => {
  it("renders the complete product story, landmarks, consistent actions, source affordance, and safe media fallback", () => {
    render(<PublicHome />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Clear work.Clear decisions.");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main-content");
    for (const link of screen.getAllByRole("link", { name: /Explore demo/u })) expect(link).toHaveAttribute("href", "/sign-in?intent=demo");
    for (const link of screen.getAllByRole("link", { name: /View source/u })) expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText(/portfolio\/demo scale/u)).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(3);
    fireEvent.error(screen.getByAltText(publicMedia[0].alt));
    expect(screen.getByText("Product preview unavailable")).toBeVisible();
    expect(screen.getByRole("heading", { name: "A clear starting point. A record that stays." })).toBeVisible();
  });
  it("redirects existing authenticated sessions without mounting actionable auth forms", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ user: { id: "user", displayName: "Person", email: "person@example.com", verified: true } }))));
    wrap(<PublicEntry><AuthScreen /></PublicEntry>);
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/work"));
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });
  it("sends signed-out private routes to the durable sign-in page", async () => {
    wrap(<SignInRedirect />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/sign-in"));
  });
  it("foregrounds explicit demo choice and never authenticates on selection", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(readyDemo)));
    vi.stubGlobal("fetch", fetcher);
    wrap(<AuthScreen demoIntent />);
    await userEvent.click(await screen.findByRole("button", { name: "Use Client Approver" }));
    expect(screen.getByLabelText("Email address")).toHaveValue("approver@demo.invalid");
    expect(screen.getByLabelText("Password")).toHaveValue("approver-unique-demo-secret");
    expect(fetcher.mock.calls).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/sign-up");
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password");
    const demo = screen.getByRole("region", { name: "Explore the shared demo" });
    expect(demo.compareDocumentPosition(screen.getByRole("heading", { level: 1 })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it.each([
    [{ enabled: false }, "disabled"],
    [{ ...readyDemo, status: "resetting" }, "resetting"],
    [{ ...readyDemo, status: "initializing" }, "being prepared"],
    [{ ...readyDemo, status: "degraded-provider" }, "provider is unavailable"],
    [{ ...readyDemo, identities: [] }, "could not be read"],
    [{ ...readyDemo, identities: [readyDemo.identities[0], readyDemo.identities[0]] }, "could not be read"],
  ])("keeps ordinary sign-in usable and hides credentials for demo state %j", async (body, message) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body))));
    wrap(<AuthScreen demoIntent />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(new RegExp(String(message))));
    expect(screen.queryByRole("button", { name: /Use Workspace Owner/u })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(document.body.innerHTML).not.toContain("unique-demo-secret");
  });
  it("announces network failure without exposing diagnostics or blocking ordinary sign-in", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("secret provider diagnostics"); }));
    wrap(<AuthScreen demoIntent />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("unavailable right now"));
    expect(document.body.textContent).not.toContain("secret provider diagnostics");
    expect(within(screen.getByRole("region", { name: "Sign in to your work" })).getByRole("button", { name: "Sign in" })).toBeEnabled();
  });
});
