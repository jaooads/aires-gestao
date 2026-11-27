import { Router } from "express";
import {
  createPayrollClosureSchema,
  payrollClosureStatusSchema,
  payrollPreviewSchema,
  updatePayrollClosureStatusSchema,
} from "@aires/shared";
import { z } from "zod";
import { AppError } from "../errors.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import { adminClient } from "../supabase.js";
import { writeAudit } from "../services/audit.js";
import { loadPayrollClosures, loadPayrollPreview } from "../services/workforce.js";

export const payrollRouter = Router();
const writableRoles = ["owner", "admin", "finance"] as const;
payrollRouter.use(requireAuth);

const translatePayrollError = (error: { message: string }): never => {
  const mappings: Array<[string, number, string, string]> = [
    ["payment_already_confirmed", 409, "payment_already_confirmed", "Este fechamento já foi pago."],
    ["closure_not_in_review", 409, "closure_not_in_review", "O fechamento precisa estar em revisão."],
    ["closure_unavailable", 409, "closure_unavailable", "O fechamento não está disponível."],
    ["time_entry_unavailable", 409, "time_entry_unavailable", "Uma das jornadas já foi incluída em outro fechamento."],
    ["advance_unavailable", 409, "advance_unavailable", "Um dos vales já foi compensado ou não está disponível."],
    ["closure_values_changed", 409, "closure_values_changed", "Os valores mudaram. Refaça a revisão do fechamento."],
    ["invalid_allocation_total", 422, "invalid_allocation_total", "O rateio deve corresponder exatamente ao custo reconhecido."],
    ["negative_payroll_total", 422, "negative_payroll_total", "Os descontos superam o valor devido."],
    ["paid_closure_cannot_be_cancelled", 409, "paid_closure_cannot_be_cancelled", "Um pagamento confirmado não pode ser cancelado diretamente."],
  ];
  const mapping = mappings.find(([token]) => error.message.includes(token));
  if (mapping) throw new AppError(mapping[1], mapping[2], mapping[3]);
  throw error;
};

payrollRouter.get("/", async (req, res) => {
  const workerId = z.uuid().optional().parse(req.query.workerId);
  const status = payrollClosureStatusSchema.optional().parse(req.query.status);
  const from = z.iso.date().optional().parse(req.query.from);
  const to = z.iso.date().optional().parse(req.query.to);
  const filters: { workerId?: string; status?: NonNullable<typeof status>; from?: string; to?: string } = {};
  if (workerId) filters.workerId = workerId;
  if (status) filters.status = status;
  if (from) filters.from = from;
  if (to) filters.to = to;
  res.json({ closures: await loadPayrollClosures(req.auth.organizationId, filters) });
});

payrollRouter.get("/:closureId", async (req, res) => {
  const closureId = z.uuid().parse(req.params.closureId);
  const closure = (await loadPayrollClosures(req.auth.organizationId)).find((item) => item.id === closureId);
  if (!closure) throw new AppError(404, "closure_not_found", "Fechamento não encontrado.");
  res.json(closure);
});

payrollRouter.post("/preview", allowRoles(...writableRoles), async (req, res) => {
  const input = payrollPreviewSchema.parse(req.body);
  res.json(await loadPayrollPreview(req.auth.organizationId, input));
});

