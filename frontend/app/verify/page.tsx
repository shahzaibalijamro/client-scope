"use client";

import { useMutation } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

import { api, json } from "../api-client";

function VerifyContent() {
  const token = useSearchParams().get("token") ?? "";
  const verification = useMutation({ mutationFn: () => api<{ message: string; signedIn: boolean }>("/auth/verify", json("POST", { token })) });
  return <main className="center-layout"><section className="focus-card"><p className="eyebrow">Email verification</p><h1>Confirm this email address</h1><p>This action verifies the account only. It will never accept an invitation or create a new session.</p>{verification.isSuccess ? <><p className="notice success">{verification.data.message}</p><Link className="primary button-link" href="/">{verification.data.signedIn ? "Continue to ClientScope" : "Sign in"}</Link></> : <button className="primary" onClick={() => verification.mutate()} disabled={!token || verification.isPending}>{verification.isPending ? "Verifying…" : "Verify email"}</button>}{verification.error && <p className="notice error" role="alert">{verification.error.message}</p>}</section></main>;
}

export default function VerifyPage() {
  return <Suspense fallback={<main className="center-layout"><p>Opening verification…</p></main>}><VerifyContent /></Suspense>;
}
