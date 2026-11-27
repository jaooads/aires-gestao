import { z } from "zod";

export const organizationRoleSchema = z.enum([
  "owner",
  "admin",
  "finance",
  "viewer",
]);

export type OrganizationRole = z.infer<typeof organizationRoleSchema>;

export const advanceDraftSchema = z.object({
  workerId: z.uuid(),
  projectId: z.uuid(),
  amountCents: z.number().int().positive().max(100_000_000),
  paidOn: z.iso.date(),
  note: z.string().trim().max(500).nullable().default(null),
});

export const naturalLanguageAdvanceSchema = z.object({
  message: z.string().trim().min(3).max(1_000),
});

export const advanceProposalRequestSchema = z.union([
  z.object({ mode: z.literal("structured"), draft: advanceDraftSchema }),
  z.object({ mode: z.literal("natural_language"), ...naturalLanguageAdvanceSchema.shape }),
]);

export const confirmAdvanceSchema = z.object({
  proposalId: z.uuid(),
});

export type AdvanceDraft = z.infer<typeof advanceDraftSchema>;
export type AdvanceProposalRequest = z.infer<typeof advanceProposalRequestSchema>;

export type LookupItem = {
  id: string;
  name: string;
};

export type BootstrapResponse = {
  organization: LookupItem;
  role: OrganizationRole;
  projects: LookupItem[];
  workers: LookupItem[];
  aiEnabled: boolean;
};

export type AdvanceProposalResponse = {
  id: string;
  status: "pending" | "confirmed" | "cancelled" | "expired";
  worker: LookupItem;
  project: LookupItem;
  amountCents: number;
  paidOn: string;
  note: string | null;
  expiresAt: string;
};

export type ConfirmAdvanceResponse = {
  advanceId: string;
  proposalId: string;
  idempotencyKey: string;
  alreadyProcessed: boolean;
  confirmedAt: string;
};

export const formatBrl = (amountCents: number): string =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amountCents / 100);

const moneyCentsSchema = z.number().int().nonnegative().max(100_000_000_000);
const positiveMoneyCentsSchema = moneyCentsSchema.positive();
const nullableText = (max: number) => z.string().trim().max(max).nullable().default(null);

export const projectStatusSchema = z.enum(["planning", "active", "paused", "completed"]);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const workerPaymentModelSchema = z.enum(["daily", "hourly", "weekly"]);
export type WorkerPaymentModel = z.infer<typeof workerPaymentModelSchema>;

export const paymentFrequencySchema = z.enum(["daily", "weekly", "biweekly", "monthly"]);
export type PaymentFrequency = z.infer<typeof paymentFrequencySchema>;

const textWithFallback = (fallback: string) => z.preprocess(
  (value) => value === null || (typeof value === "string" && value.trim() === "") ? fallback : value,
  z.string().trim().min(2).max(120),
);

export const contractPricingModelSchema = z.enum(["fixed_contract", "stage", "hourly"]);
export type ContractPricingModel = z.infer<typeof contractPricingModelSchema>;

export const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  client: textWithFallback("Cliente não informado"),
  address: nullableText(300),
  description: nullableText(1_000),
  status: projectStatusSchema.default("planning"),
  expectedCostCents: moneyCentsSchema.default(0),
  startsOn: z.iso.date().nullable().default(null),
  endsOn: z.iso.date().nullable().default(null),
});

export const updateProjectSchema = createProjectSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "Informe ao menos um campo para atualizar.",
);

export const createWorkerSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    role: textWithFallback("Profissional da construção"),
    paymentType: workerPaymentModelSchema,
    dailyRateCents: positiveMoneyCentsSchema.nullable().default(null),
    hourlyRateCents: positiveMoneyCentsSchema.nullable().default(null),
    weeklyRateCents: positiveMoneyCentsSchema.nullable().default(null),
    paymentFrequency: paymentFrequencySchema.default("weekly"),
    normalWeekDays: z.number().int().min(1).max(7).default(6),
    phone: nullableText(30),
    active: z.boolean().default(true),
  })
  .superRefine((value, context) => {
    if (value.paymentType === "daily" && value.dailyRateCents === null) {
      context.addIssue({ code: "custom", path: ["dailyRateCents"], message: "Informe o valor da diária." });
    }
    if (value.paymentType === "hourly" && value.hourlyRateCents === null) {
      context.addIssue({ code: "custom", path: ["hourlyRateCents"], message: "Informe o valor por hora." });
    }
    if (value.paymentType === "weekly" && value.weeklyRateCents === null) {
      context.addIssue({ code: "custom", path: ["weeklyRateCents"], message: "Informe o valor semanal." });
    }
  });

export const updateWorkerSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    role: textWithFallback("Profissional da construção").optional(),
    paymentType: workerPaymentModelSchema.optional(),
    dailyRateCents: positiveMoneyCentsSchema.nullable().optional(),
    hourlyRateCents: positiveMoneyCentsSchema.nullable().optional(),
    weeklyRateCents: positiveMoneyCentsSchema.nullable().optional(),
    paymentFrequency: paymentFrequencySchema.optional(),
    normalWeekDays: z.number().int().min(1).max(7).optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Informe ao menos um campo para atualizar.");

