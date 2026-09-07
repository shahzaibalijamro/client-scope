import { z } from "zod";

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  verified: z.boolean(),
}).strict();

export const sessionResponseSchema = z.object({ user: userSchema.nullable() }).strict();

export const projectSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  client: z.object({
    id: z.string(),
    name: z.string(),
    companyName: z.string().optional(),
    primaryContactEmail: z.string().email().optional(),
  }).strict(),
  description: z.string().optional(),
  targetDeadline: z.string().optional(),
  role: z.enum(["workspace-owner", "service-team-member", "client-participant", "client-approver"]),
}).strict();

export const invitationSchema = z.object({
  id: z.string(),
  kind: z.enum(["workspace", "project"]),
  inviterName: z.string(),
  workspaceName: z.string(),
  role: z.enum(["service-team-member", "client-participant", "client-approver"]),
  expiresAt: z.string(),
  projectName: z.string().optional(),
  clientName: z.string().optional(),
}).strict();

export const workspaceGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  relationship: z.enum(["owner", "service-team-member", "client"]),
  projects: z.array(projectSchema),
}).strict();

export const workResponseSchema = z.object({
  invitations: z.array(invitationSchema),
  workspaces: z.array(workspaceGroupSchema),
}).strict();

export const clientSchema = z.object({
  id: z.string(),
  name: z.string(),
  companyName: z.string().optional(),
  primaryContactEmail: z.string().optional(),
  internalNotes: z.string().optional(),
}).strict();

export const clientsResponseSchema = z.object({ clients: z.array(clientSchema) }).strict();
export const clientResponseSchema = z.object({ client: clientSchema }).strict();
export const projectResponseSchema = z.object({ project: projectSchema }).strict();

export const projectMembersResponseSchema = z.object({
  members: z.array(z.object({
    id: z.string(),
    displayName: z.string(),
    role: z.enum(["workspace-owner", "service-team-member", "client-participant", "client-approver"]),
    email: z.string().email().optional(),
  }).strict()),
}).strict();

const accessPeriodSchema = z.object({
  id: z.string(),
  userId: z.string(),
  displayName: z.string().optional(),
  status: z.enum(["active", "inactive"]),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  endReason: z.string().optional(),
}).strict();

export const accessResponseSchema = z.object({
  workspaceMemberships: z.array(accessPeriodSchema.extend({
    email: z.string().email().optional(),
    role: z.literal("service-team-member"),
  }).strict()),
  assignments: z.array(accessPeriodSchema.extend({ projectId: z.string() }).strict()),
  clientMemberships: z.array(accessPeriodSchema.extend({
    email: z.string().email().optional(),
    projectId: z.string(),
    role: z.enum(["client-participant", "client-approver"]),
  }).strict()),
  invitations: z.array(z.object({
    id: z.string(),
    projectId: z.string().optional(),
    kind: z.enum(["workspace", "project"]),
    email: z.string().email(),
    role: z.enum(["service-team-member", "client-participant", "client-approver"]),
    status: z.enum(["pending", "accepted", "expired", "revoked"]),
    deliveryStatus: z.enum(["pending", "sent", "failed"]),
    expiresAt: z.string(),
    replacedBy: z.string().optional(),
  }).strict()),
}).strict();

export const limitedInvitationResponseSchema = z.object({ invitation: invitationSchema }).strict();
export const messageResponseSchema = z.object({
  message: z.string().optional(),
  warning: z.string().optional(),
  role: z.string().optional(),
  destination: z.string().optional(),
}).passthrough();

export type User = z.infer<typeof userSchema>;
export type Project = z.infer<typeof projectSchema>;
export type WorkspaceGroup = z.infer<typeof workspaceGroupSchema>;
export type ClientRecord = z.infer<typeof clientSchema>;
export type AccessData = z.infer<typeof accessResponseSchema>;
