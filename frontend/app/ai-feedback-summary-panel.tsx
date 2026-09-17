"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { api, json } from "./api-client";
import { feedbackSummaryMutationResponseSchema, feedbackSummaryStatusResponseSchema, type FeedbackSummary } from "./api-schemas";
import { ConfirmDialog } from "./confirm-dialog";

function ErrorNote({ error }: Readonly<{ error: unknown }>) {
  return error ? <p className="notice error" role="alert">{error instanceof Error ? error.message : "The feedback summary request could not be completed."}</p> : null;
}

function ResultSection({ heading, items, sources }: Readonly<{ heading: string; items: FeedbackSummary["output"]["themes"]; sources: Map<string, FeedbackSummary["sourceReferences"][number]> }>) {
  return <section className="feedback-summary-section"><h5>{heading}</h5>{items.length ? <ul>{items.map((item, index) => <li key={`${heading}-${index}`}><p className="plain-text">{item.text}</p><ul className="feedback-citations" aria-label={`Sources for ${heading.toLowerCase()} item ${index + 1}`}>{item.citations.map((citation) => {
    const source = sources.get(`${citation.feedbackRecordId}:${citation.versionId}`);
    return <li key={`${citation.feedbackRecordId}:${citation.versionId}`}><span>Version {source?.versionNumber ?? "?"} · {(source?.kind ?? "feedback").replaceAll("-", " ")} · </span><code>{citation.feedbackRecordId}</code></li>;
  })}</ul></li>)}</ul> : <p className="fine">No source-supported items in this section.</p>}</section>;
}

export function AiFeedbackSummaryPanel({ projectId, deliverableId }: Readonly<{ projectId: string; deliverableId: string }>) {
  const queryClient = useQueryClient(); const [confirming, setConfirming] = useState(false); const [announcement, setAnnouncement] = useState<string>();
  const heading = useRef<HTMLHeadingElement>(null);
  const status = useQuery({ queryKey: ["feedback-summary", projectId, deliverableId], queryFn: () => api(`/projects/${projectId}/deliverables/${deliverableId}/feedback-summary`, {}, feedbackSummaryStatusResponseSchema) });
  const generate = useMutation({
    mutationFn: () => api(`/projects/${projectId}/deliverables/${deliverableId}/feedback-summary`, json("POST", {}), feedbackSummaryMutationResponseSchema),
    onSuccess: async ({ summary }) => {
      setConfirming(false); setAnnouncement("Private feedback summary generated.");
      queryClient.setQueryData(["feedback-summary", projectId, deliverableId], { availability: status.data!.availability, summary });
      await queryClient.invalidateQueries({ queryKey: ["feedback-summary", projectId, deliverableId] });
    },
    onError: () => setConfirming(false),
  });
  const summary = status.data?.summary;
  const summaryGeneratedAt = summary?.generatedAt;
  useEffect(() => { if (summaryGeneratedAt) heading.current?.focus(); }, [summaryGeneratedAt]);
  if (status.isPending) return <section className="ai-panel"><p role="status">Checking feedback-summary availability…</p></section>;
  if (status.error) return <section className="ai-panel"><ErrorNote error={status.error} /></section>;
  const { availability } = status.data; const sources = new Map(summary?.sourceReferences.map((source) => [`${source.feedbackRecordId}:${source.versionId}`, source]) ?? []);
  return <section className="ai-panel feedback-summary" aria-labelledby={`feedback-summary-${deliverableId}`}>
    <div className="panel-heading"><div><p className="eyebrow">Optional review aid</p><h4 id={`feedback-summary-${deliverableId}`} ref={heading} tabIndex={-1}>Summarize client feedback</h4></div><span className="badge">Provider private</span></div>
    <p className="fine">AI-generated and advisory only. Original client comments and formal revision requests remain the sole source of truth.</p>
    {announcement && <p className="notice success" role="status">{announcement}</p>}<ErrorNote error={generate.error} />
    {availability.unavailableReason === "insufficient-feedback" && <p className="notice warning">At least two eligible client feedback records are required. Provider discussion, approval notes, and withdrawal reasons do not count.</p>}
    {availability.unavailableReason === "ai-disabled" && <p className="notice warning">AI summarization is unavailable. Original feedback and all manual review controls remain available.</p>}
    {availability.unavailableReason === "project-locked" && <p className="notice warning">New summaries are locked after completion begins. A previously saved result remains readable.</p>}
    <p className="fine">{availability.eligibleCount} eligible {availability.eligibleCount === 1 ? "record" : "records"} · minimum {availability.minimumRequired}</p>
    {availability.canGenerate && <button type="button" className="secondary" disabled={generate.isPending} onClick={() => setConfirming(true)}>{summary ? "Regenerate summary" : "Generate summary"}</button>}
    {summary && <article className="feedback-summary-result"><div className="panel-heading"><div><p className="eyebrow">Latest successful run</p><h5>Feedback summary</h5></div><span className={`badge ${summary.freshness === "outdated" ? "warning" : ""}`}>{summary.freshness}</span></div>
      <p className="fine">Generated by {summary.generatedBy.displayName} · <time dateTime={summary.generatedAt}>{new Date(summary.generatedAt).toLocaleString()}</time></p>
      {summary.freshness === "outdated" && <p className="notice warning" role="status">Eligible client feedback changed after this run. This result remains readable, but only explicit regeneration can replace it.</p>}
      <ResultSection heading="Themes" items={summary.output.themes} sources={sources} />
      <ResultSection heading="Requested actions" items={summary.output.requestedActions} sources={sources} />
      <ResultSection heading="Tensions or unclear points" items={summary.output.tensions} sources={sources} />
      <details><summary>Source and run provenance</summary><p className="fine">Each reference identifies the exact immutable feedback record and submitted version used for this run.</p><ul>{summary.sourceReferences.map((source) => <li key={source.feedbackRecordId}>Version {source.versionNumber} · {source.kind.replaceAll("-", " ")} by {source.author.displayName} · <code>{source.feedbackRecordId}</code></li>)}</ul><p className="fine">Prompt {summary.provenance.promptVersion} · schema {summary.provenance.schemaVersion} · {summary.provenance.provider.id}/{summary.provenance.provider.model}</p></details>
    </article>}
    {confirming && <ConfirmDialog title={summary ? "Regenerate the private feedback summary?" : "Generate a private feedback summary?"} description="Only eligible client-authored comments and formal revision-request notes from this deliverable’s submitted versions are sent. The result cannot change feedback, drafts, workflow state, activity, or client-visible data." confirmLabel={generate.isPending ? "Generating…" : summary ? "Regenerate summary" : "Generate summary"} busy={generate.isPending} onCancel={() => setConfirming(false)} onConfirm={() => generate.mutate()} />}
  </section>;
}
