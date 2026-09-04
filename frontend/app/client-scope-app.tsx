"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- API data is narrowed at the explicit rendering boundary in this first vertical slice. */

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { api, json } from "./api-client";

type User = { id: string; email: string; displayName: string; verified: boolean };
type Project = { id: string; workspaceId: string; name: string; client: { id: string; name: string }; description?: string; targetDeadline?: string; role: string };
type WorkspaceGroup = { id: string; name: string; relationship: string; projects: Project[] };
type Invitation = { id: string; kind: string; inviterName: string; workspaceName: string; role: string; expiresAt: string; projectName?: string; clientName?: string };
type Work = { invitations: Invitation[]; workspaces: WorkspaceGroup[] };

const authSchema = z.object({
  email: z.string().trim().email("Enter a valid email."),
  password: z.string().min(12, "Use at least 12 characters.").max(128).optional(),
  displayName: z.string().trim().min(1).max(80).optional(),
});
type AuthValues = z.infer<typeof authSchema>;

function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <p role="alert" className="notice error">{error instanceof Error ? error.message : "Something went wrong."}</p>;
}

function AuthScreen() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const form = useForm<AuthValues>({ resolver: zodResolver(authSchema), defaultValues: { email: "", password: "", displayName: "" } });
  const mutation = useMutation({
    mutationFn: (values: AuthValues) => api<any>(
      mode === "signup" ? "/auth/signup" : mode === "forgot" ? "/auth/forgot-password" : "/auth/signin",
      json("POST", values),
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      const returnTo = new URLSearchParams(window.location.search).get("returnTo");
      if (returnTo) window.location.assign(returnTo);
    },
  });
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
          {mode === "signup" && <label>Display name<input autoComplete="name" {...form.register("displayName")} />{form.formState.errors.displayName && <small>{form.formState.errors.displayName.message}</small>}</label>}
          <label>Email address<input type="email" autoComplete="email" {...form.register("email")} />{form.formState.errors.email && <small>{form.formState.errors.email.message}</small>}</label>
          {mode !== "forgot" && <label>Password<input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} {...form.register("password")} />{form.formState.errors.password && <small>{form.formState.errors.password.message}</small>}</label>}
          <ErrorNote error={mutation.error} />
          {mutation.isSuccess && mode === "forgot" && <p className="notice success">If the account can receive email, a reset link is on its way.</p>}
          <button className="primary" disabled={mutation.isPending}>{mutation.isPending ? "Working…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}</button>
        </form>
        <div className="auth-links">
          {mode !== "signin" && <button className="link" onClick={() => setMode("signin")}>Back to sign in</button>}
          {mode === "signin" && <><button className="link" onClick={() => setMode("signup")}>Create account</button><button className="link" onClick={() => setMode("forgot")}>Forgot password?</button></>}
        </div>
      </section>
    </main>
  );
}

function VerificationGate({ user }: { user: User }) {
  const [message, setMessage] = useState<string>();
  const mutation = useMutation({ mutationFn: () => api<any>("/auth/verification/reissue", json("POST")), onSuccess: (body) => setMessage(body.warning ?? body.message) });
  const logout = useMutation({ mutationFn: () => api("/auth/logout", json("POST")), onSuccess: () => location.reload() });
  return <main className="center-layout"><section className="focus-card"><span className="mail-mark">✉</span><p className="eyebrow">One quick step</p><h1>Verify your email</h1><p>We sent a verification link to <strong>{user.email}</strong>. Until it’s verified, no workspace or invitation details are loaded.</p>{message && <p className="notice success">{message}</p>}<ErrorNote error={mutation.error} /><button className="primary" onClick={() => mutation.mutate()} disabled={mutation.isPending}>Send a replacement link</button><button className="secondary" onClick={() => logout.mutate()}>Sign out</button></section></main>;
}

