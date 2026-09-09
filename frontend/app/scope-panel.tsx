"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, type ApiFailure, json } from "./api-client";
import {
  commentResponseSchema, draftResponseSchema, scopeResponseSchema, scopeVersionResponseSchema,
  type ScopeData, type ScopeDraft, type ScopeVersion,
} from "./api-schemas";
import { ConfirmDialog } from "./confirm-dialog";

function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <p role="alert" className="notice error">{error instanceof Error ? error.message : "Something went wrong."}</p>;
}

function move<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const destination = index + direction;
  if (destination < 0 || destination >= items.length) return items;
  const next = [...items];
  [next[index], next[destination]] = [next[destination]!, next[index]!];
  return next;
}

function DraftEditor({ projectId, draft, canSubmit, reload }: Readonly<{
  projectId: string; draft: ScopeDraft; canSubmit: boolean; reload: () => Promise<unknown>;
}>) {
  const queryClient = useQueryClient();
  const [groups, setGroups] = useState(draft.groups);
  const [requirements, setRequirements] = useState(draft.requirements);
  const [revisionToken, setRevisionToken] = useState(draft.revisionToken);
  const [revisionSummary, setRevisionSummary] = useState("");
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [message, setMessage] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () => api(`/projects/${projectId}/scope/draft`, json("PUT", {
      revisionToken,
      groups: groups.map((group, order) => ({ ...(group.id ? { id: group.id } : {}), name: group.name, order })),
      requirements: requirements.map((requirement, order) => ({
        ...(requirement.logicalId ? { logicalId: requirement.logicalId } : {}),
        ...(requirement.groupId ? { groupId: requirement.groupId } : {}),
        title: requirement.title, description: requirement.description,
        acceptanceCriteria: requirement.acceptanceCriteria, order,
      })),
    }), draftResponseSchema),
    onSuccess: async ({ draft: saved }) => {
      setGroups(saved.groups); setRequirements(saved.requirements); setRevisionToken(saved.revisionToken);
      setMessage("Draft saved."); await queryClient.invalidateQueries({ queryKey: ["scope", projectId] });
    },
    onError: async (error) => {
      if ((error as ApiFailure).code === "STALE_STATE") setMessage("A teammate changed this draft. Your unsaved fields are still here; load the latest version before editing again.");
      await queryClient.invalidateQueries({ queryKey: ["scope", projectId] });
    },
  });
  const submit = useMutation({
    mutationFn: () => api(`/projects/${projectId}/scope/submissions`, json("POST", {
      revisionToken, ...(revisionSummary.trim() ? { revisionSummary } : {}), confirmed: true,
    }), scopeVersionResponseSchema),
    onSuccess: async (body) => {
      setConfirmSubmit(false); setMessage(body.warning ?? `Scope v${body.version.number} submitted for review.`);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["scope", projectId] }), queryClient.invalidateQueries({ queryKey: ["work"] })]);
    },
  });
  const loadLatest = async () => {
    const result = await reload() as { data?: { scope?: ScopeData } };
    const latest = result.data?.scope?.draft;
    if (latest) { setGroups(latest.groups); setRequirements(latest.requirements); setRevisionToken(latest.revisionToken); setMessage("Latest draft loaded."); }
  };
  const updateRequirement = (index: number, patch: Partial<ScopeDraft["requirements"][number]>) =>
    setRequirements((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const saveValidDraft = () => {
    const errors: Record<string, string> = {};
    groups.forEach((group, index) => {
      if (!group.name.trim()) errors[`group-${index}`] = "Enter a group name.";
    });
    requirements.forEach((requirement, index) => {
      if (!requirement.title.trim()) errors[`title-${index}`] = "Enter a requirement title.";
      if (!requirement.description.trim()) errors[`description-${index}`] = "Enter a requirement description.";
      requirement.acceptanceCriteria.forEach((criterion, criterionIndex) => {
        if (!criterion.trim()) errors[`criterion-${index}-${criterionIndex}`] = "Enter an acceptance criterion.";
      });
    });
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      requestAnimationFrame(() => document.getElementById("draft-errors")?.focus());
      return;
    }
    save.mutate();
  };

  return <section className="panel scope-editor" aria-labelledby="draft-heading">
    <div className="panel-heading"><div><p className="eyebrow">Private provider draft</p><h3 id="draft-heading">Shape the proposed scope</h3></div><span className="badge">Not visible to clients</span></div>
    <p className="fine">Owner and assigned team members can edit. Only the workspace owner can submit the complete version.</p>
    {Object.keys(fieldErrors).length > 0 && <p id="draft-errors" tabIndex={-1} role="alert" className="notice error">Review the highlighted draft fields before saving.</p>}
    {message && <p className={message.includes("teammate") ? "notice warning" : "notice success"} role="status">{message}</p>}
    <ErrorNote error={save.error || submit.error} />
    <div className="scope-section">
      <div className="panel-heading"><h4>Groups</h4><button type="button" className="secondary compact" disabled={groups.length >= 50} onClick={() => setGroups((items) => [...items, { id: "", name: "", order: items.length }])}>Add group</button></div>
      {!groups.length && <p className="empty-copy">Groups are optional. Requirements can remain ungrouped.</p>}
      {groups.map((group, index) => <div className="draft-row" key={group.id || `new-group-${index}`}>
        <label>Group {index + 1}<input maxLength={120} aria-invalid={Boolean(fieldErrors[`group-${index}`])} aria-describedby={fieldErrors[`group-${index}`] ? `group-${index}-error` : undefined} value={group.name} onChange={(event) => setGroups((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} />{fieldErrors[`group-${index}`] && <small id={`group-${index}-error`} role="alert">{fieldErrors[`group-${index}`]}</small>}</label>
        <div className="row-actions"><button type="button" className="secondary compact" disabled={index === 0} onClick={() => setGroups((items) => move(items, index, -1))}>Move up</button><button type="button" className="secondary compact" disabled={index === groups.length - 1} onClick={() => setGroups((items) => move(items, index, 1))}>Move down</button><button type="button" className="danger compact" onClick={() => { const id = group.id; setGroups((items) => items.filter((_, itemIndex) => itemIndex !== index)); if (id) setRequirements((items) => items.map((item) => item.groupId === id ? { ...item, groupId: undefined } : item)); }}>Remove and ungroup</button></div>
      </div>)}
    </div>
    <div className="scope-section">
      <div className="panel-heading"><h4>Requirements</h4><button type="button" className="secondary compact" disabled={requirements.length >= 200} onClick={() => setRequirements((items) => [...items, { logicalId: "", title: "", description: "", acceptanceCriteria: [""], order: items.length }])}>Add requirement</button></div>
      {!requirements.length && <p className="empty-copy">Add at least one complete requirement before submission.</p>}
      {requirements.map((requirement, index) => <fieldset className="requirement-editor" key={requirement.logicalId || `new-requirement-${index}`}>
        <legend>Requirement {index + 1}</legend>
        <label>Title<input maxLength={120} aria-invalid={Boolean(fieldErrors[`title-${index}`])} aria-describedby={fieldErrors[`title-${index}`] ? `title-${index}-error` : undefined} value={requirement.title} onChange={(event) => updateRequirement(index, { title: event.target.value })} />{fieldErrors[`title-${index}`] && <small id={`title-${index}-error`} role="alert">{fieldErrors[`title-${index}`]}</small>}</label>
        <label>Description<textarea rows={4} maxLength={5_000} aria-invalid={Boolean(fieldErrors[`description-${index}`])} aria-describedby={fieldErrors[`description-${index}`] ? `description-${index}-error` : undefined} value={requirement.description} onChange={(event) => updateRequirement(index, { description: event.target.value })} />{fieldErrors[`description-${index}`] && <small id={`description-${index}-error`} role="alert">{fieldErrors[`description-${index}`]}</small>}</label>
        <label>Group<select value={requirement.groupId ?? ""} onChange={(event) => updateRequirement(index, { groupId: event.target.value || undefined })}><option value="">Ungrouped</option>{groups.filter((group) => group.id).map((group) => <option value={group.id} key={group.id}>{group.name || "Unnamed group"}</option>)}</select></label>
        <div className="criteria"><span>Acceptance criteria</span>{requirement.acceptanceCriteria.map((criterion, criterionIndex) => <div className="criterion-row" key={criterionIndex}><label><span className="sr-only">Criterion {criterionIndex + 1}</span><textarea rows={2} maxLength={2_000} aria-invalid={Boolean(fieldErrors[`criterion-${index}-${criterionIndex}`])} aria-describedby={fieldErrors[`criterion-${index}-${criterionIndex}`] ? `criterion-${index}-${criterionIndex}-error` : undefined} value={criterion} onChange={(event) => updateRequirement(index, { acceptanceCriteria: requirement.acceptanceCriteria.map((item, itemIndex) => itemIndex === criterionIndex ? event.target.value : item) })} />{fieldErrors[`criterion-${index}-${criterionIndex}`] && <small id={`criterion-${index}-${criterionIndex}-error`} role="alert">{fieldErrors[`criterion-${index}-${criterionIndex}`]}</small>}</label><button type="button" className="danger compact" disabled={requirement.acceptanceCriteria.length === 1} onClick={() => updateRequirement(index, { acceptanceCriteria: requirement.acceptanceCriteria.filter((_, itemIndex) => itemIndex !== criterionIndex) })}>Remove criterion</button></div>)}<button type="button" className="secondary compact" disabled={requirement.acceptanceCriteria.length >= 50} onClick={() => updateRequirement(index, { acceptanceCriteria: [...requirement.acceptanceCriteria, ""] })}>Add criterion</button></div>
        <div className="row-actions"><button type="button" className="secondary compact" disabled={index === 0} onClick={() => setRequirements((items) => move(items, index, -1))}>Move up</button><button type="button" className="secondary compact" disabled={index === requirements.length - 1} onClick={() => setRequirements((items) => move(items, index, 1))}>Move down</button><button type="button" className="danger compact" onClick={() => setRequirements((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Delete requirement</button></div>
      </fieldset>)}
    </div>
    {draft.copiedFromVersionId && <label>Revision summary required for submission<textarea rows={3} maxLength={2_000} value={revisionSummary} onChange={(event) => setRevisionSummary(event.target.value)} /></label>}
    <div className="row-actions"><button type="button" className="secondary" onClick={() => void loadLatest()}>Load latest</button><button type="button" className="secondary" disabled={save.isPending} onClick={saveValidDraft}>{save.isPending ? "Saving…" : "Save draft"}</button>{canSubmit ? <button type="button" className="primary" disabled={submit.isPending || requirements.length === 0 || Boolean(draft.copiedFromVersionId && !revisionSummary.trim())} onClick={() => setConfirmSubmit(true)}>Submit for review</button> : <span className="fine">The workspace owner submits when ready.</span>}</div>
    {confirmSubmit && <ConfirmDialog title="Submit this scope for review?" description="This creates an immutable numbered version. The editable draft is removed while clients review it." confirmLabel="Submit scope" busy={submit.isPending} onCancel={() => setConfirmSubmit(false)} onConfirm={() => submit.mutate()} />}
  </section>;
}

function Comparison({ version }: { version: ScopeVersion }) {
  if (!version.comparison) return null;
  const categories = [
    ["Added", version.comparison.added], ["Removed", version.comparison.removed], ["Content changed", version.comparison.contentChanged],
  ] as const;
  return <div className="comparison"><h4>Changes from the previous version</h4>{categories.map(([label, items]) => <div key={label}><strong>{label} · {items.length}</strong>{items.length > 0 && <ul>{items.map((item) => <li key={`${label}-${item.logicalId}`}>{item.title}</li>)}</ul>}</div>)}</div>;
}

function VersionCard({ projectId, version, active, scope }: Readonly<{ projectId: string; version: ScopeVersion; active: boolean; scope: ScopeData }>) {
  const queryClient = useQueryClient();
  const [comment, setComment] = useState(""); const [target, setTarget] = useState("");
  const [note, setNote] = useState(""); const [confirmation, setConfirmation] = useState<"approved" | "changes-requested" | "withdrawn">();
  const [warning, setWarning] = useState<string>();
  const refresh = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["scope", projectId] }), queryClient.invalidateQueries({ queryKey: ["work"] })]); };
  const post = useMutation({ mutationFn: () => api(`/projects/${projectId}/scope/versions/${version.id}/comments`, json("POST", { body: comment, ...(target ? { requirementSnapshotId: target } : {}) }), commentResponseSchema), onSuccess: async () => { setComment(""); setTarget(""); await refresh(); }, onError: refresh });
  const transition = useMutation({
    mutationFn: (outcome: "approved" | "changes-requested" | "withdrawn") => outcome === "withdrawn"
      ? api(`/projects/${projectId}/scope/versions/${version.id}/withdrawal`, json("POST", { confirmed: true, reason: note }), scopeVersionResponseSchema)
      : api(`/projects/${projectId}/scope/versions/${version.id}/decisions`, json("POST", { confirmed: true, outcome, ...(note.trim() ? { note } : {}) }), scopeVersionResponseSchema),
    onSuccess: async (body) => { setConfirmation(undefined); setNote(""); setWarning(body.warning); await refresh(); }, onError: refresh,
  });
  const grouped = new Map(version.groups.map((group) => [group.id, group.name]));
  return <article className={`scope-version ${active ? "current" : ""}`}>
    <header className="version-heading"><div><p className="eyebrow">Scope v{version.number}</p><h3>{version.status.replaceAll("-", " ")}</h3></div><span className="badge">{active ? "Current" : "History"}</span></header>
    <p className="fine">Submitted by {version.submitter.displayName} · <time dateTime={version.submittedAt}>{new Date(version.submittedAt).toLocaleString()}</time></p>
    {version.revisionSummary && <div className="revision-summary"><strong>Provider revision summary</strong><p className="plain-text">{version.revisionSummary}</p></div>}
    <Comparison version={version} />
    <div className="requirements-list">{version.requirements.map((requirement) => <section className="review-requirement" key={requirement.snapshotId}><p className="eyebrow">{requirement.groupId ? grouped.get(requirement.groupId) : "Ungrouped"}</p><h4>{requirement.title}</h4><p className="plain-text">{requirement.description}</p><strong>Acceptance criteria</strong><ol>{requirement.acceptanceCriteria.map((criterion, index) => <li key={index} className="plain-text">{criterion}</li>)}</ol>{version.comments.filter((item) => item.requirementSnapshotId === requirement.snapshotId).map((item) => <Comment key={item.id} item={item} />)}</section>)}</div>
    {version.terminal && <div className="terminal-result"><strong>{version.status === "approved" ? "Approved" : version.status === "withdrawn" ? "Withdrawn" : "Changes requested"} by {version.terminal.actor.displayName}</strong><p className="fine"><time dateTime={version.terminal.at}>{new Date(version.terminal.at).toLocaleString()}</time></p>{version.terminal.note && <p className="plain-text">{version.terminal.note}</p>}</div>}
    <section className="discussion"><h4>Scope discussion</h4>{version.comments.filter((item) => !item.requirementSnapshotId).map((item) => <Comment key={item.id} item={item} />)}{!version.comments.length && <p className="empty-copy">No comments on this version.</p>}
      {active && scope.permissions.canComment && <form onSubmit={(event) => { event.preventDefault(); post.mutate(); }}><label>Comment<textarea required minLength={1} maxLength={2_000} rows={3} value={comment} onChange={(event) => setComment(event.target.value)} /></label><label>Attach to<select value={target} onChange={(event) => setTarget(event.target.value)}><option value="">Whole scope</option>{version.requirements.map((item) => <option key={item.snapshotId} value={item.snapshotId}>{item.title}</option>)}</select></label><button className="secondary" disabled={post.isPending || !comment.trim()}>Post comment</button></form>}
    </section>
    {warning && <p className="notice warning" role="status">{warning}</p>}<ErrorNote error={post.error || transition.error} />
    {active && (scope.permissions.canDecide || scope.permissions.canWithdraw) && <div className="decision-box"><h4>Complete review of scope v{version.number}</h4><label>{scope.permissions.canWithdraw ? "Reason or decision note" : "Decision note (optional for approval)"}<textarea rows={3} maxLength={2_000} value={note} onChange={(event) => setNote(event.target.value)} /></label><div className="row-actions">{scope.permissions.canWithdraw && <button className="danger" disabled={!note.trim()} onClick={() => setConfirmation("withdrawn")}>Withdraw review</button>}{scope.permissions.canDecide && <><button className="secondary" disabled={!note.trim()} onClick={() => setConfirmation("changes-requested")}>Request changes</button><button className="primary" onClick={() => setConfirmation("approved")}>Approve scope</button></>}</div></div>}
    {confirmation && <ConfirmDialog title={`${confirmation === "approved" ? "Approve" : confirmation === "withdrawn" ? "Withdraw" : "Request changes for"} scope v${version.number}?`} description={confirmation === "approved" ? "This establishes this immutable version as the agreed scope." : "This ends this review and creates one private provider revision draft. The reviewed version remains in history."} confirmLabel={confirmation === "approved" ? "Approve scope" : confirmation === "withdrawn" ? "Withdraw review" : "Request changes"} busy={transition.isPending} onCancel={() => setConfirmation(undefined)} onConfirm={() => transition.mutate(confirmation)} />}
  </article>;
}

