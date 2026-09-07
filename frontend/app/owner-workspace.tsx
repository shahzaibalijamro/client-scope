"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { api, json } from "./api-client";
import {
  accessResponseSchema,
  clientResponseSchema,
  clientsResponseSchema,
  messageResponseSchema,
  type AccessData,
  type ClientRecord,
  type WorkspaceGroup,
} from "./api-schemas";
import { ConfirmDialog } from "./confirm-dialog";

const clientFormSchema = z.object({
  name: z.string().trim().min(1, "Enter a client name.").max(120),
  companyName: z.string().trim().max(120),
  primaryContactEmail: z.union([z.literal(""), z.string().trim().email("Enter a valid email.").max(254)]),
  internalNotes: z.string().trim().max(10_000),
});
const dateOnlySchema = z.union([
  z.literal(""),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Use a valid calendar date.").refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }, "Use a valid calendar date."),
]);
const projectFormSchema = z.object({
  name: z.string().trim().min(1, "Enter a project name.").max(120),
  clientId: z.string().min(1, "Select a client."),
  description: z.string().trim().max(5_000),
  targetDeadline: dateOnlySchema,
});
const inviteFormSchema = z.object({
  email: z.string().trim().email("Enter a valid email.").max(254),
  kind: z.enum(["workspace", "project"]),
  projectId: z.string(),
  role: z.enum(["service-team-member", "client-participant", "client-approver"]),
}).superRefine((value, context) => {
  if (value.kind === "project" && !value.projectId) context.addIssue({ code: "custom", path: ["projectId"], message: "Select a project." });
});
const assignmentFormSchema = z.object({ userId: z.string().min(1), projectId: z.string().min(1) });

type ConfirmAction = {
  title: string;
  description: string;
  label: string;
  path: string;
  method: "DELETE" | "PATCH";
  body: Record<string, unknown>;
};

function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <p role="alert" className="notice error">{error instanceof Error ? error.message : "Something went wrong."}</p>;
}

function FieldError({ message }: { message?: string }) {
  return message ? <small role="alert">{message}</small> : null;
}

function ClientEditor({ workspaceId, client, onChanged }: Readonly<{ workspaceId: string; client: ClientRecord; onChanged: () => void }>) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const form = useForm<z.infer<typeof clientFormSchema>>({
    resolver: zodResolver(clientFormSchema),
    values: {
      name: client.name,
      companyName: client.companyName ?? "",
      primaryContactEmail: client.primaryContactEmail ?? "",
      internalNotes: client.internalNotes ?? "",
    },
  });
  const update = useMutation({
    mutationFn: (values: z.infer<typeof clientFormSchema>) => api(
      `/workspaces/${workspaceId}/clients/${client.id}`,
      json("PATCH", values),
      clientResponseSchema,
    ),
    onSuccess: () => { setEditing(false); onChanged(); },
  });
  const remove = useMutation({
    mutationFn: () => api<void>(`/workspaces/${workspaceId}/clients/${client.id}`, json("DELETE", { confirmation })),
    onSuccess: () => { setDeleting(false); onChanged(); },
  });

  if (!editing) {
    return (
      <article className="client-record">
        <div>
          <strong>{client.name}</strong>
          <p>{client.companyName || "Independent client"}{client.primaryContactEmail ? ` · ${client.primaryContactEmail}` : ""}</p>
          {client.internalNotes && <p className="plain-text private-note"><span>Internal:</span> {client.internalNotes}</p>}
        </div>
        <div className="row-actions"><button className="secondary" onClick={() => setEditing(true)}>Edit</button><button className="danger compact" onClick={() => setDeleting(true)}>Delete</button></div>
        {deleting && (
          <ConfirmDialog
            title={`Delete ${client.name}?`}
            description="This is permanent and is allowed only if this client has never been associated with a project. Type the current client name to confirm."
            confirmLabel="Delete client"
            busy={remove.isPending}
            onCancel={() => { setDeleting(false); setConfirmation(""); }}
            onConfirm={() => remove.mutate()}
          >
            <label>Client name<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
            <ErrorNote error={remove.error} />
          </ConfirmDialog>
        )}
      </article>
    );
  }

  return (
    <article className="client-record editing">
      <form onSubmit={form.handleSubmit((values) => update.mutate(values))} noValidate>
        <label>Client name<input {...form.register("name")} /><FieldError message={form.formState.errors.name?.message} /></label>
        <label>Company<input {...form.register("companyName")} /><FieldError message={form.formState.errors.companyName?.message} /></label>
        <label>Contact email<input type="email" {...form.register("primaryContactEmail")} /><FieldError message={form.formState.errors.primaryContactEmail?.message} /></label>
        <label>Internal notes<textarea rows={4} {...form.register("internalNotes")} /><FieldError message={form.formState.errors.internalNotes?.message} /></label>
        <ErrorNote error={update.error} />
        <div className="row-actions"><button className="secondary" type="button" onClick={() => setEditing(false)}>Cancel</button><button className="primary" disabled={update.isPending}>Save changes</button></div>
      </form>
    </article>
  );
}

