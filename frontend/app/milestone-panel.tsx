"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, type ApiFailure, json } from "./api-client";
import {
  milestoneArchiveResponseSchema, milestoneMutationResponseSchema, milestoneOrderResponseSchema,
  milestoneTimelineResponseSchema, type Milestone, type MilestoneStatus,
} from "./api-schemas";
import { ConfirmDialog } from "./confirm-dialog";

function ErrorNote({ error }: Readonly<{ error: unknown }>) {
  if (!error) return null;
  return <p role="alert" className="notice error">{error instanceof Error ? error.message : "Something went wrong."}</p>;
}

function statusLabel(status: MilestoneStatus) {
  return status.replaceAll("-", " ");
}

function MilestoneFacts({ milestone }: Readonly<{ milestone: Milestone }>) {
  return <>
    <div className="milestone-facts">
      <span className={`badge milestone-status ${milestone.status}`}>{statusLabel(milestone.status)}</span>
      {milestone.isOverdue && <strong className="overdue">Overdue</strong>}
      <span>{milestone.targetDate ? <>Target <time dateTime={milestone.targetDate}>{milestone.targetDate}</time></> : "No target date"}</span>
    </div>
    {milestone.description && <p className="plain-text milestone-description">{milestone.description}</p>}
    {milestone.latestTransition && <div className="transition-context">
      <strong>Latest status update</strong>
      <p>{statusLabel(milestone.latestTransition.previousStatus)} → {statusLabel(milestone.latestTransition.nextStatus)} by {milestone.latestTransition.actor.displayName} · <time dateTime={milestone.latestTransition.transitionedAt}>{new Date(milestone.latestTransition.transitionedAt).toLocaleString()}</time></p>
      {milestone.latestTransition.note && <p className="plain-text">{milestone.latestTransition.note}</p>}
    </div>}
  </>;
}

async function refreshMilestones(queryClient: ReturnType<typeof useQueryClient>, projectId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["milestones", projectId] }),
    queryClient.invalidateQueries({ queryKey: ["milestone-archive", projectId] }),
    queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
    queryClient.invalidateQueries({ queryKey: ["work"] }),
  ]);
}

