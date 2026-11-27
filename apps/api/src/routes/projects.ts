import { Router } from "express";
import { createProjectSchema, updateProjectSchema } from "@aires/shared";
import { z } from "zod";
import { AppError } from "../errors.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import { adminClient } from "../supabase.js";
import { loadAppSnapshot } from "../services/app-snapshot.js";
import { writeAudit } from "../services/audit.js";
import { requireOrganizationRecord } from "../services/records.js";

export const projectsRouter = Router();
const writableRoles = ["owner", "admin", "finance"] as const;

projectsRouter.use(requireAuth);

projectsRouter.get("/", async (req, res) => {
  const snapshot = await loadAppSnapshot(req.auth.organizationId, req.auth.role);
  const status = z.enum(["planning", "active", "paused", "completed"]).optional().parse(req.query.status);
  const query = z.string().trim().max(120).optional().parse(req.query.q)?.toLocaleLowerCase("pt-BR");
  res.json(snapshot.projects.filter((project) =>
    (!status || project.status === status) &&
    (!query || `${project.name} ${project.client} ${project.address ?? ""}`.toLocaleLowerCase("pt-BR").includes(query)),
  ));
});

projectsRouter.get("/:projectId", async (req, res) => {
  const projectId = z.uuid().parse(req.params.projectId);
  const snapshot = await loadAppSnapshot(req.auth.organizationId, req.auth.role);
  const project = snapshot.projects.find((item) => item.id === projectId);
  if (!project) throw new AppError(404, "project_not_found", "Obra não encontrada.");
  res.json({
    ...project,
    contracts: snapshot.contracts.filter((item) => item.projectId === projectId),
    contractStages: snapshot.contractStages.filter((stage) =>
      snapshot.contracts.some((contract) => contract.id === stage.contractId && contract.projectId === projectId)),
    workers: snapshot.workers.filter((worker) => worker.projectIds.includes(projectId)),
    entries: snapshot.entries.filter((entry) => entry.projectId === projectId),
  });
});

projectsRouter.post("/", allowRoles(...writableRoles), async (req, res) => {
  const input = createProjectSchema.parse(req.body);
  const { data, error } = await adminClient.from("projects").insert({
    organization_id: req.auth.organizationId,
    name: input.name,
    client_name: input.client,
    address: input.address,
    description: input.description,
    status: input.status,
    active: input.status !== "completed",
    expected_cost_cents: input.expectedCostCents,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
  }).select("id").single();
  if (error) throw error;
  await writeAudit({ organizationId: req.auth.organizationId, actorUserId: req.auth.user.id,
    action: "project.created", entityType: "project", entityId: data.id });
  res.status(201).json({ id: data.id });
});

projectsRouter.patch("/:projectId", allowRoles(...writableRoles), async (req, res) => {
  const projectId = z.uuid().parse(req.params.projectId);
  await requireOrganizationRecord("projects", projectId, req.auth.organizationId);
  const input = updateProjectSchema.parse(req.body);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.client !== undefined) patch.client_name = input.client;
  if (input.address !== undefined) patch.address = input.address;
  if (input.description !== undefined) patch.description = input.description;
  if (input.status !== undefined) { patch.status = input.status; patch.active = input.status !== "completed"; }
  if (input.expectedCostCents !== undefined) patch.expected_cost_cents = input.expectedCostCents;
  if (input.startsOn !== undefined) patch.starts_on = input.startsOn;
  if (input.endsOn !== undefined) patch.ends_on = input.endsOn;
  const { error } = await adminClient.from("projects").update(patch)
    .eq("id", projectId).eq("organization_id", req.auth.organizationId);
  if (error) throw error;
  await writeAudit({ organizationId: req.auth.organizationId, actorUserId: req.auth.user.id,
    action: "project.updated", entityType: "project", entityId: projectId,
    metadata: { fields: Object.keys(input) } });
  res.json({ id: projectId });
});

projectsRouter.post("/:projectId/workers", allowRoles(...writableRoles), async (req, res) => {
  const projectId = z.uuid().parse(req.params.projectId);
  const workerId = z.uuid().parse(req.body?.workerId);
  await Promise.all([
    requireOrganizationRecord("projects", projectId, req.auth.organizationId),
    requireOrganizationRecord("workers", workerId, req.auth.organizationId),
  ]);
  const { error } = await adminClient.from("project_workers").upsert({
    organization_id: req.auth.organizationId, project_id: projectId, worker_id: workerId,
    created_by: req.auth.user.id,
  }, { onConflict: "project_id,worker_id", ignoreDuplicates: true });
  if (error) throw error;
  await writeAudit({ organizationId: req.auth.organizationId, actorUserId: req.auth.user.id,
    action: "project.worker_assigned", entityType: "project", entityId: projectId,
    metadata: { workerId } });
  res.status(201).json({ id: workerId });
});

projectsRouter.delete("/:projectId/workers/:workerId", allowRoles(...writableRoles), async (req, res) => {
  const projectId = z.uuid().parse(req.params.projectId);
  const workerId = z.uuid().parse(req.params.workerId);
  const { error, count } = await adminClient.from("project_workers").delete({ count: "exact" })
    .eq("organization_id", req.auth.organizationId).eq("project_id", projectId).eq("worker_id", workerId);
  if (error) throw error;
  if (!count) throw new AppError(404, "assignment_not_found", "Vínculo não encontrado.");
  await writeAudit({ organizationId: req.auth.organizationId, actorUserId: req.auth.user.id,
    action: "project.worker_unassigned", entityType: "project", entityId: projectId,
    metadata: { workerId } });
  res.status(204).end();
});
