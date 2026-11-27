import { Router } from "express";
import { batchTimeEntriesSchema, updateTimeEntrySchema } from "@aires/shared";
import { z } from "zod";
import { AppError } from "../errors.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import { adminClient } from "../supabase.js";
import { writeAudit } from "../services/audit.js";
import { loadTimeEntries, mapTimeEntry } from "../services/workforce.js";

export const timeEntriesRouter = Router();
const writableRoles = ["owner", "admin", "finance"] as const;
timeEntriesRouter.use(requireAuth);

const translateTimeEntryError = (error: { message: string }): never => {
  if (error.message.includes("closed_time_entry")) {
    throw new AppError(409, "closed_time_entry", "A jornada já pertence a um fechamento e não pode ser alterada.");
  }
  if (error.message.includes("duplicate_time_entry")) {
    throw new AppError(409, "duplicate_time_entry", "Já existe uma jornada incompatível para este trabalhador nessa data.");
  }
  if (error.message.includes("invalid_time_range")) {
    throw new AppError(422, "invalid_time_range", "O horário final deve ser posterior ao horário inicial.");
  }
  if (error.message.includes("invalid_break")) {
    throw new AppError(422, "invalid_break", "O intervalo deve ser menor que a duração da jornada.");
  }
  if (error.message.includes("time_required")) {
    throw new AppError(422, "time_required", "Informe os horários para uma jornada por horas.");
  }
  throw error;
};

timeEntriesRouter.get("/", async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const from = z.iso.date().default(today).parse(req.query.from);
  const to = z.iso.date().default(from).parse(req.query.to);
  if (to < from) throw new AppError(400, "invalid_period", "O fim do período deve ser igual ou posterior ao início.");
  const workerId = z.uuid().optional().parse(req.query.workerId);
  const projectId = z.uuid().optional().parse(req.query.projectId);
  const filters: { from: string; to: string; workerId?: string; projectId?: string } = { from, to };
  if (workerId) filters.workerId = workerId;
  if (projectId) filters.projectId = projectId;
  const entries = await loadTimeEntries(req.auth.organizationId, filters);
  const present = entries.filter((entry) => !["absence", "day_off"].includes(entry.status));
  res.json({
    entries,
    summary: {
      presentCount: new Set(present.map((entry) => `${entry.workerId}:${entry.workDate}`)).size,
      absenceCount: entries.filter((entry) => entry.status === "absence").length,
      dayOffCount: entries.filter((entry) => entry.status === "day_off").length,
      workedMinutes: entries.reduce((total, entry) => total + entry.workedMinutes, 0),
    },
  });
});

timeEntriesRouter.post("/", allowRoles(...writableRoles), async (req, res) => {
  const input = batchTimeEntriesSchema.parse(req.body);
  const rows = input.entries.map((entry) => ({
    organization_id: req.auth.organizationId,
    worker_id: entry.workerId,
    project_id: entry.projectId,
    work_date: entry.workDate,
    status: entry.status,
    start_time: entry.startTime,
    end_time: entry.endTime,
    break_minutes: entry.breakMinutes,
    note: entry.note,
    created_by: req.auth.user.id,
    updated_by: req.auth.user.id,
  }));
  const { data, error } = await adminClient.from("time_entries").insert(rows)
    .select("id, organization_id, worker_id, project_id, work_date, status, start_time, end_time, break_minutes, worked_minutes, note, payroll_closure_id, created_by, created_at, updated_at");
  if (error) translateTimeEntryError(error);
  const entries = (data ?? []).map((row) => mapTimeEntry(row as Parameters<typeof mapTimeEntry>[0]));
  await Promise.all(entries.map((entry) => writeAudit({
    organizationId: req.auth.organizationId,
    actorUserId: req.auth.user.id,
    action: "time_entry.created",
    entityType: "time_entry",
    entityId: entry.id,
    metadata: { workerId: entry.workerId, projectId: entry.projectId, workDate: entry.workDate },
  })));
  res.status(201).json({ entries });
});

timeEntriesRouter.patch("/:entryId", allowRoles(...writableRoles), async (req, res) => {
  const entryId = z.uuid().parse(req.params.entryId);
  const input = updateTimeEntrySchema.parse(req.body);
  const { data: existing, error: existingError } = await adminClient.from("time_entries")
    .select("id, payroll_closure_id").eq("organization_id", req.auth.organizationId).eq("id", entryId).single();
  if (existingError || !existing) throw new AppError(404, "time_entry_not_found", "Jornada não encontrada.");
  if (existing.payroll_closure_id) throw new AppError(409, "closed_time_entry", "A jornada já pertence a um fechamento.");
  const patch: Record<string, unknown> = { updated_by: req.auth.user.id };
  if (input.projectId !== undefined) patch.project_id = input.projectId;
  if (input.workDate !== undefined) patch.work_date = input.workDate;
  if (input.status !== undefined) patch.status = input.status;
  if (input.startTime !== undefined) patch.start_time = input.startTime;
  if (input.endTime !== undefined) patch.end_time = input.endTime;
  if (input.breakMinutes !== undefined) patch.break_minutes = input.breakMinutes;
  if (input.note !== undefined) patch.note = input.note;
  const { data, error } = await adminClient.from("time_entries").update(patch)
    .eq("organization_id", req.auth.organizationId).eq("id", entryId)
    .select("id, organization_id, worker_id, project_id, work_date, status, start_time, end_time, break_minutes, worked_minutes, note, payroll_closure_id, created_by, created_at, updated_at").single();
  if (error) translateTimeEntryError(error);
  await writeAudit({ organizationId: req.auth.organizationId, actorUserId: req.auth.user.id,
    action: "time_entry.updated", entityType: "time_entry", entityId: entryId,
    metadata: { fields: Object.keys(input) } });
  res.json(mapTimeEntry(data as Parameters<typeof mapTimeEntry>[0]));
});
