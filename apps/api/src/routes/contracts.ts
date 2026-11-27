import { Router } from "express";
import {
  createContractSchema,
  createContractStageSchema,
  updateContractSchema,
  updateContractStageSchema,
} from "@aires/shared";
import { z } from "zod";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import { adminClient } from "../supabase.js";
import { writeAudit } from "../services/audit.js";
import { requireOrganizationRecord } from "../services/records.js";

const writableRoles = ["owner", "admin", "finance"] as const;

export const contractsRouter = Router();
contractsRouter.use(requireAuth, allowRoles(...writableRoles));

contractsRouter.post("/", async (req, res) => {
  const input = createContractSchema.parse(req.body);
  await requireOrganizationRecord("projects", input.projectId, req.auth.organizationId);
  const { data, error } = await adminClient.from("contracts").insert({
    organization_id: req.auth.organizationId, project_id: input.projectId, name: input.name,
    pricing_model: input.pricingModel, contracted_amount_cents: input.contractedAmountCents,
    hourly_rate_cents: input.hourlyRateCents, expected_cost_cents: input.expectedCostCents,
    starts_on: input.startsOn, ends_on: input.endsOn,
  }).select("id").single();
  if (error) throw error;
  await writeAudit({ organizationId: req.auth.organizationId, actorUserId: req.auth.user.id,
    action: "contract.created", entityType: "contract", entityId: data.id,
    metadata: { projectId: input.projectId } });
  res.status(201).json({ id: data.id });
});

contractsRouter.patch("/:contractId", async (req, res) => {
  const contractId = z.uuid().parse(req.params.contractId);
  await requireOrganizationRecord("contracts", contractId, req.auth.organizationId);
  const input = updateContractSchema.parse(req.body);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.pricingModel !== undefined) patch.pricing_model = input.pricingModel;
  if (input.contractedAmountCents !== undefined) patch.contracted_amount_cents = input.contractedAmountCents;
  if (input.hourlyRateCents !== undefined) patch.hourly_rate_cents = input.hourlyRateCents;
  if (input.expectedCostCents !== undefined) patch.expected_cost_cents = input.expectedCostCents;
  if (input.startsOn !== undefined) patch.starts_on = input.startsOn;
  if (input.endsOn !== undefined) patch.ends_on = input.endsOn;
  const { error } = await adminClient.from("contracts").update(patch)
    .eq("id", contractId).eq("organization_id", req.auth.organizationId);
  if (error) throw error;
  await writeAudit({ organizationId: req.auth.organizationId, actorUserId: req.auth.user.id,
    action: "contract.updated", entityType: "contract", entityId: contractId,
    metadata: { fields: Object.keys(input) } });
  res.json({ id: contractId });
});

export const contractStagesRouter = Router();
contractStagesRouter.use(requireAuth, allowRoles(...writableRoles));

contractStagesRouter.post("/", async (req, res) => {
  const input = createContractStageSchema.parse(req.body);
  await requireOrganizationRecord("contracts", input.contractId, req.auth.organizationId);
  const { data, error } = await adminClient.from("contract_stages").insert({
    organization_id: req.auth.organizationId, contract_id: input.contractId, name: input.name,
    sequence: input.sequence, planned_amount_cents: input.plannedAmountCents,
    expected_cost_cents: input.expectedCostCents, completed_on: input.completedOn,
  }).select("id").single();
  if (error) throw error;
  await writeAudit({ organizationId: req.auth.organizationId, actorUserId: req.auth.user.id,
    action: "contract_stage.created", entityType: "contract_stage", entityId: data.id,
    metadata: { contractId: input.contractId } });
  res.status(201).json({ id: data.id });
});

contractStagesRouter.patch("/:stageId", async (req, res) => {
  const stageId = z.uuid().parse(req.params.stageId);
  await requireOrganizationRecord("contract_stages", stageId, req.auth.organizationId);
  const input = updateContractStageSchema.parse(req.body);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.sequence !== undefined) patch.sequence = input.sequence;
  if (input.plannedAmountCents !== undefined) patch.planned_amount_cents = input.plannedAmountCents;
  if (input.expectedCostCents !== undefined) patch.expected_cost_cents = input.expectedCostCents;
  if (input.completedOn !== undefined) patch.completed_on = input.completedOn;
  const { error } = await adminClient.from("contract_stages").update(patch)
    .eq("id", stageId).eq("organization_id", req.auth.organizationId);
  if (error) throw error;
  await writeAudit({ organizationId: req.auth.organizationId, actorUserId: req.auth.user.id,
    action: "contract_stage.updated", entityType: "contract_stage", entityId: stageId,
    metadata: { fields: Object.keys(input) } });
  res.json({ id: stageId });
});
