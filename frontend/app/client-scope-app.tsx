"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Auth entry keeps ordinary same-origin links usable without client navigation. */

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { CircleAlert, Plus } from "lucide-react";

import { api, json } from "./api-client";
import { AppShell } from "./app-shell";
import { demoResponseSchema, messageResponseSchema, sessionResponseSchema, userSchema, workResponseSchema, type User } from "./api-schemas";
import { ConfirmDialog } from "./confirm-dialog";
import { MyWorkDirectory } from "./my-work-directory";
import { OwnerWorkspace } from "./owner-workspace";
import { ProjectView } from "./project-view";
import { parseAppRoute } from "./route-model";
import { DialogSurface, LoadingBlock, useSafeNavigation } from "./ui-foundation";
import { clearPendingDestination, pendingDestination, type AuthMode } from "./public-routes";
import { SignInRedirect } from "./sign-in-redirect";

type AuthValues = { email: string; password: string; displayName: string };
const publicQueryKeys = new Set(["demo", "session"]);

export async function clearAuthenticatedQueryState(queryClient: QueryClient): Promise<void> {
  const authenticatedQuery = (query: { queryKey: readonly unknown[] }) => !publicQueryKeys.has(String(query.queryKey[0]));
  await queryClient.cancelQueries({ predicate: authenticatedQuery });
  queryClient.removeQueries({ predicate: authenticatedQuery });
}

const authResponseSchema = z.union([
  z.object({ user: userSchema, csrfToken: z.string(), warning: z.string().optional() }).strict(),
  z.object({ message: z.string(), csrfToken: z.string().optional(), warning: z.string().optional() }).strict(),
]);

function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <p role="alert" className="notice error">{error instanceof Error ? error.message : "Something went wrong."}</p>;
}