export function MilestonePanel({ projectId }: Readonly<{ projectId: string }>) {
  const queryClient = useQueryClient();
  const timeline = useQuery({
    queryKey: ["milestones", projectId],
    queryFn: () => api(`/projects/${projectId}/milestones`, {}, milestoneTimelineResponseSchema),
  });
  const archive = useInfiniteQuery({
    queryKey: ["milestone-archive", projectId], initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api(`/projects/${projectId}/milestones/archive?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, {}, milestoneArchiveResponseSchema),
    getNextPageParam: (lastPage) => lastPage.archive.nextCursor,
  });
  const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [targetDate, setTargetDate] = useState("");
  const [editing, setEditing] = useState<Milestone>();
  const [statusTarget, setStatusTarget] = useState<Milestone>(); const [nextStatus, setNextStatus] = useState<MilestoneStatus>("in-progress"); const [note, setNote] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<Milestone>(); const [archiveReason, setArchiveReason] = useState("");
  const [message, setMessage] = useState<string>();
  const currentRevision = timeline.data?.timeline.revisionToken;
  const handleError = async (error: unknown) => {
    if ((error as ApiFailure).code === "STALE_STATE") setMessage("The milestone timeline changed. The latest shared version has been loaded; review it and try again.");
    await refreshMilestones(queryClient, projectId);
  };
  const create = useMutation({
    mutationFn: () => api(`/projects/${projectId}/milestones`, json("POST", { revisionToken: currentRevision, title, description, targetDate }), milestoneMutationResponseSchema),
    onSuccess: async () => { setTitle(""); setDescription(""); setTargetDate(""); setMessage("Milestone created and shared."); await refreshMilestones(queryClient, projectId); },
    onError: handleError,
  });
  const edit = useMutation({
    mutationFn: () => api(`/projects/${projectId}/milestones/${editing!.id}`, json("PATCH", { revisionToken: currentRevision, title: editing!.title, description: editing!.description ?? "", targetDate: editing!.targetDate ?? "" }), milestoneMutationResponseSchema),
    onSuccess: async (result) => { setEditing(undefined); setMessage(result.unchanged ? "No milestone details changed." : "Milestone details updated."); await refreshMilestones(queryClient, projectId); },
    onError: handleError,
  });
  const transition = useMutation({
    mutationFn: () => api(`/projects/${projectId}/milestones/${statusTarget!.id}/transitions`, json("POST", { revisionToken: currentRevision, status: nextStatus, note }), milestoneMutationResponseSchema),
    onSuccess: async () => { setStatusTarget(undefined); setNote(""); setMessage("Milestone status updated."); await refreshMilestones(queryClient, projectId); },
    onError: handleError,
  });
  const reorder = useMutation({
    mutationFn: (milestoneIds: string[]) => api(`/projects/${projectId}/milestones/order`, json("PUT", { revisionToken: currentRevision, milestoneIds }), milestoneOrderResponseSchema),
    onSuccess: async () => { setMessage("Milestone order updated."); await refreshMilestones(queryClient, projectId); }, onError: handleError,
  });
  const archiveMutation = useMutation({
    mutationFn: () => api(`/projects/${projectId}/milestones/${archiveTarget!.id}/archive`, json("POST", { revisionToken: currentRevision, confirmed: true, reason: archiveReason }), milestoneMutationResponseSchema),
    onSuccess: async () => { setArchiveTarget(undefined); setArchiveReason(""); setMessage("Milestone archived."); await refreshMilestones(queryClient, projectId); }, onError: handleError,
  });

  if (timeline.isPending) return <section className="panel"><p role="status">Loading delivery milestones…</p></section>;
  if (timeline.error) return <section className="panel"><ErrorNote error={timeline.error} /><button className="secondary" onClick={() => void timeline.refetch()}>Retry</button></section>;
  const data = timeline.data.timeline;
  const move = (index: number, direction: -1 | 1) => {
    const ids = data.milestones.map((item) => item.id); const other = index + direction;
    [ids[index], ids[other]] = [ids[other]!, ids[index]!]; reorder.mutate(ids);
  };

  return <section className="scope-workflow milestone-workflow" aria-labelledby="milestone-heading">
    <header className="scope-heading"><div><p className="eyebrow">Delivery progress</p><h2 id="milestone-heading">Client-facing milestones</h2></div><span className="badge">{data.activeCount} of {data.limit} active</span></header>
    <p className="fine">Agreed scope describes what will be delivered. Milestones show where delivery stands; they are not internal tasks or client approvals.</p>
    {message && <p role="status" className={message.includes("changed") ? "notice warning" : "notice success"}>{message}</p>}
    <ErrorNote error={create.error || edit.error || transition.error || reorder.error || archiveMutation.error} />
    {!data.available && <section className="panel compact-empty"><h3>Milestones are not available yet</h3><p>{data.permissions.canCreate ? "" : "An approved scope is required before the provider can start sharing delivery milestones."}</p></section>}
    {data.available && data.permissions.canCreate && <form className="panel milestone-create" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
      <div className="panel-heading"><div><h3>Add a client-facing milestone</h3><p className="fine">New milestones start as upcoming and appear at the end of the shared sequence.</p></div></div>
      <label>Title<input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>Description (optional)<textarea rows={3} maxLength={2_000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <label>Target date (optional)<input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></label>
      <button className="primary" disabled={!title.trim() || create.isPending || data.activeCount >= data.limit}>{create.isPending ? "Creating…" : data.activeCount >= data.limit ? "Active milestone limit reached" : "Create milestone"}</button>
    </form>}
    {data.available && !data.milestones.length && <section className="panel compact-empty"><h3>No milestones shared yet</h3><p>{data.permissions.canCreate ? "Create the first delivery stage above." : "The provider has not shared any delivery milestones yet."}</p></section>}
    {!!data.milestones.length && <ol className="milestone-list">{data.milestones.map((milestone, index) => <li className="panel milestone-card" key={milestone.id}>
      {editing?.id === milestone.id ? <form onSubmit={(event) => { event.preventDefault(); edit.mutate(); }}>
        <label>Title<input required maxLength={120} value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} /></label>
        <label>Description (optional)<textarea rows={3} maxLength={2_000} value={editing.description ?? ""} onChange={(event) => setEditing({ ...editing, description: event.target.value || undefined })} /></label>
        <label>Target date (optional)<input type="date" value={editing.targetDate ?? ""} onChange={(event) => setEditing({ ...editing, targetDate: event.target.value || undefined })} /></label>
        <div className="row-actions"><button type="button" className="secondary compact" onClick={() => setEditing(undefined)}>Cancel</button><button className="primary compact" disabled={!editing.title.trim() || edit.isPending}>Save details</button></div>
      </form> : <>
        <div className="milestone-heading"><div><p className="eyebrow">Milestone {index + 1}</p><h3>{milestone.title}</h3></div></div>
        <MilestoneFacts milestone={milestone} />
        {data.permissions.canEdit && <div className="row-actions milestone-actions">
          <button className="secondary compact" disabled={index === 0 || reorder.isPending} aria-label={`Move ${milestone.title} up`} onClick={() => move(index, -1)}>Move up</button>
          <button className="secondary compact" disabled={index === data.milestones.length - 1 || reorder.isPending} aria-label={`Move ${milestone.title} down`} onClick={() => move(index, 1)}>Move down</button>
          <button className="secondary compact" onClick={() => setEditing(milestone)}>Edit details</button>
          <button className="secondary compact" onClick={() => { setStatusTarget(milestone); setNextStatus(milestone.status === "completed" ? "in-progress" : "completed"); }}>Change status</button>
          <button className="danger compact" onClick={() => setArchiveTarget(milestone)}>Archive</button>
        </div>}
      </>}
    </li>)}</ol>}
    <section className="panel milestone-archive" aria-labelledby="milestone-archive-heading"><div className="panel-heading"><div><p className="eyebrow">Preserved record</p><h3 id="milestone-archive-heading">Archived milestones</h3></div></div>
      {archive.isPending && <p role="status">Loading archived milestones…</p>}<ErrorNote error={archive.error} />
      {archive.data?.pages.every((page) => !page.archive.milestones.length) && <p className="empty-copy">No milestones have been archived.</p>}
      <ol className="archived-list">{archive.data?.pages.flatMap((page) => page.archive.milestones).map((milestone) => <li key={milestone.id} className="archived-milestone"><h4>{milestone.title}</h4><MilestoneFacts milestone={milestone} />{milestone.archive && <div className="archive-context"><strong>Archived by {milestone.archive.actor.displayName}</strong><p><time dateTime={milestone.archive.archivedAt}>{new Date(milestone.archive.archivedAt).toLocaleString()}</time></p><p className="plain-text">Reason: {milestone.archive.reason}</p></div>}</li>)}</ol>
      {archive.hasNextPage && <button className="secondary" disabled={archive.isFetchingNextPage} onClick={() => void archive.fetchNextPage()}>{archive.isFetchingNextPage ? "Loading…" : "Load older milestones"}</button>}
    </section>
    {statusTarget && <ConfirmDialog title={`Change status for ${statusTarget.title}?`} description="This creates a permanent status event. Previous status history remains preserved." confirmLabel="Save status" danger={false} busy={transition.isPending} confirmDisabled={nextStatus === statusTarget.status} onCancel={() => { setStatusTarget(undefined); setNote(""); }} onConfirm={() => transition.mutate()}>
      <label>New status<select value={nextStatus} onChange={(event) => setNextStatus(event.target.value as MilestoneStatus)}>{(["upcoming", "in-progress", "completed"] as const).filter((value) => value !== statusTarget.status).map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label>
      <label>Transition note (optional)<textarea rows={3} maxLength={2_000} value={note} onChange={(event) => setNote(event.target.value)} /></label>
    </ConfirmDialog>}
    {archiveTarget && <ConfirmDialog title={`Archive ${archiveTarget.title}?`} description="This removes the milestone from the active sequence permanently. Its content and status history remain available in the archive." confirmLabel="Archive milestone" busy={archiveMutation.isPending} confirmDisabled={!archiveReason.trim()} onCancel={() => { setArchiveTarget(undefined); setArchiveReason(""); }} onConfirm={() => archiveMutation.mutate()}>
      <label>Archive reason<textarea required minLength={1} maxLength={2_000} rows={3} value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} /></label>
    </ConfirmDialog>}
  </section>;
}
