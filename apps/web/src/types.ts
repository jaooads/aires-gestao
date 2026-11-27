import type {
  PayrollAllocationRecord,
  PayrollClosureRecord,
  PayrollPreviewResponse,
  TimeEntryRecord,
  TimeEntryStatus as SharedTimeEntryStatus,
} from "@aires/shared";

export type ProjectStatus = "planning" | "active" | "paused" | "completed";
export type PricingModel = "fixed_contract" | "stage" | "hourly";

export type ContractStage = {
  id: string;
  contractId: string;
  name: string;
  sequence: number;
  plannedAmountCents: number;
  expectedCostCents: number;
};

export type Contract = {
  id: string;
  projectId: string;
  name: string;
  pricingModel: PricingModel;
  contractedAmountCents: number | null;
  hourlyRateCents: number | null;
  expectedCostCents: number;
  startsOn: string | null;
  endsOn: string | null;
  active: boolean;
  stages: ContractStage[];
};

export type Worker = {
  id: string;
  name: string;
  role: string | null;
  paymentType: "daily" | "hourly" | "weekly";
  paymentFrequency?: "daily" | "weekly" | "biweekly" | "monthly";
  dailyRateCents: number | null;
  hourlyRateCents: number | null;
  weeklyRateCents?: number | null;
  normalWeekDays?: number;
  nextClosingOn?: string | null;
  active: boolean;
  projects?: { id: string; name: string }[];
  advancesTotalCents?: number;
  paymentsTotalCents?: number;
};

export type TimeEntryStatus = SharedTimeEntryStatus;
export type TimeEntry = TimeEntryRecord;

export type TimeEntrySummary = {
  presentCount: number;
  absenceCount: number;
  dayOffCount: number;
  workedMinutes: number;
};

export type PayrollAllocation = PayrollAllocationRecord;
export type PayrollClosing = PayrollClosureRecord;
export type PayrollPreview = PayrollPreviewResponse;

export type Project = {
  id: string;
  name: string;
  client: string | null;
  address: string | null;
  status: ProjectStatus;
  active: boolean;
  contractedCents: number;
  receivedCents: number;
  spentCents: number;
  plannedCostCents: number;
  expectedProfitCents: number;
  realizedProfitCents: number;
  contracts: Contract[];
  workers: Worker[];
};

export type LedgerEntry = {
  id: string;
  type: "worker_advance" | "worker_payment" | "daily_payment" | "advance" | "expense" | "receipt" | "reversal";
  direction: "in" | "out";
  description: string;
  amountCents: number;
  occurredOn: string;
  projectId: string | null;
  projectName: string | null;
  workerId: string | null;
  workerName: string | null;
  status: "confirmed" | "pending" | "reversed";
  createdAt: string;
};

export type AuditEntry = {
  id: string;
  action: string;
  entityType: string;
  actorName: string | null;
  occurredAt: string;
};

export type AppData = {
  organization: { id: string; name: string };
  role: "owner" | "admin" | "finance" | "viewer";
  projects: Project[];
  workers: Worker[];
  ledger: LedgerEntry[];
  audit: AuditEntry[];
  summary: {
    balanceCents: number;
    receivableCents: number;
    expensesCents: number;
    advancesCents: number;
    expectedProfitCents: number;
    realizedProfitCents: number;
  };
};

export type Section = "home" | "projects" | "finance" | "people" | "more";
export type ModalKind = "project" | "worker" | "advance" | "expense" | "receipt" | "contract" | "stage" | "link-worker";
