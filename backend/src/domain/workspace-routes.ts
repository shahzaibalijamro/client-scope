/* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose documents are serialized through explicit allow-list views in this route boundary. */
import { Router } from "express";
import mongoose, { type ClientSession } from "mongoose";
import { z } from "zod";

import { ApiError } from "../errors.js";
import { validateRequest } from "../validation.js";
import { asyncRoute, requireVerified, type AuthRequest } from "./auth.js";
import { developmentEmail, type EmailService } from "./email.js";
import {
  Activity, Client, ClientMembership, Invitation, Project, ProjectAssignment, User,
  Workspace, WorkspaceMembership,
} from "./models.js";
import { assertBrowserMutation, hashToken, normalizeEmail, randomToken } from "./security.js";
import {
  dateOnly, email, name, objectId, optionalEmail, optionalName, optionalText,
} from "./validation.js";

type Role = "workspace-owner" | "service-team-member" | "client-participant" | "client-approver";
const idParams = z.object({ workspaceId: objectId });
const projectParams = z.object({ projectId: objectId });
const clientParams = z.object({ workspaceId: objectId, clientId: objectId });

async function owner(workspaceId: string, userId: mongoose.Types.ObjectId) {
  const workspace = await Workspace.findOne({ _id: workspaceId, ownerId: userId });
  if (!workspace) throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
  return workspace;
}

async function projectRole(project: { _id: mongoose.Types.ObjectId; workspaceId: mongoose.Types.ObjectId }, userId: mongoose.Types.ObjectId): Promise<Role | null> {
  const workspace = await Workspace.findById(project.workspaceId).lean();
  if (workspace && String(workspace.ownerId) === String(userId)) return "workspace-owner";
  const assignment = await ProjectAssignment.findOne({ projectId: project._id, userId, status: "active" }).lean();
  if (assignment) return "service-team-member";
  const client = await ClientMembership.findOne({ projectId: project._id, userId, status: "active" }).lean();
  return client ? client.role as Role : null;
}

async function accessibleProject(projectId: string, userId: mongoose.Types.ObjectId) {
  const project = await Project.findById(projectId);
  if (!project || !(await projectRole(project, userId))) {
    throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
  }
  return project;
}

async function noEffectiveRole(projectId: mongoose.Types.ObjectId | string, userId: mongoose.Types.ObjectId) {
  const project = await Project.findById(projectId).lean();
  if (!project) throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
  if (await projectRole(project, userId)) {
    throw new ApiError(409, "ACCESS_CONFLICT", "This person already has access to the project.");
  }
}

function event(input: {
  workspaceId: mongoose.Types.ObjectId | string; projectId?: mongoose.Types.ObjectId | string;
  actorId?: mongoose.Types.ObjectId | string; actorName?: string;
  action: string; audience: "owner" | "project"; context: Record<string, unknown>;
}, session?: ClientSession) {
  const record = new Activity({ ...input, occurredAt: new Date() });
  return session ? record.save({ session }) : record.save();
}

function projectView(project: any, client: any, role: Role) {
  return {
    id: String(project._id), workspaceId: String(project.workspaceId), name: project.name,
    client: { id: String(client._id), name: client.name }, description: project.description,
    targetDeadline: project.targetDeadline, role,
  };
}