export function AuthScreen({ mode = "signin", demoIntent = false }: { mode?: AuthMode; demoIntent?: boolean }) {
  const queryClient = useQueryClient();
  const demo = useQuery({ queryKey: ["demo"], queryFn: () => api("/demo", {}, demoResponseSchema), enabled: mode === "signin" });
  const selectedDemo = useRef(false);
  const schema = useMemo(() => z.object({
    email: z.string().trim().email("Enter a valid email.").max(254), password: z.string().max(128), displayName: z.string().max(80),
  }).superRefine((value, context) => {
    if (mode !== "forgot" && value.password.length < 12) context.addIssue({ code: "custom", path: ["password"], message: "Use 12–128 characters." });
    if (mode === "signup" && !value.displayName.trim()) context.addIssue({ code: "custom", path: ["displayName"], message: "Enter your display name." });
  }), [mode]);
  const form = useForm<AuthValues>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "", displayName: "" } });
  const mutation = useMutation({
    mutationFn: (values: AuthValues) => api(mode === "signup" ? "/auth/signup" : mode === "forgot" ? "/auth/forgot-password" : "/auth/signin", json("POST", mode === "signup" ? values : mode === "signin" ? { email: values.email, password: values.password } : { email: values.email }), authResponseSchema),
    onSuccess: async () => {
      if (mode === "forgot") return;
      await clearAuthenticatedQueryState(queryClient);
      const session = await api("/auth/session", {}, sessionResponseSchema);
      // A full same-origin navigation avoids an auth-entry redirect racing a resumed destination.
      if (session.user) window.location.assign(session.user.verified ? pendingDestination(true) ?? "/work" : "/work");
    },
  });
  const chooseDemoIdentity = (identity: { email: string; password: string }) => {
    selectedDemo.current = true; clearPendingDestination(); mutation.reset(); form.reset({ email: identity.email, password: identity.password, displayName: "" });
  };
  const demoReady = demo.data?.enabled && demo.data.status === "ready" && !demo.error;
  useEffect(() => {
    if (!demoReady && selectedDemo.current) { form.reset({ email: "", password: "", displayName: "" }); selectedDemo.current = false; }
  }, [demoReady, form]);
  const demoEntry = mode === "signin" && (demoIntent || demo.data?.enabled) ? <section className="demo-entry" aria-labelledby="demo-entry-title"><h2 id="demo-entry-title">Explore the shared demo</h2><p>Choose either side of the client relationship. Changes are temporary; the workspace resets every six hours. Select a role, then sign in to continue.</p>{demo.isPending ? <p role="status">Checking demo availability…</p> : demo.error ? <p role="status">{/unexpected|unreadable/u.test(demo.error.message) ? "The demo response could not be read." : "The shared demo is unavailable right now."} Ordinary sign-in is still available.</p> : !demo.data?.enabled ? <p role="status">The shared demo is disabled on this deployment. You can sign in or create your own account.</p> : demoReady ? <><div>{demo.data.identities.map((identity) => <button type="button" className="secondary" key={identity.label} onClick={() => chooseDemoIdentity(identity)}>Use {identity.label}</button>)}</div><small>Next reset: {new Date(demo.data.reset.nextScheduledAt).toLocaleString()}.</small></> : <p role="status">{demo.data.status === "resetting" ? "The shared demo is resetting. Try again shortly." : demo.data.status === "initializing" ? "The shared demo is being prepared." : "A demo provider is unavailable. Try again later."} Ordinary sign-in is still available.</p>}</section> : null;
  return <main className="auth-layout">
    <section className="brand-panel" aria-label="About ClientScope">
      <div className="auth-brand"><span className="brand-mark" aria-hidden="true">C</span><strong>Client<span>Scope</span></strong></div>
      <div className="brand-message"><p className="eyebrow">Clear work. Clear decisions.</p><h2>Keep every client agreement clear.</h2><p>Scope, decisions, delivery, and history in one dependable shared record.</p></div>
      <div className="brand-promises"><div className="promise"><span>01</span><p><strong>Private by default</strong><br />Every workspace and project boundary is enforced by the API.</p></div><div className="promise"><span>02</span><p><strong>Authority stays explicit</strong><br />Roles and access remain contextual.</p></div></div>
    </section>
    <section className="auth-form-panel">
      <div className="auth-mobile-brand"><span className="brand-mark" aria-hidden="true">C</span><strong>Client<span>Scope</span></strong></div>
      <a className="auth-home-link" href="/">← Back to ClientScope</a>{demoIntent && demoEntry}<section className="auth-card" aria-labelledby="auth-title"><p className="eyebrow">{mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Password help"}</p><h1 id="auth-title">{mode === "signin" ? "Sign in to your work" : mode === "signup" ? "Start with a verified account" : "Request a reset link"}</h1>{!demoIntent && demoEntry}<form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} noValidate>{mode === "signup" && <label>Display name<input autoComplete="name" {...form.register("displayName")} />{form.formState.errors.displayName && <small role="alert">{form.formState.errors.displayName.message}</small>}</label>}<label>Email address<input type="email" autoComplete="email" {...form.register("email")} />{form.formState.errors.email && <small role="alert">{form.formState.errors.email.message}</small>}</label>{mode !== "forgot" && <label>Password<input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} {...form.register("password")} />{form.formState.errors.password && <small role="alert">{form.formState.errors.password.message}</small>}</label>}<ErrorNote error={mutation.error} />{mutation.isSuccess && mode === "forgot" && <p className="notice success" role="status">If the account can receive email, a reset link is on its way.</p>}{mutation.isSuccess && mode === "signup" && <p className="notice success" role="status">Check your email for the next step.</p>}<button className="primary" disabled={mutation.isPending}>{mutation.isPending ? "Working…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}</button></form><div className="auth-links">{mode !== "signin" && <a className="link" href="/sign-in">Back to sign in</a>}{mode === "signin" && <><a className="link" href="/sign-up">Create account</a><a className="link" href="/forgot-password">Forgot password?</a></>}</div></section>
      <p className="auth-mobile-trust">Private project access and decision authority stay tied to your verified account.</p>
    </section>
  </main>;
}

