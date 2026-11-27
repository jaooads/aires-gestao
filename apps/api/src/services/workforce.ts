import type {
  OrganizationRole,
  PayrollClosureRecord,
  PayrollClosureStatus,
  PayrollPreviewInput,
  PayrollPreviewResponse,
  TimeEntryRecord,
  TimeEntryStatus,
  WorkerPaymentModel,
  PaymentFrequency,
} from "@aires/shared";
import { AppError } from "../errors.js";
import { adminClient } from "../supabase.js";
import { allocateCentsByWeight, calculatePayroll } from "./payroll-calculations.js";

const cents = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new AppError(500, "invalid_money_data", "O banco retornou um valor monetário inválido.");
  }
  return parsed;
};

type TimeEntryRow = {
  id: string; organization_id: string; worker_id: string; project_id: string; work_date: string;
  status: TimeEntryStatus; start_time: string | null; end_time: string | null;
  break_minutes: number; worked_minutes: number; note: string | null;
  payroll_closure_id: string | null; created_by: string; created_at: string; updated_at: string;
};

export const mapTimeEntry = (row: TimeEntryRow): TimeEntryRecord => ({
  id: row.id,
  workerId: row.worker_id,
  projectId: row.project_id,
  workDate: row.work_date,
  status: row.status,
  startTime: row.start_time,
  endTime: row.end_time,
  breakMinutes: row.break_minutes,
  workedMinutes: row.worked_minutes,
  note: row.note,
  payrollClosureId: row.payroll_closure_id,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export async function loadTimeEntries(
  organizationId: string,
  filters: { from: string; to: string; workerId?: string; projectId?: string },
): Promise<TimeEntryRecord[]> {
  let query = adminClient.from("time_entries").select("id, organization_id, worker_id, project_id, work_date, status, start_time, end_time, break_minutes, worked_minutes, note, payroll_closure_id, created_by, created_at, updated_at")
    .eq("organization_id", organizationId)
    .gte("work_date", filters.from)
    .lte("work_date", filters.to)
    .order("work_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (filters.workerId) query = query.eq("worker_id", filters.workerId);
  if (filters.projectId) query = query.eq("project_id", filters.projectId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as TimeEntryRow[]).map(mapTimeEntry);
}

type WorkerPayrollRow = {
  id: string; compensation_model: WorkerPaymentModel; payment_frequency: PaymentFrequency;
  daily_rate_cents: unknown | null; hourly_rate_cents: unknown | null; weekly_rate_cents: unknown | null;
  normal_week_days: number;
};

export async function loadPayrollPreview(
  organizationId: string,
  input: PayrollPreviewInput,
): Promise<PayrollPreviewResponse> {
  const [workerResult, entriesResult, advancesResult] = await Promise.all([
    adminClient.from("workers").select("id, compensation_model, payment_frequency, daily_rate_cents, hourly_rate_cents, weekly_rate_cents, normal_week_days")
      .eq("organization_id", organizationId).eq("id", input.workerId).single(),
    adminClient.from("time_entries").select("id, organization_id, worker_id, project_id, work_date, status, start_time, end_time, break_minutes, worked_minutes, note, payroll_closure_id, created_by, created_at, updated_at")
      .eq("organization_id", organizationId).eq("worker_id", input.workerId)
      .gte("work_date", input.periodStart).lte("work_date", input.periodEnd)
      .is("payroll_closure_id", null).order("work_date"),
    adminClient.from("worker_advances").select("id, amount_cents, paid_on, note")
      .eq("organization_id", organizationId).eq("worker_id", input.workerId)
      .is("compensated_by_closure_id", null).is("reversed_by", null)
      .lte("paid_on", input.periodEnd).order("paid_on"),
  ]);
  if (workerResult.error) {
    if (workerResult.error.code === "PGRST116") throw new AppError(404, "worker_not_found", "Trabalhador não encontrado.");
    throw workerResult.error;
  }
  if (entriesResult.error) throw entriesResult.error;
  if (advancesResult.error) throw advancesResult.error;

  const worker = workerResult.data as WorkerPayrollRow;
  const entries = ((entriesResult.data ?? []) as TimeEntryRow[]).map(mapTimeEntry);
  const pendingAdvances = (advancesResult.data ?? []).map((row) => ({
    id: row.id as string,
    amountCents: cents(row.amount_cents),
    paidOn: row.paid_on as string,
    note: row.note as string | null,
  }));
  const selected = pendingAdvances.filter((advance) => input.selectedAdvanceIds.includes(advance.id));
  if (selected.length !== new Set(input.selectedAdvanceIds).size) {
    throw new AppError(409, "advance_unavailable", "Um dos vales selecionados não está disponível para compensação.");
  }
  const rateValue = worker.compensation_model === "hourly"
    ? worker.hourly_rate_cents
    : worker.compensation_model === "daily"
      ? worker.daily_rate_cents
      : worker.weekly_rate_cents;
  if (rateValue === null) throw new AppError(422, "worker_rate_missing", "Configure o valor de remuneração do trabalhador.");
  const rateCents = cents(rateValue);
  const periodDays = Math.round((Date.parse(`${input.periodEnd}T12:00:00Z`) - Date.parse(`${input.periodStart}T12:00:00Z`)) / 86_400_000) + 1;
  const calculation = calculatePayroll({
    paymentType: worker.compensation_model,
    rateCents,
    periodDays,
    entries: entries.map((entry) => ({ projectId: entry.projectId, status: entry.status, workedMinutes: entry.workedMinutes })),
    advanceCents: selected.map((advance) => advance.amountCents),
    adjustments: input.adjustments,
  });
  const weights = entries.map((entry) => ({ projectId: entry.projectId, weight: entry.workedMinutes }));
  const suggestedAllocations = allocateCentsByWeight(calculation.laborCostCents, weights);
  const suggestedAbsenceDeductionCents = worker.compensation_model === "weekly"
    ? Math.round(rateCents / worker.normal_week_days * calculation.absences)
    : 0;

  return {
    workerId: worker.id,
    paymentType: worker.compensation_model,
    paymentFrequency: worker.payment_frequency,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    timeEntryIds: entries.map((entry) => entry.id),
    fullDays: calculation.fullDays,
    halfDays: calculation.halfDays,
    absences: calculation.absences,
    daysOff: calculation.daysOff,
    workedMinutes: calculation.workedMinutes,
    grossCents: calculation.grossCents,
    advancesCents: calculation.advancesCents,
    additionsCents: calculation.additionsCents,
    deductionsCents: calculation.deductionsCents,
    laborCostCents: calculation.laborCostCents,
    netCents: calculation.netCents,
    suggestedAbsenceDeductionCents,
    pendingAdvances,
    selectedAdvanceIds: input.selectedAdvanceIds,
    suggestedAllocations,
  };
}

type ClosureRow = {
  id: string; worker_id: string; period_start: string; period_end: string;
  status: PayrollClosureStatus; compensation_model: WorkerPaymentModel; payment_frequency: PaymentFrequency;
  full_days: number; half_days: number; absences: number; days_off: number; worked_minutes: number;
  gross_cents: unknown; advances_cents: unknown; additions_cents: unknown; deductions_cents: unknown; net_cents: unknown;
  note: string | null; paid_on: string; idempotency_key: string | null; created_at: string; updated_at: string;
};

export async function loadPayrollClosures(
  organizationId: string,
  filters: { workerId?: string; status?: PayrollClosureStatus; from?: string; to?: string } = {},
): Promise<PayrollClosureRecord[]> {
  let closureQuery = adminClient.from("payroll_closures").select("id, worker_id, period_start, period_end, status, compensation_model, payment_frequency, full_days, half_days, absences, days_off, worked_minutes, gross_cents, advances_cents, additions_cents, deductions_cents, net_cents, note, paid_on, idempotency_key, created_at, updated_at")
    .eq("organization_id", organizationId).order("period_end", { ascending: false });
  if (filters.workerId) closureQuery = closureQuery.eq("worker_id", filters.workerId);
  if (filters.status) closureQuery = closureQuery.eq("status", filters.status);
  if (filters.from) closureQuery = closureQuery.gte("period_end", filters.from);
  if (filters.to) closureQuery = closureQuery.lte("period_start", filters.to);
  const closureResult = await closureQuery;
  if (closureResult.error) throw closureResult.error;
  const closures = (closureResult.data ?? []) as ClosureRow[];
  if (!closures.length) return [];
  const ids = closures.map((closure) => closure.id);
  const [allocationsResult, adjustmentsResult, advancesResult, entriesResult] = await Promise.all([
    adminClient.from("payroll_allocations").select("payroll_closure_id, project_id, amount_cents").eq("organization_id", organizationId).in("payroll_closure_id", ids),
    adminClient.from("payroll_adjustments").select("payroll_closure_id, kind, amount_cents, reason").eq("organization_id", organizationId).in("payroll_closure_id", ids),
    adminClient.from("payroll_closure_advances").select("payroll_closure_id, worker_advance_id, active").eq("organization_id", organizationId).in("payroll_closure_id", ids),
    adminClient.from("time_entries").select("id, payroll_closure_id").eq("organization_id", organizationId).in("payroll_closure_id", ids),
  ]);
  const childError = allocationsResult.error ?? adjustmentsResult.error ?? advancesResult.error ?? entriesResult.error;
  if (childError) throw childError;

  return closures.map((closure) => {
    const allocations = (allocationsResult.data ?? []).filter((row) => row.payroll_closure_id === closure.id)
      .map((row) => ({ projectId: row.project_id as string, amountCents: cents(row.amount_cents) }));
    const adjustments = (adjustmentsResult.data ?? []).filter((row) => row.payroll_closure_id === closure.id)
      .map((row) => ({ kind: row.kind as "addition" | "deduction", amountCents: cents(row.amount_cents), reason: row.reason as string }));
    const selectedAdvanceIds = (advancesResult.data ?? []).filter((row) => row.payroll_closure_id === closure.id && row.active)
      .map((row) => row.worker_advance_id as string);
    const grossCents = cents(closure.gross_cents);
    const additionsCents = cents(closure.additions_cents);
    const deductionsCents = cents(closure.deductions_cents);
    return {
      id: closure.id,
      workerId: closure.worker_id,
      paymentType: closure.compensation_model,
      paymentFrequency: closure.payment_frequency,
      periodStart: closure.period_start,
      periodEnd: closure.period_end,
      timeEntryIds: (entriesResult.data ?? []).filter((row) => row.payroll_closure_id === closure.id).map((row) => row.id as string),
      fullDays: closure.full_days,
      halfDays: closure.half_days,
      absences: closure.absences,
      daysOff: closure.days_off,
      workedMinutes: closure.worked_minutes,
      grossCents,
      advancesCents: cents(closure.advances_cents),
      additionsCents,
      deductionsCents,
      laborCostCents: grossCents + additionsCents - deductionsCents,
      netCents: cents(closure.net_cents),
      suggestedAbsenceDeductionCents: 0,
      pendingAdvances: [],
      selectedAdvanceIds,
      suggestedAllocations: allocations,
      status: closure.status,
      allocations,
      adjustments,
      note: closure.note,
      paidOn: closure.paid_on,
      idempotencyKey: closure.idempotency_key,
      createdAt: closure.created_at,
      updatedAt: closure.updated_at,
    };
  });
}