const workspaceSchema = z.object({ name: z.string().trim().min(1).max(120) });
function CreateWorkspace({ onDone }: { onDone: () => void }) {
  const form = useForm<z.infer<typeof workspaceSchema>>({ resolver: zodResolver(workspaceSchema), defaultValues: { name: "" } });
  const mutation = useMutation({ mutationFn: (values: { name: string }) => api("/workspaces", json("POST", values)), onSuccess: () => { form.reset(); onDone(); } });
  return <form className="inline-form" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}><label><span>Workspace name</span><input placeholder="e.g. Northstar Studio" {...form.register("name")} /></label><button className="primary" disabled={mutation.isPending}>Create workspace</button><ErrorNote error={mutation.error} /></form>;
}

function ProjectView({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const project = useQuery({ queryKey: ["project", projectId], queryFn: () => api<{ project: Project }>(`/projects/${projectId}`) });
  const members = useQuery({ queryKey: ["project-members", projectId], queryFn: () => api<{ members: Array<{ id: string; displayName: string; role: string }> }>(`/projects/${projectId}/members`) });
  const leave = useMutation({ mutationFn: () => api(`/projects/${projectId}/leave`, json("POST")), onSuccess: () => onBack() });
  if (project.isPending) return <p>Loading project…</p>;
  if (project.error) return <ErrorNote error={project.error} />;
  const item = project.data.project;
  return <section><button className="back" onClick={onBack}>← Your work</button><div className="project-hero"><div><p className="eyebrow">{item.client.name}</p><h1>{item.name}</h1><p>{item.description || "No project description was added."}</p></div><div className="meta-box"><span>Your role</span><strong>{item.role.replaceAll("-", " ")}</strong><span>Target deadline</span><strong>{item.targetDeadline || "Not set"}</strong></div></div><section className="panel"><div className="panel-heading"><div><p className="eyebrow">Shared access</p><h2>Project members</h2></div></div>{members.data?.members.map((member) => <div className="member" key={member.id}><span className="avatar">{member.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{member.displayName}</strong><p>{member.role.replaceAll("-", " ")}</p></div></div>)}</section>{item.role.startsWith("client-") && <button className="danger" onClick={() => confirm(`Leave ${item.name}? Your access ends immediately.`) && leave.mutate()}>Leave project</button>}<ErrorNote error={leave.error} /></section>;
}

function OwnerWorkspace({ workspace, onBack, refreshWork }: { workspace: WorkspaceGroup; onBack: () => void; refreshWork: () => void }) {
  const clients = useQuery({ queryKey: ["clients", workspace.id], queryFn: () => api<{ clients: Array<any> }>(`/workspaces/${workspace.id}/clients`) });
  const access = useQuery({ queryKey: ["access", workspace.id], queryFn: () => api<any>(`/workspaces/${workspace.id}/access`) });
  const [tab, setTab] = useState<"overview" | "access">("overview");
  const clientForm = useForm({ defaultValues: { name: "", companyName: "", primaryContactEmail: "", internalNotes: "" } });
  const clientMutation = useMutation({ mutationFn: (values: any) => api(`/workspaces/${workspace.id}/clients`, json("POST", values)), onSuccess: () => { clientForm.reset(); void clients.refetch(); } });
  const projectForm = useForm({ defaultValues: { name: "", clientId: "", description: "", targetDeadline: "" } });
  const projectMutation = useMutation({ mutationFn: (values: any) => api(`/workspaces/${workspace.id}/projects`, json("POST", { ...values, targetDeadline: values.targetDeadline || undefined })), onSuccess: () => { projectForm.reset(); refreshWork(); } });
  const inviteForm = useForm({ defaultValues: { email: "", kind: "workspace", projectId: "", role: "service-team-member" } });
  const inviteMutation = useMutation({ mutationFn: (values: any) => api(`/workspaces/${workspace.id}/invitations`, json("POST", values.kind === "workspace" ? { kind: "workspace", email: values.email, role: "service-team-member" } : values)), onSuccess: () => { inviteForm.reset(); void access.refetch(); } });
  return <section><button className="back" onClick={onBack}>← Your work</button><div className="workspace-title"><div><p className="eyebrow">Workspace administration</p><h1>{workspace.name}</h1></div><nav className="tabs"><button aria-current={tab === "overview"} onClick={() => setTab("overview")}>Clients & projects</button><button aria-current={tab === "access"} onClick={() => setTab("access")}>Access</button></nav></div>{tab === "overview" ? <div className="admin-grid"><section className="panel"><h2>Add a client</h2><form onSubmit={clientForm.handleSubmit((values) => clientMutation.mutate(values))}><label>Client name<input required {...clientForm.register("name")} /></label><label>Company<input {...clientForm.register("companyName")} /></label><label>Contact email<input type="email" {...clientForm.register("primaryContactEmail")} /></label><label>Internal notes<textarea rows={4} {...clientForm.register("internalNotes")} /></label><button className="primary">Save client</button><ErrorNote error={clientMutation.error} /></form></section><section className="panel"><h2>Create a project</h2><form onSubmit={projectForm.handleSubmit((values) => projectMutation.mutate(values))}><label>Project name<input required {...projectForm.register("name")} /></label><label>Client<select required {...projectForm.register("clientId")}><option value="">Select a client</option>{clients.data?.clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select></label><label>Description<textarea rows={4} {...projectForm.register("description")} /></label><label>Target deadline<input type="date" {...projectForm.register("targetDeadline")} /></label><button className="primary">Create project</button><ErrorNote error={projectMutation.error} /></form></section><section className="panel span"><h2>Client records</h2>{clients.data?.clients.length ? clients.data.clients.map((client) => <div className="client-row" key={client.id}><div><strong>{client.name}</strong><p>{client.companyName || "Independent client"}{client.primaryContactEmail ? ` · ${client.primaryContactEmail}` : ""}</p></div><span>Private notes protected</span></div>) : <p className="empty-copy">No clients yet. Create one to establish the first project.</p>}</section></div> : <div className="admin-grid"><section className="panel"><h2>Invite someone</h2><form onSubmit={inviteForm.handleSubmit((values) => inviteMutation.mutate(values))}><label>Email<input type="email" required {...inviteForm.register("email")} /></label><label>Access type<select {...inviteForm.register("kind")}><option value="workspace">Service-team workspace access</option><option value="project">Client project access</option></select></label><label>Project<select {...inviteForm.register("projectId")}><option value="">Not applicable</option>{workspace.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label><label>Client role<select {...inviteForm.register("role")}><option value="service-team-member">Service-team member</option><option value="client-participant">Client participant</option><option value="client-approver">Client approver</option></select></label><button className="primary">Issue invitation</button><ErrorNote error={inviteMutation.error} /></form></section><section className="panel span"><h2>Invitations & access history</h2>{access.data?.invitations.map((item: any) => <div className="client-row" key={item.id}><div><strong>{item.email}</strong><p>{item.role.replaceAll("-", " ")} · {item.status}</p></div><span className={`badge ${item.deliveryStatus}`}>{item.deliveryStatus}</span></div>)}{!access.data?.invitations.length && <p className="empty-copy">No invitations have been issued.</p>}</section></div>}</section>;
}

function Home({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const work = useQuery({ queryKey: ["work"], queryFn: () => api<Work>("/work") });
  const [createOpen, setCreateOpen] = useState(false);
  const [projectId, setProjectId] = useState<string>();
  const [workspaceId, setWorkspaceId] = useState<string>();
  const logout = useMutation({ mutationFn: () => api("/auth/logout", json("POST")), onSuccess: () => queryClient.setQueryData(["session"], { user: null }) });
  const accept = useMutation({ mutationFn: (id: string) => api(`/invitations/${id}/accept`, json("POST")), onSuccess: () => void work.refetch() });
  if (projectId) return <AppFrame user={user} onLogout={() => logout.mutate()}><ProjectView projectId={projectId} onBack={() => { setProjectId(undefined); void work.refetch(); }} /></AppFrame>;
  const selected = work.data?.workspaces.find((item) => item.id === workspaceId);
  if (selected?.relationship === "owner") return <AppFrame user={user} onLogout={() => logout.mutate()}><OwnerWorkspace workspace={selected} onBack={() => setWorkspaceId(undefined)} refreshWork={() => void work.refetch()} /></AppFrame>;
  return <AppFrame user={user} onLogout={() => logout.mutate()}><header className="home-heading"><div><p className="eyebrow">Your work</p><h1>Good to see you, {user.displayName.split(" ")[0]}.</h1><p>Everything you can currently access, grouped by workspace.</p></div><button className="primary" onClick={() => setCreateOpen((value) => !value)}>＋ New workspace</button></header>{createOpen && <section className="panel create-panel"><h2>Create a workspace</h2><CreateWorkspace onDone={() => { setCreateOpen(false); void work.refetch(); }} /></section>}<ErrorNote error={work.error} />{work.data?.invitations.length ? <section className="section-block"><div className="section-title"><h2>Waiting for you</h2><span>{work.data.invitations.length} invitation{work.data.invitations.length === 1 ? "" : "s"}</span></div><div className="card-grid">{work.data.invitations.map((item) => <article className="invitation-card" key={item.id}><p className="eyebrow">Invitation · {item.role.replaceAll("-", " ")}</p><h3>{item.projectName || item.workspaceName}</h3><p>{item.projectName ? `${item.clientName} · ${item.workspaceName}` : `Join ${item.workspaceName}`}</p><p className="fine">Invited by {item.inviterName}</p><button className="primary" onClick={() => accept.mutate(item.id)}>Accept invitation</button></article>)}</div></section> : null}<section className="section-block"><div className="section-title"><h2>Workspaces</h2><span>{work.data?.workspaces.length ?? 0} total</span></div>{work.isPending ? <p>Loading your work…</p> : work.data?.workspaces.length ? work.data.workspaces.map((workspace) => <article className="workspace-card" key={workspace.id}><div className="workspace-card-head"><div><p className="eyebrow">{workspace.relationship.replaceAll("-", " ")}</p><h3>{workspace.name}</h3></div>{workspace.relationship === "owner" && <button className="secondary" onClick={() => setWorkspaceId(workspace.id)}>Manage workspace</button>}</div>{workspace.projects.length ? <div className="project-list">{workspace.projects.map((project) => <button key={project.id} onClick={() => setProjectId(project.id)}><span><strong>{project.name}</strong><small>{project.client.name}</small></span><span><small>{project.role.replaceAll("-", " ")}</small><b>→</b></span></button>)}</div> : <p className="empty-copy">No accessible projects yet.</p>}</article>) : <section className="empty-state"><span>◎</span><h2>Your client work will live here</h2><p>Create a workspace or accept an invitation to get started.</p><button className="primary" onClick={() => setCreateOpen(true)}>Create your first workspace</button></section>}</section></AppFrame>;
}

function AppFrame({ user, onLogout, children }: { user: User; onLogout: () => void; children: React.ReactNode }) {
  return <><header className="topbar"><Link className="logo" href="/">Client<span>Scope</span></Link><div className="account"><span className="avatar">{user.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{user.displayName}</strong><small>{user.email}</small></div><button className="link" onClick={onLogout}>Sign out</button></div></header><main className="app-shell">{children}</main></>;
}

export function ClientScopeApp() {
  const session = useQuery({ queryKey: ["session"], queryFn: () => api<{ user: User | null }>("/auth/session") });
  if (session.isPending) return <main className="center-layout"><p>Opening ClientScope…</p></main>;
  if (session.error) return <main className="center-layout"><section className="focus-card"><h1>ClientScope is unavailable</h1><ErrorNote error={session.error} /></section></main>;
  if (!session.data.user) return <AuthScreen />;
  if (!session.data.user.verified) return <VerificationGate user={session.data.user} />;
  return <Home user={session.data.user} />;
}
