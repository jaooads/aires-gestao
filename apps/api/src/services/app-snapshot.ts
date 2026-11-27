import type {
  AppSnapshotResponse,
  ContractPricingModel,
  ContractRecord,
  ContractStageRecord,
  FinancialEntryRecord,
  OrganizationRole,
  ProjectRecord,
  ProjectStatus,
  WorkerPaymentModel,
  WorkerRecord,
} from "@aires/shared";
import { AppError } from "../errors.js";
import { adminClient } from "../supabase.js";
import {
  calculateFinancialTotals,
  sumCents,
} from "./financial-calculations.js";

const cents = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new AppError(500, "invalid_money_data", "O banco retornou um valor monetário inválido.");
  }
  return parsed;
};

const nullableCents = (value: unknown): number | null => (value === null ? null : cents(value));

type QueryResult = { data: unknown; error: { message: string } | null };
const rows = <T>(result: QueryResult): T[] => {
  if (result.error) throw result.error;
  return (result.data ?? []) as T[];
};

export async function loadAppSnapshot(
  organizationId: string,
  role: OrganizationRole,
): Promise<AppSnapshotResponse> {
  const [organizationResult, projectsResult, workersResult, contractsResult, stagesResult,
    assignmentsResult, advancesResult, expensesResult, receiptsResult,
    payrollResult, payrollAllocationsResult] =
    await Promise.all([
      adminClient.from("organizations").select("id, name").eq("id", organizationId).single(),
      adminClient.from("projects").select("id, name, client_name, address, description, status, expected_cost_cents, starts_on, ends_on, created_at, updated_at").eq("organization_id", organizationId).order("created_at", { ascending: false }),
      adminClient.from("workers").select("id, name, role_title, compensation_model, payment_frequency, daily_rate_cents, hourly_rate_cents, weekly_rate_cents, normal_week_days, phone, active, created_at, updated_at").eq("organization_id", organizationId).order("name"),
      adminClient.from("contracts").select("id, project_id, name, pricing_model, contracted_amount_cents, hourly_rate_cents, expected_cost_cents, starts_on, ends_on, active").eq("organization_id", organizationId).order("created_at"),
      adminClient.from("contract_stages").select("id, contract_id, name, sequence, planned_amount_cents, expected_cost_cents, completed_on").eq("organization_id", organizationId).order("sequence"),
      adminClient.from("project_workers").select("project_id, worker_id").eq("organization_id", organizationId),
      adminClient.from("worker_advances").select("id, project_id, worker_id, amount_cents, paid_on, note, compensated_by_closure_id, reversed_by, created_at").eq("organization_id", organizationId),
      adminClient.from("expenses").select("id, project_id, description, category, amount_cents, incurred_on, created_at").eq("organization_id", organizationId),
      adminClient.from("receipts").select("id, project_id, contract_id, description, amount_cents, received_on, created_at").eq("organization_id", organizationId),
      adminClient.from("payroll_closures").select("id, worker_id, gross_cents, advances_cents, additions_cents, deductions_cents, net_cents, paid_on, paid_at, created_at").eq("organization_id", organizationId).eq("status", "paid"),
      adminClient.from("payroll_allocations").select("payroll_closure_id, project_id, amount_cents").eq("organization_id", organizationId),
    ]);

  if (organizationResult.error) throw organizationResult.error;
  if (!organizationResult.data) throw new AppError(404, "organization_not_found", "Empresa não encontrada.");

  type ProjectRow = { id: string; name: string; client_name: string; address: string | null; description: string | null; status: ProjectStatus; expected_cost_cents: unknown; starts_on: string | null; ends_on: string | null; created_at: string; updated_at: string };
  type WorkerRow = { id: string; name: string; role_title: string; compensation_model: WorkerPaymentModel; payment_frequency: WorkerRecord["paymentFrequency"]; daily_rate_cents: unknown | null; hourly_rate_cents: unknown | null; weekly_rate_cents: unknown | null; normal_week_days: number; phone: string | null; active: boolean; created_at: string; updated_at: string };
  type ContractRow = { id: string; project_id: string; name: string; pricing_model: ContractPricingModel; contracted_amount_cents: unknown | null; hourly_rate_cents: unknown | null; expected_cost_cents: unknown; starts_on: string | null; ends_on: string | null; active: boolean };
  type StageRow = { id: string; contract_id: string; name: string; sequence: number; planned_amount_cents: unknown; expected_cost_cents: unknown; completed_on: string | null };
  type AssignmentRow = { project_id: string; worker_id: string };
  type AdvanceRow = { id: string; project_id: string; worker_id: string; amount_cents: unknown; paid_on: string; note: string | null; compensated_by_closure_id: string | null; reversed_by: string | null; created_at: string };
  type ExpenseRow = { id: string; project_id: string | null; description: string; category: string; amount_cents: unknown; incurred_on: string; created_at: string };
  type ReceiptRow = { id: string; project_id: string; contract_id: string | null; description: string; amount_cents: unknown; received_on: string; created_at: string };
  type PayrollRow = { id: string; worker_id: string; gross_cents: unknown; advances_cents: unknown; additions_cents: unknown; deductions_cents: unknown; net_cents: unknown; paid_on: string; paid_at: string | null; created_at: string };
  type PayrollAllocationRow = { payroll_closure_id: string; project_id: string; amount_cents: unknown };

  const projectRows = rows<ProjectRow>(projectsResult);
  const workerRows = rows<WorkerRow>(workersResult);
  const contractRows = rows<ContractRow>(contractsResult);
  const stageRows = rows<StageRow>(stagesResult);
  const assignments = rows<AssignmentRow>(assignmentsResult);
  const advances = rows<AdvanceRow>(advancesResult);
  const expenses = rows<ExpenseRow>(expensesResult);
  const receipts = rows<ReceiptRow>(receiptsResult);
  const payrolls = rows<PayrollRow>(payrollResult);
  const payrollAllocations = rows<PayrollAllocationRow>(payrollAllocationsResult).filter((item) => payrolls.some((payroll) => payroll.id === item.payroll_closure_id));

  const contracts: ContractRecord[] = contractRows.map((row) => ({
    id: row.id, projectId: row.project_id, name: row.name, pricingModel: row.pricing_model,
    contractedAmountCents: nullableCents(row.contracted_amount_cents),
    hourlyRateCents: nullableCents(row.hourly_rate_cents), expectedCostCents: cents(row.expected_cost_cents),
    startsOn: row.starts_on, endsOn: row.ends_on, active: row.active,
  }));
  const contractStages: ContractStageRecord[] = stageRows.map((row) => ({
    id: row.id, contractId: row.contract_id, name: row.name, sequence: row.sequence,
    plannedAmountCents: cents(row.planned_amount_cents), expectedCostCents: cents(row.expected_cost_cents),
    completedOn: row.completed_on,
  }));

  const projectTotals = (projectId: string) => {
    const projectContracts = contracts.filter((contract) => contract.projectId === projectId);
    const contractedCents = sumCents(projectContracts.map((contract) => contract.contractedAmountCents ?? 0));
    const contractExpectedCosts = sumCents(projectContracts.map((contract) => contract.expectedCostCents));
    const projectExpenses = expenses.filter((item) => item.project_id === projectId);
    const projectReceipts = receipts.filter((item) => item.project_id === projectId);
    const projectAdvances = advances.filter((item) => item.project_id === projectId);
    const laborCostCents = sumCents(payrollAllocations.filter((item) => item.project_id === projectId).map((item) => cents(item.amount_cents)));
    return {
      contractedCents,
      contractExpectedCosts,
      receivedCents: sumCents(projectReceipts.map((item) => cents(item.amount_cents))),
      expenseCents: sumCents(projectExpenses.map((item) => cents(item.amount_cents))),
      advanceCents: sumCents(projectAdvances.map((item) => cents(item.amount_cents))),
      laborCostCents,
    };
  };

  const projects: ProjectRecord[] = projectRows.map((row) => {
    const totals = projectTotals(row.id);
    const expectedCostCents = cents(row.expected_cost_cents) + totals.contractExpectedCosts;
    const calculated = calculateFinancialTotals({
      contractedCents: totals.contractedCents, expectedCostCents,
      receivedCents: totals.receivedCents, expenseCents: totals.expenseCents,
      laborCostCents: totals.laborCostCents, advanceCents: totals.advanceCents,
    });
    return {
      id: row.id, name: row.name, client: row.client_name, address: row.address,
      description: row.description, status: row.status, expectedCostCents: cents(row.expected_cost_cents),
      startsOn: row.starts_on, endsOn: row.ends_on, createdAt: row.created_at, updatedAt: row.updated_at,
      summary: {
        balanceCents: calculated.balanceCents, receivableCents: calculated.receivableCents,
        expensesCents: totals.expenseCents, advancesCents: totals.advanceCents,
        expectedProfitCents: calculated.expectedProfitCents, realizedProfitCents: calculated.realizedProfitCents,
        contractedCents: totals.contractedCents, receivedCents: totals.receivedCents,
        laborCostCents: totals.laborCostCents,
      },
    };
  });

  const workers: WorkerRecord[] = workerRows.map((row) => ({
    id: row.id, name: row.name, role: row.role_title, paymentType: row.compensation_model,
    dailyRateCents: nullableCents(row.daily_rate_cents), hourlyRateCents: nullableCents(row.hourly_rate_cents),
    weeklyRateCents: nullableCents(row.weekly_rate_cents), paymentFrequency: row.payment_frequency,
    normalWeekDays: row.normal_week_days,
    phone: row.phone, active: row.active,
    projectIds: assignments.filter((item) => item.worker_id === row.id).map((item) => item.project_id),
    pendingAdvanceCents: sumCents(advances.filter((item) => item.worker_id === row.id && !item.compensated_by_closure_id && !item.reversed_by).map((item) => cents(item.amount_cents))),
    paymentsTotalCents: sumCents(payrolls.filter((item) => item.worker_id === row.id).map((item) => cents(item.net_cents))),
    createdAt: row.created_at, updatedAt: row.updated_at,
  }));

  const entries: FinancialEntryRecord[] = [
    ...advances.map((row) => ({ id: row.id, projectId: row.project_id, workerId: row.worker_id,
      contractId: null, type: "advance" as const, description: row.note ?? "Vale ou adiantamento",
      amountCents: cents(row.amount_cents), occurredOn: row.paid_on, createdAt: row.created_at })),
    ...expenses.map((row) => ({ id: row.id, projectId: row.project_id, workerId: null,
      contractId: null, type: "expense" as const, description: row.description,
      category: row.category, amountCents: cents(row.amount_cents), occurredOn: row.incurred_on, createdAt: row.created_at })),
    ...receipts.map((row) => ({ id: row.id, projectId: row.project_id, workerId: null,
      contractId: row.contract_id, type: "receipt" as const, description: row.description,
      amountCents: cents(row.amount_cents), occurredOn: row.received_on, createdAt: row.created_at })),
    ...payrolls.map((row) => ({ id: row.id, projectId: null, workerId: row.worker_id,
      contractId: null, type: "worker_payment" as const, description: "Pagamento de trabalhador",
      amountCents: cents(row.net_cents), occurredOn: row.paid_on, createdAt: row.paid_at ?? row.created_at })),
  ].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt));

  const contractedCents = sumCents(contracts.map((item) => item.contractedAmountCents ?? 0));
  const expectedCostCents = sumCents(projects.map((item) => item.expectedCostCents)) + sumCents(contracts.map((item) => item.expectedCostCents));
  const receivedCents = sumCents(receipts.map((item) => cents(item.amount_cents)));
  const expenseCents = sumCents(expenses.map((item) => cents(item.amount_cents)));
  const advanceCents = sumCents(advances.map((item) => cents(item.amount_cents)));
  const laborCostCents = sumCents(payrollAllocations.map((item) => cents(item.amount_cents)));
  const payrollNetCents = sumCents(payrolls.map((item) => cents(item.net_cents)));
  const calculated = calculateFinancialTotals({ contractedCents, expectedCostCents, receivedCents, expenseCents, laborCostCents, advanceCents });

  return {
    organization: organizationResult.data,
    role,
    summary: {
      balanceCents: calculated.balanceCents - payrollNetCents, receivableCents: calculated.receivableCents,
      expensesCents: expenseCents, advancesCents: advanceCents,
      expectedProfitCents: calculated.expectedProfitCents, realizedProfitCents: calculated.realizedProfitCents,
    },
    projects, workers, contracts, contractStages, entries,
  };
}
