"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { api, json } from "./api-client";
import {
  messageResponseSchema,
  sessionResponseSchema,
  userSchema,
  workResponseSchema,
  type Project,
  type User,
} from "./api-schemas";
import { ConfirmDialog } from "./confirm-dialog";
import { OwnerWorkspace } from "./owner-workspace";
import { ProjectView } from "./project-view";

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
  const [mode, setMode] = useState<AuthMode>("signin");
  const schema = useMemo(() => z.object({
    email: z.string().trim().email("Enter a valid email.").max(254),
    password: z.string().max(128),
    displayName: z.string().max(80),
  }).superRefine((value, context) => {
    if (mode !== "forgot" && value.password.length < 12) context.addIssue({ code: "custom", path: ["password"], message: "Use 12–128 characters." });
    if (mode === "signup" && !value.displayName.trim()) context.addIssue({ code: "custom", path: ["displayName"], message: "Enter your display name." });
  }), [mode]);
  const form = useForm<AuthValues>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "", displayName: "" } });
  const mutation = useMutation({
    mutationFn: (values: AuthValues) => api(
      mode === "signup" ? "/auth/signup" : mode === "forgot" ? "/auth/forgot-password" : "/auth/signin",
      json("POST", mode === "signup" ? values : mode === "signin" ? { email: values.email, password: values.password } : { email: values.email }),
      authResponseSchema,
    ),
    onSuccess: async () => {
      if (mode === "forgot") return;
      const returnTo = new URLSearchParams(window.location.search).get("returnTo");
      if (returnTo?.startsWith("/invite/")) sessionStorage.setItem("clientscope:returnTo", returnTo);
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      const session = queryClient.getQueryData<z.infer<typeof sessionResponseSchema>>(["session"]);
      if (returnTo && session?.user?.verified) window.location.assign(returnTo);
    },
  });
  const switchMode = (next: AuthMode) => { setMode(next); mutation.reset(); form.clearErrors(); };

  return (
    <main className="auth-layout">
      <section className="brand-panel">
        <p className="eyebrow">ClientScope</p>
        <h1>Keep the client agreement clear from kickoff to delivery.</h1>
        <p>One calm, shared record for scope, decisions, access, and delivery history.</p>
        <div className="promise"><span>01</span><p><strong>Private by default</strong><br />Every workspace and project boundary is enforced by the API.</p></div>
        <div className="promise"><span>02</span><p><strong>Authority stays explicit</strong><br />Roles and access are contextual—not permanent labels on people.</p></div>
      </section>
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="eyebrow">{mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Password help"}</p>
        <h2 id="auth-title">{mode === "signin" ? "Sign in to your work" : mode === "signup" ? "Start with a verified account" : "Request a reset link"}</h2>
        <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} noValidate>
          {mode === "signup" && <label>Display name<input autoComplete="name" {...form.register("displayName")} />{form.formState.errors.displayName && <small role="alert">{form.formState.errors.displayName.message}</small>}</label>}
          <label>Email address<input type="email" autoComplete="email" {...form.register("email")} />{form.formState.errors.email && <small role="alert">{form.formState.errors.email.message}</small>}</label>
          {mode !== "forgot" && <label>Password<input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} {...form.register("password")} />{form.formState.errors.password && <small role="alert">{form.formState.errors.password.message}</small>}</label>}
          <ErrorNote error={mutation.error} />
          {mutation.isSuccess && mode === "forgot" && <p className="notice success" role="status">If the account can receive email, a reset link is on its way.</p>}
          {mutation.isSuccess && mode === "signup" && <p className="notice success" role="status">Check your email for the next step.</p>}
          <button className="primary" disabled={mutation.isPending}>{mutation.isPending ? "Working…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}</button>
        </form>
        <div className="auth-links">
          {mode !== "signin" && <button className="link" onClick={() => switchMode("signin")}>Back to sign in</button>}
          {mode === "signin" && <><button className="link" onClick={() => switchMode("signup")}>Create account</button><button className="link" onClick={() => switchMode("forgot")}>Forgot password?</button></>}
        </div>
      </section>
    </main>
  );
}

function VerificationGate({ user }: Readonly<{ user: User }>) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string>();
  const mutation = useMutation({
    mutationFn: () => api("/auth/verification/reissue", json("POST"), messageResponseSchema),
    onSuccess: (body) => setMessage(body.warning ?? body.message),
  });
  const logout = useMutation({
    mutationFn: () => api("/auth/logout", json("POST"), messageResponseSchema),
    onSuccess: () => queryClient.setQueryData(["session"], { user: null }),
  });
  return <main className="center-layout"><section className="focus-card"><span className="mail-mark">✉</span><p className="eyebrow">One quick step</p><h1>Verify your email</h1><p>We sent a verification link to <strong>{user.email}</strong>. Until it’s verified, no workspace or invitation details are loaded.</p>{message && <p className="notice success" role="status">{message}</p>}<ErrorNote error={mutation.error || logout.error} /><button className="primary" onClick={() => mutation.mutate()} disabled={mutation.isPending}>Send a replacement link</button><button className="secondary" onClick={() => logout.mutate()} disabled={logout.isPending}>Sign out</button></section></main>;
}

