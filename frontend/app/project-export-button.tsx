"use client";

import { useRef, useState } from "react";

function filenameFromDisposition(value: string | null): string {
  if (!value) return "project-record.zip";
  const encoded = /filename\*=UTF-8''([^;]+)/iu.exec(value)?.[1];
  if (encoded) { try { return decodeURIComponent(encoded).replace(/[\\/\u0000-\u001f]/gu, "-"); } catch { /* use fallback */ } }
  return /filename="?([^";]+)"?/iu.exec(value)?.[1]?.replace(/[\\/\u0000-\u001f]/gu, "-") ?? "project-record.zip";
}

export function ProjectExportButton({ projectId }: Readonly<{ projectId: string }>) {
  const [state, setState] = useState<"idle" | "preparing" | "failed" | "complete">("idle");
  const [message, setMessage] = useState<string>(); const controller = useRef<AbortController | undefined>(undefined);
  const download = async () => {
    if (state === "preparing") return;
    const abort = new AbortController(); controller.current = abort; setState("preparing"); setMessage(undefined);
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/export`, { credentials: "same-origin", signal: abort.signal, headers: { Accept: "application/zip" } });
      if (!response.ok) {
        let reason = response.status === 401 || response.status === 403 || response.status === 404 ? "You no longer have access to export this project." : "The project record could not be prepared. Try again.";
        try { const body = await response.json() as { error?: { message?: string } }; if (response.status >= 500 && body.error?.message) reason = body.error.message; } catch { /* bounded message above */ }
        throw new Error(reason);
      }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = filenameFromDisposition(response.headers.get("Content-Disposition")); anchor.style.display = "none";
      document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
      const incomplete = response.headers.get("X-Project-Export-Complete") === "false";
      setState("complete"); setMessage(incomplete ? "Download ready. Some attachment files were omitted; see the PDF and manifest for details." : "Project record downloaded.");
    } catch (error) {
      if (abort.signal.aborted) { setState("idle"); setMessage("Export canceled."); }
      else { setState("failed"); setMessage(error instanceof Error ? error.message : "The project record could not be prepared. Try again."); }
    } finally { controller.current = undefined; }
  };
  return <section className="panel" aria-labelledby="project-export-title"><div className="panel-heading"><div><p className="eyebrow">Portable record</p><h2 id="project-export-title">Project export</h2><p>Download the shared project record as a ZIP. This does not change or lock the project.</p></div><div className="row-actions">{state === "preparing" && <button type="button" className="secondary" onClick={() => controller.current?.abort()}>Cancel</button>}<button type="button" className="primary" onClick={() => void download()} disabled={state === "preparing"}>{state === "preparing" ? "Preparing…" : state === "failed" ? "Try export again" : "Export project record"}</button></div></div>{message && <p role={state === "failed" ? "alert" : "status"} className={`notice ${state === "failed" ? "error" : "success"}`}>{message}</p>}<span className="sr-only" aria-live="polite">{state === "preparing" ? "Preparing project record download." : ""}</span></section>;
}
