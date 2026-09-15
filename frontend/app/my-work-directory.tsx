"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { ArrowUpDown, CalendarDays, Filter, Search, X } from "lucide-react";

import type { WorkResponse } from "./api-schemas";
import { projectHref } from "./route-model";
import {
  deadlineStatus,
  deadlineValues,
  defaultDirectoryState,
  directoryStateParams,
  filterAndSortProjects,
  flattenWorkspaces,
  hasPendingAction,
  lifecycleValues,
  parseDirectoryState,
  pendingActionLabel,
  roleValues,
  sortValues,
  type DirectoryState,
} from "./work-directory";
import { EmptyState, useSafeNavigation } from "./ui-foundation";

const title = (value: string) => value.replaceAll("-", " ").replace(/\b\w/gu, (character) => character.toUpperCase());
const dateLabel = (value?: string) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`)) : "No deadline";
const recencyLabel = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));

function MultiFilter({ label, values, selected, onChange }: { label: string; values: readonly string[]; selected: string[]; onChange: (values: string[]) => void }) {
  return <details className="filter-menu"><summary><Filter size={15} />{label}{selected.length ? <span className="filter-count">{selected.length}</span> : null}</summary><fieldset><legend className="sr-only">Filter by {label}</legend>{values.map((value) => <label className="check-row" key={value}><input type="checkbox" checked={selected.includes(value)} onChange={(event) => onChange(event.target.checked ? [...selected, value] : selected.filter((item) => item !== value))} />{title(value)}</label>)}</fieldset></details>;
}

function ProjectFacts({ project }: { project: ReturnType<typeof flattenWorkspaces>[number] }) {
  const deadline = deadlineStatus(project);
  return <><div><strong>{project.name}</strong><small>{project.client.name} · {project.workspaceName}</small></div><span className={`badge lifecycle-${project.lifecycle?.state ?? "active"}`}>{title(project.lifecycle?.state ?? "active")}</span><span>{title(project.role)}</span><span className={deadline === "overdue" ? "overdue" : ""}><CalendarDays size={15} /> {dateLabel(project.targetDeadline)}<small>{title(deadline)}</small></span><span className={hasPendingAction(project) ? "attention-copy" : "muted-copy"}>{pendingActionLabel(project)}</span><span><small>Updated {recencyLabel(project.updatedAt)}</small></span></>;
}

function ProjectRow({ project, onOpen }: { project: ReturnType<typeof flattenWorkspaces>[number]; onOpen: () => void }) {
  const deadline = deadlineStatus(project);
  return <tr><td><button className="directory-project-link" onClick={onOpen}><strong>{project.name}</strong><small>{project.client.name} · {project.workspaceName}</small></button></td><td><span className={`badge lifecycle-${project.lifecycle?.state ?? "active"}`}>{title(project.lifecycle?.state ?? "active")}</span></td><td>{title(project.role)}</td><td className={deadline === "overdue" ? "overdue" : ""}><span className="deadline-cell"><CalendarDays size={15} /> {dateLabel(project.targetDeadline)}<small>{title(deadline)}</small></span></td><td className={hasPendingAction(project) ? "attention-copy" : "muted-copy"}>{pendingActionLabel(project)}</td><td><small>Updated {recencyLabel(project.updatedAt)}</small></td></tr>;
}

export function MyWorkDirectory({ work }: { work: WorkResponse }) {
  const searchParamsText = useSearchParams()?.toString() ?? "";
  const { navigate } = useSafeNavigation();
  const allProjects = useMemo(() => flattenWorkspaces(work.workspaces), [work.workspaces]);
  const state = useMemo(() => parseDirectoryState(new URLSearchParams(searchParamsText), work.workspaces.map((workspace) => workspace.id)), [searchParamsText, work.workspaces]);
  const projects = useMemo(() => filterAndSortProjects(allProjects, state), [allProjects, state]);
  const update = (next: DirectoryState, replace = false) => {
    const query = directoryStateParams(next).toString();
    const href = query ? `/?${query}` : "/";
    if (replace) window.history.replaceState(null, "", href); else window.history.pushState(null, "", href);
  };
  const activeFilters = state.workspaces.length + state.states.length + state.roles.length + state.deadlines.length + Number(state.pendingOnly) + Number(Boolean(state.query));

  if (!allProjects.length) return <EmptyState title="Your client work will live here"><p>Create a workspace or accept an invitation to get started.</p></EmptyState>;

  return <section className="directory-section" aria-labelledby="directory-title"><div className="section-title"><div><p className="eyebrow">Project directory</p><h2 id="directory-title">All accessible projects</h2></div><span>{projects.length} of {allProjects.length}</span></div><div className="directory-toolbar"><label className="search-field"><Search size={18} /><span className="sr-only">Search projects</span><input type="search" value={state.query} maxLength={120} placeholder="Search projects, clients, workspaces" onChange={(event) => update({ ...state, query: event.target.value.slice(0, 120) }, true)} /></label><div className="filter-row"><MultiFilter label="Workspace" values={work.workspaces.map((workspace) => workspace.id)} selected={state.workspaces} onChange={(values) => update({ ...state, workspaces: values })} />{state.workspaces.length > 0 && <span className="selected-filter-names">{state.workspaces.map((id) => work.workspaces.find((workspace) => workspace.id === id)?.name).filter(Boolean).join(", ")}</span>}<MultiFilter label="Lifecycle" values={lifecycleValues} selected={state.states} onChange={(values) => update({ ...state, states: values as DirectoryState["states"] })} /><MultiFilter label="Role" values={roleValues} selected={state.roles} onChange={(values) => update({ ...state, roles: values as DirectoryState["roles"] })} /><MultiFilter label="Deadline" values={deadlineValues} selected={state.deadlines} onChange={(values) => update({ ...state, deadlines: values as DirectoryState["deadlines"] })} /><label className="pending-toggle"><input type="checkbox" checked={state.pendingOnly} onChange={(event) => update({ ...state, pendingOnly: event.target.checked })} /> Needs my action</label><label className="sort-control"><ArrowUpDown size={16} /><span className="sr-only">Sort projects</span><select value={state.sort} onChange={(event) => update({ ...state, sort: event.target.value as DirectoryState["sort"] })}>{sortValues.map((value) => <option value={value} key={value}>{value === "recent" ? "Recent update" : title(value)}</option>)}</select></label>{activeFilters > 0 && <button className="clear-filters" onClick={() => update(defaultDirectoryState)}><X size={15} /> Clear</button>}</div></div>{projects.length ? <><div className="directory-table-wrap"><table className="directory-table"><thead><tr><th>Project</th><th>Status</th><th>Your role</th><th>Deadline</th><th>Attention</th><th>Recency</th></tr></thead><tbody>{projects.map((project) => <ProjectRow key={project.id} project={project} onOpen={() => navigate(projectHref(project.id))} />)}</tbody></table></div><div className="directory-cards">{projects.map((project) => <article key={project.id} className="directory-card"><button onClick={() => navigate(projectHref(project.id))}><ProjectFacts project={project} /></button></article>)}</div></> : <EmptyState title="No projects match these filters"><p>Adjust or clear the current search and filters.</p><button className="secondary" onClick={() => update(defaultDirectoryState)}>Clear filters</button></EmptyState>}</section>;
}
