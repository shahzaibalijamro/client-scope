"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
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

type AuthMode = "signin" | "signup" | "forgot";
type AuthValues = { email: string; password: string; displayName: string };
const authResponseSchema = z.union([
  z.object({ user: userSchema, csrfToken: z.string(), warning: z.string().optional() }).strict(),
  z.object({ message: z.string(), csrfToken: z.string().optional(), warning: z.string().optional() }).strict(),
]);

function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <p role="alert" className="notice error">{error instanceof Error ? error.message : "Something went wrong."}</p>;
}

function AuthScreen() {
  const queryClient = useQueryClient();
  const demo = useQuery({ queryKey: ["demo"], queryFn: () => api("/demo", {}, demoResponseSchema) });
  const [mode, setMode] = useState<AuthMode>("signin");
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
      const returnTo = new URLSearchParams(window.location.search).get("returnTo");
      if (returnTo?.startsWith("/invite/")) sessionStorage.setItem("clientscope:returnTo", returnTo);
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      const session = queryClient.getQueryData<z.infer<typeof sessionResponseSchema>>(["session"]);
      if (returnTo && session?.user?.verified) window.location.assign(returnTo);
    },
  });
  const switchMode = (next: AuthMode) => { setMode(next); mutation.reset(); form.reset({ email: form.getValues("email"), password: "", displayName: "" }); };
  const chooseDemoIdentity = (identity: { email: string; password: string }) => {
    setMode("signin"); mutation.reset(); form.reset({ email: identity.email, password: identity.password, displayName: "" });
  };
  return <main className="auth-layout">
    <section className="brand-panel" aria-label="About ClientScope">
      <div className="auth-brand"><span className="brand-mark" aria-hidden="true">C</span><strong>Client<span>Scope</span></strong></div>
      <div className="brand-message"><p className="eyebrow">Clear work. Clear decisions.</p><h1>Keep every client agreement clear.</h1><p>Scope, decisions, delivery, and history in one dependable shared record.</p></div>
      <div className="brand-promises"><div className="promise"><span>01</span><p><strong>Private by default</strong><br />Every workspace and project boundary is enforced by the API.</p></div><div className="promise"><span>02</span><p><strong>Authority stays explicit</strong><br />Roles and access remain contextual.</p></div></div>
    </section>
    <section className="auth-form-panel">
      <div className="auth-mobile-brand"><span className="brand-mark" aria-hidden="true">C</span><strong>Client<span>Scope</span></strong></div>
      <section className="auth-card" aria-labelledby="auth-title"><p className="eyebrow">{mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Password help"}</p><h2 id="auth-title">{mode === "signin" ? "Sign in to your work" : mode === "signup" ? "Start with a verified account" : "Request a reset link"}</h2>{demo.data?.enabled && <section className="demo-entry" aria-labelledby="demo-entry-title"><strong id="demo-entry-title">Explore the shared demo</strong><p>Choose either side of the client relationship. Changes are temporary; the workspace resets every six hours.</p><div>{demo.data.identities.map((identity) => <button type="button" className="secondary" key={identity.label} onClick={() => chooseDemoIdentity(identity)}>Use {identity.label}</button>)}</div>{demo.data.status !== "ready" && <small role="status">Demo status: {demo.data.status.replaceAll("-", " ")}.</small>}<small>Next reset: {new Date(demo.data.reset.nextScheduledAt).toLocaleString()}.</small></section>}<form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} noValidate>{mode === "signup" && <label>Display name<input autoComplete="name" {...form.register("displayName")} />{form.formState.errors.displayName && <small role="alert">{form.formState.errors.displayName.message}</small>}</label>}<label>Email address<input type="email" autoComplete="email" {...form.register("email")} />{form.formState.errors.email && <small role="alert">{form.formState.errors.email.message}</small>}</label>{mode !== "forgot" && <label>Password<input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} {...form.register("password")} />{form.formState.errors.password && <small role="alert">{form.formState.errors.password.message}</small>}</label>}<ErrorNote error={mutation.error} />{mutation.isSuccess && mode === "forgot" && <p className="notice success" role="status">If the account can receive email, a reset link is on its way.</p>}{mutation.isSuccess && mode === "signup" && <p className="notice success" role="status">Check your email for the next step.</p>}<button className="primary" disabled={mutation.isPending}>{mutation.isPending ? "Working…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}</button></form><div className="auth-links">{mode !== "signin" && <button className="link" onClick={() => switchMode("signin")}>Back to sign in</button>}{mode === "signin" && <><button className="link" onClick={() => switchMode("signup")}>Create account</button><button className="link" onClick={() => switchMode("forgot")}>Forgot password?</button></>}</div></section>
      <p className="auth-mobile-trust">Private project access and decision authority stay tied to your verified account.</p>
    </section>
  </main>;
}

