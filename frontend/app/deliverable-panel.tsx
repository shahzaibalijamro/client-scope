"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, type ApiFailure, json } from "./api-client";
import {
  attachmentAccessResponseSchema, deliverableCollectionResponseSchema, deliverableCommentResponseSchema,
  deliverableCommentsResponseSchema, deliverableHistoryResponseSchema, deliverableMutationResponseSchema,
  deliverableVersionActionResponseSchema, deliverableVersionsResponseSchema, messageResponseSchema,
  uploadAuthorizationResponseSchema, type Deliverable, type DeliverableAttachment, type DeliverableDraft, type DeliverableVersion,
} from "./api-schemas";
import { ConfirmDialog } from "./confirm-dialog";

function ErrorNote({ error }: Readonly<{ error: unknown }>) {
  if (!error) return null;
  return <p role="alert" className="notice error">{error instanceof Error ? error.message : "Something went wrong."}</p>;
}

function newObjectId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function readableBytes(value: number): string {
  return value >= 1_048_576 ? `${(value / 1_048_576).toFixed(1)} MiB` : `${Math.ceil(value / 1_024)} KiB`;
}

async function refresh(queryClient: ReturnType<typeof useQueryClient>, projectId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["deliverables", projectId] }),
    queryClient.invalidateQueries({ queryKey: ["deliverable-history", projectId] }),
    queryClient.invalidateQueries({ queryKey: ["work"] }), queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
  ]);
}

