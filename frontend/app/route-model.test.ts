import { describe, expect, it } from "vitest";

import { adminHref, parseAppRoute, projectHref } from "./route-model";

describe("durable route model", () => {
  it("resolves project defaults and every canonical section", () => {
    expect(parseAppRoute("/projects/p1")).toEqual({ kind: "project", projectId: "p1", section: "overview" });
    expect(parseAppRoute(projectHref("p1", "deliverables"))).toEqual({ kind: "project", projectId: "p1", section: "deliverables" });
  });

  it("accepts only canonical admin sections and rejects malformed routes safely", () => {
    expect(parseAppRoute(adminHref("w1", "access"))).toEqual({ kind: "admin", workspaceId: "w1", section: "access" });
    expect(parseAppRoute("/workspaces/w1/admin/private")).toEqual({ kind: "invalid" });
    expect(parseAppRoute("/projects/p1/unknown")).toEqual({ kind: "invalid" });
    expect(parseAppRoute(null)).toEqual({ kind: "work" });
  });
});

