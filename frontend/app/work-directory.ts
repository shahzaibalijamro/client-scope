import type { Project, WorkspaceGroup } from "./api-schemas";

export const lifecycleValues = ["active", "completion-in-review", "completed", "archived"] as const;
export const roleValues = ["workspace-owner", "service-team-member", "client-participant", "client-approver"] as const;
export const deadlineValues = ["overdue", "due-soon", "later", "no-deadline"] as const;
export const sortValues = ["attention", "deadline", "recent", "name"] as const;

export type LifecycleFilter = (typeof lifecycleValues)[number];
export type RoleFilter = (typeof roleValues)[number];
export type DeadlineStatus = (typeof deadlineValues)[number];
export type DirectorySort = (typeof sortValues)[number];

export type DirectoryProject = Project & {
  workspaceName: string;
  workspaceRelationship: WorkspaceGroup["relationship"];
};

export type DirectoryState = {
  query: string;
  workspaces: string[];
  states: LifecycleFilter[];
  roles: RoleFilter[];
  pendingOnly: boolean;
  deadlines: DeadlineStatus[];
  sort: DirectorySort;
};

export const defaultDirectoryState: DirectoryState = {
  query: "",
  workspaces: [],
  states: [],
  roles: [],
  pendingOnly: false,
  deadlines: [],
  sort: "attention",
};

function validList<T extends string>(value: string | null, valid: readonly T[]): T[] {
  if (!value) return [];
  return [...new Set(value.split(",").filter((item): item is T => valid.includes(item as T)))];
}

export function parseDirectoryState(params: URLSearchParams, accessibleWorkspaceIds: readonly string[] = []): DirectoryState {
  const sort = params.get("sort");
  return {
    query: (params.get("q") ?? "").slice(0, 120),
    workspaces: validList(params.get("workspace"), accessibleWorkspaceIds),
    states: validList(params.get("state"), lifecycleValues),
    roles: validList(params.get("role"), roleValues),
    pendingOnly: params.get("action") === "pending",
    deadlines: validList(params.get("deadline"), deadlineValues),
    sort: sortValues.includes(sort as DirectorySort) ? sort as DirectorySort : "attention",
  };
}

export function directoryStateParams(state: DirectoryState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query.slice(0, 120));
  if (state.workspaces.length) params.set("workspace", state.workspaces.join(","));
  if (state.states.length) params.set("state", state.states.join(","));
  if (state.roles.length) params.set("role", state.roles.join(","));
  if (state.pendingOnly) params.set("action", "pending");
  if (state.deadlines.length) params.set("deadline", state.deadlines.join(","));
  if (state.sort !== "attention") params.set("sort", state.sort);
  return params;
}

export function flattenWorkspaces(workspaces: readonly WorkspaceGroup[]): DirectoryProject[] {
  return workspaces.flatMap((workspace) => [
    ...workspace.projects,
    ...workspace.completedProjects,
    ...workspace.archivedProjects,
  ].map((project) => ({
    ...project,
    workspaceName: workspace.name,
    workspaceRelationship: workspace.relationship,
  })));
}

export function hasPendingAction(project: DirectoryProject): boolean {
  return Boolean(project.lifecycle?.pendingAction || project.scope?.pendingAction || project.changeControl?.pendingAction || project.deliverables?.pendingAction);
}

export function pendingActionLabel(project: DirectoryProject): string {
  const action = project.lifecycle?.pendingAction ?? project.scope?.pendingAction ?? project.changeControl?.pendingAction ?? project.deliverables?.pendingAction;
  return action ? action.replaceAll("-", " ") : "No action pending";
}

function validDateOnly(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const result = new Date(year, month - 1, day);
  return result.getFullYear() === year && result.getMonth() === month - 1 && result.getDate() === day ? result : null;
}

export function deadlineStatus(project: DirectoryProject, today = new Date()): DeadlineStatus {
  const deadline = validDateOnly(project.targetDeadline);
  if (!deadline) return "no-deadline";
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const lifecycle = project.lifecycle?.state ?? "active";
  if (deadline < start && lifecycle !== "completed" && lifecycle !== "archived") return "overdue";
  const dueSoonEnd = new Date(start);
  dueSoonEnd.setDate(dueSoonEnd.getDate() + 14);
  if (deadline >= start && deadline <= dueSoonEnd) return "due-soon";
  return "later";
}

function projectNameCompare(a: DirectoryProject, b: DirectoryProject): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id);
}

function validTimestamp(value?: string): number {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function deadlineTimestamp(project: DirectoryProject, futureOnly: boolean, today: Date): number {
  const deadline = validDateOnly(project.targetDeadline);
  if (!deadline) return Number.POSITIVE_INFINITY;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (futureOnly && deadline < start) return Number.POSITIVE_INFINITY;
  return deadline.getTime();
}

export function filterAndSortProjects(projects: readonly DirectoryProject[], state: DirectoryState, today = new Date()): DirectoryProject[] {
  const query = state.query.trim().toLocaleLowerCase();
  const filtered = projects.filter((project) => {
    const lifecycle = project.lifecycle?.state ?? "active";
    return (!query || [project.name, project.client.name, project.workspaceName].some((value) => value.toLocaleLowerCase().includes(query)))
      && (!state.workspaces.length || state.workspaces.includes(project.workspaceId))
      && (!state.states.length || state.states.includes(lifecycle))
      && (!state.roles.length || state.roles.includes(project.role))
      && (!state.pendingOnly || hasPendingAction(project))
      && (!state.deadlines.length || state.deadlines.includes(deadlineStatus(project, today)));
  });

  return [...filtered].sort((a, b) => {
    if (state.sort === "name") return projectNameCompare(a, b);
    if (state.sort === "recent") return validTimestamp(b.updatedAt) - validTimestamp(a.updatedAt) || projectNameCompare(a, b);
    if (state.sort === "deadline") return deadlineTimestamp(a, false, today) - deadlineTimestamp(b, false, today) || projectNameCompare(a, b);
    const attention = Number(hasPendingAction(b)) - Number(hasPendingAction(a));
    return attention
      || deadlineTimestamp(a, true, today) - deadlineTimestamp(b, true, today)
      || validTimestamp(b.updatedAt) - validTimestamp(a.updatedAt)
      || projectNameCompare(a, b);
  });
}

