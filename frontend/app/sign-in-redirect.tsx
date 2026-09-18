"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { rememberDestination } from "./public-routes";
export function SignInRedirect() {
  const router = useRouter();
  useEffect(() => { rememberDestination(window.location.pathname); router.replace("/sign-in"); }, [router]);
  return <main className="center-layout"><p role="status">Opening sign-in…</p><a href="/sign-in">Continue to sign in</a></main>;
}