export function createWorkspaceRouter(emailService: EmailService = developmentEmail): Router {
  const router = Router();

  router.get("/work", asyncRoute(async (request, response) => {
    const { user } = requireVerified(request);
    const now = new Date();
    await Invitation.updateMany(
      { normalizedEmail: user.normalizedEmail, status: "pending", expiresAt: { $lte: now } },
      { $set: { status: "expired" } },
    );
    const [owned, joined, assignments, clientMemberships, invitations] = await Promise.all([
      Workspace.find({ ownerId: user._id }).lean(),
      WorkspaceMembership.find({ userId: user._id, status: "active" }).lean(),
      ProjectAssignment.find({ userId: user._id, status: "active" }).lean(),
      ClientMembership.find({ userId: user._id, status: "active" }).lean(),
      Invitation.find({ normalizedEmail: user.normalizedEmail, status: "pending", expiresAt: { $gt: now } }).lean(),
    ]);
    const workspaceIds = [...new Set([
      ...owned.map((item) => String(item._id)), ...joined.map((item) => String(item.workspaceId)),
    ])];
    const workspaces = await Workspace.find({ _id: { $in: workspaceIds } }).lean();
    const projectIds = [...assignments.map((item) => item.projectId), ...clientMemberships.map((item) => item.projectId)];
    const ownedProjects = await Project.find({ workspaceId: { $in: owned.map((item) => item._id) } }).lean();
    const projects = await Project.find({ _id: { $in: projectIds } }).lean();
    const allProjects = [...ownedProjects, ...projects.filter((project) => !ownedProjects.some((ownedProject) => String(ownedProject._id) === String(project._id)))];
    const clients = await Client.find({ _id: { $in: allProjects.map((project) => project.clientId) } }).select("name").lean();
    const clientById = new Map(clients.map((client) => [String(client._id), client]));
    const workspaceById = new Map(workspaces.map((workspace) => [String(workspace._id), workspace]));
    const groups = workspaces.map((workspace) => ({
      id: String(workspace._id), name: workspace.name,
      relationship: String(workspace.ownerId) === String(user._id) ? "owner" : "service-team-member",
      projects: allProjects.filter((project) => String(project.workspaceId) === String(workspace._id)).map((project) => {
        const assignment = assignments.find((item) => String(item.projectId) === String(project._id));
        const membership = clientMemberships.find((item) => String(item.projectId) === String(project._id));
        const role: Role = String(workspace.ownerId) === String(user._id) ? "workspace-owner" : assignment ? "service-team-member" : membership!.role as Role;
        return projectView(project, clientById.get(String(project.clientId)), role);
      }),
    }));
    const invitationViews = await Promise.all(invitations.map(async (invitation) => {
      const workspace = workspaceById.get(String(invitation.workspaceId)) ?? await Workspace.findById(invitation.workspaceId).lean();
      const project = invitation.projectId ? await Project.findById(invitation.projectId).lean() : null;
      const client = project ? await Client.findById(project.clientId).select("name").lean() : null;
      return {
        id: String(invitation._id), kind: invitation.kind, inviterName: invitation.inviterName,
        workspaceName: workspace?.name, role: invitation.role, expiresAt: invitation.expiresAt,
        projectName: project?.name, clientName: client?.name,
      };
    }));
    response.json({ invitations: invitationViews, workspaces: groups });
  }));

  router.post(
    "/workspaces", validateRequest("body", z.object({ name })),
    asyncRoute(async (request, response) => {
      assertBrowserMutation(request);
      const { user } = requireVerified(request);
      const workspace = await Workspace.create({ name: (request.body as { name: string }).name, ownerId: user._id });
      try {
        await event({ workspaceId: workspace._id, actorId: user._id, actorName: user.displayName,
          action: "workspace.created", audience: "owner", context: { workspaceName: workspace.name } });
      } catch (error) { await Workspace.deleteOne({ _id: workspace._id }); throw error; }
      response.status(201).json({ workspace: { id: String(workspace._id), name: workspace.name, role: "workspace-owner" } });
    }),
  );

  router.get("/workspaces/:workspaceId", validateRequest("params", idParams), asyncRoute(async (request, response) => {
    const { user } = requireVerified(request);
    const workspaceId = (request.params as { workspaceId: string }).workspaceId;
    const workspace = await Workspace.findById(workspaceId).lean();
    if (!workspace) throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
    const isOwner = String(workspace.ownerId) === String(user._id);
    const membership = isOwner ? null : await WorkspaceMembership.findOne({ workspaceId, userId: user._id, status: "active" }).lean();
    if (!isOwner && !membership) throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
    response.json({ workspace: { id: String(workspace._id), name: workspace.name, role: isOwner ? "workspace-owner" : "service-team-member" } });
  }));

  router.get("/workspaces/:workspaceId/clients", validateRequest("params", idParams), asyncRoute(async (request, response) => {
    const { user } = requireVerified(request); const workspaceId = (request.params as any).workspaceId;
    await owner(workspaceId, user._id);
    const clients = await Client.find({ workspaceId }).sort({ createdAt: -1 }).lean();
    response.json({ clients: clients.map((client) => ({ id: String(client._id), name: client.name, companyName: client.companyName, primaryContactEmail: client.primaryContactEmail, internalNotes: client.internalNotes })) });
  }));

  router.post(
    "/workspaces/:workspaceId/clients", validateRequest("params", idParams),
    validateRequest("body", z.object({ name, companyName: optionalName, primaryContactEmail: optionalEmail, internalNotes: optionalText(10_000) })),
    asyncRoute(async (request, response) => {
      assertBrowserMutation(request); const { user } = requireVerified(request); const workspaceId = (request.params as any).workspaceId;
      await owner(workspaceId, user._id); const client = await Client.create({ workspaceId, ...(request.body as object) });
      try { await event({ workspaceId, actorId: user._id, actorName: user.displayName, action: "client.created", audience: "owner", context: { clientId: String(client._id), clientName: client.name } }); }
      catch (error) { await Client.deleteOne({ _id: client._id }); throw error; }
      response.status(201).json({ client: { id: String(client._id), name: client.name, companyName: client.companyName, primaryContactEmail: client.primaryContactEmail, internalNotes: client.internalNotes } });
    }),
  );

  router.get("/workspaces/:workspaceId/clients/:clientId", validateRequest("params", clientParams), asyncRoute(async (request, response) => {
    const { user } = requireVerified(request); const params = request.params as any; await owner(params.workspaceId, user._id);
    const client = await Client.findOne({ _id: params.clientId, workspaceId: params.workspaceId }).lean();
    if (!client) throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
    response.json({ client: { id: String(client._id), name: client.name, companyName: client.companyName, primaryContactEmail: client.primaryContactEmail, internalNotes: client.internalNotes } });
  }));

  router.patch(
    "/workspaces/:workspaceId/clients/:clientId", validateRequest("params", clientParams),
    validateRequest("body", z.object({ name, companyName: optionalName, primaryContactEmail: optionalEmail, internalNotes: optionalText(10_000) })),
    asyncRoute(async (request, response) => {
      assertBrowserMutation(request); const { user } = requireVerified(request); const params = request.params as any; await owner(params.workspaceId, user._id);
      const client = await Client.findOneAndUpdate({ _id: params.clientId, workspaceId: params.workspaceId }, { $set: request.body }, { new: true });
      if (!client) throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
      response.json({ client: { id: String(client._id), name: client.name, companyName: client.companyName, primaryContactEmail: client.primaryContactEmail, internalNotes: client.internalNotes } });
    }),
  );

  router.delete(
    "/workspaces/:workspaceId/clients/:clientId", validateRequest("params", clientParams), validateRequest("body", z.object({ confirmation: z.string() })),
    asyncRoute(async (request, response) => {
      assertBrowserMutation(request); const { user } = requireVerified(request); const params = request.params as any; await owner(params.workspaceId, user._id);
      const client = await Client.findOne({ _id: params.clientId, workspaceId: params.workspaceId });
      if (!client) throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
      if ((request.body as any).confirmation !== client.name) throw new ApiError(400, "CONFIRMATION_MISMATCH", "Type the current client name to confirm deletion.");
      if (await Project.exists({ clientId: client._id })) throw new ApiError(409, "CLIENT_HAS_PROJECTS", "This client cannot be deleted because a project is associated with it.");
      await Client.deleteOne({ _id: client._id });
      await event({ workspaceId: params.workspaceId, actorId: user._id, actorName: user.displayName, action: "client.deleted", audience: "owner", context: { clientName: client.name } });
      response.status(204).end();
    }),
  );

  router.post(
    "/workspaces/:workspaceId/projects", validateRequest("params", idParams),
    validateRequest("body", z.object({ clientId: objectId, name, description: optionalText(5_000), targetDeadline: dateOnly.optional() })),
    asyncRoute(async (request, response) => {
      assertBrowserMutation(request); const { user } = requireVerified(request); const workspaceId = (request.params as any).workspaceId;
      await owner(workspaceId, user._id); const body = request.body as any;
      const client = await Client.findOne({ _id: body.clientId, workspaceId });
      if (!client) throw new ApiError(400, "INVALID_CLIENT", "Select a client from this workspace.");
      const project = await Project.create({ workspaceId, ...body });
      try { await event({ workspaceId, projectId: project._id, actorId: user._id, actorName: user.displayName, action: "project.created", audience: "project", context: { projectName: project.name, clientName: client.name } }); }
      catch (error) { await Project.deleteOne({ _id: project._id }); throw error; }
      response.status(201).json({ project: projectView(project, client, "workspace-owner") });
    }),
  );

  router.get("/projects/:projectId", validateRequest("params", projectParams), asyncRoute(async (request, response) => {
    const { user } = requireVerified(request); const project = await accessibleProject((request.params as any).projectId, user._id);
    const role = (await projectRole(project, user._id))!; const client = await Client.findById(project.clientId).lean();
    response.json({ project: projectView(project, client, role) });
  }));

  router.get("/projects/:projectId/members", validateRequest("params", projectParams), asyncRoute(async (request, response) => {
    const { user } = requireVerified(request); const project = await accessibleProject((request.params as any).projectId, user._id);
    const workspace = await Workspace.findById(project.workspaceId).lean();
    const [ownerUser, assignments, clients] = await Promise.all([
      User.findById(workspace!.ownerId).select("displayName email").lean(),
      ProjectAssignment.find({ projectId: project._id, status: "active" }).lean(),
      ClientMembership.find({ projectId: project._id, status: "active" }).lean(),
    ]);
    const people = await User.find({ _id: { $in: [...assignments.map((a) => a.userId), ...clients.map((c) => c.userId)] } }).select("displayName email").lean();
    const isOwner = String(workspace!.ownerId) === String(user._id);
    const personById = new Map(people.map((person) => [String(person._id), person]));
    const members = [
      { id: String(ownerUser!._id), displayName: ownerUser!.displayName, role: "workspace-owner", ...(isOwner ? { email: ownerUser!.email } : {}) },
      ...assignments.map((assignment) => { const person = personById.get(String(assignment.userId))!; return { id: String(person._id), displayName: person.displayName, role: "service-team-member", ...(isOwner ? { email: person.email } : {}) }; }),
      ...clients.map((membership) => { const person = personById.get(String(membership.userId))!; return { id: String(person._id), displayName: person.displayName, role: membership.role, ...(isOwner ? { email: person.email } : {}) }; }),
    ];
    response.json({ members });
  }));

  router.get("/workspaces/:workspaceId/access", validateRequest("params", idParams), asyncRoute(async (request, response) => {
    const { user } = requireVerified(request); const workspaceId = (request.params as any).workspaceId;
    await owner(workspaceId, user._id);
    await Invitation.updateMany({ workspaceId, status: "pending", expiresAt: { $lte: new Date() } }, { $set: { status: "expired" } });
    const [memberships, assignments, clientMemberships, invitations] = await Promise.all([
      WorkspaceMembership.find({ workspaceId }).sort({ createdAt: -1 }).lean(),
      ProjectAssignment.find({ workspaceId }).sort({ createdAt: -1 }).lean(),
      ClientMembership.find({ workspaceId }).sort({ createdAt: -1 }).lean(),
      Invitation.find({ workspaceId }).sort({ createdAt: -1 }).lean(),
    ]);
    const userIds = [...memberships.map((item) => item.userId), ...assignments.map((item) => item.userId), ...clientMemberships.map((item) => item.userId)];
    const people = await User.find({ _id: { $in: userIds } }).select("displayName email").lean();
    const personById = new Map(people.map((person) => [String(person._id), person]));
    response.json({
      workspaceMemberships: memberships.map((item) => ({
        id: String(item._id), userId: String(item.userId), displayName: personById.get(String(item.userId))?.displayName,
        email: personById.get(String(item.userId))?.email, role: item.role, status: item.status,
        startedAt: item.startedAt, endedAt: item.endedAt, endReason: item.endReason,
      })),
      assignments: assignments.map((item) => ({ id: String(item._id), projectId: String(item.projectId), userId: String(item.userId), displayName: personById.get(String(item.userId))?.displayName, status: item.status, startedAt: item.startedAt, endedAt: item.endedAt, endReason: item.endReason })),
      clientMemberships: clientMemberships.map((item) => ({ id: String(item._id), projectId: String(item.projectId), userId: String(item.userId), displayName: personById.get(String(item.userId))?.displayName, email: personById.get(String(item.userId))?.email, role: item.role, status: item.status, startedAt: item.startedAt, endedAt: item.endedAt, endReason: item.endReason })),
      invitations: invitations.map((item) => ({ id: String(item._id), projectId: item.projectId ? String(item.projectId) : undefined, kind: item.kind, email: item.displayEmail, role: item.role, status: item.status, deliveryStatus: item.deliveryStatus, expiresAt: item.expiresAt, replacedBy: item.replacedBy ? String(item.replacedBy) : undefined })),
    });
  }));

  router.post(
    "/workspaces/:workspaceId/invitations", validateRequest("params", idParams),
    validateRequest("body", z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("workspace"), email, role: z.literal("service-team-member") }),
      z.object({ kind: z.literal("project"), email, projectId: objectId, role: z.enum(["client-participant", "client-approver"]) }),
    ])),
    asyncRoute(async (request, response) => {
      assertBrowserMutation(request); const { user } = requireVerified(request); const workspaceId = (request.params as any).workspaceId;
      await owner(workspaceId, user._id); const body = request.body as any; const normalizedEmail = normalizeEmail(body.email);
      if (normalizedEmail === user.normalizedEmail) throw new ApiError(409, "ACCESS_CONFLICT", "The workspace owner already has access.");
      const recipient = await User.findOne({ normalizedEmail }).lean();
      if (body.kind === "workspace") {
        if (recipient && await WorkspaceMembership.exists({ workspaceId, userId: recipient._id, status: "active" })) throw new ApiError(409, "ACCESS_CONFLICT", "This person already has workspace access.");
      } else {
        const project = await Project.findOne({ _id: body.projectId, workspaceId }).lean();
        if (!project) throw new ApiError(400, "INVALID_PROJECT", "Select a project from this workspace.");
        if (recipient) await noEffectiveRole(project._id, recipient._id);
      }
      const now = new Date();
      const previous = await Invitation.findOne({ workspaceId, projectId: body.projectId, kind: body.kind, normalizedEmail, status: "pending" });
      if (previous) {
        previous.status = "revoked"; previous.revokedAt = now; previous.revokedBy = user._id; await previous.save();
      }
      const rawToken = randomToken();
      const invitation = await Invitation.create({
        workspaceId, projectId: body.projectId, kind: body.kind, normalizedEmail, displayEmail: body.email.trim(),
        role: body.role, inviterId: user._id, inviterName: user.displayName, tokenHash: hashToken(rawToken),
        status: "pending", expiresAt: new Date(now.valueOf() + 3 * 24 * 60 * 60 * 1_000), deliveryStatus: "sent",
      });
      const workspace = await Workspace.findById(workspaceId).lean();
      const delivery = await emailService.send({
        category: "invitation", to: invitation.displayEmail, subject: `Invitation to ${workspace!.name}`,
        text: `${process.env.FRONTEND_ORIGIN ?? "http://localhost:3000"}/invite/${rawToken}`,
      });
      invitation.deliveryStatus = delivery.delivered ? "sent" : "failed"; await invitation.save();
      if (previous) { previous.replacedBy = invitation._id; await previous.save(); }
      await event({ workspaceId, actorId: user._id, actorName: user.displayName, action: previous ? "invitation.replaced" : "invitation.issued", audience: "owner", context: { invitationId: String(invitation._id), kind: invitation.kind, role: invitation.role, deliveryStatus: invitation.deliveryStatus } });
      response.status(201).json({ invitation: { id: String(invitation._id), status: invitation.status, deliveryStatus: invitation.deliveryStatus, expiresAt: invitation.expiresAt }, warning: delivery.delivered ? undefined : "The invitation is pending, but email delivery failed. Reissue it to try again." });
    }),
  );

  async function limitedInvitation(invitation: any, user: any) {
    if (!invitation || invitation.status !== "pending" || invitation.expiresAt <= new Date() || invitation.normalizedEmail !== user.normalizedEmail) {
      throw new ApiError(404, "INVITATION_UNAVAILABLE", "This invitation is unavailable.");
    }
    const workspace = await Workspace.findById(invitation.workspaceId).lean();
    if (!workspace) throw new ApiError(404, "INVITATION_UNAVAILABLE", "This invitation is unavailable.");
    const project = invitation.projectId ? await Project.findById(invitation.projectId).lean() : null;
    const client = project ? await Client.findById(project.clientId).select("name").lean() : null;
    return { id: String(invitation._id), kind: invitation.kind, inviterName: invitation.inviterName, workspaceName: workspace.name, role: invitation.role, expiresAt: invitation.expiresAt, projectName: project?.name, clientName: client?.name };
  }

  router.get("/invitation-links/:token", asyncRoute(async (request, response) => {
    const { user } = requireVerified(request);
    const invitation = await Invitation.findOne({ tokenHash: hashToken(String(request.params.token)) }).lean();
    response.json({ invitation: await limitedInvitation(invitation, user) });
  }));

  async function acceptInvitation(request: AuthRequest, response: any, invitation: any) {
    assertBrowserMutation(request); const { user } = requireVerified(request); await limitedInvitation(invitation, user);
    const now = new Date();
    if (invitation.kind === "workspace") {
      if (await WorkspaceMembership.exists({ workspaceId: invitation.workspaceId, userId: user._id, status: "active" })) throw new ApiError(409, "ACCESS_CONFLICT", "You already have access.");
      await WorkspaceMembership.create({ workspaceId: invitation.workspaceId, userId: user._id, role: "service-team-member", status: "active", startedAt: now });
      await event({ workspaceId: invitation.workspaceId, actorId: user._id, actorName: user.displayName, action: "workspace-invitation.accepted", audience: "owner", context: { invitationId: String(invitation._id), role: invitation.role } });
    } else {
      await noEffectiveRole(invitation.projectId, user._id);
      await ClientMembership.create({ workspaceId: invitation.workspaceId, projectId: invitation.projectId, userId: user._id, role: invitation.role, status: "active", startedAt: now });
      await event({ workspaceId: invitation.workspaceId, projectId: invitation.projectId, actorId: user._id, actorName: user.displayName, action: "client.joined", audience: "project", context: { role: invitation.role } });
    }
    const result = await Invitation.updateOne({ _id: invitation._id, status: "pending", expiresAt: { $gt: now } }, { $set: { status: "accepted", acceptedAt: now, acceptedBy: user._id }, $unset: { tokenHash: 1 } });
    if (result.modifiedCount !== 1) throw new ApiError(409, "STALE_STATE", "The invitation state changed. Refresh and try again.");
    response.json({ message: "Invitation accepted.", destination: "/" });
  }

  router.post("/invitation-links/:token/accept", asyncRoute(async (request, response) => {
    const invitation = await Invitation.findOne({ tokenHash: hashToken(String(request.params.token)) });
    await acceptInvitation(request, response, invitation);
  }));
  router.post("/invitations/:invitationId/accept", validateRequest("params", z.object({ invitationId: objectId })), asyncRoute(async (request, response) => {
    const invitation = await Invitation.findById(String(request.params.invitationId));
    await acceptInvitation(request, response, invitation);
  }));

  router.post("/workspaces/:workspaceId/invitations/:invitationId/revoke", validateRequest("params", z.object({ workspaceId: objectId, invitationId: objectId })), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request); const workspaceId = String(request.params.workspaceId); await owner(workspaceId, user._id);
    const invitation = await Invitation.findOne({ _id: String(request.params.invitationId), workspaceId, status: "pending" });
    if (!invitation) throw new ApiError(409, "STALE_STATE", "The invitation state changed. Refresh and try again.");
    invitation.status = "revoked"; invitation.revokedAt = new Date(); invitation.revokedBy = user._id; invitation.tokenHash = randomToken(); await invitation.save();
    await event({ workspaceId: invitation.workspaceId, actorId: user._id, actorName: user.displayName, action: "invitation.revoked", audience: "owner", context: { kind: invitation.kind, role: invitation.role } });
    response.json({ message: "Invitation revoked." });
  }));

  router.post("/projects/:projectId/assignments", validateRequest("params", projectParams), validateRequest("body", z.object({ userId: objectId })), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request); const project = await Project.findById(String(request.params.projectId));
    if (!project) throw new ApiError(404, "NOT_FOUND", "The requested resource was not found."); await owner(String(project.workspaceId), user._id);
    const targetId = new mongoose.Types.ObjectId((request.body as any).userId);
    if (!await WorkspaceMembership.exists({ workspaceId: project.workspaceId, userId: targetId, status: "active" })) throw new ApiError(409, "MEMBERSHIP_REQUIRED", "Only an active service-team member can be assigned.");
    await noEffectiveRole(project._id, targetId);
    const assignment = await ProjectAssignment.create({ workspaceId: project.workspaceId, projectId: project._id, userId: targetId, status: "active", startedAt: new Date() });
    const target = await User.findById(targetId).lean();
    await event({ workspaceId: project.workspaceId, projectId: project._id, actorId: user._id, actorName: user.displayName, action: "service-member.assigned", audience: "project", context: { memberName: target!.displayName } });
    const delivery = await emailService.send({ category: "assignment", to: target!.email, subject: `Assigned to ${project.name}`, text: "You now have access to this project in ClientScope." });
    response.status(201).json({ assignment: { id: String(assignment._id) }, warning: delivery.delivered ? undefined : "Access was granted, but notification email failed." });
  }));

  router.delete("/projects/:projectId/assignments/:assignmentId", validateRequest("params", z.object({ projectId: objectId, assignmentId: objectId })), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request); const project = await Project.findById(String(request.params.projectId));
    if (!project) throw new ApiError(404, "NOT_FOUND", "The requested resource was not found."); await owner(String(project.workspaceId), user._id);
    const assignment = await ProjectAssignment.findOneAndUpdate({ _id: request.params.assignmentId, projectId: project._id, status: "active" }, { $set: { status: "inactive", endedAt: new Date(), endedBy: user._id, endReason: "unassigned" } }, { new: true });
    if (!assignment) throw new ApiError(409, "STALE_STATE", "The assignment state changed. Refresh and try again.");
    const target = await User.findById(assignment.userId).lean();
    await event({ workspaceId: project.workspaceId, projectId: project._id, actorId: user._id, actorName: user.displayName, action: "service-member.unassigned", audience: "project", context: { memberName: target!.displayName } });
    const delivery = await emailService.send({ category: "access-removal", to: target!.email, subject: `Access removed from ${project.name}`, text: "Your project assignment has ended." });
    response.json({ message: "Project access removed.", warning: delivery.delivered ? undefined : "Access was removed, but notification email failed." });
  }));

  async function endWorkspaceMembership(request: AuthRequest, response: any, voluntary: boolean) {
    assertBrowserMutation(request); const { user: actor } = requireVerified(request); const workspaceId = String(request.params.workspaceId);
    const targetId = voluntary ? actor._id : new mongoose.Types.ObjectId(String(request.params.userId));
    const workspace = voluntary ? await Workspace.findById(workspaceId) : await owner(workspaceId, actor._id);
    if (!workspace || String(workspace.ownerId) === String(targetId)) throw new ApiError(409, "OWNER_PROTECTED", "The workspace owner cannot leave or be removed.");
    const now = new Date(); const reason = voluntary ? "left" : "removed";
    const membership = await WorkspaceMembership.findOneAndUpdate({ workspaceId, userId: targetId, status: "active" }, { $set: { status: "inactive", endedAt: now, endedBy: actor._id, endReason: reason } }, { new: true });
    if (!membership) throw new ApiError(409, "STALE_STATE", "The membership state changed. Refresh and try again.");
    const assignments = await ProjectAssignment.find({ workspaceId, userId: targetId, status: "active" });
    await ProjectAssignment.updateMany({ workspaceId, userId: targetId, status: "active" }, { $set: { status: "inactive", endedAt: now, endedBy: actor._id, endReason: voluntary ? "workspace-left" : "workspace-removed" } });
    const target = await User.findById(targetId).lean();
    await event({ workspaceId, actorId: actor._id, actorName: actor.displayName, action: `workspace-member.${reason}`, audience: "owner", context: { memberName: target!.displayName } });
    await Promise.all(assignments.map((assignment) => event({ workspaceId, projectId: assignment.projectId, actorId: actor._id, actorName: actor.displayName, action: "service-member.workspace-access-ended", audience: "project", context: { memberName: target!.displayName, reason } })));
    const delivery = await emailService.send({ category: "access-removal", to: target!.email, subject: `Workspace access ${reason}`, text: "Your workspace and assigned-project access has ended." });
    response.json({ message: voluntary ? "You left the workspace." : "Member removed from the workspace.", warning: delivery.delivered ? undefined : "Access changed, but notification email failed." });
  }
  router.post("/workspaces/:workspaceId/leave", validateRequest("params", idParams), asyncRoute((request, response) => endWorkspaceMembership(request, response, true)));
  router.delete("/workspaces/:workspaceId/members/:userId", validateRequest("params", z.object({ workspaceId: objectId, userId: objectId })), asyncRoute((request, response) => endWorkspaceMembership(request, response, false)));

  router.patch("/projects/:projectId/client-members/:membershipId/role", validateRequest("params", z.object({ projectId: objectId, membershipId: objectId })), validateRequest("body", z.object({ role: z.enum(["client-participant", "client-approver"]), confirmed: z.literal(true) })), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request); const project = await Project.findById(String(request.params.projectId));
    if (!project) throw new ApiError(404, "NOT_FOUND", "The requested resource was not found."); await owner(String(project.workspaceId), user._id);
    const membership = await ClientMembership.findOne({ _id: String(request.params.membershipId), projectId: project._id, status: "active" });
    if (!membership) throw new ApiError(409, "STALE_STATE", "The membership state changed. Refresh and try again.");
    const previousRole = membership.role; membership.role = (request.body as any).role; await membership.save(); const target = await User.findById(membership.userId).lean();
    await event({ workspaceId: project.workspaceId, projectId: project._id, actorId: user._id, actorName: user.displayName, action: "client-member.role-changed", audience: "project", context: { memberName: target!.displayName, previousRole, role: membership.role } });
    const delivery = await emailService.send({ category: "role-change", to: target!.email, subject: `Role changed for ${project.name}`, text: `Your role is now ${membership.role}.` });
    response.json({ message: "Role changed.", role: membership.role, warning: delivery.delivered ? undefined : "The role changed, but notification email failed." });
  }));

  async function endClientMembership(request: AuthRequest, response: any, voluntary: boolean) {
    assertBrowserMutation(request); const { user: actor } = requireVerified(request); const project = await Project.findById(String(request.params.projectId));
    if (!project) throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
    if (!voluntary) await owner(String(project.workspaceId), actor._id);
    const query: any = { projectId: project._id, status: "active" };
    if (voluntary) query.userId = actor._id; else query._id = request.params.membershipId;
    const membership = await ClientMembership.findOneAndUpdate(query, { $set: { status: "inactive", endedAt: new Date(), endedBy: actor._id, endReason: voluntary ? "left" : "removed" } }, { new: true });
    if (!membership) throw new ApiError(409, "STALE_STATE", "The membership state changed. Refresh and try again.");
    const target = await User.findById(membership.userId).lean();
    await event({ workspaceId: project.workspaceId, projectId: project._id, actorId: actor._id, actorName: actor.displayName, action: voluntary ? "client-member.left" : "client-member.removed", audience: "project", context: { memberName: target!.displayName, role: membership.role } });
    const delivery = await emailService.send({ category: "access-removal", to: target!.email, subject: `Access ended for ${project.name}`, text: "Your access to this project has ended." });
    response.json({ message: voluntary ? "You left the project." : "Client member removed.", warning: delivery.delivered ? undefined : "Access changed, but notification email failed." });
  }
  router.post("/projects/:projectId/leave", validateRequest("params", projectParams), asyncRoute((request, response) => endClientMembership(request, response, true)));
  router.delete("/projects/:projectId/client-members/:membershipId", validateRequest("params", z.object({ projectId: objectId, membershipId: objectId })), asyncRoute((request, response) => endClientMembership(request, response, false)));

  return router;
}
