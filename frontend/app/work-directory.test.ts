import { describe, expect, it } from "vitest";

import {
  deadlineStatus, defaultDirectoryState, directoryStateParams, filterAndSortProjects,
  parseDirectoryState, type DirectoryProject,
} from "./work-directory";

function project(overrides: Partial<DirectoryProject> = {}): DirectoryProject {
  return {
    id: "project", workspaceId: "workspace", workspaceName: "Northstar Studio", workspaceRelationship: "owner",
    name: "Website", client: { id: "client", name: "Acme" }, role: "workspace-owner",
    updatedAt: "2026-09-10T12:00:00.000Z", lifecycle: { state: "active", readOnly: false, permissions: { canRequestCompletion: false, canWithdrawCompletion: false, canDecideCompletion: false, canArchive: false, canRestore: false } },
    ...overrides,
  };
}

describe("work directory rules", () => {
  const today = new Date(2026, 8, 14);

  it("matches project, client, and workspace names as bounded plain text", () => {
    const items = [project(), project({ id: "two", name: "Mobile app", client: { id: "client-2", name: "A.C.M.E [Labs]" }, workspaceName: "Other" })];
    expect(filterAndSortProjects(items, { ...defaultDirectoryState, query: "provider" }, today)).toHaveLength(0);
    expect(filterAndSortProjects(items, { ...defaultDirectoryState, query: "NORTHSTAR" }, today)).toHaveLength(1);
    expect(filterAndSortProjects(items, { ...defaultDirectoryState, query: "[labs]" }, today)[0].id).toBe("two");
    expect(parseDirectoryState(new URLSearchParams(`q=${"x".repeat(130)}`)).query).toHaveLength(120);
  });

  it("classifies deadlines at local calendar boundaries and never marks terminal work overdue", () => {
    expect(deadlineStatus(project({ targetDeadline: "2026-09-13" }), today)).toBe("overdue");
    expect(deadlineStatus(project({ targetDeadline: "2026-09-14" }), today)).toBe("due-soon");
    expect(deadlineStatus(project({ targetDeadline: "2026-09-28" }), today)).toBe("due-soon");
    expect(deadlineStatus(project({ targetDeadline: "2026-09-29" }), today)).toBe("later");
    expect(deadlineStatus(project({ targetDeadline: "invalid" }), today)).toBe("no-deadline");
    expect(deadlineStatus(project({ targetDeadline: "2026-09-13", lifecycle: { ...project().lifecycle!, state: "completed", readOnly: true } }), today)).toBe("later");
  });

  it("combines categories with AND and values within a category with OR", () => {
    const items = [
      project({ id: "owner-active", role: "workspace-owner" }),
      project({ id: "approver-active", role: "client-approver" }),
      project({ id: "member-completed", role: "service-team-member", lifecycle: { ...project().lifecycle!, state: "completed", readOnly: true } }),
    ];
    const result = filterAndSortProjects(items, { ...defaultDirectoryState, states: ["active"], roles: ["workspace-owner", "client-approver"] }, today);
    expect(result.map((item) => item.id).sort()).toEqual(["approver-active", "owner-active"]);
  });

  it("sorts attention first, then future deadline, recency, and deterministic name", () => {
    const items = [
      project({ id: "late", name: "Zulu", targetDeadline: "2026-10-01", updatedAt: "2026-09-13T00:00:00.000Z" }),
      project({ id: "attention", name: "Bravo", targetDeadline: "2026-12-01", scope: { state: "in-review", pendingAction: "decision-required" } }),
      project({ id: "near", name: "Alpha", targetDeadline: "2026-09-20", updatedAt: "2026-09-01T00:00:00.000Z" }),
    ];
    expect(filterAndSortProjects(items, defaultDirectoryState, today).map((item) => item.id)).toEqual(["attention", "near", "late"]);
    expect(filterAndSortProjects(items, { ...defaultDirectoryState, sort: "name" }, today).map((item) => item.name)).toEqual(["Alpha", "Bravo", "Zulu"]);
  });

  it("normalizes URL state and omits defaults when clearing", () => {
    const parsed = parseDirectoryState(new URLSearchParams("workspace=w1,bad&state=active,nope&role=client-approver&action=pending&deadline=overdue&sort=recent&unknown=x"), ["w1"]);
    expect(parsed).toMatchObject({ workspaces: ["w1"], states: ["active"], roles: ["client-approver"], pendingOnly: true, deadlines: ["overdue"], sort: "recent" });
    expect(directoryStateParams(defaultDirectoryState).toString()).toBe("");
  });
});

