"use client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import { api, json } from "../../api-client";
import { limitedInvitationResponseSchema, messageResponseSchema } from "../../api-schemas";

export default function InvitationPage() {
  const token = String(useParams().token ?? "");
  const invitation = useQuery({ queryKey: ["invitation-link", token], queryFn: () => api(`/invitation-links/${token}`, {}, limitedInvitationResponseSchema) });
  const accept = useMutation({ mutationFn: () => api(`/invitation-links/${token}/accept`, json("POST"), messageResponseSchema), onSuccess: (body) => { sessionStorage.removeItem("clientscope:returnTo"); location.href = body.destination ?? "/"; } });
  return <main className="center-layout"><section className="focus-card"><p className="eyebrow">ClientScope invitation</p>{invitation.isPending ? <h1>Checking your invitation…</h1> : invitation.error ? <><h1>Use the invited account</h1><p>Sign in with the verified email address that received this invitation. Private workspace and project details stay hidden until then.</p><a className="primary button-link" href={`/?returnTo=${encodeURIComponent(`/invite/${token}`)}`}>Sign in or create an account</a></> : <><h1>{invitation.data.invitation.projectName || invitation.data.invitation.workspaceName}</h1><p>{invitation.data.invitation.projectName ? `${invitation.data.invitation.clientName} · ${invitation.data.invitation.workspaceName}` : `Join ${invitation.data.invitation.workspaceName}`}</p><div className="meta-box"><span>Invited by</span><strong>{invitation.data.invitation.inviterName}</strong><span>Intended role</span><strong>{invitation.data.invitation.role.replaceAll("-", " ")}</strong></div><p className="fine">Authentication and verification never accept access. Choose the explicit action below.</p><button className="primary" onClick={() => accept.mutate()} disabled={accept.isPending}>{accept.isPending ? "Accepting…" : "Accept invitation"}</button>{accept.error && <p className="notice error" role="alert">{accept.error.message}</p>}</>}</section></main>;
}