export const createContractSchema = z
  .object({
    projectId: z.uuid(),
    name: z.string().trim().min(2).max(160),
    pricingModel: contractPricingModelSchema,
    contractedAmountCents: moneyCentsSchema.nullable().default(null),
    hourlyRateCents: positiveMoneyCentsSchema.nullable().default(null),
    expectedCostCents: moneyCentsSchema.default(0),
    startsOn: z.iso.date().nullable().default(null),
    endsOn: z.iso.date().nullable().default(null),
  })
  .superRefine((value, context) => {
    if (value.pricingModel === "hourly" && value.hourlyRateCents === null) {
      context.addIssue({ code: "custom", path: ["hourlyRateCents"], message: "Informe o valor por hora." });
    }
    if (value.pricingModel === "fixed_contract" && value.contractedAmountCents === null) {
      context.addIssue({ code: "custom", path: ["contractedAmountCents"], message: "Informe o valor contratado." });
    }
  });

export const updateContractSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    pricingModel: contractPricingModelSchema.optional(),
    contractedAmountCents: moneyCentsSchema.nullable().optional(),
    hourlyRateCents: positiveMoneyCentsSchema.nullable().optional(),
    expectedCostCents: moneyCentsSchema.optional(),
    startsOn: z.iso.date().nullable().optional(),
    endsOn: z.iso.date().nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Informe ao menos um campo para atualizar.");

export const createContractStageSchema = z.object({
  contractId: z.uuid(),
  name: z.string().trim().min(2).max(160),
  sequence: z.number().int().positive().max(1_000),
  plannedAmountCents: moneyCentsSchema,
  expectedCostCents: moneyCentsSchema.default(0),
  completedOn: z.iso.date().nullable().default(null),
});

export const updateContractStageSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    sequence: z.number().int().positive().max(1_000).optional(),
    plannedAmountCents: moneyCentsSchema.optional(),
    expectedCostCents: moneyCentsSchema.optional(),
    completedOn: z.iso.date().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Informe ao menos um campo para atualizar.");

export const assignProjectWorkerSchema = z.object({ workerId: z.uuid() });

export const createExpenseSchema = z.object({
  projectId: z.uuid().nullable().default(null),
  description: z.string().trim().min(2).max(300),
  category: z.string().trim().min(2).max(80).default("Geral"),
  amountCents: positiveMoneyCentsSchema,
  incurredOn: z.iso.date(),
});