function Comment({ item }: Readonly<{ item: ScopeVersion["comments"][number] }>) {
  return <blockquote className="scope-comment"><p className="plain-text">{item.body}</p><footer>{item.author.displayName} · {item.author.role.replaceAll("-", " ")} · <time dateTime={item.postedAt}>{new Date(item.postedAt).toLocaleString()}</time></footer></blockquote>;
}

export function ScopePanel({ projectId }: Readonly<{ projectId: string }>) {
  const queryClient = useQueryClient();
  const scope = useQuery({ queryKey: ["scope", projectId], queryFn: () => api(`/projects/${projectId}/scope`, {}, scopeResponseSchema) });
  const start = useMutation({ mutationFn: () => api(`/projects/${projectId}/scope/draft`, json("POST", {}), draftResponseSchema), onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["scope", projectId] }), queryClient.invalidateQueries({ queryKey: ["work"] })]); } });
  if (scope.isPending) return <section className="panel"><p role="status">Loading requirements…</p></section>;
  if (scope.error) return <section className="panel"><ErrorNote error={scope.error} /></section>;
  const data = scope.data.scope;
  return <section className="scope-workflow" aria-labelledby="scope-heading"><header className="scope-heading"><div><p className="eyebrow">Requirements and agreement</p><h2 id="scope-heading">Scope · {data.state.replaceAll("-", " ")}</h2></div>{data.pendingAction && <span className="pending-badge">{data.pendingAction.replaceAll("-", " ")}</span>}</header>
    {data.state === "not-started" && <section className="panel empty-state compact-empty"><h3>No proposed scope yet</h3><p>Start a private provider draft to structure requirements before client review.</p>{data.permissions.canStartDraft && <button className="primary" disabled={start.isPending} onClick={() => start.mutate()}>{start.isPending ? "Starting…" : "Start scope draft"}</button>}<ErrorNote error={start.error} /></section>}
    {data.draft && <DraftEditor projectId={projectId} draft={data.draft} canSubmit={data.permissions.canSubmit} reload={() => scope.refetch()} />}
    {data.versions.length > 0 && <section className="version-history" aria-labelledby="history-heading"><h2 id="history-heading">Submitted version history</h2>{data.versions.map((version) => <VersionCard key={version.id} projectId={projectId} version={version} active={version.id === data.currentVersionId} scope={data} />)}</section>}
  </section>;
}
