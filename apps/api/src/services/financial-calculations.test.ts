import { describe, expect, it } from "vitest";
import {
  calculateFinancialTotals,
  calculateLaborCostCents,
  sumCents,
} from "./financial-calculations.js";

describe("regras financeiras", () => {
  it("calcula lucro previsto sem ponto flutuante monetário", () => {
    expect(
      calculateFinancialTotals({
        contractedCents: 1_000_000,
        expectedCostCents: 640_000,
        receivedCents: 0,
        expenseCents: 0,
        laborCostCents: 0,
        advanceCents: 0,
      }).expectedProfitCents,
    ).toBe(360_000);
  });

  it("calcula lucro realizado com recebimentos, despesas e trabalho reconhecido", () => {
    expect(
      calculateFinancialTotals({
        contractedCents: 1_000_000,
        expectedCostCents: 600_000,
        receivedCents: 750_000,
        expenseCents: 210_000,
        laborCostCents: 125_000,
        advanceCents: 40_000,
      }),
    ).toEqual({
      expectedProfitCents: 400_000,
      realizedProfitCents: 415_000,
      balanceCents: 500_000,
      receivableCents: 250_000,
    });
  });

  it("arredonda horas fracionadas uma única vez para centavos", () => {
    expect(calculateLaborCostCents([{ quantity: 1.5, unitRateCents: 12_345 }])).toBe(18_518);
  });

  it("rejeita centavos negativos ou não inteiros", () => {
    expect(() => sumCents([100, -1])).toThrow(RangeError);
    expect(() => sumCents([10.5])).toThrow(RangeError);
  });
});