function invitePayload(item: AccessData["invitations"][number]) {
  return item.kind === "workspace"
    ? { kind: "workspace" as const, email: item.email, role: "service-team-member" as const }
    : { kind: "project" as const, email: item.email, projectId: item.projectId, role: item.role };
}

export function OwnerWorkspace({ workspace, onBack, refreshWork }: Readonly<{ workspace: WorkspaceGroup; onBack: () => void; refreshWork: () => void }>) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"overview" | "access">("overview");
  const [warning, setWarning] = useState<string>();
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>();
  const clients = useQuery({
    queryKey: ["clients", workspace.id],
    queryFn: () => api(`/workspaces/${workspace.id}/clients`, {}, clientsResponseSchema),
  });
  const access = useQuery({
    queryKey: ["access", workspace.id],
    queryFn: () => api(`/workspaces/${workspace.id}/access`, {}, accessResponseSchema),
  });
  const refreshAccess = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["access", workspace.id] }),
      queryClient.invalidateQueries({ queryKey: ["work"] }),
    ]);
    refreshWork();
  };

  const clientForm = useForm<z.infer<typeof clientFormSchema>>({ resolver: zodResolver(clientFormSchema), defaultValues: { name: "", companyName: "", primaryContactEmail: "", internalNotes: "" } });
  const clientMutation = useMutation({
    mutationFn: (values: z.infer<typeof clientFormSchema>) => api(`/workspaces/${workspace.id}/clients`, json("POST", values), clientResponseSchema),
    onSuccess: async () => { clientForm.reset(); await clients.refetch(); },
  });
  const projectForm = useForm<z.infer<typeof projectFormSchema>>({ resolver: zodResolver(projectFormSchema), defaultValues: { name: "", clientId: "", description: "", targetDeadline: "" } });
  const projectMutation = useMutation({
    mutationFn: (values: z.infer<typeof projectFormSchema>) => api(
      `/workspaces/${workspace.id}/projects`,
      json("POST", { ...values, targetDeadline: values.targetDeadline || undefined }),
      z.object({ project: z.unknown() }),
    ),
    onSuccess: () => { projectForm.reset(); refreshWork(); },
  });
  const inviteForm = useForm<z.infer<typeof inviteFormSchema>>({ resolver: zodResolver(inviteFormSchema), defaultValues: { email: "", kind: "workspace", projectId: "", role: "service-team-member" } });
  const inviteKind = useWatch({ control: inviteForm.control, name: "kind" });
  const inviteMutation = useMutation({
    mutationFn: (values: z.infer<typeof inviteFormSchema>) => api(
      `/workspaces/${workspace.id}/invitations`,
      json("POST", values.kind === "workspace" ? { kind: "workspace", email: values.email, role: "service-team-member" } : { kind: "project", email: values.email, projectId: values.projectId, role: values.role }),
      messageResponseSchema,
    ),
    onSuccess: async (body) => { inviteForm.reset(); setWarning(body.warning); await refreshAccess(); },
    onError: () => { void refreshAccess(); },
  });
  const assignmentForm = useForm<z.infer<typeof assignmentFormSchema>>({ resolver: zodResolver(assignmentFormSchema), defaultValues: { userId: "", projectId: "" } });
  const assignmentMutation = useMutation({
    mutationFn: (values: z.infer<typeof assignmentFormSchema>) => api(`/projects/${values.projectId}/assignments`, json("POST", { userId: values.userId }), messageResponseSchema),
    onSuccess: async (body) => { assignmentForm.reset(); setWarning(body.warning); await refreshAccess(); },
    onError: () => { void refreshAccess(); },
  });
  const quickAction = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: string; body?: unknown }) => api(path, json(method, body), messageResponseSchema),
    onSuccess: async (body) => { setWarning(body.warning); await refreshAccess(); },
    onError: () => { void refreshAccess(); },
  });
  const confirmedMutation = useMutation({
    mutationFn: (action: ConfirmAction) => api(action.path, json(action.method, action.body), messageResponseSchema),
    onSuccess: async (body) => { setWarning(body.warning); setConfirmAction(undefined); await refreshAccess(); },
    onError: () => { void refreshAccess(); },
  });

  const data = access.data;
  const projectName = (id?: string) => workspace.projects.find((project) => project.id === id)?.name ?? "Project";
  const activeServiceMembers = data?.workspaceMemberships.filter((item) => item.status === "active") ?? [];
  const activeClientAccess = (item: AccessData["invitations"][number]) => item.kind === "project"
    ? data?.clientMemberships.some((membership) => membership.status === "active" && membership.projectId === item.projectId && membership.email?.toLowerCase() === item.email.toLowerCase())
    : data?.workspaceMemberships.some((membership) => membership.status === "active" && membership.email?.toLowerCase() === item.email.toLowerCase());

  return (
    <section>
      <button className="back" onClick={onBack}>← Your work</button>
      <div className="workspace-title">
        <div><p className="eyebrow">Workspace administration</p><h1>{workspace.name}</h1></div>
        <nav className="tabs" aria-label="Workspace administration">
          <button aria-current={tab === "overview" ? "page" : undefined} onClick={() => setTab("overview")}>Clients & projects</button>
          <button aria-current={tab === "access" ? "page" : undefined} onClick={() => setTab("access")}>Access</button>
        </nav>
      </div>
      {warning && <p className="notice warning" role="status">{warning}</p>}
      {tab === "overview" ? (
        <div className="admin-grid">
          <section className="panel">
            <h2>Add a client</h2>
            <form onSubmit={clientForm.handleSubmit((values) => clientMutation.mutate(values))} noValidate>
              <label>Client name<input {...clientForm.register("name")} /><FieldError message={clientForm.formState.errors.name?.message} /></label>
              <label>Company<input {...clientForm.register("companyName")} /></label>
              <label>Contact email<input type="email" {...clientForm.register("primaryContactEmail")} /><FieldError message={clientForm.formState.errors.primaryContactEmail?.message} /></label>
              <label>Internal notes<textarea rows={4} {...clientForm.register("internalNotes")} /></label>
              <button className="primary" disabled={clientMutation.isPending}>Save client</button><ErrorNote error={clientMutation.error} />
            </form>
          </section>
          <section className="panel">
            <h2>Create a project</h2>
            <form onSubmit={projectForm.handleSubmit((values) => projectMutation.mutate(values))} noValidate>
              <label>Project name<input {...projectForm.register("name")} /><FieldError message={projectForm.formState.errors.name?.message} /></label>
              <label>Client<select {...projectForm.register("clientId")}><option value="">Select a client</option>{clients.data?.clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select><FieldError message={projectForm.formState.errors.clientId?.message} /></label>
              <label>Description<textarea rows={4} {...projectForm.register("description")} /></label>
              <label>Target deadline<input type="date" {...projectForm.register("targetDeadline")} /><FieldError message={projectForm.formState.errors.targetDeadline?.message} /></label>
              <button className="primary" disabled={projectMutation.isPending}>Create project</button><ErrorNote error={projectMutation.error} />
            </form>
          </section>
          <section className="panel span">
            <h2>Client records</h2>
            {clients.isPending && <p role="status">Loading clients…</p>}<ErrorNote error={clients.error} />
            {clients.data?.clients.map((client) => <ClientEditor key={client.id} workspaceId={workspace.id} client={client} onChanged={() => void clients.refetch()} />)}
            {clients.data && !clients.data.clients.length && <p className="empty-copy">No clients yet. Create one to establish the first project.</p>}
          </section>
        </div>
      ) : (
        <div className="admin-grid">
          <section className="panel">
            <h2>Invite someone</h2>
            <form onSubmit={inviteForm.handleSubmit((values) => inviteMutation.mutate(values))} noValidate>
              <label>Email<input type="email" {...inviteForm.register("email")} /><FieldError message={inviteForm.formState.errors.email?.message} /></label>
              <label>Access type<select {...inviteForm.register("kind")} onChange={(event) => {
                inviteForm.setValue("kind", event.target.value as "workspace" | "project");
                inviteForm.setValue("role", event.target.value === "workspace" ? "service-team-member" : "client-participant");
              }}><option value="workspace">Service-team workspace access</option><option value="project">Client project access</option></select></label>
              {inviteKind === "project" && <><label>Project<select {...inviteForm.register("projectId")}><option value="">Select a project</option>{workspace.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select><FieldError message={inviteForm.formState.errors.projectId?.message} /></label><label>Client role<select {...inviteForm.register("role")}><option value="client-participant">Client participant</option><option value="client-approver">Client approver</option></select></label></>}
              <button className="primary" disabled={inviteMutation.isPending}>Issue invitation</button><ErrorNote error={inviteMutation.error} />
            </form>
          </section>
          <section className="panel">
            <h2>Assign a service-team member</h2>
            <form onSubmit={assignmentForm.handleSubmit((values) => assignmentMutation.mutate(values))}>
              <label>Member<select {...assignmentForm.register("userId")}><option value="">Select a member</option>{activeServiceMembers.map((member) => <option key={member.id} value={member.userId}>{member.displayName}</option>)}</select><FieldError message={assignmentForm.formState.errors.userId?.message} /></label>
              <label>Project<select {...assignmentForm.register("projectId")}><option value="">Select a project</option>{workspace.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><FieldError message={assignmentForm.formState.errors.projectId?.message} /></label>
              <button className="primary" disabled={assignmentMutation.isPending}>Assign project</button><ErrorNote error={assignmentMutation.error} />
            </form>
          </section>
          <section className="panel span">
            <h2>Workspace members</h2>
            {data?.workspaceMemberships.map((item) => <div className="access-row" key={item.id}><div><strong>{item.displayName}</strong><p>{item.email} · {item.status}{item.endReason ? ` · ${item.endReason}` : ""}</p></div>{item.status === "active" && <button className="danger compact" onClick={() => setConfirmAction({ title: `Remove ${item.displayName}?`, description: "Workspace access and every active project assignment will end immediately. Prior access history remains.", label: "Remove member", path: `/workspaces/${workspace.id}/members/${item.userId}`, method: "DELETE", body: { confirmed: true } })}>Remove</button>}</div>)}
            {data && !data.workspaceMemberships.length && <p className="empty-copy">No service-team members yet.</p>}
          </section>
          <section className="panel span">
            <h2>Project assignments</h2>
            {data?.assignments.map((item) => <div className="access-row" key={item.id}><div><strong>{item.displayName}</strong><p>{projectName(item.projectId)} · {item.status}{item.endReason ? ` · ${item.endReason}` : ""}</p></div>{item.status === "active" && <button className="danger compact" onClick={() => setConfirmAction({ title: `Unassign ${item.displayName}?`, description: `Access to ${projectName(item.projectId)} ends immediately; workspace membership and other assignments remain active.`, label: "Unassign project", path: `/projects/${item.projectId}/assignments/${item.id}`, method: "DELETE", body: { confirmed: true } })}>Unassign</button>}</div>)}
            {data && !data.assignments.length && <p className="empty-copy">No project assignments yet.</p>}
          </section>
          <section className="panel span">
            <h2>Client project access</h2>
            {data?.clientMemberships.map((item) => <div className="access-row" key={item.id}><div><strong>{item.displayName}</strong><p>{projectName(item.projectId)} · {item.role.replaceAll("-", " ")} · {item.status}{item.endReason ? ` · ${item.endReason}` : ""}</p></div>{item.status === "active" && <div className="row-actions"><button className="secondary" onClick={() => setConfirmAction({ title: `Change ${item.displayName}'s authority?`, description: `Their role in ${projectName(item.projectId)} will change immediately. Earlier role periods and actions remain unchanged.`, label: `Make ${item.role === "client-approver" ? "participant" : "approver"}`, path: `/projects/${item.projectId}/client-members/${item.id}/role`, method: "PATCH", body: { role: item.role === "client-approver" ? "client-participant" : "client-approver", confirmed: true } })}>Change role</button><button className="danger compact" onClick={() => setConfirmAction({ title: `Remove ${item.displayName}?`, description: `Their access to ${projectName(item.projectId)} ends immediately. Restoration requires a new invitation.`, label: "Remove access", path: `/projects/${item.projectId}/client-members/${item.id}`, method: "DELETE", body: { confirmed: true } })}>Remove</button></div>}</div>)}
            {data && !data.clientMemberships.length && <p className="empty-copy">No client members yet.</p>}
          </section>
          <section className="panel span">
            <h2>Invitations</h2>
            {access.isPending && <p role="status">Loading access history…</p>}<ErrorNote error={access.error || quickAction.error} />
            {data?.invitations.map((item) => {
              const canReissue = item.status === "pending" || (item.status !== "accepted" || !activeClientAccess(item));
              return <div className="access-row" key={item.id}><div><strong>{item.email}</strong><p>{item.role.replaceAll("-", " ")}{item.projectId ? ` · ${projectName(item.projectId)}` : ""} · {item.status} · delivery {item.deliveryStatus}</p></div><div className="row-actions">{item.status === "pending" && <button className="danger compact" onClick={() => quickAction.mutate({ path: `/workspaces/${workspace.id}/invitations/${item.id}/revoke`, method: "POST" })}>Revoke</button>}{canReissue && <button className="secondary" onClick={() => quickAction.mutate({ path: `/workspaces/${workspace.id}/invitations`, method: "POST", body: invitePayload(item) })}>{item.status === "pending" ? "Replace" : "Invite again"}</button>}</div></div>;
            })}
            {data && !data.invitations.length && <p className="empty-copy">No invitations have been issued.</p>}
          </section>
        </div>
      )}
      {confirmAction && <ConfirmDialog title={confirmAction.title} description={confirmAction.description} confirmLabel={confirmAction.label} busy={confirmedMutation.isPending} onCancel={() => setConfirmAction(undefined)} onConfirm={() => confirmedMutation.mutate(confirmAction)}><ErrorNote error={confirmedMutation.error} /></ConfirmDialog>}
    </section>
  );
}