function AttachmentAction({ projectId, deliverableId, versionId, attachment }: Readonly<{ projectId: string; deliverableId: string; versionId: string; attachment: DeliverableAttachment }>) {
  const [previewUrl, setPreviewUrl] = useState<string>();
  const access = useMutation({
    mutationFn: () => api(`/projects/${projectId}/deliverables/${deliverableId}/versions/${versionId}/attachments/${attachment.id}/access`, json("POST", {}), attachmentAccessResponseSchema),
    onSuccess: (result) => {
      if (result.preview) setPreviewUrl(result.url);
      else window.open(result.url, "_blank", "noopener,noreferrer");
    },
  });
  return <li className="deliverable-attachment">
    <span><strong>{attachment.filename}</strong><small>{attachment.mediaType} · {readableBytes(attachment.byteSize)}</small></span>
    <button className="secondary compact" disabled={access.isPending} onClick={() => access.mutate()}>{access.isPending ? "Authorizing…" : attachment.preview ? "Preview image" : attachment.mediaType === "application/zip" ? "Download ZIP" : "Open file"}</button>
    <ErrorNote error={access.error} />
    {/* Short-lived authorized asset URLs cannot be routed through the public Next image optimizer. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {previewUrl && <img className="authorized-preview" src={previewUrl} alt={`Authorized preview of ${attachment.filename}`} onError={() => setPreviewUrl(undefined)} />}
  </li>;
}

function VersionFacts({ projectId, deliverableId, version }: Readonly<{ projectId: string; deliverableId: string; version: DeliverableVersion }>) {
  return <article className="deliverable-version">
    <div className="version-heading"><div><p className="eyebrow">Version {version.number}</p><h4>{version.title}</h4></div><span className={`badge deliverable-status ${version.outcome}`}>{version.outcome.replaceAll("-", " ")}</span></div>
    <p className="fine">Submitted by {version.submitter.displayName} · <time dateTime={version.submittedAt}>{new Date(version.submittedAt).toLocaleString()}</time> · agreed scope v{version.scopeVersion.number}</p>
    {version.revisionSummary && <div><strong>Revision summary</strong><p className="plain-text">{version.revisionSummary}</p></div>}
    {version.notes && <div><strong>Notes</strong><p className="plain-text">{version.notes}</p></div>}
    {!!version.links.length && <div><strong>External links</strong><ul className="deliverable-links">{version.links.map((link) => <li key={link.id}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.label} <span aria-hidden="true">↗</span></a></li>)}</ul></div>}
    {!!version.attachments.length && <div><strong>Private attachments</strong><ul className="deliverable-attachments">{version.attachments.map((attachment) => <AttachmentAction key={attachment.id} projectId={projectId} deliverableId={deliverableId} versionId={version.id} attachment={attachment} />)}</ul></div>}
    {version.terminal && <div className="decision-context"><strong>{version.outcome === "approved" ? "Approved" : version.outcome === "withdrawn" ? "Withdrawn" : "Revision requested"} by {version.terminal.actor.displayName}</strong><p><time dateTime={version.terminal.at}>{new Date(version.terminal.at).toLocaleString()}</time></p>{version.terminal.note && <p className="plain-text">{version.terminal.note}</p>}</div>}
  </article>;
}

function Comments({ projectId, deliverable, version }: Readonly<{ projectId: string; deliverable: Deliverable; version: DeliverableVersion }>) {
  const queryClient = useQueryClient(); const [body, setBody] = useState("");
  const comments = useInfiniteQuery({
    queryKey: ["deliverable-comments", projectId, version.id], initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api(`/projects/${projectId}/deliverables/${deliverable.id}/versions/${version.id}/comments?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, {}, deliverableCommentsResponseSchema),
    getNextPageParam: (last) => last.history.nextCursor,
  });
  const post = useMutation({
    mutationFn: () => api(`/projects/${projectId}/deliverables/${deliverable.id}/versions/${version.id}/comments`, json("POST", { body }), deliverableCommentResponseSchema),
    onSuccess: async () => { setBody(""); await queryClient.invalidateQueries({ queryKey: ["deliverable-comments", projectId, version.id] }); },
    onError: async () => { await refresh(queryClient, projectId); },
  });
  return <section className="deliverable-comments" aria-label={`Discussion for version ${version.number}`}>
    <h4>Version discussion</h4>
    {comments.isPending && <p role="status">Loading comments…</p>}<ErrorNote error={comments.error || post.error} />
    <ol>{comments.data?.pages.flatMap((page) => page.history.comments).map((comment) => <li key={comment.id}><strong>{comment.author.displayName}</strong><span>{comment.author.role.replaceAll("-", " ")} · <time dateTime={comment.postedAt}>{new Date(comment.postedAt).toLocaleString()}</time></span><p className="plain-text">{comment.body}</p></li>)}</ol>
    {comments.hasNextPage && <button className="secondary compact" disabled={comments.isFetchingNextPage} onClick={() => void comments.fetchNextPage()}>{comments.isFetchingNextPage ? "Loading…" : "Load more comments"}</button>}
    {deliverable.permissions.canComment && <form onSubmit={(event) => { event.preventDefault(); post.mutate(); }}><label>Comment<textarea required minLength={1} maxLength={2_000} rows={3} value={body} onChange={(event) => setBody(event.target.value)} /></label><button className="secondary" disabled={!body.trim() || post.isPending}>{post.isPending ? "Posting…" : "Post comment"}</button></form>}
  </section>;
}

function VersionHistory({ projectId, deliverable }: Readonly<{ projectId: string; deliverable: Deliverable }>) {
  const [open, setOpen] = useState(false);
  const versions = useInfiniteQuery({
    queryKey: ["deliverable-versions", projectId, deliverable.id], initialPageParam: undefined as string | undefined, enabled: open && Boolean(deliverable.number),
    queryFn: ({ pageParam }) => api(`/projects/${projectId}/deliverables/${deliverable.id}/versions?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, {}, deliverableVersionsResponseSchema),
    getNextPageParam: (last) => last.history.nextCursor,
  });
  if (!deliverable.number) return null;
  return <section className="version-history"><button className="secondary compact" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? "Hide version history" : "Show version history"}</button>
    {open && <div><ErrorNote error={versions.error} />{versions.isPending && <p role="status">Loading versions…</p>}<div className="version-stack">{versions.data?.pages.flatMap((page) => page.history.versions).map((version) => <div key={version.id}><VersionFacts projectId={projectId} deliverableId={deliverable.id} version={version} /><Comments projectId={projectId} deliverable={{ ...deliverable, permissions: { ...deliverable.permissions, canComment: false } }} version={version} /></div>)}</div>{versions.hasNextPage && <button className="secondary" onClick={() => void versions.fetchNextPage()}>Load older versions</button>}</div>}
  </section>;
}

type DraftLink = DeliverableDraft["links"][number];

function DraftEditor({ projectId, deliverable, onMessage }: Readonly<{ projectId: string; deliverable: Deliverable; onMessage: (message: string) => void }>) {
  const queryClient = useQueryClient(); const draft = deliverable.draft!;
  const [title, setTitle] = useState(draft.editableTitle ?? deliverable.title); const [notes, setNotes] = useState(draft.notes ?? ""); const [summary, setSummary] = useState(draft.revisionSummary ?? ""); const [links, setLinks] = useState<DraftLink[]>(draft.links);
  const [uploadState, setUploadState] = useState<string>(); const [message, setMessage] = useState<string>(); const [discardOpen, setDiscardOpen] = useState(false);
  const save = useMutation({
    mutationFn: () => api(`/projects/${projectId}/deliverables/${deliverable.id}/draft`, json("PUT", { revisionToken: draft.revisionToken, ...(draft.editableTitle !== undefined ? { title } : {}), notes, revisionSummary: summary, links: links.map((link, order) => ({ ...link, order })), attachmentIds: draft.attachments.map((attachment) => attachment.id) }), deliverableMutationResponseSchema),
    onSuccess: async (result) => {
      const savedDraft = result.deliverable.draft!;
      setTitle(savedDraft.editableTitle ?? result.deliverable.title); setNotes(savedDraft.notes ?? ""); setSummary(savedDraft.revisionSummary ?? ""); setLinks(savedDraft.links);
      await refresh(queryClient, projectId); setMessage(result.unchanged ? "No draft details changed." : "Draft saved.");
    }, onError: async () => refresh(queryClient, projectId),
  });
  const submit = useMutation({
    mutationFn: () => api(`/projects/${projectId}/deliverables/${deliverable.id}/submissions`, json("POST", { revisionToken: draft.revisionToken, confirmed: true }), deliverableVersionActionResponseSchema),
    onSuccess: async (result) => { await refresh(queryClient, projectId); onMessage(result.warning ?? "Version submitted for client review."); }, onError: async () => refresh(queryClient, projectId),
  });
  const discard = useMutation({ mutationFn: () => api(`/projects/${projectId}/deliverables/${deliverable.id}/discard`, json("POST", { revisionToken: draft.revisionToken, confirmed: true }), messageResponseSchema), onSuccess: async () => { setDiscardOpen(false); await refresh(queryClient, projectId); }, onError: async () => refresh(queryClient, projectId) });
  const detach = useMutation({ mutationFn: (attachmentId: string) => api(`/projects/${projectId}/deliverables/${deliverable.id}/attachments/${attachmentId}/detach`, json("POST", { revisionToken: draft.revisionToken }), deliverableMutationResponseSchema), onSuccess: async () => { setUploadState("Attachment detached; cleanup is safe and may continue in the background."); await refresh(queryClient, projectId); }, onError: async () => refresh(queryClient, projectId) });
  const upload = async (file: File) => {
    setUploadState("Requesting a private upload…");
    try {
      const byExtension: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", zip: "application/zip" }; const extension = file.name.split(".").pop()?.toLowerCase() ?? ""; const mediaType = file.type || byExtension[extension] || "";
      const allowed = ["application/pdf", "image/png", "image/jpeg", "image/webp", "application/zip"];
      if (!allowed.includes(mediaType) || file.size > 26_214_400) throw new Error("Choose a PDF, PNG, JPEG, WebP, or ZIP file no larger than 25 MiB.");
      const authorization = await api(`/projects/${projectId}/deliverables/${deliverable.id}/uploads/authorization`, json("POST", { revisionToken: draft.revisionToken, filename: file.name, mediaType, byteSize: file.size }), uploadAuthorizationResponseSchema);
      setUploadState("Uploading directly to private storage…"); const form = new FormData(); Object.entries(authorization.fields).forEach(([key, value]) => form.append(key, value)); form.append("file", file);
      const uploadResponse = await fetch(authorization.uploadUrl, { method: "POST", body: form }); if (!uploadResponse.ok) throw new Error("The private upload failed. Try again.");
      const providerResult = await uploadResponse.json() as Record<string, unknown>; setUploadState("Upload received; verifying trusted metadata…");
      await api(`/projects/${projectId}/deliverables/${deliverable.id}/uploads/finalization`, json("POST", { revisionToken: draft.revisionToken, reservationId: authorization.reservationId, providerResult }), deliverableMutationResponseSchema);
      setUploadState("Attachment finalized and ready for submission."); await refresh(queryClient, projectId);
    } catch (error) { setUploadState(error instanceof Error ? error.message : "The upload could not be completed."); }
  };
  const detailsDirty = JSON.stringify({ title, notes, summary, links: links.map((link, order) => ({ ...link, order })) }) !== JSON.stringify({ title: draft.editableTitle ?? deliverable.title, notes: draft.notes ?? "", summary: draft.revisionSummary ?? "", links: draft.links });
  const ready = draft.links.length > 0 || draft.attachments.length > 0; const revision = Boolean(draft.copiedFromVersionId);
  return <div className="deliverable-draft">
    <p className="notice warning">Provider-private draft. Clients cannot see these details until a version is submitted.</p>
    {message && <p role="status" className="notice success">{message}</p>}<ErrorNote error={save.error || submit.error || discard.error || detach.error} />
    <form onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      {draft.editableTitle !== undefined && <label>Deliverable title<input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} /></label>}
      <label>Version notes (optional)<textarea rows={4} maxLength={5_000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
      {revision && <label>Revision summary<textarea required minLength={1} maxLength={2_000} rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} /></label>}
      <fieldset><legend>External links</legend>{links.map((link, index) => <div className="link-editor" key={link.id}><label>Link label<input required maxLength={120} value={link.label} onChange={(event) => setLinks(links.map((item) => item.id === link.id ? { ...item, label: event.target.value } : item))} /></label><label>HTTPS address<input required type="url" maxLength={2_048} value={link.url} onChange={(event) => setLinks(links.map((item) => item.id === link.id ? { ...item, url: event.target.value } : item))} /></label><div className="row-actions"><button type="button" className="secondary compact" disabled={index === 0} onClick={() => { const copy = [...links]; [copy[index - 1], copy[index]] = [copy[index]!, copy[index - 1]!]; setLinks(copy); }}>Move up</button><button type="button" className="secondary compact" disabled={index === links.length - 1} onClick={() => { const copy = [...links]; [copy[index], copy[index + 1]] = [copy[index + 1]!, copy[index]!]; setLinks(copy); }}>Move down</button><button type="button" className="danger compact" onClick={() => setLinks(links.filter((item) => item.id !== link.id))}>Remove link</button></div></div>)}<button type="button" className="secondary compact" disabled={links.length >= 10} onClick={() => setLinks([...links, { id: newObjectId(), label: "", url: "https://", order: links.length }])}>Add link</button></fieldset>
      <button className="secondary" disabled={save.isPending || !title.trim()}>{save.isPending ? "Saving…" : "Save draft details"}</button>
    </form>
    <fieldset><legend>Private attachments</legend><label>Choose a file<input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.zip" disabled={draft.attachments.length >= 10} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} /></label>{uploadState && <p role="status" className="fine">{uploadState}</p>}<ul className="deliverable-attachments">{draft.attachments.map((attachment) => <li key={attachment.id}><span><strong>{attachment.filename}</strong><small>Finalized · {readableBytes(attachment.byteSize)}</small></span><button className="danger compact" disabled={detach.isPending} onClick={() => detach.mutate(attachment.id)}>Detach</button></li>)}</ul></fieldset>
    {detailsDirty && <p className="fine">Save the current draft details before submitting.</p>}
    <div className="row-actions"><button className="primary" disabled={!ready || detailsDirty || (revision && !summary.trim()) || submit.isPending || save.isPending} onClick={() => submit.mutate()}>{submit.isPending ? "Submitting…" : revision ? "Submit revised version" : "Submit version 1"}</button>{deliverable.permissions.canDiscard && <button className="danger" disabled={discard.isPending} onClick={() => setDiscardOpen(true)}>Discard draft</button>}</div>
    {discardOpen && <ConfirmDialog title={`Discard ${deliverable.title}?`} description="This permanently removes the never-submitted private draft. It consumes no number and creates no client-visible history." confirmLabel="Discard draft" busy={discard.isPending} onCancel={() => setDiscardOpen(false)} onConfirm={() => discard.mutate()} />}
  </div>;
}

function ReviewActions({ projectId, deliverable, onMessage }: Readonly<{ projectId: string; deliverable: Deliverable; onMessage: (message: string) => void }>) {
  const queryClient = useQueryClient(); const version = deliverable.currentVersion!; const [action, setAction] = useState<"approved" | "changes-requested" | "withdrawn">(); const [note, setNote] = useState("");
  const mutation = useMutation({
    mutationFn: () => action === "withdrawn"
      ? api(`/projects/${projectId}/deliverables/${deliverable.id}/versions/${version.id}/withdrawal`, json("POST", { confirmed: true, reason: note }), deliverableVersionActionResponseSchema)
      : api(`/projects/${projectId}/deliverables/${deliverable.id}/versions/${version.id}/decisions`, json("POST", { confirmed: true, outcome: action, note }), deliverableVersionActionResponseSchema),
    onSuccess: async (result) => { setAction(undefined); setNote(""); await refresh(queryClient, projectId); if (result.warning) onMessage(result.warning); }, onError: async () => refresh(queryClient, projectId),
  });
  return <><div className="row-actions review-actions">{deliverable.permissions.canDecide && <><button className="primary" onClick={() => setAction("approved")}>Approve exact version</button><button className="secondary" onClick={() => setAction("changes-requested")}>Request revision</button></>}{deliverable.permissions.canWithdraw && <button className="danger" onClick={() => setAction("withdrawn")}>Withdraw from review</button>}</div><ErrorNote error={mutation.error} />
    {action && <ConfirmDialog title={`${action === "approved" ? "Approve" : action === "withdrawn" ? "Withdraw" : "Request revision for"} ${deliverable.title}, version ${version.number}?`} description={action === "approved" ? "Approval is terminal. This deliverable cannot be reopened or revised." : "The submitted version remains permanently visible and a copied provider draft will be created."} confirmLabel={action === "approved" ? "Approve version" : action === "withdrawn" ? "Withdraw version" : "Request revision"} busy={mutation.isPending} confirmDisabled={action !== "approved" && !note.trim()} onCancel={() => { setAction(undefined); setNote(""); }} onConfirm={() => mutation.mutate()}>
      <label>{action === "approved" ? "Approval note (optional)" : action === "withdrawn" ? "Withdrawal reason" : "Required revision"}<textarea rows={3} required={action !== "approved"} maxLength={2_000} value={note} onChange={(event) => setNote(event.target.value)} /></label>
    </ConfirmDialog>}
  </>;
}

function OpenDeliverable({ projectId, deliverable }: Readonly<{ projectId: string; deliverable: Deliverable }>) {
  const queryClient = useQueryClient(); const [cancel, setCancel] = useState(false); const [reason, setReason] = useState(""); const [message, setMessage] = useState<string>();
  const cancellation = useMutation({ mutationFn: () => api(`/projects/${projectId}/deliverables/${deliverable.id}/cancellation`, json("POST", { confirmed: true, reason }), deliverableMutationResponseSchema), onSuccess: async () => { setCancel(false); setReason(""); await refresh(queryClient, projectId); }, onError: async () => refresh(queryClient, projectId) });
  return <li className="panel deliverable-card"><div className="deliverable-card-heading"><div><p className="eyebrow">{deliverable.number ? `Deliverable ${deliverable.number}` : "Unnumbered draft"}</p><h3>{deliverable.title}</h3></div><span className={`badge deliverable-status ${deliverable.state}`}>{deliverable.state.replaceAll("-", " ")}</span></div>
    <p className="fine">Created by {deliverable.creator.displayName} · <time dateTime={deliverable.createdAt}>{new Date(deliverable.createdAt).toLocaleString()}</time></p>
    {message && <p role="status" className="notice success">{message}</p>}
    {deliverable.draft && <DraftEditor projectId={projectId} deliverable={deliverable} onMessage={setMessage} />}
    {deliverable.currentVersion && <><VersionFacts projectId={projectId} deliverableId={deliverable.id} version={deliverable.currentVersion} /><Comments projectId={projectId} deliverable={deliverable} version={deliverable.currentVersion} /><ReviewActions projectId={projectId} deliverable={deliverable} onMessage={setMessage} /></>}
    {deliverable.state === "revision-draft" && !deliverable.draft && <p className="notice warning">A provider is preparing a revised version. The submitted history remains available.</p>}
    {deliverable.permissions.canCancel && <button className="danger" onClick={() => setCancel(true)}>Cancel deliverable</button>}<ErrorNote error={cancellation.error} /><VersionHistory projectId={projectId} deliverable={deliverable} />
    {cancel && <ConfirmDialog title={`Cancel ${deliverable.title}?`} description="This ends the deliverable and removes only the mutable revision draft. Every submitted version, comment, outcome, and historical attachment remains preserved." confirmLabel="Cancel deliverable" busy={cancellation.isPending} confirmDisabled={!reason.trim()} onCancel={() => { setCancel(false); setReason(""); }} onConfirm={() => cancellation.mutate()}><label>Cancellation reason<textarea required maxLength={2_000} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label></ConfirmDialog>}
  </li>;
}

export function DeliverablePanel({ projectId }: Readonly<{ projectId: string }>) {
  const queryClient = useQueryClient(); const [title, setTitle] = useState(""); const [message, setMessage] = useState<string>();
  const collection = useQuery({ queryKey: ["deliverables", projectId], queryFn: () => api(`/projects/${projectId}/deliverables`, {}, deliverableCollectionResponseSchema) });
  const history = useInfiniteQuery({ queryKey: ["deliverable-history", projectId], initialPageParam: undefined as string | undefined, queryFn: ({ pageParam }) => api(`/projects/${projectId}/deliverables/history?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, {}, deliverableHistoryResponseSchema), getNextPageParam: (last) => last.history.nextCursor });
  const create = useMutation({ mutationFn: () => api(`/projects/${projectId}/deliverables`, json("POST", { title }), deliverableMutationResponseSchema), onSuccess: async () => { setTitle(""); await refresh(queryClient, projectId); setMessage("Private deliverable draft created."); }, onError: async (error) => { if ((error as ApiFailure).code === "STALE_STATE") setMessage("Deliverables changed. The latest state has been loaded."); await refresh(queryClient, projectId); } });
  if (collection.isPending) return <section className="panel"><p role="status">Loading deliverables…</p></section>;
  if (collection.error) return <section className="panel"><ErrorNote error={collection.error} /><button className="secondary" onClick={() => void collection.refetch()}>Retry</button></section>;
  const data = collection.data.deliverables;
  return <section className="scope-workflow deliverable-workflow" aria-labelledby="deliverable-heading"><header className="scope-heading"><div><p className="eyebrow">Concrete client work</p><h2 id="deliverable-heading">Deliverables and review</h2></div><span className="badge">{data.openCount} of {data.limit} open</span></header>
    <p className="fine">Deliverables preserve each submitted file, link, discussion, and client decision as versioned review history.</p>{message && <p role="status" className="notice success">{message}</p>}<ErrorNote error={create.error} />
    {!data.available && <section className="panel compact-empty"><h3>Deliverables are not available yet</h3><p>An approved scope is required before the provider can prepare concrete work for client review.</p></section>}
    {data.available && data.permissions.canCreate && <form className="panel deliverable-create" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}><div className="panel-heading"><div><h3>Create a private deliverable draft</h3><p className="fine">The title remains editable until version 1 is submitted.</p></div></div><label>Deliverable title<input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} /></label><button className="primary" disabled={!title.trim() || create.isPending || data.openCount >= data.limit}>{create.isPending ? "Creating…" : data.openCount >= data.limit ? "Open deliverable limit reached" : "Create draft"}</button></form>}
    {data.available && !data.deliverables.length && <section className="panel compact-empty"><h3>No open deliverables</h3><p>{data.permissions.canCreate ? "Create a private draft above when work is ready to package for review." : "The provider has not submitted work for review yet."}</p></section>}
    <ol className="deliverable-list">{data.deliverables.map((deliverable) => <OpenDeliverable key={deliverable.id} projectId={projectId} deliverable={deliverable} />)}</ol>
    <section className="panel deliverable-history" aria-labelledby="deliverable-history-heading"><div className="panel-heading"><div><p className="eyebrow">Preserved record</p><h3 id="deliverable-history-heading">Approved and canceled deliverables</h3></div></div>{history.isPending && <p role="status">Loading deliverable history…</p>}<ErrorNote error={history.error} />{history.data?.pages.every((page) => !page.history.deliverables.length) && <p className="empty-copy">No deliverables have reached a terminal outcome.</p>}<ol>{history.data?.pages.flatMap((page) => page.history.deliverables).map((deliverable) => <li key={deliverable.id} className="terminal-deliverable"><div><p className="eyebrow">Deliverable {deliverable.number}</p><h4>{deliverable.title}</h4><span className={`badge deliverable-status ${deliverable.state}`}>{deliverable.state}</span></div>{deliverable.terminal && <p className="fine">{deliverable.state === "approved" ? "Approved" : "Canceled"} by {deliverable.terminal.actor.displayName} · <time dateTime={deliverable.terminal.at}>{new Date(deliverable.terminal.at).toLocaleString()}</time></p>}{deliverable.terminal?.reason && <p className="plain-text">Reason: {deliverable.terminal.reason}</p>}<VersionHistory projectId={projectId} deliverable={deliverable} /></li>)}</ol>{history.hasNextPage && <button className="secondary" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>{history.isFetchingNextPage ? "Loading…" : "Load older deliverables"}</button>}</section>
  </section>;
}