function VerificationGate({ user }: { user: User }) {
  const queryClient = useQueryClient(); const [message, setMessage] = useState<string>();
  const mutation = useMutation({ mutationFn: () => api("/auth/verification/reissue", json("POST"), messageResponseSchema), onSuccess: (body) => setMessage(body.warning ?? body.message) });
  const logout = useMutation({ mutationFn: () => api("/auth/logout", json("POST"), messageResponseSchema), onSuccess: () => queryClient.setQueryData(["session"], { user: null }) });
  return <main className="center-layout"><section className="focus-card"><span className="mail-mark">✉</span><p className="eyebrow">One quick step</p><h1>Verify your email</h1><p>We sent a verification link to <strong>{user.email}</strong>. No private work loads before verification.</p>{message && <p className="notice success" role="status">{message}</p>}<ErrorNote error={mutation.error || logout.error} /><button className="primary" onClick={() => mutation.mutate()} disabled={mutation.isPending}>Send a replacement link</button><button className="secondary" onClick={() => logout.mutate()} disabled={logout.isPending}>Sign out</button></section></main>;
}

const workspaceSchema = z.object({ name: z.string().trim().min(1, "Enter a workspace name.").max(120) });
function CreateWorkspace({ onDone }: { onDone: () => void }) {
  const { runAction } = useSafeNavigation();
  const form = useForm<z.infer<typeof workspaceSchema>>({ resolver: zodResolver(workspaceSchema), defaultValues: { name: "" } });
  const mutation = useMutation({ mutationFn: (values: z.infer<typeof workspaceSchema>) => api("/workspaces", json("POST", values), z.object({ workspace: z.unknown() })), onSuccess: () => { form.reset(); onDone(); } });
  return <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} noValidate><label>Workspace name<input autoFocus placeholder="e.g. Northstar Studio" {...form.register("name")} />{form.formState.errors.name && <small role="alert">{form.formState.errors.name.message}</small>}</label><ErrorNote error={mutation.error} /><div className="dialog-actions"><button type="button" className="secondary" onClick={() => runAction(onDone)}>Cancel</button><button className="primary" disabled={mutation.isPending}>Create workspace</button></div></form>;
}

