"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Bell, BriefcaseBusiness, Building2, ChevronLeft, ChevronRight, LogOut, Menu, Search, UserRound, X } from "lucide-react";

import { api, json } from "./api-client";
import { demoResponseSchema, userSchema, type User, type WorkResponse } from "./api-schemas";
import { adminHref, parseAppRoute, projectHref } from "./route-model";
import { flattenWorkspaces } from "./work-directory";
import { useSafeNavigation } from "./ui-foundation";

const profileSchema = z.object({ displayName: z.string().trim().min(1, "Enter a display name.").max(80) });

function ProfileEditor({ user, onClose }: { user: User; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { runAction } = useSafeNavigation();
  const form = useForm<z.infer<typeof profileSchema>>({ resolver: zodResolver(profileSchema), defaultValues: { displayName: user.displayName } });
  const update = useMutation({
    mutationFn: (values: z.infer<typeof profileSchema>) => api("/account", json("PATCH", values), z.object({ user: userSchema }).strict()),
    onSuccess: (body) => { queryClient.setQueryData(["session"], { user: body.user }); form.reset({ displayName: body.user.displayName }); onClose(); },
  });
  return <div className="profile-popover"><form onSubmit={form.handleSubmit((values) => update.mutate(values))} noValidate><label>Display name<input {...form.register("displayName")} />{form.formState.errors.displayName && <small role="alert">{form.formState.errors.displayName.message}</small>}</label>{update.error && <p className="notice error" role="alert">{update.error.message}</p>}<div className="row-actions"><button type="button" className="secondary" onClick={() => runAction(onClose)}>Cancel</button><button className="primary" disabled={update.isPending}>Save</button></div></form></div>;
}

function NavButton({ href, active, icon, children, onNavigate }: { href: string; active: boolean; icon: ReactNode; children: ReactNode; onNavigate?: () => void }) {
  const { navigate } = useSafeNavigation();
  return <button className="shell-nav-link" aria-current={active ? "page" : undefined} onClick={() => { onNavigate?.(); navigate(href); }}>{icon}<span>{children}</span></button>;
}

function ProjectSwitcher({ work }: { work?: WorkResponse }) {
  const { navigate } = useSafeNavigation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const projects = useMemo(() => flattenWorkspaces(work?.workspaces ?? []), [work]);
  const results = projects.filter((project) => [project.name, project.client.name, project.workspaceName].some((value) => value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))).slice(0, 20);
  const close = () => { setOpen(false); setQuery(""); window.setTimeout(() => triggerRef.current?.focus(), 0); };
  const select = (id: string) => { close(); navigate(projectHref(id)); };
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault(); setOpen(true);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => { if (open) window.setTimeout(() => inputRef.current?.focus(), 0); }, [open]);

  return <><button ref={triggerRef} className="project-switcher-trigger" onClick={() => setOpen(true)}><Search size={17} /><span>Switch project</span><kbd>Ctrl K</kbd></button>{open && <div className="dialog-backdrop" role="presentation"><section className="switcher-dialog" role="dialog" aria-modal="true" aria-labelledby="switcher-title" onKeyDown={(event) => {
    if (event.key === "Escape") close();
    if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((value) => Math.min(value + 1, results.length - 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((value) => Math.max(value - 1, 0)); }
    if (event.key === "Enter" && results[activeIndex]) { event.preventDefault(); select(results[activeIndex].id); }
  }}><header><div><p className="eyebrow">Quick navigation</p><h2 id="switcher-title">Switch project</h2></div><button className="icon-button" aria-label="Close project switcher" onClick={close}><X size={18} /></button></header><label className="search-field"><Search size={18} /><span className="sr-only">Search accessible projects</span><input ref={inputRef} value={query} maxLength={120} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} placeholder="Search projects, clients, or workspaces" /></label><div className="switcher-results" role="listbox" aria-label="Accessible projects">{results.map((project, index) => <button role="option" aria-selected={index === activeIndex} className={index === activeIndex ? "active" : ""} key={project.id} onMouseEnter={() => setActiveIndex(index)} onClick={() => select(project.id)}><span><strong>{project.name}</strong><small>{project.client.name} · {project.workspaceName}</small></span><span className="badge">{project.role.replaceAll("-", " ")}</span></button>)}{!results.length && <p className="empty-copy">No accessible projects match that search.</p>}</div></section></div>}</>;
}

