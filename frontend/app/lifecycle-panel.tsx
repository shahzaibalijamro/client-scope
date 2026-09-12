"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, json } from "./api-client";
import { activityResponseSchema, lifecycleResponseSchema, type ProjectLifecycle } from "./api-schemas";
import { ConfirmDialog } from "./confirm-dialog";

const blockerCopy: Record<string, string> = {
  NO_APPROVED_SCOPE: "Approve the current scope.",
  NO_APPROVED_DELIVERABLE: "Approve at least one deliverable.",
  NO_ACTIVE_CLIENT_APPROVER: "Add an active Client Approver.",
  PENDING_SCOPE_REVIEW: "Finish or withdraw the pending scope work.",
  ACTIVE_CHANGE_REQUEST: "Finish or cancel the active change request.",
  OPEN_DELIVERABLE: "Finish or cancel every open deliverable.",
  INCOMPLETE_ACTIVE_MILESTONE: "Complete every active milestone or archive it.",
};

const eventCopy: Record<string, string> = {
  "project.created": "created the project", "client.joined": "joined the project",
  "service-member.assigned": "assigned a service-team member", "service-member.unassigned": "removed a service-team assignment",
  "service-member.workspace-access-ended": "ended a service-team member's access", "client-member.role-changed": "changed a client member's role",
  "client-member.left": "left the project", "client-member.removed": "removed a client member",
  "scope.version-submitted": "submitted a scope version", "scope.comment-posted": "commented on scope",
  "scope.version-approved": "approved a scope version", "scope.changes-requested": "requested scope changes", "scope.review-withdrawn": "withdrew scope review",
  "change-request.proposal-submitted": "submitted a change request", "change-request.comment-posted": "commented on a change request",
  "change-request.approved": "approved a change request", "change-request.rejected": "rejected a change request",
  "change-request.changes-requested": "requested change-request revisions", "change-request.proposal-withdrawn": "withdrew a change proposal", "change-request.canceled": "canceled a change request",
  "milestone.created": "created a milestone", "milestone.edited": "edited a milestone", "milestone.status-transitioned": "changed a milestone status",
  "milestone.reordered": "reordered milestones", "milestone.archived": "archived a milestone",
  "deliverable.submitted": "submitted a deliverable", "deliverable.commented": "commented on a deliverable",
  "deliverable.approved": "approved a deliverable", "deliverable.revision-requested": "requested a deliverable revision",
  "deliverable.withdrawn": "withdrew a deliverable", "deliverable.canceled": "canceled a deliverable",
  "project.completion-requested": "requested final completion", "project.completion-approved": "approved final completion",
  "project.completion-returned": "returned the project to active work", "project.completion-withdrawn": "withdrew final review",
  "project.archived": "archived the project", "project.restored": "restored the project to completed",
};

type Action = "request" | "approve" | "return" | "withdraw" | "archive" | "restore";

function ErrorNote({ error }: Readonly<{ error: unknown }>) {
  if (!error) return null;
  return <p role="alert" className="notice error">{error instanceof Error ? error.message : "Something went wrong."}</p>;
}

function actionDetails(action: Action) {
  switch (action) {
    case "request": return { title: "Request final completion?", description: "This locks project work while the client reviews the complete project.", label: "Request final review", optional: true, field: "Optional summary" };
    case "approve": return { title: "Approve final completion?", description: "Approval permanently closes ordinary project work.", label: "Approve completion", optional: true, field: "Optional note" };
    case "return": return { title: "Return this project to active work?", description: "The current review round remains preserved and providers can continue work.", label: "Return to active", optional: false, field: "Reason" };
    case "withdraw": return { title: "Withdraw final review?", description: "The project returns to active work and this round remains preserved.", label: "Withdraw review", optional: false, field: "Reason" };
    case "archive": return { title: "Archive this completed project?", description: "The project moves out of completed work and remains permanently read-only.", label: "Archive project", optional: false, field: "Reason" };
    case "restore": return { title: "Restore this archived project?", description: "The project returns to completed work. It remains permanently read-only.", label: "Restore to completed", optional: false, field: "Reason" };
  }
}

