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