payrollRouter.post("/", allowRoles(...writableRoles), async (req, res) => {
  const input = createPayrollClosureSchema.parse(req.body);
  const preview = await loadPayrollPreview(req.auth.organizationId, input);
  if (!preview.timeEntryIds.length) {
    throw new AppError(422, "no_open_time_entries", "Não há jornadas abertas no período selecionado.");
  }
  const uniqueProjects = new Set(input.allocations.map((allocation) => allocation.projectId));
  if (uniqueProjects.size !== input.allocations.length) {
    throw new AppError(422, "duplicate_allocation", "Cada obra deve aparecer uma única vez no rateio.");
  }
  const allocationTotal = input.allocations.reduce((total, allocation) => total + allocation.amountCents, 0);
  if (allocationTotal !== preview.laborCostCents) {
    throw new AppError(422, "invalid_allocation_total", `O rateio deve somar exatamente ${preview.laborCostCents} centavos.`);
  }
  const [workerResult, projectsResult] = await Promise.all([
    adminClient.from("workers").select("compensation_model, payment_frequency, daily_rate_cents, hourly_rate_cents, weekly_rate_cents, normal_week_days")
      .eq("organization_id", req.auth.organizationId).eq("id", input.workerId).single(),
    adminClient.from("projects").select("id").eq("organization_id", req.auth.organizationId).in("id", [...uniqueProjects]),
  ]);
  if (workerResult.error) throw workerResult.error;
  if (projectsResult.error) throw projectsResult.error;
  if ((projectsResult.data ?? []).length !== uniqueProjects.size) {
    throw new AppError(422, "invalid_allocation_project", "Uma obra do rateio não pertence à empresa ativa.");
  }
  const worker = workerResult.data;
  const rateValue = worker.compensation_model === "hourly" ? worker.hourly_rate_cents
    : worker.compensation_model === "daily" ? worker.daily_rate_cents : worker.weekly_rate_cents;
  const rateCents = Number(rateValue);
  if (!Number.isSafeInteger(rateCents) || rateCents <= 0) {
    throw new AppError(422, "worker_rate_missing", "Configure o valor de remuneração do trabalhador.");
  }

  const { data: closure, error: closureError } = await adminClient.from("payroll_closures").insert({
    organization_id: req.auth.organizationId,
    worker_id: input.workerId,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    status: "review",
    compensation_model: worker.compensation_model,
    payment_frequency: worker.payment_frequency,
    rate_cents: rateCents,
    normal_week_days: worker.normal_week_days,
    full_days: preview.fullDays,
    half_days: preview.halfDays,
    absences: preview.absences,
    days_off: preview.daysOff,
    worked_minutes: preview.workedMinutes,
    gross_cents: preview.grossCents,
    advances_cents: preview.advancesCents,
    additions_cents: preview.additionsCents,
    deductions_cents: preview.deductionsCents,
    net_cents: preview.netCents,
    note: input.note,
    paid_on: input.paidOn,
    created_by: req.auth.user.id,
  }).select("id").single();
  if (closureError) throw closureError;

  try {
    const selectedAdvances = preview.pendingAdvances.filter((advance) => input.selectedAdvanceIds.includes(advance.id));
    const writes = [
      input.adjustments.length
        ? adminClient.from("payroll_adjustments").insert(input.adjustments.map((adjustment) => ({
            organization_id: req.auth.organizationId, payroll_closure_id: closure.id,
            kind: adjustment.kind, amount_cents: adjustment.amountCents,
            reason: adjustment.reason, created_by: req.auth.user.id,
          })))
        : Promise.resolve({ error: null }),
      adminClient.from("payroll_allocations").insert(input.allocations.map((allocation) => ({
        organization_id: req.auth.organizationId, payroll_closure_id: closure.id,
        project_id: allocation.projectId, amount_cents: allocation.amountCents,
      }))),
      selectedAdvances.length
        ? adminClient.from("payroll_closure_advances").insert(selectedAdvances.map((advance) => ({
            organization_id: req.auth.organizationId, payroll_closure_id: closure.id,
            worker_advance_id: advance.id, amount_cents: advance.amountCents,
          })))
        : Promise.resolve({ error: null }),
    ];
    const results = await Promise.all(writes);
    const writeError = results.find((result) => result.error)?.error;
    if (writeError) throw writeError;
    const { data: attached, error: attachError } = await adminClient.rpc("attach_payroll_time_entries", {
      p_closure_id: closure.id,
      p_time_entry_ids: preview.timeEntryIds,
      p_actor_user_id: req.auth.user.id,
      p_organization_id: req.auth.organizationId,
    });
    if (attachError) translatePayrollError(attachError);
    if (Number(attached) !== preview.timeEntryIds.length) throw new Error("Quantidade de jornadas anexadas inconsistente.");
  } catch (error) {
    await adminClient.from("payroll_closures").delete().eq("id", closure.id).eq("organization_id", req.auth.organizationId);
    throw error;
  }

  await writeAudit({ organizationId: req.auth.organizationId, actorUserId: req.auth.user.id,
    action: "payroll.review_created", entityType: "payroll_closure", entityId: closure.id,
    metadata: { workerId: input.workerId, periodStart: input.periodStart, periodEnd: input.periodEnd } });
  const created = (await loadPayrollClosures(req.auth.organizationId)).find((item) => item.id === closure.id);
  if (!created) throw new AppError(500, "closure_reload_failed", "O fechamento foi salvo, mas não pôde ser recarregado.");
  res.status(201).json(created);
});

payrollRouter.patch("/:closureId/status", allowRoles(...writableRoles), async (req, res) => {
  const closureId = z.uuid().parse(req.params.closureId);
  const input = updatePayrollClosureStatusSchema.parse(req.body);
  if (input.status === "review") {
    const { error } = await adminClient.from("payroll_closures").update({ status: "review", updated_at: new Date().toISOString() })
      .eq("organization_id", req.auth.organizationId).eq("id", closureId).eq("status", "draft");
    if (error) throw error;
  } else {
    const { error } = await adminClient.rpc("cancel_payroll_closure", {
      p_closure_id: closureId,
      p_actor_user_id: req.auth.user.id,
      p_organization_id: req.auth.organizationId,
    });
    if (error) translatePayrollError(error);
  }
  const updated = (await loadPayrollClosures(req.auth.organizationId)).find((item) => item.id === closureId);
  if (!updated) throw new AppError(404, "closure_not_found", "Fechamento não encontrado.");
  res.json(updated);
});

payrollRouter.post("/:closureId/confirm", allowRoles(...writableRoles), async (req, res) => {
  const closureId = z.uuid().parse(req.params.closureId);
  const key = z.uuid().parse(req.header("idempotency-key"));
  const { data, error } = await adminClient.rpc("confirm_payroll_closure", {
    p_closure_id: closureId,
    p_actor_user_id: req.auth.user.id,
    p_organization_id: req.auth.organizationId,
    p_idempotency_key: key,
  });
  if (error) translatePayrollError(error);
  const closure = (await loadPayrollClosures(req.auth.organizationId)).find((item) => item.id === closureId);
  if (!closure) throw new AppError(500, "closure_reload_failed", "O pagamento foi confirmado, mas não pôde ser recarregado.");
  res.status((data as { already_processed?: boolean })?.already_processed ? 200 : 201).json(closure);
});