export function LifecyclePanel({ projectId }: Readonly<{ projectId: string }>) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<Action>();
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string>();
  const lifecycle = useQuery({ queryKey: ["lifecycle", projectId], queryFn: () => api(`/projects/${projectId}/lifecycle`, {}, lifecycleResponseSchema) });
  const activity = useInfiniteQuery({
    queryKey: ["activity", projectId], initialPageParam: "",
    queryFn: ({ pageParam }) => api(`/projects/${projectId}/activity?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, {}, activityResponseSchema),
    getNextPageParam: (last) => last.activity.nextCursor,
  });
  const mutation = useMutation({
    mutationFn: async ({ kind, current }: { kind: Action; current: ProjectLifecycle }) => {
      const roundId = current.currentRoundId;
      if (kind === "request") return api(`/projects/${projectId}/completion-requests`, json("POST", { confirmed: true, lifecycleRevision: current.revision, summary: text }), lifecycleResponseSchema);
      if (kind === "approve" || kind === "return") return api(`/projects/${projectId}/completion-rounds/${roundId}/decisions`, json("POST", kind === "approve"
        ? { confirmed: true, lifecycleRevision: current.revision, outcome: "approved", note: text }
        : { confirmed: true, lifecycleRevision: current.revision, outcome: "returned", reason: text }), lifecycleResponseSchema);
      if (kind === "withdraw") return api(`/projects/${projectId}/completion-rounds/${roundId}/withdrawal`, json("POST", { confirmed: true, lifecycleRevision: current.revision, reason: text }), lifecycleResponseSchema);
      return api(`/projects/${projectId}/${kind === "archive" ? "archive" : "restore"}`, json("POST", { confirmed: true, lifecycleRevision: current.revision, reason: text }), lifecycleResponseSchema);
    },
    onSuccess: async (body) => {
      setMessage(body.warning ?? "Project lifecycle updated."); setAction(undefined); setText("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["lifecycle", projectId] }), queryClient.invalidateQueries({ queryKey: ["activity", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["project", projectId] }), queryClient.invalidateQueries({ queryKey: ["work"] }),
        queryClient.invalidateQueries({ queryKey: ["scope", projectId] }), queryClient.invalidateQueries({ queryKey: ["change-control", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["milestones", projectId] }), queryClient.invalidateQueries({ queryKey: ["deliverables", projectId] }),
      ]);
    },
    onError: async () => { await lifecycle.refetch(); },
  });

  if (lifecycle.isPending) return <section className="panel"><p role="status">Checking project completion…</p></section>;
  if (lifecycle.error) return <section className="panel"><ErrorNote error={lifecycle.error} /></section>;
  const current = lifecycle.data.lifecycle;
  const currentRound = current.rounds.find((round) => round.id === current.currentRoundId);
  const details = action ? actionDetails(action) : undefined;
  const stateLabel = current.state.replaceAll("-", " ");

  return <>
    <section className="panel lifecycle-panel" aria-labelledby="completion-heading">
      <div className="panel-heading"><div><p className="eyebrow">Project lifecycle</p><h2 id="completion-heading">Completion and record</h2></div><span className={`badge lifecycle-${current.state}`}>{stateLabel}</span></div>
      {current.readOnly && <p className="notice">{current.state === "completion-in-review" ? "Project work is locked while final review is pending." : "This project is permanently read-only."}</p>}
      {message && <p className="notice success" role="status">{message}</p>}
      <ErrorNote error={mutation.error} />
      {current.readiness && <div className="readiness"><h3>{current.readiness.ready ? "Ready for final review" : "Completion blockers"}</h3>{current.readiness.ready
        ? <p>Approved scope, approved delivery, access, changes, and active milestones are ready.</p>
        : <ul>{current.readiness.blockers.map((blocker) => <li key={blocker.code}>{blockerCopy[blocker.code]}{blocker.count ? ` (${blocker.count})` : ""}</li>)}</ul>}</div>}
      {currentRound && <article className="completion-round"><p className="eyebrow">Current round {currentRound.number}</p><h3>Final decision pending</h3><p>Requested by {currentRound.requester.displayName} on {new Date(currentRound.requestedAt).toLocaleString()}.</p>{currentRound.requestSummary && <p className="plain-text">{currentRound.requestSummary}</p>}</article>}
      <div className="row-actions">
        {current.permissions.canRequestCompletion && <button className="primary" onClick={() => setAction("request")}>Request final review</button>}
        {current.permissions.canWithdrawCompletion && <button className="secondary" onClick={() => setAction("withdraw")}>Withdraw request</button>}
        {current.permissions.canDecideCompletion && <><button className="primary" onClick={() => setAction("approve")}>Approve completion</button><button className="secondary" onClick={() => setAction("return")}>Return to active work</button></>}
        {current.permissions.canArchive && <button className="secondary" onClick={() => setAction("archive")}>Archive project</button>}
        {current.permissions.canRestore && <button className="secondary" onClick={() => setAction("restore")}>Restore to completed</button>}
      </div>
      {current.rounds.length > 0 && <details><summary>Completion review history ({current.rounds.length})</summary><div className="version-stack">{current.rounds.map((round) => <article key={round.id}><strong>Round {round.number} · {round.status.replaceAll("-", " ")}</strong><p>Requested by {round.requester.displayName} · {new Date(round.requestedAt).toLocaleString()}</p>{round.terminal && <p className="plain-text">{round.terminal.actor.displayName} {round.terminal.outcome} this round{round.terminal.note ? `: ${round.terminal.note}` : "."}</p>}</article>)}</div></details>}
      {current.archiveHistory.length > 0 && <details><summary>Archive history ({current.archiveHistory.length})</summary>{current.archiveHistory.map((record) => <p className="plain-text" key={record.id}><strong>{record.action}</strong> by {record.actor.displayName}: {record.reason}</p>)}</details>}
    </section>
    <section className="panel" aria-labelledby="activity-heading">
      <div className="panel-heading"><div><p className="eyebrow">Preserved history</p><h2 id="activity-heading">Project activity</h2></div></div>
      {activity.isPending && <p role="status">Loading project activity…</p>}
      <ErrorNote error={activity.error} />
      {!activity.isPending && activity.data?.pages.every((page) => page.activity.items.length === 0) && <p>No project activity yet.</p>}
      <ol className="activity-list">{activity.data?.pages.flatMap((page) => page.activity.items).map((item) => <li key={item.id}><span>{item.actor?.displayName ?? "ClientScope"} {eventCopy[item.type] ?? "updated the project"}.</span><time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString()}</time></li>)}</ol>
      {activity.hasNextPage && <button className="secondary" disabled={activity.isFetchingNextPage} onClick={() => void activity.fetchNextPage()}>{activity.isFetchingNextPage ? "Loading…" : "Load older activity"}</button>}
    </section>
    {action && details && <ConfirmDialog title={details.title} description={details.description} confirmLabel={details.label} danger={action !== "request" && action !== "approve" && action !== "restore"} busy={mutation.isPending} confirmDisabled={!details.optional && !text.trim()} onCancel={() => { setAction(undefined); setText(""); }} onConfirm={() => mutation.mutate({ kind: action, current })}>
      <label>{details.field}<textarea maxLength={2_000} value={text} onChange={(event) => setText(event.target.value)} /></label>
    </ConfirmDialog>}
  </>;
}
