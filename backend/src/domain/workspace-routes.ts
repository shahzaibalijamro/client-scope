/* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose documents are serialized through explicit allow-list views in this route boundary. */
import { Router } from "express";
import mongoose, { type ClientSession } from "mongoose";
import { z } from "zod";

import { ApiError } from "../errors.js";
import { validateRequest } from "../validation.js";
import { asyncRoute, requireVerified, type AuthRequest } from "./auth.js";
import { developmentEmail, sendEmailSafely, type EmailService } from "./email.js";
import {
  Activity, Client, ClientMembership, EffectiveProjectAccess, Invitation, Project, ProjectAssignment, User,
  Workspace, WorkspaceMembership,
} from "./models.js";
import { assertBrowserMutation, hashToken, normalizeEmail, randomToken } from "./security.js";
import { projectScopeSummary } from "./scope-service.js";
import { changeControlSummary } from "./change-control-service.js";
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
  const access = await EffectiveProjectAccess.findOne({ projectId: project._id, userId }).lean();
  return access ? access.role as Role : null;
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

async function transaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result as T;
  } finally {
    await session.endSession();
  }
}

function duplicateAccess(error: unknown): never {
  if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
    throw new ApiError(409, "ACCESS_CONFLICT", "This person already has access to the project.");
  }
  throw error;
}