const workspaceSchema = z.object({ name: z.string().trim().min(1, "Enter a workspace name.").max(120) });
function CreateWorkspace({ onDone }: Readonly<{ onDone: () => void }>) {
  const form = useForm<z.infer<typeof workspaceSchema>>({ resolver: zodResolver(workspaceSchema), defaultValues: { name: "" } });
  const mutation = useMutation({ mutationFn: (values: z.infer<typeof workspaceSchema>) => api("/workspaces", json("POST", values), z.object({ workspace: z.unknown() })), onSuccess: () => { form.reset(); onDone(); } });
  return <form className="inline-form" onSubmit={form.handleSubmit((values) => mutation.mutate(values))} noValidate><label><span>Workspace name</span><input placeholder="e.g. Northstar Studio" {...form.register("name")} />{form.formState.errors.name && <small role="alert">{form.formState.errors.name.message}</small>}</label><button className="primary" disabled={mutation.isPending}>Create workspace</button><ErrorNote error={mutation.error} /></form>;
}

function ProfileEditor({ user, onClose }: Readonly<{ user: User; onClose: () => void }>) {
  const queryClient = useQueryClient();
  const schema = z.object({ displayName: z.string().trim().min(1, "Enter a display name.").max(80) });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { displayName: user.displayName } });
  const update = useMutation({
    mutationFn: (values: z.infer<typeof schema>) => api("/account", json("PATCH", values), z.object({ user: userSchema }).strict()),
    onSuccess: (body) => { queryClient.setQueryData(["session"], { user: body.user }); onClose(); },
  });
  return <div className="profile-popover"><form onSubmit={form.handleSubmit((values) => update.mutate(values))}><label>Display name<input {...form.register("displayName")} />{form.formState.errors.displayName && <small role="alert">{form.formState.errors.displayName.message}</small>}</label><ErrorNote error={update.error} /><div className="row-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={update.isPending}>Save</button></div></form></div>;
}

