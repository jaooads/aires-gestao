import { describe, expect, it } from "vitest";
import { allocateCentsByWeight, calculatePayroll, calculateWorkedMinutes } from "./payroll-calculations.js";

const entry = (status: "full_day" | "half_day" | "hourly" | "absence" | "day_off", workedMinutes: number, projectId = "p1") => ({ status, workedMinutes, projectId });
const base = { periodDays: 7, advanceCents: [] as number[], adjustments: [] as Array<{ kind: "addition" | "deduction"; amountCents: number; reason: string }> };

describe("controle de jornada e folha", () => {
  it("calcula minutos e desconta intervalo", () => expect(calculateWorkedMinutes("07:30", "17:00", 90)).toBe(480));
  it("rejeita horário final anterior", () => expect(() => calculateWorkedMinutes("17:00", "08:00")).toThrow(RangeError));
  it("rejeita duração negativa pelo intervalo", () => expect(() => calculateWorkedMinutes("08:00", "09:00", 60)).toThrow(RangeError));
  it("calcula pagamento por hora em minutos inteiros", () => expect(calculatePayroll({ ...base, paymentType: "hourly", rateCents: 2_500, entries: [entry("hourly", 510)] }).grossCents).toBe(21_250));
  it("arredonda centavos por hora uma única vez", () => expect(calculatePayroll({ ...base, paymentType: "hourly", rateCents: 1_001, entries: [entry("hourly", 1)] }).grossCents).toBe(17));
  it("calcula diárias completas", () => expect(calculatePayroll({ ...base, paymentType: "daily", rateCents: 18_000, entries: [entry("full_day", 480), entry("full_day", 480)] }).grossCents).toBe(36_000));
  it("calcula meio período como metade da diária", () => expect(calculatePayroll({ ...base, paymentType: "daily", rateCents: 18_001, entries: [entry("half_day", 240)] }).grossCents).toBe(9_001));
  it("falta e folga têm valor zero na diária", () => expect(calculatePayroll({ ...base, paymentType: "daily", rateCents: 18_000, entries: [entry("absence", 0), entry("day_off", 0)] }).grossCents).toBe(0));
  it("valor semanal não desconta falta automaticamente", () => expect(calculatePayroll({ ...base, paymentType: "weekly", rateCents: 120_000, entries: [entry("absence", 0)] }).grossCents).toBe(120_000));
  it("prorrateia remuneração semanal pelo período", () => expect(calculatePayroll({ ...base, periodDays: 14, paymentType: "weekly", rateCents: 120_000, entries: [] }).grossCents).toBe(240_000));
  it("compensa vales uma única vez no líquido informado", () => expect(calculatePayroll({ ...base, paymentType: "daily", rateCents: 20_000, entries: [entry("full_day", 480)], advanceCents: [5_000] }).netCents).toBe(15_000));
  it("aplica acréscimos e descontos justificados", () => expect(calculatePayroll({ ...base, paymentType: "daily", rateCents: 20_000, entries: [entry("full_day", 480)], adjustments: [{ kind: "addition", amountCents: 2_000, reason: "Bônus" }, { kind: "deduction", amountCents: 1_000, reason: "Ajuste" }] })).toMatchObject({ laborCostCents: 21_000, netCents: 21_000 }));
  it("rejeita valores negativos", () => expect(() => calculatePayroll({ ...base, paymentType: "daily", rateCents: -1, entries: [] })).toThrow(RangeError));
  it("rejeita descontos maiores que o devido", () => expect(() => calculatePayroll({ ...base, paymentType: "daily", rateCents: 10_000, entries: [entry("full_day", 480)], adjustments: [{ kind: "deduction", amountCents: 11_000, reason: "Ajuste" }] })).toThrow(RangeError));
  it("rateia entre obras e preserva soma exata", () => expect(allocateCentsByWeight(10_001, [{ projectId: "p1", weight: 480 }, { projectId: "p2", weight: 240 }])).toEqual([{ projectId: "p1", amountCents: 6_667 }, { projectId: "p2", amountCents: 3_334 }]));
  it("rateia centavo residual deterministicamente", () => expect(allocateCentsByWeight(1, [{ projectId: "b", weight: 1 }, { projectId: "a", weight: 1 }])).toEqual([{ projectId: "a", amountCents: 1 }, { projectId: "b", amountCents: 0 }]));
});
