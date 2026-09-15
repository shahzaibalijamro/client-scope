"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import { ConfirmDialog } from "./confirm-dialog";

type Toast = { id: number; message: string; tone: "success" | "info" | "warning" };

export function announceToast(message: string, tone: Toast["tone"] = "success") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("clientscope:toast", { detail: { message, tone } }));
}

export function ToastRegion() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; tone?: Toast["tone"] }>).detail;
      if (!detail?.message) return;
      const toast = { id: Date.now() + Math.random(), message: detail.message, tone: detail.tone ?? "success" };
      setToasts((current) => [...current.slice(-2), toast]);
      window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== toast.id)), 5000);
    };
    window.addEventListener("clientscope:toast", listener);
    return () => window.removeEventListener("clientscope:toast", listener);
  }, []);
  return <div className="toast-region" aria-live="polite" aria-label="Notifications">{toasts.map((toast) => <div className={`toast ${toast.tone}`} key={toast.id}><span>{toast.message}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}><X size={16} /></button></div>)}</div>;
}

type DirtyContextValue = {
  navigate: (href: string) => void;
  runAction: (action: () => void) => void;
};

const DirtyContext = createContext<DirtyContextValue>({ navigate: () => undefined, runAction: (action) => action() });

function formSignature(form: HTMLFormElement): string {
  const values: string[] = [];
  for (const element of Array.from(form.elements)) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) continue;
    if (!element.name || element.disabled || ["submit", "button", "reset"].includes(element.type)) continue;
    if ((element instanceof HTMLInputElement) && ["checkbox", "radio"].includes(element.type) && !element.checked) continue;
    values.push(`${element.name}:${element.value}`);
  }
  return values.join("|");
}

export function DirtyNavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const originals = useRef(new WeakMap<HTMLFormElement, string>());
  const dirtyForms = useRef(new Set<HTMLFormElement>());
  const [pending, setPending] = useState<{ kind: "href"; href: string } | { kind: "action"; action: () => void }>();

  const hasDirtyForms = useCallback(() => {
    for (const form of dirtyForms.current) {
      if (!form.isConnected) dirtyForms.current.delete(form);
    }
    return dirtyForms.current.size > 0;
  }, []);

  const refreshForm = useCallback((form: HTMLFormElement) => {
    const original = originals.current.get(form);
    if (original === undefined) return;
    if (formSignature(form) === original) dirtyForms.current.delete(form);
    else dirtyForms.current.add(form);
  }, []);

  useEffect(() => {
    const remember = (event: Event) => {
      const form = (event.target as HTMLElement | null)?.closest("form");
      if (form && !originals.current.has(form)) originals.current.set(form, formSignature(form));
    };
    const changed = (event: Event) => {
      const form = (event.target as HTMLElement | null)?.closest("form");
      if (form) refreshForm(form);
    };
    const submitted = (event: Event) => {
      const form = event.target as HTMLFormElement;
      window.setTimeout(() => refreshForm(form), 0);
    };
    const reset = (event: Event) => {
      const form = event.target as HTMLFormElement;
      window.setTimeout(() => {
        originals.current.set(form, formSignature(form));
        dirtyForms.current.delete(form);
      }, 0);
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasDirtyForms()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    document.addEventListener("focusin", remember, true);
    document.addEventListener("input", changed, true);
    document.addEventListener("change", changed, true);
    document.addEventListener("submit", submitted, true);
    document.addEventListener("reset", reset, true);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      document.removeEventListener("focusin", remember, true);
      document.removeEventListener("input", changed, true);
      document.removeEventListener("change", changed, true);
      document.removeEventListener("submit", submitted, true);
      document.removeEventListener("reset", reset, true);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [hasDirtyForms, refreshForm]);

  const navigate = useCallback((href: string) => {
    if (hasDirtyForms()) setPending({ kind: "href", href });
    else router.push(href);
  }, [hasDirtyForms, router]);
  const runAction = useCallback((action: () => void) => {
    if (hasDirtyForms()) setPending({ kind: "action", action });
    else action();
  }, [hasDirtyForms]);
  const discard = () => {
    const destination = pending;
    dirtyForms.current.clear();
    originals.current = new WeakMap();
    setPending(undefined);
    if (destination?.kind === "href") router.push(destination.href);
    else destination?.action();
  };

  return <DirtyContext.Provider value={{ navigate, runAction }}>{children}{pending && <ConfirmDialog title="Discard unsaved changes?" description="You have unsaved changes on this page. Stay to keep editing, or discard them and continue." confirmLabel="Discard changes" onCancel={() => setPending(undefined)} onConfirm={discard} />}</DirtyContext.Provider>;
}

export const useSafeNavigation = () => useContext(DirtyContext);

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return <div className="loading-block" role="status"><span className="skeleton wide" /><span className="skeleton" /><span className="sr-only">{label}</span></div>;
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return <section className="empty-state compact-empty"><h2>{title}</h2><div>{children}</div></section>;
}

export function Disclosure({ label, children, open = false }: { label: string; children: ReactNode; open?: boolean }) {
  return <details className="disclosure" open={open}><summary>{label}</summary><div className="disclosure-content">{children}</div></details>;
}

export function DialogSurface({ title, description, onClose, children }: { title: string; description?: string; onClose: () => void; children: ReactNode }) {
  const { runAction } = useSafeNavigation();
  const requestClose = () => runAction(onClose);
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    return () => previousFocus.current?.focus();
  }, []);
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) requestClose(); }}><section ref={dialogRef} className="dialog drawer-responsive" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={(event) => {
    if (event.key === "Escape") { event.preventDefault(); requestClose(); return; }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]") ?? []);
    if (!focusable.length) return;
    const first = focusable[0]; const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }}><header className="dialog-header"><div><p className="eyebrow">Focused action</p><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" aria-label={`Close ${title}`} onClick={requestClose}><X size={18} /></button></header>{children}</section></div>;
}