function AppFrame({ user, onLogout, children }: Readonly<{ user: User; onLogout: () => void; children: React.ReactNode }>) {
  const [editingProfile, setEditingProfile] = useState(false);
  return <><header className="topbar"><Link className="logo" href="/">Client<span>Scope</span></Link><div className="account"><span className="avatar">{user.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{user.displayName}</strong><small>{user.email}</small></div><button className="link" onClick={() => setEditingProfile((value) => !value)}>Edit profile</button><button className="link" onClick={onLogout}>Sign out</button>{editingProfile && <ProfileEditor user={user} onClose={() => setEditingProfile(false)} />}</div></header><main className="app-shell">{children}</main></>;
}

function ProjectCollection({ title, projects, onOpen }: Readonly<{ title: string; projects: Project[]; onOpen: (id: string) => void }>) {
  if (!projects.length) return null;
  return <section className="project-collection"><h4>{title}</h4><div className="project-list">{projects.map((project) => <button key={project.id} onClick={() => onOpen(project.id)}><span><strong>{project.name}</strong><small>{project.client.name}{project.targetDeadline ? ` · ${project.targetDeadline}` : ""}</small></span><span className="project-pending"><span>{project.lifecycle?.pendingAction && <small>{project.lifecycle.pendingAction.replaceAll("-", " ")}</small>}{project.scope?.pendingAction && <small>{project.scope.pendingAction.replaceAll("-", " ")}</small>}{project.changeControl?.pendingAction && <small>{project.changeControl.pendingAction.replaceAll("-", " ")}</small>}{project.deliverables?.pendingAction && <small>{project.deliverables.pendingAction.replaceAll("-", " ")} ({project.deliverables.pendingCount})</small>}{!project.lifecycle?.pendingAction && !project.scope?.pendingAction && !project.changeControl?.pendingAction && !project.deliverables?.pendingAction && <small>{project.lifecycle && project.lifecycle.state !== "active" ? project.lifecycle.state.replaceAll("-", " ") : project.role.replaceAll("-", " ")}</small>}</span><b>→</b></span></button>)}</div></section>;
}

function Home({ user }: Readonly<{ user: User }>) {
  const queryClient = useQueryClient();
  const work = useQuery({ queryKey: ["work"], queryFn: () => api("/work", {}, workResponseSchema) });
  const [createOpen, setCreateOpen] = useState(false);
  const [projectId, setProjectId] = useState<string>();
  const [workspaceId, setWorkspaceId] = useState<string>();
  const [leaveWorkspace, setLeaveWorkspace] = useState<{ id: string; name: string }>();
  const logout = useMutation({ mutationFn: () => api("/auth/logout", json("POST"), messageResponseSchema), onSuccess: () => queryClient.setQueryData(["session"], { user: null }) });
  const accept = useMutation({ mutationFn: (id: string) => api(`/invitations/${id}/accept`, json("POST"), messageResponseSchema), onSuccess: () => void work.refetch(), onError: () => void work.refetch() });
  const leave = useMutation({
    mutationFn: (workspace: { id: string }) => api(`/workspaces/${workspace.id}/leave`, json("POST", { confirmed: true }), messageResponseSchema),
    onSuccess: async () => { setLeaveWorkspace(undefined); await work.refetch(); },
    onError: () => { void work.refetch(); },
  });
  if (projectId) return <AppFrame user={user} onLogout={() => logout.mutate()}><ProjectView projectId={projectId} onBack={() => { setProjectId(undefined); void work.refetch(); }} /></AppFrame>;
  const selected = work.data?.workspaces.find((item) => item.id === workspaceId);
  if (selected?.relationship === "owner") return <AppFrame user={user} onLogout={() => logout.mutate()}><OwnerWorkspace workspace={selected} onBack={() => setWorkspaceId(undefined)} refreshWork={() => void work.refetch()} /></AppFrame>;

  return (
    <AppFrame user={user} onLogout={() => logout.mutate()}>
      <header className="home-heading"><div><p className="eyebrow">Your work</p><h1>Good to see you, {user.displayName.split(" ")[0]}.</h1><p>Everything you can currently access, grouped by workspace.</p></div><button className="primary" onClick={() => setCreateOpen((value) => !value)}>＋ New workspace</button></header>
      {createOpen && <section className="panel create-panel"><h2>Create a workspace</h2><CreateWorkspace onDone={() => { setCreateOpen(false); void work.refetch(); }} /></section>}
      <ErrorNote error={work.error || accept.error || leave.error} />
      {work.data?.invitations.length ? <section className="section-block"><div className="section-title"><h2>Waiting for you</h2><span>{work.data.invitations.length} invitation{work.data.invitations.length === 1 ? "" : "s"}</span></div><div className="card-grid">{work.data.invitations.map((item) => <article className="invitation-card" key={item.id}><p className="eyebrow">Invitation · {item.role.replaceAll("-", " ")}</p><h3>{item.projectName || item.workspaceName}</h3><p>{item.projectName ? `${item.clientName} · ${item.workspaceName}` : `Join ${item.workspaceName}`}</p><p className="fine">Invited by {item.inviterName}</p><button className="primary" onClick={() => accept.mutate(item.id)} disabled={accept.isPending}>Accept invitation</button></article>)}</div></section> : null}
      <section className="section-block"><div className="section-title"><h2>Workspaces</h2><span>{work.data?.workspaces.length ?? 0} total</span></div>{work.isPending ? <p role="status">Loading your work…</p> : work.data?.workspaces.length ? work.data.workspaces.map((workspace) => <article className="workspace-card" key={workspace.id}><div className="workspace-card-head"><div><p className="eyebrow">{workspace.relationship.replaceAll("-", " ")}</p><h3>{workspace.name}</h3></div><div className="row-actions">{workspace.relationship === "owner" && <button className="secondary" onClick={() => setWorkspaceId(workspace.id)}>Manage workspace</button>}{workspace.relationship === "service-team-member" && <button className="danger compact" onClick={() => setLeaveWorkspace({ id: workspace.id, name: workspace.name })}>Leave workspace</button>}</div></div><ProjectCollection title="Active and in review" projects={workspace.projects} onOpen={setProjectId} /><ProjectCollection title="Completed" projects={workspace.completedProjects} onOpen={setProjectId} /><ProjectCollection title="Archived" projects={workspace.archivedProjects} onOpen={setProjectId} />{!workspace.projects.length && !workspace.completedProjects.length && !workspace.archivedProjects.length && <p className="empty-copy">No accessible projects yet.</p>}</article>) : <section className="empty-state"><span>◎</span><h2>Your client work will live here</h2><p>Create a workspace or accept an invitation to get started.</p><button className="primary" onClick={() => setCreateOpen(true)}>Create your first workspace</button></section>}</section>
      {leaveWorkspace && <ConfirmDialog title={`Leave ${leaveWorkspace.name}?`} description="Workspace membership and every active project assignment end immediately. Returning requires a new invitation." confirmLabel="Leave workspace" busy={leave.isPending} onCancel={() => setLeaveWorkspace(undefined)} onConfirm={() => leave.mutate(leaveWorkspace)} />}
    </AppFrame>
  );
}

export function ClientScopeApp() {
  const session = useQuery({ queryKey: ["session"], queryFn: () => api("/auth/session", {}, sessionResponseSchema) });
  if (session.isPending) return <main className="center-layout"><p role="status">Opening ClientScope…</p></main>;
  if (session.error) return <main className="center-layout"><section className="focus-card"><h1>ClientScope is unavailable</h1><ErrorNote error={session.error} /></section></main>;
  if (!session.data.user) return <AuthScreen />;
  if (!session.data.user.verified) return <VerificationGate user={session.data.user} />;
  return <Home user={session.data.user} />;
}
