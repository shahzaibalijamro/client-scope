"use client";

import { useMutation } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";

import { api, json } from "../api-client";

function VerifyContent() {
  const token = useSearchParams().get("token") ?? "";
  const verification = useMutation({ mutationFn: () => api("/auth/verify", json("POST", { token }), z.object({ message: z.string(), signedIn: z.boolean() }).strict()) });
  const returnTo = typeof window === "undefined" ? null : sessionStorage.getItem("clientscope:returnTo");
  const destination = verification.data?.signedIn && returnTo?.startsWith("/invite/") ? returnTo : "/";
  return <main className="center-layout"><section className="focus-card"><p className="eyebrow">Email verification</p><h1>Confirm this email address</h1><p>This action verifies the account only. It will never accept an invitation or create a new session.</p>{!token ? <><p className="notice error" role="alert">This verification link is unavailable.</p><Link className="secondary button-link" href="/">Sign in to request another link</Link></> : verification.isSuccess ? <><p className="notice success" role="status">{verification.data.message}</p><Link className="primary button-link" href={destination}>{verification.data.signedIn ? "Continue to ClientScope" : "Sign in"}</Link></> : <button className="primary" onClick={() => verification.mutate()} disabled={verification.isPending}>{verification.isPending ? "Verifying…" : "Verify email"}</button>}{verification.error && <><p className="notice error" role="alert">{verification.error.message}</p><Link className="secondary button-link" href="/">Sign in to request another link</Link></>}</section></main>;
}

export default function VerifyPage() {
  return <Suspense fallback={<main className="center-layout"><p>Opening verification…</p></main>}><VerifyContent /></Suspense>;
}
