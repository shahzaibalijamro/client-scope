export const projectSections = ["overview", "scope", "changes", "milestones", "deliverables", "activity", "settings"] as const;
export const adminSections = ["clients", "projects", "access", "invitations"] as const;

export type ProjectSection = (typeof projectSections)[number];
export type AdminSection = (typeof adminSections)[number];

export type AppRoute =
  | { kind: "work" }
  | { kind: "project"; projectId: string; section: ProjectSection }
  | { kind: "admin"; workspaceId: string; section: AdminSection }
  | { kind: "invalid" };

export function parseAppRoute(pathname: string | null | undefined): AppRoute {
  pathname ??= "/";
  if (pathname === "/" || pathname === "/work") return { kind: "work" };
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "projects" && parts.length >= 2) {
    if (parts.length === 2) return { kind: "project", projectId: parts[1], section: "overview" };
    if (parts.length === 3 && projectSections.includes(parts[2] as ProjectSection)) {
      return { kind: "project", projectId: parts[1], section: parts[2] as ProjectSection };
    }
  }
  if (parts[0] === "workspaces" && parts[2] === "admin" && parts.length === 4 && adminSections.includes(parts[3] as AdminSection)) {
    return { kind: "admin", workspaceId: parts[1], section: parts[3] as AdminSection };
  }
  return { kind: "invalid" };
}

export const projectHref = (projectId: string, section: ProjectSection = "overview") => `/projects/${encodeURIComponent(projectId)}/${section}`;
export const adminHref = (workspaceId: string, section: AdminSection = "clients") => `/workspaces/${encodeURIComponent(workspaceId)}/admin/${section}`;
