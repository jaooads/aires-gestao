export type FinancialTotalsInput = {
  contractedCents: number;
  expectedCostCents: number;
  receivedCents: number;
  expenseCents: number;
  laborCostCents: number;
  advanceCents: number;
};

const assertCents = (value: number, field: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} deve ser um inteiro não negativo em centavos.`);
  }
};

export const sumCents = (values: number[]): number => {
  const total = values.reduce((sum, value) => {
    assertCents(value, "valor");
    return sum + value;
  }, 0);
  assertCents(total, "total");
  return total;
};

export const calculateLaborCostCents = (
  entries: Array<{ quantity: number; unitRateCents: number }>,
): number =>
  sumCents(
    entries.map(({ quantity, unitRateCents }) => {
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new RangeError("A quantidade trabalhada deve ser positiva.");
      }
      assertCents(unitRateCents, "unitRateCents");
      return Math.round(quantity * unitRateCents);
    }),
  );

export const calculateFinancialTotals = (input: FinancialTotalsInput) => {
  Object.entries(input).forEach(([field, value]) => assertCents(value, field));
  const expectedProfitCents = input.contractedCents - input.expectedCostCents;
  const realizedProfitCents = input.receivedCents - input.expenseCents - input.laborCostCents;
  const balanceCents = input.receivedCents - input.expenseCents - input.advanceCents;
  const receivableCents = Math.max(0, input.contractedCents - input.receivedCents);

  return { expectedProfitCents, realizedProfitCents, balanceCents, receivableCents };
};