function RoutedHome({ user }: { user: User }) {
  const queryClient = useQueryClient(); const pathname = usePathname(); const search = useSearchParams() ?? new URLSearchParams(); const route = parseAppRoute(pathname ?? (typeof window === "undefined" ? "/" : window.location.pathname)); const { navigate } = useSafeNavigation();
  const work = useQuery({ queryKey: ["work"], queryFn: () => api("/work", {}, workResponseSchema) });
  const [createOpen, setCreateOpen] = useState(false); const [leaveWorkspace, setLeaveWorkspace] = useState<{ id: string; name: string }>();
  const logout = useMutation({ mutationFn: () => api("/auth/logout", json("POST"), messageResponseSchema), onSuccess: () => queryClient.setQueryData(["session"], { user: null }) });
  const accept = useMutation({ mutationFn: (id: string) => api(`/invitations/${id}/accept`, json("POST"), messageResponseSchema), onSuccess: () => void work.refetch(), onError: () => void work.refetch() });
  const leave = useMutation({ mutationFn: (workspace: { id: string }) => api(`/workspaces/${workspace.id}/leave`, json("POST", { confirmed: true }), messageResponseSchema), onSuccess: async () => { setLeaveWorkspace(undefined); await work.refetch(); }, onError: () => void work.refetch() });
  const selected = route.kind === "admin" ? work.data?.workspaces.find((workspace) => workspace.id === route.workspaceId && workspace.relationship === "owner") : undefined;

  let content: React.ReactNode;
  if (work.isPending) content = <LoadingBlock label="Loading your work" />;
  else if (work.error) content = <section className="route-error"><CircleAlert /><h1>ClientScope is unavailable</h1><ErrorNote error={work.error} /><button className="secondary" onClick={() => void work.refetch()}>Try again</button></section>;
  else if (route.kind === "invalid") content = <section className="route-error"><CircleAlert /><h1>Page not found</h1><p>This address does not identify an available ClientScope section.</p><button className="secondary" onClick={() => navigate("/")}>Back to My Work</button></section>;
  else if (route.kind === "project") content = <ProjectView projectId={route.projectId} section={route.section} onBack={() => navigate("/")} />;
  else if (route.kind === "admin") content = selected ? <OwnerWorkspace workspace={selected} section={route.section} onBack={() => navigate("/")} refreshWork={() => void work.refetch()} /> : <section className="route-error"><CircleAlert /><h1>Workspace unavailable</h1><p>The requested resource was not found or is no longer available to your account.</p><button className="secondary" onClick={() => navigate("/")}>Back to My Work</button></section>;
  else content = <><header className="home-heading"><div><p className="eyebrow">My Work</p><h1>Good to see you, {user.displayName.split(" ")[0]}.</h1><p>Find the work that needs attention and move directly to the right project section.</p></div><button className="primary" onClick={() => setCreateOpen(true)}><Plus size={18} /> New workspace</button></header><ErrorNote error={accept.error || leave.error} />{search.get("view") === "invitations" ? <section className="section-block"><div className="section-title"><div><p className="eyebrow">Invitations</p><h2>Waiting for you</h2></div><span>{work.data!.invitations.length}</span></div>{work.data!.invitations.length ? <div className="card-grid">{work.data!.invitations.map((item) => <article className="invitation-card" key={item.id}><p className="eyebrow">{item.role.replaceAll("-", " ")}</p><h3>{item.projectName || item.workspaceName}</h3><p>{item.projectName ? `${item.clientName} · ${item.workspaceName}` : `Join ${item.workspaceName}`}</p><p className="fine">Invited by {item.inviterName}</p><button className="primary" onClick={() => accept.mutate(item.id)} disabled={accept.isPending}>Accept invitation</button></article>)}</div> : <p className="empty-copy">No invitations are waiting for you.</p>}</section> : <MyWorkDirectory work={work.data!} />}{work.data!.workspaces.filter((workspace) => workspace.relationship === "service-team-member").map((workspace) => <button className="sr-only" key={workspace.id} onClick={() => setLeaveWorkspace({ id: workspace.id, name: workspace.name })}>Leave {workspace.name}</button>)}{createOpen && <DialogSurface title="Create a workspace" onClose={() => setCreateOpen(false)}><CreateWorkspace onDone={() => { setCreateOpen(false); void work.refetch(); }} /></DialogSurface>}</>;

  return <AppShell user={user} work={work.data} onLogout={() => logout.mutate()}>{content}{leaveWorkspace && <ConfirmDialog title={`Leave ${leaveWorkspace.name}?`} description="Workspace membership and every active project assignment end immediately. Returning requires a new invitation." confirmLabel="Leave workspace" busy={leave.isPending} onCancel={() => setLeaveWorkspace(undefined)} onConfirm={() => leave.mutate(leaveWorkspace)} />}</AppShell>;
}

export function ClientScopeApp() {
  const session = useQuery({ queryKey: ["session"], queryFn: () => api("/auth/session", {}, sessionResponseSchema) });
  if (session.isPending) return <main className="center-layout"><LoadingBlock label="Opening ClientScope" /></main>;
  if (session.error) return <main className="center-layout"><section className="focus-card"><h1>ClientScope is unavailable</h1><ErrorNote error={session.error} /></section></main>;
  if (!session.data.user) return <AuthScreen />;
  if (!session.data.user.verified) return <VerificationGate user={session.data.user} />;
  return <RoutedHome user={session.data.user} />;
}