export const createReceiptSchema = z.object({
  projectId: z.uuid(),
  contractId: z.uuid().nullable().default(null),
  description: z.string().trim().min(2).max(300),
  amountCents: positiveMoneyCentsSchema,
  receivedOn: z.iso.date(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateWorkerInput = z.infer<typeof createWorkerSchema>;
export type UpdateWorkerInput = z.infer<typeof updateWorkerSchema>;
export type CreateContractInput = z.infer<typeof createContractSchema>;
export type CreateContractStageInput = z.infer<typeof createContractStageSchema>;
export type UpdateContractInput = z.infer<typeof updateContractSchema>;
export type UpdateContractStageInput = z.infer<typeof updateContractStageSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type CreateReceiptInput = z.infer<typeof createReceiptSchema>;

export type FinancialSummary = {
  balanceCents: number;
  receivableCents: number;
  expensesCents: number;
  advancesCents: number;
  expectedProfitCents: number;
  realizedProfitCents: number;
};

export type ProjectRecord = {
  id: string;
  name: string;
  client: string;
  address: string | null;
  description: string | null;
  status: ProjectStatus;
  expectedCostCents: number;
  startsOn: string | null;
  endsOn: string | null;
  createdAt: string;
  updatedAt: string;
  summary: FinancialSummary & { contractedCents: number; receivedCents: number; laborCostCents: number };
};

export type WorkerRecord = {
  id: string;
  name: string;
  role: string;
  paymentType: WorkerPaymentModel;
  dailyRateCents: number | null;
  hourlyRateCents: number | null;
  weeklyRateCents: number | null;
  paymentFrequency: PaymentFrequency;
  normalWeekDays: number;
  phone: string | null;
  active: boolean;
  projectIds: string[];
  pendingAdvanceCents: number;
  paymentsTotalCents: number;
  createdAt: string;
  updatedAt: string;
};

export type ContractRecord = {
  id: string;
  projectId: string;
  name: string;
  pricingModel: ContractPricingModel;
  contractedAmountCents: number | null;
  hourlyRateCents: number | null;
  expectedCostCents: number;
  startsOn: string | null;
  endsOn: string | null;
  active: boolean;
};

export type ContractStageRecord = {
  id: string;
  contractId: string;
  name: string;
  sequence: number;
  plannedAmountCents: number;
  expectedCostCents: number;
  completedOn: string | null;
};

export type FinancialEntryRecord = {
  id: string;
  projectId: string | null;
  workerId: string | null;
  contractId: string | null;
  type: "advance" | "expense" | "receipt" | "worker_payment";
  description: string;
  amountCents: number;
  occurredOn: string;
  createdAt: string;
};

export type AppSnapshotResponse = {
  organization: LookupItem;
  role: OrganizationRole;
  summary: FinancialSummary;
  projects: ProjectRecord[];
  workers: WorkerRecord[];
  contracts: ContractRecord[];
  contractStages: ContractStageRecord[];
  entries: FinancialEntryRecord[];
};

export type MutationResponse = { id: string };
export type FinancialMutationResponse = MutationResponse & {
  ledgerEntryId: string;
  alreadyProcessed: boolean;
};

export const timeEntryStatusSchema = z.enum(["full_day", "half_day", "hourly", "absence", "day_off"]);
export type TimeEntryStatus = z.infer<typeof timeEntryStatusSchema>;

export const payrollClosureStatusSchema = z.enum(["draft", "review", "paid", "cancelled"]);
export type PayrollClosureStatus = z.infer<typeof payrollClosureStatusSchema>;

const timeEntryBaseSchema = z.object({
  workerId: z.uuid(),
  projectId: z.uuid(),
  workDate: z.iso.date(),
  status: timeEntryStatusSchema,
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
  breakMinutes: z.number().int().min(0).max(1_440).default(0),
  note: z.string().trim().max(500).nullable().default(null),
});

export const createTimeEntrySchema = timeEntryBaseSchema.superRefine((value, context) => {
  if (value.status === "hourly" && (!value.startTime || !value.endTime)) {
    context.addIssue({ code: "custom", path: ["startTime"], message: "Informe início e fim para jornada por horas." });
  }
});

export const updateTimeEntrySchema = timeEntryBaseSchema.omit({ workerId: true }).partial().refine(
  (value) => Object.keys(value).length > 0,
  "Informe ao menos um campo para atualizar.",
);

export const batchTimeEntriesSchema = z.object({ entries: z.array(createTimeEntrySchema).min(1).max(100) });

export const payrollAdjustmentSchema = z.object({
  kind: z.enum(["addition", "deduction"]),
  amountCents: positiveMoneyCentsSchema,
  reason: z.string().trim().min(3).max(300),
});

export const payrollPreviewSchema = z.object({
  workerId: z.uuid(),
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  selectedAdvanceIds: z.array(z.uuid()).max(100).default([]),
  adjustments: z.array(payrollAdjustmentSchema).max(50).default([]),
}).refine((value) => value.periodEnd >= value.periodStart, {
  path: ["periodEnd"], message: "O fim do período deve ser igual ou posterior ao início.",
}).refine((value) => new Set(value.selectedAdvanceIds).size === value.selectedAdvanceIds.length, {
  path: ["selectedAdvanceIds"], message: "Cada vale pode ser selecionado somente uma vez.",
});

export const createPayrollClosureSchema = payrollPreviewSchema.safeExtend({
  allocations: z.array(z.object({ projectId: z.uuid(), amountCents: moneyCentsSchema })).min(1).max(100),
  note: z.string().trim().max(1_000).nullable().default(null),
  paidOn: z.iso.date(),
});

export const updatePayrollClosureStatusSchema = z.object({ status: z.enum(["review", "cancelled"]) });

export type CreateTimeEntryInput = z.infer<typeof createTimeEntrySchema>;
export type UpdateTimeEntryInput = z.infer<typeof updateTimeEntrySchema>;
export type PayrollAdjustmentInput = z.infer<typeof payrollAdjustmentSchema>;
export type PayrollPreviewInput = z.infer<typeof payrollPreviewSchema>;
export type CreatePayrollClosureInput = z.infer<typeof createPayrollClosureSchema>;

export type TimeEntryRecord = {
  id: string;
  workerId: string;
  projectId: string;
  workDate: string;
  status: TimeEntryStatus;
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number;
  workedMinutes: number;
  note: string | null;
  payrollClosureId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type PayrollAllocationRecord = { projectId: string; amountCents: number };

export type PayrollPreviewResponse = {
  workerId: string;
  paymentType: WorkerPaymentModel;
  paymentFrequency: PaymentFrequency;
  periodStart: string;
  periodEnd: string;
  timeEntryIds: string[];
  fullDays: number;
  halfDays: number;
  absences: number;
  daysOff: number;
  workedMinutes: number;
  grossCents: number;
  advancesCents: number;
  additionsCents: number;
  deductionsCents: number;
  laborCostCents: number;
  netCents: number;
  suggestedAbsenceDeductionCents: number;
  pendingAdvances: Array<{ id: string; amountCents: number; paidOn: string; note: string | null }>;
  selectedAdvanceIds: string[];
  suggestedAllocations: PayrollAllocationRecord[];
};

export type PayrollClosureRecord = PayrollPreviewResponse & {
  id: string;
  status: PayrollClosureStatus;
  allocations: PayrollAllocationRecord[];
  adjustments: PayrollAdjustmentInput[];
  note: string | null;
  paidOn: string;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
};