export function AppShell({ user, work, onLogout, children, demoMode: requestedDemoMode = false }: { user: User; work?: WorkResponse; onLogout: () => void; children: ReactNode; demoMode?: boolean }) {
  const demo = useQuery({ queryKey: ["demo"], queryFn: () => api("/demo", {}, demoResponseSchema) });
  const canonicalDemoIdentity = Boolean(
    demo.data?.enabled
    && demo.data.identities.some((identity) => identity.email.toLowerCase() === user.email.toLowerCase()),
  );
  const demoMode = requestedDemoMode || canonicalDemoIdentity;
  const pathname = usePathname() ?? (typeof window === "undefined" ? "/" : window.location.pathname);
  const route = parseAppRoute(pathname);
  const { runAction } = useSafeNavigation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  useEffect(() => {
    if (demoMode) document.body.dataset.demoMode = "true";
    else delete document.body.dataset.demoMode;
    return () => { delete document.body.dataset.demoMode; };
  }, [demoMode]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { setCollapsed(localStorage.getItem("clientscope:sidebar-collapsed") === "true"); } catch { setCollapsed(false); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const toggleCollapsed = () => setCollapsed((value) => {
    const next = !value;
    try { localStorage.setItem("clientscope:sidebar-collapsed", String(next)); } catch { /* local preference is optional */ }
    return next;
  });
  useEffect(() => {
    const timer = window.setTimeout(() => setMobileOpen(false), 0);
    const heading = document.querySelector<HTMLElement>("#main-content h1");
    if (heading) { heading.tabIndex = -1; heading.focus(); }
    return () => window.clearTimeout(timer);
  }, [pathname]);
  const ownerWorkspaces = work?.workspaces.filter((workspace) => workspace.relationship === "owner") ?? [];

  const navigation = <><div className="shell-brand"><span className="brand-mark">C</span><strong>Client<span>Scope</span></strong></div><ProjectSwitcher work={work} /><nav aria-label="Primary navigation"><p className="nav-label">Navigate</p><NavButton href="/" active={route.kind === "work"} icon={<BriefcaseBusiness size={19} />} onNavigate={() => setMobileOpen(false)}>My Work</NavButton>{Boolean(work?.invitations.length) && <NavButton href="/?view=invitations" active={false} icon={<Bell size={19} />} onNavigate={() => setMobileOpen(false)}>Invitations <span className="nav-count">{work!.invitations.length}</span></NavButton>}<p className="nav-label">Workspace Admin</p>{ownerWorkspaces.map((workspace) => <NavButton key={workspace.id} href={adminHref(workspace.id)} active={route.kind === "admin" && route.workspaceId === workspace.id} icon={<Building2 size={19} />} onNavigate={() => setMobileOpen(false)}>{workspace.name}</NavButton>)}</nav><button className="collapse-button" onClick={toggleCollapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <ChevronRight size={18} /> : <><ChevronLeft size={18} /><span>Collapse sidebar</span></>}</button></>;

  return <div className={`authenticated-layout${collapsed ? " sidebar-collapsed" : ""}`}><a className="skip-link" href="#main-content">Skip to content</a><aside className="desktop-sidebar">{navigation}</aside>{mobileOpen && <div className="mobile-drawer-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setMobileOpen(false); }}><aside className="mobile-drawer" aria-label="Mobile navigation"><button className="icon-button drawer-close" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X /></button>{navigation}</aside></div>}<header className="mobile-topbar"><button className="icon-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu /></button><strong>ClientScope</strong></header><div className="shell-main">{demoMode && <div className="demo-shell-notice" role="status">Shared portfolio demo · changes are temporary and reset every six hours.</div>}<header className="shell-topbar"><div className="account"><span className="avatar">{user.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{user.displayName}</strong><small>{user.email}</small></div>{!demoMode && <button className="icon-button" aria-label="Edit profile" onClick={() => setProfileOpen((value) => !value)}><UserRound size={18} /></button>}<button className="icon-button" aria-label="Sign out" onClick={() => runAction(onLogout)}><LogOut size={18} /></button>{profileOpen && !demoMode && <ProfileEditor user={user} onClose={() => setProfileOpen(false)} />}</div></header><main id="main-content" className="app-shell">{children}</main></div></div>;
}
