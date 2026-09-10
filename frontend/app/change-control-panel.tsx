"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, ApiFailure, json } from "./api-client";
import {
  changeActionResponseSchema, changeCommentResponseSchema, changeControlResponseSchema, changeDraftResponseSchema,
  type ChangeControl, type ChangeProposal, type ChangeRequestRecord, type ScopeDraft,
} from "./api-schemas";
import { ConfirmDialog } from "./confirm-dialog";

function ErrorNote({ error }: Readonly<{ error: unknown }>) {
  if (!error) return null;
  return <p role="alert" className="notice error">{error instanceof Error ? error.message : "Something went wrong."}</p>;
}
function move<T>(items: T[], index: number, direction: -1 | 1) {
  const next = [...items]; const other = index + direction; [next[index], next[other]] = [next[other]!, next[index]!]; return next;
}
async function refreshChange(queryClient: ReturnType<typeof useQueryClient>, projectId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["change-control", projectId] }),
    queryClient.invalidateQueries({ queryKey: ["scope", projectId] }),
    queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
    queryClient.invalidateQueries({ queryKey: ["work"] }),
  ]);
}

function DraftEditor({ projectId, request, reload }: Readonly<{ projectId: string; request: ChangeRequestRecord; reload: () => Promise<unknown> }>) {
  const draft = request.draft!; const queryClient = useQueryClient();
  const [title, setTitle] = useState(draft.title); const [rationale, setRationale] = useState(draft.rationale);
  const [impact, setImpact] = useState(draft.impactSummary ?? ""); const [summary, setSummary] = useState(draft.revisionSummary ?? "");
  const [groups, setGroups] = useState(draft.groups); const [requirements, setRequirements] = useState(draft.requirements);
  const [revisionToken, setRevisionToken] = useState(draft.revisionToken); const [message, setMessage] = useState<string>();
  const [confirmation, setConfirmation] = useState<"submit" | "discard" | "cancel">(); const [reason, setReason] = useState("");
  const body = () => ({
    revisionToken, title, rationale, ...(impact.trim() ? { impactSummary: impact } : {}), ...(summary.trim() ? { revisionSummary: summary } : {}),
    groups: groups.map((group, order) => ({ ...(group.id ? { id: group.id } : {}), name: group.name, order })),
    requirements: requirements.map((item, order) => ({
      ...(item.logicalId ? { logicalId: item.logicalId } : {}), ...(item.groupId ? { groupId: item.groupId } : {}),
      title: item.title, description: item.description, acceptanceCriteria: item.acceptanceCriteria, order,
    })),
  });
  const save = useMutation({
    mutationFn: () => api(`/projects/${projectId}/change-requests/${request.id}/draft`, json("PUT", body()), changeDraftResponseSchema),
    onSuccess: async ({ draft: saved }) => {
      setTitle(saved.title); setRationale(saved.rationale); setImpact(saved.impactSummary ?? ""); setSummary(saved.revisionSummary ?? "");
      setGroups(saved.groups); setRequirements(saved.requirements); setRevisionToken(saved.revisionToken); setMessage("Change proposal draft saved.");
      await refreshChange(queryClient, projectId);
    },
    onError: async (error) => {
      if ((error as ApiFailure).code === "STALE_STATE") setMessage("A teammate changed this proposal. Your unsaved input is preserved; load the latest draft before trying again.");
      await refreshChange(queryClient, projectId);
    },
  });
  const action = useMutation({
    mutationFn: async (kind: "submit" | "discard" | "cancel") => {
      if (kind === "submit") return api(`/projects/${projectId}/change-requests/${request.id}/submissions`, json("POST", { revisionToken, confirmed: true }), changeActionResponseSchema);
      if (kind === "discard") return api(`/projects/${projectId}/change-requests/${request.id}/discard`, json("POST", { confirmed: true }), changeActionResponseSchema);
      return api(`/projects/${projectId}/change-requests/${request.id}/cancellation`, json("POST", { confirmed: true, reason }), changeActionResponseSchema);
    },
    onSuccess: async (result) => { setConfirmation(undefined); setReason(""); setMessage(result.warning ?? result.message ?? "Change request updated."); await refreshChange(queryClient, projectId); },
    onError: async () => { await refreshChange(queryClient, projectId); },
  });
  const loadLatest = async () => {
    const result = await reload() as { data?: { changeControl?: ChangeControl } };
    const latest = result.data?.changeControl?.requests.find((item) => item.id === request.id)?.draft;
    if (latest) {
      setTitle(latest.title); setRationale(latest.rationale); setImpact(latest.impactSummary ?? ""); setSummary(latest.revisionSummary ?? "");
      setGroups(latest.groups); setRequirements(latest.requirements); setRevisionToken(latest.revisionToken); setMessage("Latest proposal draft loaded.");
    }
  };
  const updateRequirement = (index: number, patch: Partial<ScopeDraft["requirements"][number]>) => setRequirements((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const complete = title.trim() && rationale.trim() && requirements.length > 0 && requirements.every((item) => item.title.trim() && item.description.trim() && item.acceptanceCriteria.length && item.acceptanceCriteria.every((criterion) => criterion.trim()));
  return <section className="panel scope-editor" aria-labelledby={`change-draft-${request.id}`}>
    <div className="panel-heading"><div><p className="eyebrow">Private provider proposal</p><h3 id={`change-draft-${request.id}`}>{request.state === "revision-draft" ? "Revise the proposed change" : "Draft a scope change"}</h3></div><span className="badge">Based on scope v{request.baseScopeVersion.number}</span></div>
    <p className="fine">This is a copy of the approved scope. Editing it does not alter the current agreement. Only the workspace owner can submit it.</p>
    {message && <p role="status" className={message.includes("teammate") ? "notice warning" : "notice success"}>{message}</p>}
    <ErrorNote error={save.error || action.error} />
    <label>Change request title<input required maxLength={120} readOnly={draft.titleFrozen} value={title} onChange={(event) => setTitle(event.target.value)} />{draft.titleFrozen && <small>The title was frozen on first submission.</small>}</label>
    <label>Rationale<textarea required rows={4} maxLength={5_000} value={rationale} onChange={(event) => setRationale(event.target.value)} /></label>
    <label>Impact summary (optional)<textarea rows={3} maxLength={2_000} value={impact} onChange={(event) => setImpact(event.target.value)} /></label>
    {draft.copiedFromProposalId && <label>Revision summary<textarea required rows={3} maxLength={2_000} value={summary} onChange={(event) => setSummary(event.target.value)} /><small>Explain what changed since the last submitted proposal.</small></label>}
    <div className="scope-section"><div className="panel-heading"><h4>Target groups</h4><button type="button" className="secondary compact" disabled={groups.length >= 50} onClick={() => setGroups((items) => [...items, { id: "", name: "", order: items.length }])}>Add group</button></div>
      {groups.map((group, index) => <div className="draft-row" key={group.id || `new-change-group-${index}`}><label>Group {index + 1}<input required maxLength={120} value={group.name} onChange={(event) => setGroups((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /></label><div className="row-actions"><button type="button" className="secondary compact" disabled={index === 0} onClick={() => setGroups((items) => move(items, index, -1))}>Move up</button><button type="button" className="secondary compact" disabled={index === groups.length - 1} onClick={() => setGroups((items) => move(items, index, 1))}>Move down</button><button type="button" className="danger compact" onClick={() => { const removed = group.id; setGroups((items) => items.filter((_, itemIndex) => itemIndex !== index)); setRequirements((items) => items.map((item) => item.groupId === removed ? { ...item, groupId: undefined } : item)); }}>Remove and ungroup</button></div></div>)}
    </div>
    <div className="scope-section"><div className="panel-heading"><h4>Target requirements</h4><button type="button" className="secondary compact" disabled={requirements.length >= 200} onClick={() => setRequirements((items) => [...items, { logicalId: "", title: "", description: "", acceptanceCriteria: [""], order: items.length }])}>Add requirement</button></div>
      {requirements.map((item, index) => <fieldset className="requirement-editor" key={item.logicalId || `new-change-requirement-${index}`}><legend>Requirement {index + 1}</legend>
        <label>Title<input required maxLength={120} value={item.title} onChange={(event) => updateRequirement(index, { title: event.target.value })} /></label>
        <label>Description<textarea required rows={4} maxLength={5_000} value={item.description} onChange={(event) => updateRequirement(index, { description: event.target.value })} /></label>
        <label>Group<select value={item.groupId ?? ""} onChange={(event) => updateRequirement(index, { groupId: event.target.value || undefined })}><option value="">Ungrouped</option>{groups.filter((group) => group.id).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        <div className="criteria"><span>Acceptance criteria</span>{item.acceptanceCriteria.map((criterion, criterionIndex) => <div className="criterion-row" key={criterionIndex}><label><span className="sr-only">Criterion {criterionIndex + 1}</span><textarea required rows={2} maxLength={2_000} value={criterion} onChange={(event) => updateRequirement(index, { acceptanceCriteria: item.acceptanceCriteria.map((value, valueIndex) => valueIndex === criterionIndex ? event.target.value : value) })} /></label><button type="button" className="danger compact" disabled={item.acceptanceCriteria.length === 1} onClick={() => updateRequirement(index, { acceptanceCriteria: item.acceptanceCriteria.filter((_, valueIndex) => valueIndex !== criterionIndex) })}>Remove criterion</button></div>)}<button type="button" className="secondary compact" disabled={item.acceptanceCriteria.length >= 50} onClick={() => updateRequirement(index, { acceptanceCriteria: [...item.acceptanceCriteria, ""] })}>Add criterion</button></div>
        <div className="row-actions"><button type="button" className="secondary compact" disabled={index === 0} onClick={() => setRequirements((items) => move(items, index, -1))}>Move up</button><button type="button" className="secondary compact" disabled={index === requirements.length - 1} onClick={() => setRequirements((items) => move(items, index, 1))}>Move down</button><button type="button" className="danger compact" onClick={() => setRequirements((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Remove requirement</button></div>
      </fieldset>)}
    </div>
    <div className="row-actions"><button type="button" className="secondary" onClick={() => void loadLatest()}>Load latest</button><button type="button" className="secondary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save proposal"}</button>{request.permissions.canSubmit && <button type="button" className="primary" disabled={!complete || Boolean(draft.copiedFromProposalId && !summary.trim())} onClick={() => setConfirmation("submit")}>Submit for client review</button>}{request.permissions.canDiscard && <button type="button" className="danger" onClick={() => setConfirmation("discard")}>Discard private draft</button>}{request.permissions.canCancel && <button type="button" className="danger" onClick={() => setConfirmation("cancel")}>Cancel change request</button>}</div>
    {confirmation && <ConfirmDialog title={confirmation === "submit" ? `Submit ${request.title} for review?` : confirmation === "discard" ? `Discard ${request.title}?` : `Cancel change request ${request.number}?`} description={confirmation === "submit" ? "This freezes an immutable proposal version for client review. The approved scope remains current until approval." : confirmation === "discard" ? "This permanently removes this never-submitted private draft without creating project history." : "Submitted proposal history remains visible, but this request cannot be reopened."} confirmLabel={confirmation === "submit" ? "Submit proposal" : confirmation === "discard" ? "Discard draft" : "Cancel request"} busy={action.isPending} confirmDisabled={confirmation === "cancel" && !reason.trim()} onCancel={() => { setConfirmation(undefined); setReason(""); }} onConfirm={() => action.mutate(confirmation)}>{confirmation === "cancel" && <label>Cancellation reason<textarea required minLength={1} maxLength={2_000} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label>}</ConfirmDialog>}
  </section>;
}

function Comparison({ title, items, proposal, projectId, requestId, active }: Readonly<{ title: string; items: ChangeProposal["comparisons"]["baseScope"]; proposal: ChangeProposal; projectId: string; requestId: string; active: boolean }>) {
  const queryClient = useQueryClient(); const [body, setBody] = useState(""); const [target, setTarget] = useState("");
  const post = useMutation({
    mutationFn: () => {
      const item = items.find((candidate) => candidate.id === target);
      return api(`/projects/${projectId}/change-requests/${requestId}/proposals/${proposal.id}/comments`, json("POST", { body, ...(item ? { comparisonKind: item.comparisonKind, changeItemId: item.id } : {}) }), changeCommentResponseSchema);
    },
    onSuccess: async () => { setBody(""); setTarget(""); await refreshChange(queryClient, projectId); },
    onError: async () => { await refreshChange(queryClient, projectId); },
  });
  const label = (item: typeof items[number]) => {
    const snapshot = (item.after ?? item.before) as { title?: unknown; name?: unknown } | undefined;
    return String(snapshot?.title ?? snapshot?.name ?? item.entityKind);
  };
  return <section className="comparison" aria-label={title}><h4>{title}</h4>{!items.length && <p className="empty-copy">No material scope changes in this comparison.</p>}<ol>{items.map((item) => <li key={item.id}><strong>{label(item)}</strong> — {item.changeKinds.join(" and ").replaceAll("-", " ")}{proposal.comments.filter((comment) => comment.changeItemId === item.id).map((comment) => <Comment key={comment.id} comment={comment} />)}</li>)}</ol>{active && <form onSubmit={(event) => { event.preventDefault(); post.mutate(); }}><label>Comment on {title.toLowerCase()}<textarea required maxLength={2_000} rows={3} value={body} onChange={(event) => setBody(event.target.value)} /></label><label>Attach to<select value={target} onChange={(event) => setTarget(event.target.value)}><option value="">Whole proposal</option>{items.map((item) => <option key={item.id} value={item.id}>{label(item)} · {item.changeKinds.join(", ")}</option>)}</select></label><button className="secondary" disabled={!body.trim() || post.isPending}>Post comment</button><ErrorNote error={post.error} /></form>}</section>;
}

function Comment({ comment }: Readonly<{ comment: ChangeProposal["comments"][number] }>) {
  return <blockquote className="scope-comment"><p className="plain-text">{comment.body}</p><footer>{comment.author.displayName} · {comment.author.role.replaceAll("-", " ")} · <time dateTime={comment.postedAt}>{new Date(comment.postedAt).toLocaleString()}</time></footer></blockquote>;
}

function ProposalReview({ projectId, request, proposal }: Readonly<{ projectId: string; request: ChangeRequestRecord; proposal: ChangeProposal }>) {
  const queryClient = useQueryClient(); const active = proposal.outcome === "in-review"; const [note, setNote] = useState("");
  const [confirmation, setConfirmation] = useState<"approved" | "changes-requested" | "rejected" | "withdrawn">(); const [warning, setWarning] = useState<string>();
  const transition = useMutation({
    mutationFn: (kind: NonNullable<typeof confirmation>) => kind === "withdrawn"
      ? api(`/projects/${projectId}/change-requests/${request.id}/proposals/${proposal.id}/withdrawal`, json("POST", { confirmed: true, reason: note }), changeActionResponseSchema)
      : api(`/projects/${projectId}/change-requests/${request.id}/proposals/${proposal.id}/decisions`, json("POST", { outcome: kind, confirmed: true, ...(note.trim() ? { note } : {}) }), changeActionResponseSchema),
    onSuccess: async (result) => { setConfirmation(undefined); setNote(""); setWarning(result.warning); await refreshChange(queryClient, projectId); },
    onError: async () => { await refreshChange(queryClient, projectId); },
  });
  const groups = new Map(proposal.groups.map((group) => [group.id, group.name]));
  const actionLabel = confirmation === "approved" ? "Approve" : confirmation === "changes-requested" ? "Request changes for" : confirmation === "rejected" ? "Reject" : "Withdraw";
  const confirmLabel = confirmation === "approved" ? "Approve proposal" : confirmation === "changes-requested" ? "Request changes" : confirmation === "rejected" ? "Reject proposal" : "Withdraw proposal";
  return <article className={`scope-version ${active ? "current" : ""}`}><header className="version-heading"><div><p className="eyebrow">Proposal v{proposal.number}</p><h3>{proposal.title}</h3></div><span className="badge">{proposal.outcome.replaceAll("-", " ")}</span></header>
    <p className="fine">Against approved scope v{proposal.baseScopeVersion.number} · submitted by {proposal.submitter.displayName} · <time dateTime={proposal.submittedAt}>{new Date(proposal.submittedAt).toLocaleString()}</time></p>
    <section><h4>Why this change</h4><p className="plain-text">{proposal.rationale}</p>{proposal.impactSummary && <><h4>Expected impact</h4><p className="plain-text">{proposal.impactSummary}</p></>}{proposal.revisionSummary && <><h4>Revision summary</h4><p className="plain-text">{proposal.revisionSummary}</p></>}</section>
    <Comparison title={`Total effect against scope v${proposal.baseScopeVersion.number}`} items={proposal.comparisons.baseScope} proposal={proposal} projectId={projectId} requestId={request.id} active={active && request.permissions.canComment} />
    {proposal.number > 1 && <><Comparison title={`Changes since proposal v${proposal.number - 1}`} items={proposal.comparisons.previousProposal} proposal={proposal} projectId={projectId} requestId={request.id} active={active && request.permissions.canComment} />{proposal.comparisons.previousMetadata && (proposal.comparisons.previousMetadata.rationaleChanged || proposal.comparisons.previousMetadata.impactChanged) && <p className="notice">Proposal narrative changed since the previous review: {[proposal.comparisons.previousMetadata.rationaleChanged && "rationale", proposal.comparisons.previousMetadata.impactChanged && "impact"].filter(Boolean).join(" and ")}.</p>}</>}
    <section><h4>Complete resulting scope</h4><div className="requirements-list">{proposal.requirements.map((item) => <section className="review-requirement" key={item.snapshotId ?? item.logicalId}><p className="eyebrow">{item.groupId ? groups.get(item.groupId) : "Ungrouped"}</p><h4>{item.title}</h4><p className="plain-text">{item.description}</p><strong>Acceptance criteria</strong><ol>{item.acceptanceCriteria.map((criterion, index) => <li className="plain-text" key={index}>{criterion}</li>)}</ol></section>)}</div></section>
    <section className="discussion"><h4>Proposal discussion</h4>{proposal.comments.filter((comment) => !comment.changeItemId).map((comment) => <Comment key={comment.id} comment={comment} />)}{!proposal.comments.length && <p className="empty-copy">No comments on this proposal.</p>}</section>
    {proposal.terminal && <div className="terminal-result"><strong>{proposal.outcome.replaceAll("-", " ")} by {proposal.terminal.actor.displayName}</strong><p className="fine"><time dateTime={proposal.terminal.at}>{new Date(proposal.terminal.at).toLocaleString()}</time></p>{proposal.terminal.note && <p className="plain-text">{proposal.terminal.note}</p>}</div>}
    {warning && <p role="status" className="notice warning">{warning}</p>}<ErrorNote error={transition.error} />
    {active && (request.permissions.canDecide || request.permissions.canWithdraw) && <section className="decision-box"><h4>{request.permissions.canDecide ? "Make the binding client decision" : "Manage this client review"}</h4><label>{request.permissions.canDecide ? "Decision note (optional only for approval)" : "Withdrawal reason"}<textarea rows={3} maxLength={2_000} value={note} onChange={(event) => setNote(event.target.value)} /></label><div className="row-actions">{request.permissions.canWithdraw && <button type="button" className="danger" disabled={!note.trim()} onClick={() => setConfirmation("withdrawn")}>Withdraw proposal</button>}{request.permissions.canDecide && <><button type="button" className="secondary" disabled={!note.trim()} onClick={() => setConfirmation("changes-requested")}>Request changes</button><button type="button" className="danger" disabled={!note.trim()} onClick={() => setConfirmation("rejected")}>Reject proposal</button><button type="button" className="primary" onClick={() => setConfirmation("approved")}>Approve proposal</button></>}</div></section>}
    {confirmation && <ConfirmDialog title={`${actionLabel} change request ${request.number}, proposal v${proposal.number}?`} description={confirmation === "approved" ? `This creates the next approved scope from this exact proposal and supersedes scope v${request.baseScopeVersion.number}.` : confirmation === "rejected" ? "This permanently closes the request without changing approved scope." : "This closes this exact review while preserving it in history."} confirmLabel={confirmLabel} busy={transition.isPending} onCancel={() => setConfirmation(undefined)} onConfirm={() => transition.mutate(confirmation)} />}
  </article>;
}

export function ChangeControlPanel({ projectId }: Readonly<{ projectId: string }>) {
  const queryClient = useQueryClient(); const [title, setTitle] = useState("");
  const change = useQuery({ queryKey: ["change-control", projectId], queryFn: () => api(`/projects/${projectId}/change-requests`, {}, changeControlResponseSchema) });
  const start = useMutation({ mutationFn: () => api(`/projects/${projectId}/change-requests`, json("POST", { title }), changeDraftResponseSchema), onSuccess: async () => { setTitle(""); await refreshChange(queryClient, projectId); } });
  if (change.isPending) return <section className="panel"><p role="status">Loading change requests…</p></section>;
  if (change.error) return <section className="panel"><ErrorNote error={change.error} /></section>;
  const data = change.data.changeControl;
  return <section className="scope-workflow" aria-labelledby="change-control-heading"><header className="scope-heading"><div><p className="eyebrow">Formal change control</p><h2 id="change-control-heading">Approved scope changes</h2></div>{data.pendingAction && <span className="pending-badge">{data.pendingAction.replaceAll("-", " ")}</span>}</header>
    {data.permissions.canStart && <section className="panel compact-empty"><h3>Propose a material scope change</h3><p>The new request begins as a private copy of the exact current approved scope.</p><form onSubmit={(event) => { event.preventDefault(); start.mutate(); }}><label>Change request title<input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} /></label><button className="primary" disabled={start.isPending || !title.trim()}>{start.isPending ? "Starting…" : "Start change request"}</button></form><ErrorNote error={start.error} /></section>}
    {!data.requests.length && !data.permissions.canStart && <section className="panel compact-empty"><h3>No change requests</h3><p>A formal change can be proposed after the first scope is approved.</p></section>}
    {data.requests.map((request) => <section className="version-history" key={request.id} aria-labelledby={`request-${request.id}`}><header className="panel-heading"><div><p className="eyebrow">{request.number ? `Change request ${request.number}` : "Unnumbered private request"}</p><h3 id={`request-${request.id}`}>{request.title}</h3></div><span className="badge">{request.state.replaceAll("-", " ")}</span></header><p className="fine">Fixed base: approved scope v{request.baseScopeVersion.number}. Created by {request.creator.displayName}.</p>{request.terminal && <p className="notice">Closed {request.state} by {request.terminal.actor.displayName} on <time dateTime={request.terminal.at}>{new Date(request.terminal.at).toLocaleString()}</time>.</p>}{request.draft && <DraftEditor projectId={projectId} request={request} reload={() => change.refetch()} />}{request.proposals.map((proposal) => <ProposalReview key={proposal.id} projectId={projectId} request={request} proposal={proposal} />)}</section>)}
  </section>;
}
