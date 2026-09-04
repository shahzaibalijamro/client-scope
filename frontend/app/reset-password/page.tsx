"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { Suspense } from "react";
import { z } from "zod";

import { api, json } from "../api-client";

const schema = z.object({ password: z.string().min(12).max(128), confirmation: z.string().min(12).max(128) }).refine((value) => value.password === value.confirmation, { path: ["confirmation"], message: "Passwords must match." });

function ResetPasswordContent() {
  const token = useSearchParams().get("token") ?? "";
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { password: "", confirmation: "" } });
  const reset = useMutation({ mutationFn: (values: z.infer<typeof schema>) => api<{ message: string }>("/auth/reset-password", json("POST", { token, ...values })) });
  return <main className="center-layout"><section className="focus-card"><p className="eyebrow">Account recovery</p><h1>Choose a new password</h1><p>Use 12–128 characters. Spaces and Unicode are welcome; the value is never trimmed.</p>{reset.isSuccess ? <><p className="notice success">{reset.data.message}</p><Link className="primary button-link" href="/">Return to sign in</Link></> : <form onSubmit={form.handleSubmit((values) => reset.mutate(values))}><label>New password<input type="password" autoComplete="new-password" {...form.register("password")} />{form.formState.errors.password && <small>{form.formState.errors.password.message}</small>}</label><label>Confirm new password<input type="password" autoComplete="new-password" {...form.register("confirmation")} />{form.formState.errors.confirmation && <small>{form.formState.errors.confirmation.message}</small>}</label><button className="primary" disabled={!token || reset.isPending}>Change password</button></form>}{reset.error && <p className="notice error" role="alert">{reset.error.message}</p>}</section></main>;
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<main className="center-layout"><p>Opening password reset…</p></main>}><ResetPasswordContent /></Suspense>;
}