function VerificationGate({ user }: { user: User }) {
  const queryClient = useQueryClient(); const [message, setMessage] = useState<string>();
  const mutation = useMutation({ mutationFn: () => api("/auth/verification/reissue", json("POST"), messageResponseSchema), onSuccess: (body) => setMessage(body.warning ?? body.message) });
  const logout = useMutation({ mutationFn: () => api("/auth/logout", json("POST"), messageResponseSchema), onSuccess: async () => { clearPendingDestination(); await clearAuthenticatedQueryState(queryClient); window.location.assign("/sign-in"); } });
  return <main className="center-layout"><section className="focus-card"><span className="mail-mark">✉</span><p className="eyebrow">One quick step</p><h1>Verify your email</h1><p>We sent a verification link to <strong>{user.email}</strong>. No private work loads before verification.</p>{message && <p className="notice success" role="status">{message}</p>}<ErrorNote error={mutation.error || logout.error} /><button className="primary" onClick={() => mutation.mutate()} disabled={mutation.isPending} aria-busy={mutation.isPending}>{mutation.isPending ? "Sending replacement…" : "Send a replacement link"}</button><button className="secondary" onClick={() => logout.mutate()} disabled={logout.isPending} aria-busy={logout.isPending}>{logout.isPending ? "Signing out…" : "Sign out"}</button></section></main>;
}

const workspaceSchema = z.object({ name: z.string().trim().min(1, "Enter a workspace name.").max(120) });
function CreateWorkspace({ onDone }: { onDone: () => void }) {
  const { runAction } = useSafeNavigation();
  const form = useForm<z.infer<typeof workspaceSchema>>({ resolver: zodResolver(workspaceSchema), defaultValues: { name: "" } });
  const mutation = useMutation({ mutationFn: (values: z.infer<typeof workspaceSchema>) => api("/workspaces", json("POST", values), z.object({ workspace: z.unknown() })), onSuccess: () => { form.reset(); onDone(); } });
  return <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} noValidate><label>Workspace name<input autoFocus placeholder="e.g. Northstar Studio" {...form.register("name")} />{form.formState.errors.name && <small role="alert">{form.formState.errors.name.message}</small>}</label><ErrorNote error={mutation.error} /><div className="dialog-actions"><button type="button" className="secondary" onClick={() => runAction(onDone)}>Cancel</button><button className="primary" disabled={mutation.isPending} aria-busy={mutation.isPending}>{mutation.isPending ? "Creating workspace…" : "Create workspace"}</button></div></form>;
}

