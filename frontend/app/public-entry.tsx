"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Public fallback remains usable without client navigation. */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { api } from "./api-client";
import { sessionResponseSchema } from "./api-schemas";
import { LoadingBlock } from "./ui-foundation";

export function PublicEntry({ children, homepage = false }: { children: ReactNode; homepage?: boolean }) {
  const router = useRouter();
  const session = useQuery({ queryKey: ["session"], queryFn: () => api("/auth/session", {}, sessionResponseSchema) });
  useEffect(() => { if (session.data?.user) { const query = typeof window === "undefined" ? "" : window.location.search; router.replace(query ? `/work${query}` : "/work"); } }, [session.data?.user, router]);
  if (session.data?.user || (!homepage && session.isPending)) return <main className="center-layout"><LoadingBlock label="Opening ClientScope" /></main>;
  if (session.error && !homepage) return <main className="center-layout"><section className="focus-card"><h1>Unable to check your session</h1><p>Try again to continue securely.</p><button className="primary" onClick={() => void session.refetch()}>Try again</button><a href="/">Back to ClientScope</a></section></main>;
  return children;
}
