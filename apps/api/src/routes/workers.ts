import { Router } from "express";
import { createWorkerSchema, updateWorkerSchema } from "@aires/shared";
import { z } from "zod";
import { AppError } from "../errors.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import { adminClient } from "../supabase.js";
import { loadAppSnapshot } from "../services/app-snapshot.js";
import { writeAudit } from "../services/audit.js";
import { requireOrganizationRecord } from "../services/records.js";

export const workersRouter = Router();
const writableRoles = ["owner", "admin", "finance"] as const;
workersRouter.use(requireAuth);

workersRouter.get("/", async (req, res) => {
  const snapshot = await loadAppSnapshot(req.auth.organizationId, req.auth.role);
  const active = z.enum(["true", "false"]).optional().parse(req.query.active);
  const query = z.string().trim().max(120).optional().parse(req.query.q)?.toLocaleLowerCase("pt-BR");
  res.json(snapshot.workers.filter((worker) =>
    (active === undefined || worker.active === (active === "true")) &&
    (!query || `${worker.name} ${worker.role}`.toLocaleLowerCase("pt-BR").includes(query)),
  ));
});

workersRouter.get("/:workerId", async (req, res) => {
  const workerId = z.uuid().parse(req.params.workerId);
  const snapshot = await loadAppSnapshot(req.auth.organizationId, req.auth.role);
  const worker = snapshot.workers.find((item) => item.id === workerId);
  if (!worker) throw new AppError(404, "worker_not_found", "Trabalhador não encontrado.");
  res.json({ ...worker, projects: snapshot.projects.filter((item) => worker.projectIds.includes(item.id)),
    entries: snapshot.entries.filter((item) => item.workerId === workerId) });
});

workersRouter.post("/", allowRoles(...writableRoles), async (req, res) => {
  const input = createWorkerSchema.parse(req.body);
  const { data, error } = await adminClient.from("workers").insert({
    organization_id: req.auth.organizationId, name: input.name, role_title: input.role,
    payment_model: input.paymentType === "hourly" ? "hourly" : "daily",
    compensation_model: input.paymentType, payment_frequency: input.paymentFrequency,
    daily_rate_cents: input.dailyRateCents, hourly_rate_cents: input.hourlyRateCents,
    weekly_rate_cents: input.weeklyRateCents, normal_week_days: input.normalWeekDays,
    phone: input.phone, active: input.active,
  }).select("id").single();
  if (error) throw error;
  await writeAudit({ organizationId: req.auth.organizationId, actorUserId: req.auth.user.id,
    action: "worker.created", entityType: "worker", entityId: data.id });
  res.status(201).json({ id: data.id });
});

workersRouter.patch("/:workerId", allowRoles(...writableRoles), async (req, res) => {
  const workerId = z.uuid().parse(req.params.workerId);
  await requireOrganizationRecord("workers", workerId, req.auth.organizationId);
  const input = updateWorkerSchema.parse(req.body);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.role !== undefined) patch.role_title = input.role;
  if (input.paymentType !== undefined) {
    patch.compensation_model = input.paymentType;
    patch.payment_model = input.paymentType === "hourly" ? "hourly" : "daily";
  }
  if (input.dailyRateCents !== undefined) patch.daily_rate_cents = input.dailyRateCents;
  if (input.hourlyRateCents !== undefined) patch.hourly_rate_cents = input.hourlyRateCents;
  if (input.weeklyRateCents !== undefined) patch.weekly_rate_cents = input.weeklyRateCents;
  if (input.paymentFrequency !== undefined) patch.payment_frequency = input.paymentFrequency;
  if (input.normalWeekDays !== undefined) patch.normal_week_days = input.normalWeekDays;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.active !== undefined) patch.active = input.active;
  const { error } = await adminClient.from("workers").update(patch)
    .eq("id", workerId).eq("organization_id", req.auth.organizationId);
  if (error) throw error;
  await writeAudit({ organizationId: req.auth.organizationId, actorUserId: req.auth.user.id,
    action: "worker.updated", entityType: "worker", entityId: workerId,
    metadata: { fields: Object.keys(input) } });
  res.json({ id: workerId });
});