function RoutedHome({ user }: { user: User }) {
  const queryClient = useQueryClient(); const pathname = usePathname(); const search = useSearchParams() ?? new URLSearchParams(); const route = parseAppRoute(pathname ?? (typeof window === "undefined" ? "/" : window.location.pathname)); const { navigate } = useSafeNavigation();
  const work = useQuery({ queryKey: ["work"], queryFn: () => api("/work", {}, workResponseSchema) });
  const [createOpen, setCreateOpen] = useState(false); const [leaveWorkspace, setLeaveWorkspace] = useState<{ id: string; name: string }>();
  const logout = useMutation({ mutationFn: () => api("/auth/logout", json("POST"), messageResponseSchema), onSuccess: async () => { clearPendingDestination(); await clearAuthenticatedQueryState(queryClient); window.location.assign("/sign-in"); } });
  const accept = useMutation({ mutationFn: (id: string) => api(`/invitations/${id}/accept`, json("POST"), messageResponseSchema), onSuccess: () => void work.refetch(), onError: () => void work.refetch() });
  const leave = useMutation({ mutationFn: (workspace: { id: string }) => api(`/workspaces/${workspace.id}/leave`, json("POST", { confirmed: true }), messageResponseSchema), onSuccess: async () => { setLeaveWorkspace(undefined); await work.refetch(); }, onError: () => void work.refetch() });
  const selected = route.kind === "admin" ? work.data?.workspaces.find((workspace) => workspace.id === route.workspaceId && workspace.relationship === "owner") : undefined;

  let content: React.ReactNode;
  if (work.isPending) content = <LoadingBlock label="Loading your work" />;
  else if (work.error) content = <section className="route-error"><CircleAlert /><h1>ClientScope is unavailable</h1><ErrorNote error={work.error} /><button className="secondary" onClick={() => void work.refetch()}>Try again</button></section>;
  else if (route.kind === "invalid") content = <section className="route-error"><CircleAlert /><h1>Page not found</h1><p>This address does not identify an available ClientScope section.</p><button className="secondary" onClick={() => navigate("/work")}>Back to My Work</button></section>;
  else if (route.kind === "project") content = <ProjectView projectId={route.projectId} section={route.section} onBack={() => navigate("/work")} />;
  else if (route.kind === "admin") content = selected ? <OwnerWorkspace workspace={selected} section={route.section} onBack={() => navigate("/work")} refreshWork={() => void work.refetch()} /> : <section className="route-error"><CircleAlert /><h1>Workspace unavailable</h1><p>The requested resource was not found or is no longer available to your account.</p><button className="secondary" onClick={() => navigate("/work")}>Back to My Work</button></section>;
  else content = <><header className="home-heading"><div><p className="eyebrow">My Work</p><h1>Good to see you, {user.displayName.split(" ")[0]}.</h1><p>Find the work that needs attention and move directly to the right project section.</p></div><button className="primary" onClick={() => setCreateOpen(true)}><Plus size={18} /> New workspace</button></header><ErrorNote error={accept.error || leave.error} />{search.get("view") === "invitations" ? <section className="section-block"><div className="section-title"><div><p className="eyebrow">Invitations</p><h2>Waiting for you</h2></div><span>{work.data!.invitations.length}</span></div>{work.data!.invitations.length ? <div className="card-grid">{work.data!.invitations.map((item) => <article className="invitation-card" key={item.id}><p className="eyebrow">{item.role.replaceAll("-", " ")}</p><h3>{item.projectName || item.workspaceName}</h3><p>{item.projectName ? `${item.clientName} · ${item.workspaceName}` : `Join ${item.workspaceName}`}</p><p className="fine">Invited by {item.inviterName}</p><button className="primary" onClick={() => accept.mutate(item.id)} disabled={accept.isPending} aria-busy={accept.isPending}>{accept.isPending ? "Accepting…" : "Accept invitation"}</button></article>)}</div> : <p className="empty-copy">No invitations are waiting for you.</p>}</section> : <MyWorkDirectory work={work.data!} />}{work.data!.workspaces.filter((workspace) => workspace.relationship === "service-team-member").map((workspace) => <button className="sr-only" key={workspace.id} onClick={() => setLeaveWorkspace({ id: workspace.id, name: workspace.name })}>Leave {workspace.name}</button>)}{createOpen && <DialogSurface title="Create a workspace" onClose={() => setCreateOpen(false)}><CreateWorkspace onDone={() => { setCreateOpen(false); void work.refetch(); }} /></DialogSurface>}</>;

  return <AppShell user={user} work={work.data} onLogout={() => logout.mutate()}>{content}{leaveWorkspace && <ConfirmDialog title={`Leave ${leaveWorkspace.name}?`} description="Workspace membership and every active project assignment end immediately. Returning requires a new invitation." confirmLabel="Leave workspace" busy={leave.isPending} onCancel={() => setLeaveWorkspace(undefined)} onConfirm={() => leave.mutate(leaveWorkspace)} />}</AppShell>;
}

export function ClientScopeApp() {
  const session = useQuery({ queryKey: ["session"], queryFn: () => api("/auth/session", {}, sessionResponseSchema) });
  if (session.isPending) return <main className="center-layout"><LoadingBlock label="Opening ClientScope" /></main>;
  if (session.error) return <main className="center-layout"><section className="focus-card"><h1>ClientScope is unavailable</h1><ErrorNote error={session.error} /></section></main>;
  if (!session.data.user) return <SignInRedirect />;
  if (!session.data.user.verified) return <VerificationGate user={session.data.user} />;
  return <RoutedHome user={session.data.user} />;
}
