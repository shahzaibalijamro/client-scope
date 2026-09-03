"use client";

import { useQuery } from "@tanstack/react-query";

import { healthQueryOptions } from "./health-query";

type StatusKind = "checking" | "available" | "unavailable";

const statusCopy: Record<StatusKind, { eyebrow: string; heading: string; description: string }> = {
  checking: {
    eyebrow: "Checking",
    heading: "Checking service availability",
    description: "This should only take a moment.",
  },
  available: {
    eyebrow: "Available",
    heading: "ClientScope is available",
    description: "The service and its data connection are ready.",
  },
  unavailable: {
    eyebrow: "Unavailable",
    heading: "ClientScope is temporarily unavailable",
    description: "Please refresh this page later to check again.",
  },
};

export function StatusPage() {
  const health = useQuery(healthQueryOptions);
  const kind: StatusKind = health.isPending
    ? "checking"
    : health.isSuccess
      ? "available"
      : "unavailable";
  const copy = statusCopy[kind];

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-8">
      <section
        aria-labelledby="status-heading"
        aria-live="polite"
        className="w-full max-w-xl rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-7 shadow-[0_22px_70px_rgba(30,55,40,0.10)] sm:p-11"
      >
        <p
          className="mb-4 text-sm font-bold uppercase tracking-[0.18em]"
          style={{ color: `var(--${kind})` }}
        >
          System status: {copy.eyebrow}
        </p>
        <h1 id="status-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {copy.heading}
        </h1>
        <p className="mt-4 max-w-md text-base leading-7 text-[var(--muted)] sm:text-lg">
          {copy.description}
        </p>
      </section>
    </main>
  );
}
