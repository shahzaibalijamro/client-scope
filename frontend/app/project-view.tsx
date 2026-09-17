"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, CircleGauge, Clock3, FileCheck2, Settings2 } from "lucide-react";

import { api, json } from "./api-client";
import {
  activityResponseSchema, deliverableCollectionResponseSchema, lifecycleResponseSchema,
  messageResponseSchema, milestoneTimelineResponseSchema, projectMembersResponseSchema,
  projectResponseSchema, type Project,
} from "./api-schemas";
import { ChangeControlPanel } from "./change-control-panel";
import { ConfirmDialog } from "./confirm-dialog";
import { DeliverablePanel } from "./deliverable-panel";
import { LifecyclePanel } from "./lifecycle-panel";
import { MilestonePanel } from "./milestone-panel";
import { ProjectExportButton } from "./project-export-button";
import { projectHref, projectSections, type ProjectSection } from "./route-model";
import { ScopePanel } from "./scope-panel";
import { LoadingBlock, useSafeNavigation } from "./ui-foundation";

const sectionLabels: Record<ProjectSection, string> = {
  overview: "Overview", scope: "Scope", changes: "Changes", milestones: "Milestones",
  deliverables: "Deliverables", activity: "Activity", settings: "Settings",
};

function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <p role="alert" className="notice error">{error instanceof Error ? error.message : "Something went wrong."}</p>;
}

function nextAction(project: Project): { label: string; section: ProjectSection } {
  if (project.lifecycle?.pendingAction) return { label: project.lifecycle.pendingAction.replaceAll("-", " "), section: "settings" };
  if (project.scope?.pendingAction) return { label: project.scope.pendingAction.replaceAll("-", " "), section: "scope" };
  if (project.changeControl?.pendingAction) return { label: project.changeControl.pendingAction.replaceAll("-", " "), section: "changes" };
  if (project.deliverables?.pendingAction) return { label: project.deliverables.pendingAction.replaceAll("-", " "), section: "deliverables" };
  return { label: "No action is waiting on you", section: "activity" };
}

function Overview({ project }: { project: Project }) {
  const { navigate } = useSafeNavigation();
  const lifecycle = useQuery({ queryKey: ["lifecycle", project.id], queryFn: () => api(`/projects/${project.id}/lifecycle`, {}, lifecycleResponseSchema) });
  const milestones = useQuery({ queryKey: ["milestones", project.id], queryFn: () => api(`/projects/${project.id}/milestones`, {}, milestoneTimelineResponseSchema) });
  const deliverables = useQuery({ queryKey: ["deliverables", project.id], queryFn: () => api(`/projects/${project.id}/deliverables`, {}, deliverableCollectionResponseSchema) });
  const activity = useQuery({ queryKey: ["activity-overview", project.id], queryFn: () => api(`/projects/${project.id}/activity?limit=5`, {}, activityResponseSchema) });
  const action = nextAction(project);
  const milestoneItems = milestones.data?.timeline.milestones ?? [];
  const completed = milestoneItems.filter((item) => item.status === "completed").length;
  const latestDeliverable = [...(deliverables.data?.deliverables.deliverables ?? [])].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];

  return <div className="overview-grid">
    <section className="overview-status panel"><div className="overview-icon"><CircleGauge /></div><p className="eyebrow">Current state</p><h2>{(lifecycle.data?.lifecycle.state ?? project.lifecycle?.state ?? "active").replaceAll("-", " ")}</h2><p>{lifecycle.data?.lifecycle.readOnly ? "Project work is currently read-only." : "Project work remains active and available to authorized members."}</p><button className="text-link" onClick={() => navigate(projectHref(project.id, "settings"))}>View lifecycle and settings →</button></section>
    <section className="overview-action panel"><div className="overview-icon attention"><Clock3 /></div><p className="eyebrow">Next action</p><h2>{action.label}</h2><p>{action.label.startsWith("No action") ? "Review recent activity or continue work in a project section." : "Open the source section to review the current context and available action."}</p><button className="primary" onClick={() => navigate(projectHref(project.id, action.section))}>Open {sectionLabels[action.section]}</button></section>
    <section className="overview-card panel"><FileCheck2 /><div><p className="eyebrow">Milestone progress</p><h2>{milestones.isPending ? "Loading…" : `${completed} of ${milestoneItems.length} complete`}</h2></div><button className="text-link" onClick={() => navigate(projectHref(project.id, "milestones"))}>View milestones →</button></section>
    <section className="overview-card panel"><CheckCircle2 /><div><p className="eyebrow">Latest deliverable</p><h2>{deliverables.isPending ? "Loading…" : latestDeliverable?.title ?? "No deliverables yet"}</h2>{latestDeliverable && <p>{latestDeliverable.state.replaceAll("-", " ")}</p>}</div><button className="text-link" onClick={() => navigate(projectHref(project.id, "deliverables"))}>View deliverables →</button></section>
    <section className="panel overview-activity"><div className="panel-heading"><div><p className="eyebrow">Recent activity</p><h2>Latest project events</h2></div><button className="text-link" onClick={() => navigate(projectHref(project.id, "activity"))}>View all →</button></div>{activity.isPending && <LoadingBlock label="Loading recent activity" />}<ErrorNote error={activity.error} /><ol className="activity-list">{activity.data?.activity.items.map((item) => <li key={item.id}><span><strong>{item.actor?.displayName ?? "ClientScope"}</strong> · {item.type.replaceAll(".", " ")}</span><time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString()}</time></li>)}</ol>{activity.data && !activity.data.activity.items.length && <p className="empty-copy">No project activity yet.</p>}</section>
  </div>;
}

