import type { PayrollAdjustmentInput, TimeEntryStatus, WorkerPaymentModel } from "@aires/shared";

export type PayrollTimeInput = {
  id?: string;
  projectId: string;
  status: TimeEntryStatus;
  workedMinutes: number;
};

const assertCents = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} deve ser inteiro não negativo.`);
};

export const calculateWorkedMinutes = (startTime: string, endTime: string, breakMinutes = 0): number => {
  const parse = (value: string): number => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new RangeError("Horário inválido.");
    const [hour, minute] = value.split(":").map(Number) as [number, number];
    return hour * 60 + minute;
  };
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0) throw new RangeError("Intervalo inválido.");
  const duration = parse(endTime) - parse(startTime);
  if (duration <= 0) throw new RangeError("O horário final deve ser posterior ao inicial.");
  if (breakMinutes >= duration) throw new RangeError("O intervalo deve ser menor que a jornada.");
  return duration - breakMinutes;
};

export type PayrollCalculationInput = {
  paymentType: WorkerPaymentModel;
  rateCents: number;
  periodDays: number;
  entries: PayrollTimeInput[];
  advanceCents: number[];
  adjustments: PayrollAdjustmentInput[];
};

export type PayrollCalculation = {
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
};

export const calculatePayroll = (input: PayrollCalculationInput): PayrollCalculation => {
  assertCents(input.rateCents, "rateCents");
  if (input.rateCents === 0) throw new RangeError("A remuneração deve ser positiva.");
  if (!Number.isInteger(input.periodDays) || input.periodDays <= 0) throw new RangeError("Período inválido.");
  input.entries.forEach((entry) => {
    if (!Number.isInteger(entry.workedMinutes) || entry.workedMinutes < 0) throw new RangeError("Duração inválida.");
  });
  input.advanceCents.forEach((value) => assertCents(value, "advanceCents"));
  input.adjustments.forEach((item) => assertCents(item.amountCents, "adjustmentCents"));

  const fullDays = input.entries.filter((entry) => entry.status === "full_day").length;
  const halfDays = input.entries.filter((entry) => entry.status === "half_day").length;
  const absences = input.entries.filter((entry) => entry.status === "absence").length;
  const daysOff = input.entries.filter((entry) => entry.status === "day_off").length;
  const workedMinutes = input.entries.reduce((total, entry) => total + entry.workedMinutes, 0);

  let grossCents: number;
  if (input.paymentType === "hourly") grossCents = Math.round(workedMinutes * input.rateCents / 60);
  else if (input.paymentType === "daily") grossCents = fullDays * input.rateCents + halfDays * Math.round(input.rateCents / 2);
  else grossCents = Math.round(input.rateCents * input.periodDays / 7);

  const advancesCents = input.advanceCents.reduce((total, value) => total + value, 0);
  const additionsCents = input.adjustments.filter((item) => item.kind === "addition").reduce((total, item) => total + item.amountCents, 0);
  const deductionsCents = input.adjustments.filter((item) => item.kind === "deduction").reduce((total, item) => total + item.amountCents, 0);
  const laborCostCents = grossCents + additionsCents - deductionsCents;
  const netCents = laborCostCents - advancesCents;
  if (laborCostCents < 0 || netCents < 0) throw new RangeError("Descontos não podem superar o valor devido.");
  return { fullDays, halfDays, absences, daysOff, workedMinutes, grossCents,
    advancesCents, additionsCents, deductionsCents, laborCostCents, netCents };
};

export const allocateCentsByWeight = (
  totalCents: number,
  weights: Array<{ projectId: string; weight: number }>,
): Array<{ projectId: string; amountCents: number }> => {
  assertCents(totalCents, "totalCents");
  const grouped = new Map<string, number>();
  for (const item of weights) {
    if (!Number.isFinite(item.weight) || item.weight < 0) throw new RangeError("Peso inválido.");
    grouped.set(item.projectId, (grouped.get(item.projectId) ?? 0) + item.weight);
  }
  const items = [...grouped].map(([projectId, weight]) => ({ projectId, weight }));
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (!items.length) return [];
  if (totalWeight === 0) {
    const base = Math.floor(totalCents / items.length);
    return items.map((item, index) => ({ projectId: item.projectId,
      amountCents: base + (index < totalCents - base * items.length ? 1 : 0) }));
  }
  const raw = items.map((item) => {
    const exact = totalCents * item.weight / totalWeight;
    return { projectId: item.projectId, amountCents: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = totalCents - raw.reduce((sum, item) => sum + item.amountCents, 0);
  const byRemainder = [...raw].sort((a, b) => b.remainder - a.remainder || a.projectId.localeCompare(b.projectId));
  for (let index = 0; index < byRemainder.length && remaining > 0; index += 1, remaining -= 1) byRemainder[index]!.amountCents += 1;
  return raw
    .sort((a, b) => a.projectId.localeCompare(b.projectId))
    .map(({ projectId, amountCents }) => ({ projectId, amountCents }));
};
