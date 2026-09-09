"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, json } from "./api-client";
import { messageResponseSchema, projectMembersResponseSchema, projectResponseSchema } from "./api-schemas";
import { ConfirmDialog } from "./confirm-dialog";
import { ScopePanel } from "./scope-panel";

function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <p role="alert" className="notice error">{error instanceof Error ? error.message : "Something went wrong."}</p>;
}

export function ProjectView({ projectId, onBack }: Readonly<{ projectId: string; onBack: () => void }>) {
  const queryClient = useQueryClient();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api(`/projects/${projectId}`, {}, projectResponseSchema),
  });
  const members = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: () => api(`/projects/${projectId}/members`, {}, projectMembersResponseSchema),
  });
  const leave = useMutation({
    mutationFn: () => api(`/projects/${projectId}/leave`, json("POST", { confirmed: true }), messageResponseSchema),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["work"] });
      setConfirmLeave(false);
      onBack();
    },
    onError: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["work"] }),
        project.refetch(),
        members.refetch(),
      ]);
    },
  });

  if (project.isPending) return <p role="status">Loading project…</p>;
  if (project.error) return <ErrorNote error={project.error} />;
  const item = project.data.project;

  return (
    <section>
      <button className="back" onClick={onBack}>← Your work</button>
      <div className="project-hero">
        <div>
          <p className="eyebrow">{item.client.name}</p>
          <h1>{item.name}</h1>
          {item.role === "service-team-member" && (item.client.companyName || item.client.primaryContactEmail) && (
            <p className="fine">{[item.client.companyName, item.client.primaryContactEmail].filter(Boolean).join(" · ")}</p>
          )}
          <p className="plain-text">{item.description || "No project description was added."}</p>
        </div>
        <div className="meta-box">
          <span>Your role</span><strong>{item.role.replaceAll("-", " ")}</strong>
          <span>Target deadline</span><strong>{item.targetDeadline || "Not set"}</strong>
        </div>
      </div>
      <ScopePanel projectId={projectId} />
      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Shared access</p><h2>Project members</h2></div></div>
        {members.isPending && <p role="status">Loading members…</p>}
        <ErrorNote error={members.error} />
        {members.data?.members.map((member) => (
          <div className="member" key={`${member.id}-${member.role}`}>
            <span className="avatar">{member.displayName.slice(0, 1).toUpperCase()}</span>
            <div><strong>{member.displayName}</strong><p>{member.role.replaceAll("-", " ")}</p></div>
          </div>
        ))}
      </section>
      {item.role.startsWith("client-") && <button className="danger" onClick={() => setConfirmLeave(true)}>Leave project</button>}
      <ErrorNote error={leave.error} />
      {confirmLeave && (
        <ConfirmDialog
          title={`Leave ${item.name}?`}
          description="Your access ends immediately. Returning later requires a new invitation from the workspace owner."
          confirmLabel="Leave project"
          busy={leave.isPending}
          onCancel={() => setConfirmLeave(false)}
          onConfirm={() => leave.mutate()}
        />
      )}
    </section>
  );
}