function SettingsSection({ project, onBack }: { project: Project; onBack?: () => void }) {
  const queryClient = useQueryClient();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const members = useQuery({ queryKey: ["project-members", project.id], queryFn: () => api(`/projects/${project.id}/members`, {}, projectMembersResponseSchema) });
  const leave = useMutation({
    mutationFn: () => api(`/projects/${project.id}/leave`, json("POST", { confirmed: true }), messageResponseSchema),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["work"] }); setConfirmLeave(false); onBack?.(); },
    onError: async () => {
      setConfirmLeave(false);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["work"] }), members.refetch()]);
    },
  });
  return <div className="settings-stack"><LifecyclePanel projectId={project.id} show="lifecycle" /><section className="panel"><div className="panel-heading"><div><p className="eyebrow">Shared access</p><h2>Project members</h2></div></div>{members.isPending && <LoadingBlock label="Loading members" />}<ErrorNote error={members.error} />{members.data?.members.map((member) => <div className="member" key={`${member.id}-${member.role}`}><span className="avatar">{member.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{member.displayName}</strong><p>{member.role.replaceAll("-", " ")}</p></div></div>)}</section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">Portable record</p><h2>Project record export</h2></div></div><p className="fine">Download the complete shared record available to your current membership.</p><ProjectExportButton projectId={project.id} /></section>{project.role.startsWith("client-") && <section className="panel danger-zone"><div><p className="eyebrow">Access</p><h2>Leave this project</h2><p>Your access ends immediately and returning requires a new invitation.</p></div><button className="danger" onClick={() => setConfirmLeave(true)}>Leave project</button></section>}<ErrorNote error={leave.error} />{confirmLeave && <ConfirmDialog title={`Leave ${project.name}?`} description="Your access ends immediately. Returning later requires a new invitation from the workspace owner." confirmLabel="Leave project" busy={leave.isPending} onCancel={() => setConfirmLeave(false)} onConfirm={() => leave.mutate()} />}</div>;
}

export function ProjectView({ projectId, section = "overview", onBack }: { projectId: string; section?: ProjectSection; onBack?: () => void }) {
  const { navigate } = useSafeNavigation();
  const project = useQuery({ queryKey: ["project", projectId], queryFn: () => api(`/projects/${projectId}`, {}, projectResponseSchema) });
  if (project.isPending) return <LoadingBlock label="Loading project" />;
  if (project.error) return <section className="route-error"><Settings2 /><h1>Project unavailable</h1><ErrorNote error={project.error} /><button className="secondary" onClick={() => navigate("/")}>Back to My Work</button></section>;
  const item = project.data.project;
  const serviceContact = item.role === "service-team-member" ? [item.client.companyName, item.client.primaryContactEmail].filter(Boolean).join(" · ") : "";
  return <section className="project-layout"><header className="project-header"><button className="back" onClick={() => onBack ? onBack() : navigate("/")}>← My Work</button><div className="project-heading"><div><p className="eyebrow">{item.client.name}</p><h1>{item.name}</h1>{serviceContact && <p className="fine">{serviceContact}</p>}<p className="plain-text">{item.description || "No project description was added."}</p></div><div className="project-meta"><span className={`badge lifecycle-${item.lifecycle?.state ?? "active"}`}>{(item.lifecycle?.state ?? "active").replaceAll("-", " ")}</span><span>{item.role.replaceAll("-", " ")}</span><span>{item.targetDeadline ? `Due ${item.targetDeadline}` : "No deadline"}</span></div></div><nav className="project-tabs" aria-label="Project sections">{projectSections.map((candidate) => <button aria-current={candidate === section ? "page" : undefined} key={candidate} onClick={() => navigate(projectHref(projectId, candidate))}>{sectionLabels[candidate]}</button>)}</nav></header><div className="project-section" aria-labelledby="section-heading"><div className="section-heading"><div><p className="eyebrow">Project section</p><h2 id="section-heading">{sectionLabels[section]}</h2></div></div>{section === "overview" && <Overview project={item as Project} />}{section === "scope" && <ScopePanel projectId={projectId} />}{section === "changes" && <ChangeControlPanel projectId={projectId} />}{section === "milestones" && <MilestonePanel projectId={projectId} />}{section === "deliverables" && <DeliverablePanel projectId={projectId} />}{section === "activity" && <LifecyclePanel projectId={projectId} show="activity" />}{section === "settings" && <SettingsSection project={item as Project} onBack={onBack ?? (() => navigate("/"))} />}</div></section>;
}
