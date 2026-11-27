import { Router } from "express";
import { createExpenseSchema, createReceiptSchema, type FinancialMutationResponse } from "@aires/shared";
import { z } from "zod";
import { AppError } from "../errors.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import { loadAppSnapshot } from "../services/app-snapshot.js";
import { adminClient } from "../supabase.js";

export const financeRouter = Router();
const writableRoles = ["owner", "admin", "finance"] as const;
financeRouter.use(requireAuth);

financeRouter.get("/", async (req, res) => {
  const type = z.enum(["advance", "expense", "receipt"]).optional().parse(req.query.type);
  const projectId = z.uuid().optional().parse(req.query.projectId);
  const workerId = z.uuid().optional().parse(req.query.workerId);
  const from = z.iso.date().optional().parse(req.query.from);
  const to = z.iso.date().optional().parse(req.query.to);
  const snapshot = await loadAppSnapshot(req.auth.organizationId, req.auth.role);
  res.json({
    summary: snapshot.summary,
    entries: snapshot.entries.filter((entry) =>
      (!type || entry.type === type) && (!projectId || entry.projectId === projectId) &&
      (!workerId || entry.workerId === workerId) && (!from || entry.occurredOn >= from) &&
      (!to || entry.occurredOn <= to)),
  });
});

const idempotencyKey = (value: string | undefined): string => {
  if (!value) throw new AppError(400, "missing_idempotency_key", "Informe o cabeçalho Idempotency-Key.");
  return z.uuid().parse(value);
};

financeRouter.post("/expenses", allowRoles(...writableRoles), async (req, res) => {
  const input = createExpenseSchema.parse(req.body);
  const { data, error } = await adminClient.rpc("record_expense", {
    p_actor_user_id: req.auth.user.id, p_organization_id: req.auth.organizationId,
    p_idempotency_key: idempotencyKey(req.header("idempotency-key")),
    p_project_id: input.projectId, p_description: input.description, p_category: input.category,
    p_amount_cents: input.amountCents, p_incurred_on: input.incurredOn,
  });
  if (error) throw error;
  const result = data as { id: string; ledger_entry_id: string; already_processed: boolean };
  const body: FinancialMutationResponse = { id: result.id, ledgerEntryId: result.ledger_entry_id,
    alreadyProcessed: result.already_processed };
  res.status(result.already_processed ? 200 : 201).json(body);
});

financeRouter.post("/receipts", allowRoles(...writableRoles), async (req, res) => {
  const input = createReceiptSchema.parse(req.body);
  const { data, error } = await adminClient.rpc("record_receipt", {
    p_actor_user_id: req.auth.user.id, p_organization_id: req.auth.organizationId,
    p_idempotency_key: idempotencyKey(req.header("idempotency-key")),
    p_project_id: input.projectId, p_contract_id: input.contractId,
    p_description: input.description, p_amount_cents: input.amountCents,
    p_received_on: input.receivedOn,
  });
  if (error) throw error;
  const result = data as { id: string; ledger_entry_id: string; already_processed: boolean };
  const body: FinancialMutationResponse = { id: result.id, ledgerEntryId: result.ledger_entry_id,
    alreadyProcessed: result.already_processed };
  res.status(result.already_processed ? 200 : 201).json(body);
});