async function materializeExpiredInvitations(filter: Record<string, unknown>): Promise<void> {
  const now = new Date();
  const expired = await Invitation.find({ ...filter, status: "pending", expiresAt: { $lte: now } }).select("_id").lean();
  for (const candidate of expired) {
    await transaction(async (session) => {
      const invitation = await Invitation.findOneAndUpdate(
        { _id: candidate._id, status: "pending", expiresAt: { $lte: now } },
        { $set: { status: "expired", tokenHash: hashToken(randomToken()) } },
        { returnDocument: "after", session },
      );
      if (!invitation) return;
      await event({
        workspaceId: invitation.workspaceId,
        action: "invitation.expired",
        audience: "owner",
        context: {
          invitationId: String(invitation._id), kind: invitation.kind, role: invitation.role,
          systemReason: "expired-at-authoritative-time",
        },
      }, session);
    });
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

function projectView(project: any, client: any, role: Role, scope?: Awaited<ReturnType<typeof projectScopeSummary>>, changeControl?: Awaited<ReturnType<typeof changeControlSummary>>) {
  return {
    id: String(project._id), workspaceId: String(project.workspaceId), name: project.name,
    client: {
      id: String(client._id), name: client.name,
      ...(role === "service-team-member" ? {
        companyName: client.companyName,
        primaryContactEmail: client.primaryContactEmail,
      } : {}),
    },
    description: project.description,
    targetDeadline: project.targetDeadline, role, ...(scope ? { scope } : {}), ...(changeControl ? { changeControl } : {}),
  };
}

export function createWorkspaceRouter(emailService: EmailService = developmentEmail): Router {
  const router = Router();
  const sendEmail = (command: Parameters<EmailService["send"]>[0]) => sendEmailSafely(emailService, command);

  router.get("/work", asyncRoute(async (request, response) => {
    const { user } = requireVerified(request);
    const now = new Date();
    await materializeExpiredInvitations({ normalizedEmail: user.normalizedEmail });
    const [owned, joined, assignments, clientMemberships, invitations] = await Promise.all([
      Workspace.find({ ownerId: user._id }).lean(),
      WorkspaceMembership.find({ userId: user._id, status: "active" }).lean(),
      ProjectAssignment.find({ userId: user._id, status: "active" }).lean(),
      ClientMembership.find({ userId: user._id, status: "active" }).lean(),
      Invitation.find({ normalizedEmail: user.normalizedEmail, status: "pending", expiresAt: { $gt: now } }).lean(),
    ]);
    const workspaceIds = [...new Set([
      ...owned.map((item) => String(item._id)), ...joined.map((item) => String(item.workspaceId)),
      ...clientMemberships.map((item) => String(item.workspaceId)),
    ])];
    const workspaces = await Workspace.find({ _id: { $in: workspaceIds } }).lean();
    const projectIds = [...assignments.map((item) => item.projectId), ...clientMemberships.map((item) => item.projectId)];
    const ownedProjects = await Project.find({ workspaceId: { $in: owned.map((item) => item._id) } }).lean();
    const projects = await Project.find({ _id: { $in: projectIds } }).lean();
    const allProjects = [...ownedProjects, ...projects.filter((project) => !ownedProjects.some((ownedProject) => String(ownedProject._id) === String(project._id)))];
    const clients = await Client.find({ _id: { $in: allProjects.map((project) => project.clientId) } }).select("name companyName primaryContactEmail").lean();
    const clientById = new Map(clients.map((client) => [String(client._id), client]));
    const workspaceById = new Map(workspaces.map((workspace) => [String(workspace._id), workspace]));
    const groups = await Promise.all(workspaces.map(async (workspace) => ({
      id: String(workspace._id), name: workspace.name,
      relationship: String(workspace.ownerId) === String(user._id)
        ? "owner"
        : joined.some((item) => String(item.workspaceId) === String(workspace._id))
          ? "service-team-member"
          : "client",
      projects: await Promise.all(allProjects.filter((project) => String(project.workspaceId) === String(workspace._id)).map(async (project) => {
        const assignment = assignments.find((item) => String(item.projectId) === String(project._id));
        const membership = clientMemberships.find((item) => String(item.projectId) === String(project._id));
        const role: Role = String(workspace.ownerId) === String(user._id) ? "workspace-owner" : assignment ? "service-team-member" : membership!.role as Role;
        const [scope, changeControl] = await Promise.all([projectScopeSummary(project._id, role), changeControlSummary(project._id, role)]);
        return projectView(project, clientById.get(String(project.clientId)), role, scope, changeControl);
      })),
    })));
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
      const workspace = await transaction(async (session) => {
        const created = new Workspace({ name: (request.body as { name: string }).name, ownerId: user._id });
        await created.save({ session });
        await event({ workspaceId: created._id, actorId: user._id, actorName: user.displayName,
          action: "workspace.created", audience: "owner", context: { workspaceName: created.name } }, session);
        return created;
      });
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
      await owner(workspaceId, user._id);
      const client = await transaction(async (session) => {
        const created = new Client({ workspaceId, ...(request.body as object) });
        await created.save({ session });
        await event({ workspaceId, actorId: user._id, actorName: user.displayName, action: "client.created", audience: "owner", context: { clientId: String(created._id), clientName: created.name } }, session);
        return created;
      });
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
      const body = request.body as Record<string, unknown>;
      const set = Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));
      const unset = Object.fromEntries(Object.entries(body).filter(([, value]) => value === undefined).map(([key]) => [key, 1]));
      const client = await Client.findOneAndUpdate(
        { _id: params.clientId, workspaceId: params.workspaceId },
        { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
        { returnDocument: "after" },
      );
      if (!client) throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
      response.json({ client: { id: String(client._id), name: client.name, companyName: client.companyName, primaryContactEmail: client.primaryContactEmail, internalNotes: client.internalNotes } });
    }),
  );

  router.delete(
    "/workspaces/:workspaceId/clients/:clientId", validateRequest("params", clientParams), validateRequest("body", z.object({ confirmation: z.string() })),
    asyncRoute(async (request, response) => {
      assertBrowserMutation(request); const { user } = requireVerified(request); const params = request.params as any; await owner(params.workspaceId, user._id);
      await transaction(async (session) => {
        const client = await Client.findOne({ _id: params.clientId, workspaceId: params.workspaceId }).session(session);
        if (!client) throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
        if ((request.body as any).confirmation !== client.name) throw new ApiError(400, "CONFIRMATION_MISMATCH", "Type the current client name to confirm deletion.");
        if (client.projectCount > 0 || await Project.exists({ clientId: client._id }).session(session)) throw new ApiError(409, "CLIENT_HAS_PROJECTS", "This client cannot be deleted because a project is associated with it.");
        await Client.deleteOne({ _id: client._id }, { session });
        await event({ workspaceId: params.workspaceId, actorId: user._id, actorName: user.displayName, action: "client.deleted", audience: "owner", context: { clientName: client.name } }, session);
      });
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
      const project = await transaction(async (session) => {
        const sameWorkspaceClient = await Client.findOneAndUpdate(
          { _id: body.clientId, workspaceId }, { $inc: { projectCount: 1 } },
          { returnDocument: "after", session },
        );
        if (!sameWorkspaceClient) throw new ApiError(400, "INVALID_CLIENT", "Select a client from this workspace.");
        const created = new Project({ workspaceId, ...body });
        await created.save({ session });
        await event({ workspaceId, projectId: created._id, actorId: user._id, actorName: user.displayName, action: "project.created", audience: "project", context: { projectName: created.name, clientName: sameWorkspaceClient.name } }, session);
        return created;
      });
      response.status(201).json({ project: projectView(project, client, "workspace-owner") });
    }),
  );

  router.get("/projects/:projectId", validateRequest("params", projectParams), asyncRoute(async (request, response) => {
    const { user } = requireVerified(request); const project = await accessibleProject((request.params as any).projectId, user._id);
    const role = (await projectRole(project, user._id))!; const client = await Client.findById(project.clientId).lean();
    const [scope, changeControl] = await Promise.all([projectScopeSummary(project._id, role), changeControlSummary(project._id, role)]);
    response.json({ project: projectView(project, client, role, scope, changeControl) });
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
    await materializeExpiredInvitations({ workspaceId });
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
      const rawToken = randomToken();
      const now = new Date();
      const invitation = await transaction(async (session) => {
        const previous = await Invitation.findOne({
          workspaceId, projectId: body.projectId, kind: body.kind, normalizedEmail, status: "pending",
        }).session(session);
        if (previous) {
          previous.status = "revoked";
          previous.revokedAt = now;
          previous.revokedBy = user._id;
          previous.tokenHash = hashToken(randomToken());
          await previous.save({ session });
        }
        const created = new Invitation({
          workspaceId, projectId: body.projectId, kind: body.kind, normalizedEmail, displayEmail: body.email.trim(),
          role: body.role, inviterId: user._id, inviterName: user.displayName, tokenHash: hashToken(rawToken),
          status: "pending", expiresAt: new Date(now.valueOf() + 3 * 24 * 60 * 60 * 1_000), deliveryStatus: "pending",
        });
        await created.save({ session });
        if (previous) {
          previous.replacedBy = created._id;
          await previous.save({ session });
        }
        await event({
          workspaceId, actorId: user._id, actorName: user.displayName,
          action: previous ? "invitation.replaced" : "invitation.issued", audience: "owner",
          context: {
            invitationId: String(created._id), kind: created.kind, role: created.role,
            ...(previous ? { replacedInvitationId: String(previous._id) } : {}),
          },
        }, session);
        return created;
      }).catch((error: unknown) => {
        if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
          throw new ApiError(409, "STALE_STATE", "The invitation state changed. Refresh and try again.");
        }
        throw error;
      });
      const workspace = await Workspace.findById(workspaceId).lean();
      const delivery = await sendEmail({
        category: "invitation", to: invitation.displayEmail, subject: `Invitation to ${workspace!.name}`,
        text: `${process.env.FRONTEND_ORIGIN ?? "http://localhost:3000"}/invite/${rawToken}`,
      });
      invitation.deliveryStatus = delivery.delivered ? "sent" : "failed";
      await transaction(async (session) => {
        await Invitation.updateOne({ _id: invitation._id }, { $set: { deliveryStatus: invitation.deliveryStatus } }, { session });
        await event({
          workspaceId, actorId: user._id, actorName: user.displayName,
          action: "invitation.delivery-recorded", audience: "owner",
          context: { invitationId: String(invitation._id), deliveryStatus: invitation.deliveryStatus },
        }, session);
      });
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
    if (invitation.kind === "project" && (!project || String(project.workspaceId) !== String(invitation.workspaceId))) {
      throw new ApiError(404, "INVITATION_UNAVAILABLE", "This invitation is unavailable.");
    }
    const client = project ? await Client.findById(project.clientId).select("name").lean() : null;
    if (project && !client) throw new ApiError(404, "INVITATION_UNAVAILABLE", "This invitation is unavailable.");
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
    try {
      await transaction(async (session) => {
        const accepted = await Invitation.findOneAndUpdate(
          {
            _id: invitation._id, status: "pending", expiresAt: { $gt: now },
            normalizedEmail: user.normalizedEmail,
          },
          { $set: { status: "accepted", acceptedAt: now, acceptedBy: user._id, tokenHash: hashToken(randomToken()) } },
          { returnDocument: "after", session },
        );
        if (!accepted) throw new ApiError(409, "STALE_STATE", "The invitation state changed. Refresh and try again.");
        const workspace = await Workspace.findById(accepted.workspaceId).session(session);
        if (!workspace || String(workspace.ownerId) === String(user._id)) {
          throw new ApiError(409, "ACCESS_CONFLICT", "You already have access.");
        }
        if (accepted.kind === "workspace") {
          const membership = new WorkspaceMembership({
            workspaceId: accepted.workspaceId, userId: user._id, role: "service-team-member",
            status: "active", startedAt: now,
          });
          await membership.save({ session });
          await event({ workspaceId: accepted.workspaceId, actorId: user._id, actorName: user.displayName, action: "workspace-invitation.accepted", audience: "owner", context: { invitationId: String(accepted._id), membershipId: String(membership._id), role: accepted.role } }, session);
          return;
        }
        const project = await Project.findOne({ _id: accepted.projectId, workspaceId: accepted.workspaceId }).session(session);
        if (!project) throw new ApiError(409, "STALE_STATE", "The invitation target is no longer available.");
        const projectId = project._id;
        const membership = new ClientMembership({
          workspaceId: accepted.workspaceId, projectId, userId: user._id,
          role: accepted.role, status: "active", startedAt: now,
        });
        await membership.save({ session });
        const access = new EffectiveProjectAccess({
          workspaceId: accepted.workspaceId, projectId, userId: user._id,
          role: accepted.role, sourceId: membership._id,
        });
        await access.save({ session });
        await event({ workspaceId: accepted.workspaceId, projectId, actorId: user._id, actorName: user.displayName, action: "client.joined", audience: "project", context: { membershipId: String(membership._id), role: accepted.role } }, session);
      });
    } catch (error) {
      duplicateAccess(error);
    }
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
    await materializeExpiredInvitations({ _id: String(request.params.invitationId), workspaceId });
    await transaction(async (session) => {
      const invitation = await Invitation.findOneAndUpdate(
        { _id: String(request.params.invitationId), workspaceId, status: "pending", expiresAt: { $gt: new Date() } },
        { $set: { status: "revoked", revokedAt: new Date(), revokedBy: user._id, tokenHash: hashToken(randomToken()) } },
        { returnDocument: "after", session },
      );
      if (!invitation) throw new ApiError(409, "STALE_STATE", "The invitation state changed. Refresh and try again.");
      await event({ workspaceId: invitation.workspaceId, actorId: user._id, actorName: user.displayName, action: "invitation.revoked", audience: "owner", context: { invitationId: String(invitation._id), kind: invitation.kind, role: invitation.role } }, session);
    });
    response.json({ message: "Invitation revoked." });
  }));

  router.post("/projects/:projectId/assignments", validateRequest("params", projectParams), validateRequest("body", z.object({ userId: objectId })), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request); const project = await Project.findById(String(request.params.projectId));
    if (!project) throw new ApiError(404, "NOT_FOUND", "The requested resource was not found."); await owner(String(project.workspaceId), user._id);
    const targetId = new mongoose.Types.ObjectId((request.body as any).userId);
    const target = await User.findById(targetId).lean();
    if (!target) throw new ApiError(409, "MEMBERSHIP_REQUIRED", "Only an active service-team member can be assigned.");
    const assignment = await (async () => {
      try {
        return await transaction(async (session) => {
        const activeMembership = await WorkspaceMembership.exists({
          workspaceId: project.workspaceId, userId: targetId, status: "active",
        }).session(session);
        if (!activeMembership) throw new ApiError(409, "MEMBERSHIP_REQUIRED", "Only an active service-team member can be assigned.");
        const created = new ProjectAssignment({
          workspaceId: project.workspaceId, projectId: project._id, userId: targetId,
          status: "active", startedAt: new Date(),
        });
        await created.save({ session });
        const access = new EffectiveProjectAccess({
          workspaceId: project.workspaceId, projectId: project._id, userId: targetId,
          role: "service-team-member", sourceId: created._id,
        });
        await access.save({ session });
        await event({ workspaceId: project.workspaceId, projectId: project._id, actorId: user._id, actorName: user.displayName, action: "service-member.assigned", audience: "project", context: { assignmentId: String(created._id), memberName: target.displayName } }, session);
        return created;
        });
      } catch (error) {
        duplicateAccess(error);
      }
    })();
    const delivery = await sendEmail({ category: "assignment", to: target!.email, subject: `Assigned to ${project.name}`, text: "You now have access to this project in ClientScope." });
    response.status(201).json({ assignment: { id: String(assignment._id) }, warning: delivery.delivered ? undefined : "Access was granted, but notification email failed." });
  }));

  router.delete("/projects/:projectId/assignments/:assignmentId", validateRequest("params", z.object({ projectId: objectId, assignmentId: objectId })), validateRequest("body", z.object({ confirmed: z.literal(true) })), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request); const project = await Project.findById(String(request.params.projectId));
    if (!project) throw new ApiError(404, "NOT_FOUND", "The requested resource was not found."); await owner(String(project.workspaceId), user._id);
    const assignment = await transaction(async (session) => {
      const updated = await ProjectAssignment.findOneAndUpdate({ _id: request.params.assignmentId, projectId: project._id, status: "active" }, { $set: { status: "inactive", endedAt: new Date(), endedBy: user._id, endReason: "unassigned" } }, { returnDocument: "after", session });
      if (!updated) throw new ApiError(409, "STALE_STATE", "The assignment state changed. Refresh and try again.");
      const target = await User.findById(updated.userId).session(session);
      const access = await EffectiveProjectAccess.deleteOne({ projectId: project._id, userId: updated.userId, sourceId: updated._id }, { session });
      if (access.deletedCount !== 1 || !target) throw new ApiError(409, "STALE_STATE", "The assignment state changed. Refresh and try again.");
      await event({ workspaceId: project.workspaceId, projectId: project._id, actorId: user._id, actorName: user.displayName, action: "service-member.unassigned", audience: "project", context: { assignmentId: String(updated._id), memberName: target.displayName } }, session);
      return updated;
    });
    const target = await User.findById(assignment.userId).lean();
    const delivery = await sendEmail({ category: "access-removal", to: target!.email, subject: `Access removed from ${project.name}`, text: "Your project assignment has ended." });
    response.json({ message: "Project access removed.", warning: delivery.delivered ? undefined : "Access was removed, but notification email failed." });
  }));

  async function endWorkspaceMembership(request: AuthRequest, response: any, voluntary: boolean) {
    assertBrowserMutation(request); const { user: actor } = requireVerified(request); const workspaceId = String(request.params.workspaceId);
    const targetId = voluntary ? actor._id : new mongoose.Types.ObjectId(String(request.params.userId));
    const workspace = voluntary ? await Workspace.findById(workspaceId) : await owner(workspaceId, actor._id);
    if (!workspace || String(workspace.ownerId) === String(targetId)) throw new ApiError(409, "OWNER_PROTECTED", "The workspace owner cannot leave or be removed.");
    const target = await User.findById(targetId).lean();
    if (!target) throw new ApiError(409, "STALE_STATE", "The membership state changed. Refresh and try again.");
    const now = new Date(); const reason = voluntary ? "left" : "removed";
    await transaction(async (session) => {
      const membership = await WorkspaceMembership.findOneAndUpdate(
        { workspaceId, userId: targetId, status: "active" },
        { $set: { status: "inactive", endedAt: now, endedBy: actor._id, endReason: reason } },
        { returnDocument: "after", session },
      );
      if (!membership) throw new ApiError(409, "STALE_STATE", "The membership state changed. Refresh and try again.");
      const assignments = await ProjectAssignment.find({ workspaceId, userId: targetId, status: "active" }).session(session);
      await ProjectAssignment.updateMany(
        { workspaceId, userId: targetId, status: "active" },
        { $set: { status: "inactive", endedAt: now, endedBy: actor._id, endReason: voluntary ? "workspace-left" : "workspace-removed" } },
        { session },
      );
      await EffectiveProjectAccess.deleteMany({
        workspaceId, userId: targetId, sourceId: { $in: assignments.map((item) => item._id) },
      }, { session });
      await event({ workspaceId, actorId: actor._id, actorName: actor.displayName, action: `workspace-member.${reason}`, audience: "owner", context: { membershipId: String(membership._id), memberName: target.displayName } }, session);
      await Promise.all(assignments.map((assignment) => event({ workspaceId, projectId: assignment.projectId, actorId: actor._id, actorName: actor.displayName, action: "service-member.workspace-access-ended", audience: "project", context: { assignmentId: String(assignment._id), memberName: target.displayName, reason } }, session)));
    });
    const delivery = await sendEmail({ category: "access-removal", to: target!.email, subject: `Workspace access ${reason}`, text: "Your workspace and assigned-project access has ended." });
    response.json({ message: voluntary ? "You left the workspace." : "Member removed from the workspace.", warning: delivery.delivered ? undefined : "Access changed, but notification email failed." });
  }
  router.post("/workspaces/:workspaceId/leave", validateRequest("params", idParams), validateRequest("body", z.object({ confirmed: z.literal(true) })), asyncRoute((request, response) => endWorkspaceMembership(request, response, true)));
  router.delete("/workspaces/:workspaceId/members/:userId", validateRequest("params", z.object({ workspaceId: objectId, userId: objectId })), validateRequest("body", z.object({ confirmed: z.literal(true) })), asyncRoute((request, response) => endWorkspaceMembership(request, response, false)));

  router.patch("/projects/:projectId/client-members/:membershipId/role", validateRequest("params", z.object({ projectId: objectId, membershipId: objectId })), validateRequest("body", z.object({ role: z.enum(["client-participant", "client-approver"]), confirmed: z.literal(true) })), asyncRoute(async (request, response) => {
    assertBrowserMutation(request); const { user } = requireVerified(request); const project = await Project.findById(String(request.params.projectId));
    if (!project) throw new ApiError(404, "NOT_FOUND", "The requested resource was not found."); await owner(String(project.workspaceId), user._id);
    const nextRole = (request.body as any).role as "client-participant" | "client-approver";
    const result = await transaction(async (session) => {
      const membership = await ClientMembership.findOne({ _id: String(request.params.membershipId), projectId: project._id, status: "active" }).session(session);
      if (!membership) throw new ApiError(409, "STALE_STATE", "The membership state changed. Refresh and try again.");
      if (membership.role === nextRole) throw new ApiError(409, "STALE_STATE", "The member already has that role.");
      const target = await User.findById(membership.userId).session(session);
      if (!target) throw new ApiError(409, "STALE_STATE", "The membership state changed. Refresh and try again.");
      const previousRole = membership.role;
      membership.status = "inactive";
      membership.endedAt = new Date();
      membership.endedBy = user._id;
      membership.endReason = "role-changed";
      await membership.save({ session });
      const replacement = new ClientMembership({
        workspaceId: membership.workspaceId, projectId: membership.projectId, userId: membership.userId,
        role: nextRole, status: "active", startedAt: new Date(),
      });
      await replacement.save({ session });
      const access = await EffectiveProjectAccess.updateOne(
        { projectId: project._id, userId: membership.userId, sourceId: membership._id },
        { $set: { role: nextRole, sourceId: replacement._id } },
        { session },
      );
      if (access.modifiedCount !== 1) throw new ApiError(409, "STALE_STATE", "The membership state changed. Refresh and try again.");
      await event({ workspaceId: project.workspaceId, projectId: project._id, actorId: user._id, actorName: user.displayName, action: "client-member.role-changed", audience: "project", context: { membershipId: String(replacement._id), memberName: target.displayName, previousRole, role: nextRole } }, session);
      return { replacement, target };
    });
    const delivery = await sendEmail({ category: "role-change", to: result.target.email, subject: `Role changed for ${project.name}`, text: `Your role is now ${result.replacement.role}.` });
    response.json({ message: "Role changed.", role: result.replacement.role, warning: delivery.delivered ? undefined : "The role changed, but notification email failed." });
  }));

  async function endClientMembership(request: AuthRequest, response: any, voluntary: boolean) {
    assertBrowserMutation(request); const { user: actor } = requireVerified(request); const project = await Project.findById(String(request.params.projectId));
    if (!project) throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
    if (!voluntary) await owner(String(project.workspaceId), actor._id);
    const membership = await transaction(async (session) => {
      const query: any = { projectId: project._id, status: "active" };
      if (voluntary) query.userId = actor._id; else query._id = request.params.membershipId;
      const updated = await ClientMembership.findOneAndUpdate(query, { $set: { status: "inactive", endedAt: new Date(), endedBy: actor._id, endReason: voluntary ? "left" : "removed" } }, { returnDocument: "after", session });
      if (!updated) throw new ApiError(409, "STALE_STATE", "The membership state changed. Refresh and try again.");
      const target = await User.findById(updated.userId).session(session);
      const access = await EffectiveProjectAccess.deleteOne({ projectId: project._id, userId: updated.userId, sourceId: updated._id }, { session });
      if (access.deletedCount !== 1 || !target) throw new ApiError(409, "STALE_STATE", "The membership state changed. Refresh and try again.");
      await event({ workspaceId: project.workspaceId, projectId: project._id, actorId: actor._id, actorName: actor.displayName, action: voluntary ? "client-member.left" : "client-member.removed", audience: "project", context: { membershipId: String(updated._id), memberName: target.displayName, role: updated.role } }, session);
      return updated;
    });
    const target = await User.findById(membership.userId).lean();
    const delivery = await sendEmail({ category: "access-removal", to: target!.email, subject: `Access ended for ${project.name}`, text: "Your access to this project has ended." });
    response.json({ message: voluntary ? "You left the project." : "Client member removed.", warning: delivery.delivered ? undefined : "Access changed, but notification email failed." });
  }
  router.post("/projects/:projectId/leave", validateRequest("params", projectParams), validateRequest("body", z.object({ confirmed: z.literal(true) })), asyncRoute((request, response) => endClientMembership(request, response, true)));
  router.delete("/projects/:projectId/client-members/:membershipId", validateRequest("params", z.object({ projectId: objectId, membershipId: objectId })), validateRequest("body", z.object({ confirmed: z.literal(true) })), asyncRoute((request, response) => endClientMembership(request, response, false)));

  return router;
}
