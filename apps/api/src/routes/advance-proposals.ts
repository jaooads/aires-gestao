import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import {
  advanceProposalRequestSchema,
  type AdvanceDraft,
  type AdvanceProposalResponse,
  type ConfirmAdvanceResponse,
  type LookupItem,
} from "@aires/shared";
import { interpretAdvance } from "../ai/interpret-advance.js";
import { AppError } from "../errors.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import { resolveByName } from "../services/resolve-lookup.js";
import { adminClient } from "../supabase.js";

export const advanceProposalsRouter = Router();
const writableRoles = ["owner", "admin", "finance"] as const;

const todayInSaoPaulo = (): string =>
  new Intl.DateTimeFormat("fr-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

advanceProposalsRouter.post(
  "/",
  requireAuth,
  allowRoles(...writableRoles),
  async (req, res) => {
    const input = advanceProposalRequestSchema.parse(req.body);
    const organizationId = req.auth.organizationId;

    const [projectsResult, workersResult] = await Promise.all([
      adminClient
        .from("projects")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("active", true),
      adminClient
        .from("workers")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("active", true),
    ]);
    const lookupError = projectsResult.error ?? workersResult.error;
    if (lookupError) throw lookupError;
    const projects = (projectsResult.data ?? []) as LookupItem[];
    const workers = (workersResult.data ?? []) as LookupItem[];

    let draft: AdvanceDraft;
    let sourceText: string | null = null;
    if (input.mode === "structured") {
      const worker = workers.find(({ id }) => id === input.draft.workerId);
      const project = projects.find(({ id }) => id === input.draft.projectId);
      if (!worker || !project) {
        throw new AppError(
          422,
          "invalid_lookup",
          "Trabalhador ou obra não pertence à empresa ativa.",
        );
      }
      draft = input.draft;
    } else {
      sourceText = input.message;
      const interpreted = await interpretAdvance(input.message, todayInSaoPaulo());
      if (interpreted.intent !== "create_advance") {
        throw new AppError(422, "unsupported_intent", "A mensagem não descreve um vale.");
      }
      const worker = resolveByName(workers, interpreted.workerName, "Trabalhador");
      const project = resolveByName(projects, interpreted.projectName, "Obra");
      if (!interpreted.amountCents) {
        throw new AppError(422, "missing_amount", "Valor do vale não informado.");
      }
      draft = {
        workerId: worker.id,
        projectId: project.id,
        amountCents: interpreted.amountCents,
        paidOn: interpreted.paidOn ?? todayInSaoPaulo(),
        note: interpreted.note,
      };
    }

    const id = randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const { error } = await adminClient.from("financial_proposals").insert({
      id,
      organization_id: organizationId,
      proposal_type: "worker_advance",
      status: "pending",
      payload: draft,
      source_text: sourceText,
      created_by: req.auth.user.id,
      expires_at: expiresAt,
    });
    if (error) throw error;

    const worker = workers.find(({ id: workerId }) => workerId === draft.workerId)!;
    const project = projects.find(({ id: projectId }) => projectId === draft.projectId)!;
    const body: AdvanceProposalResponse = {
      id,
      status: "pending",
      worker,
      project,
      amountCents: draft.amountCents,
      paidOn: draft.paidOn,
      note: draft.note,
      expiresAt,
    };
    res.status(201).json(body);
  },
);

advanceProposalsRouter.post(
  "/:proposalId/confirm",
  requireAuth,
  allowRoles(...writableRoles),
  async (req, res) => {
    const proposalId = z.uuid().parse(req.params.proposalId);
    const idempotencyKey = z.uuid().parse(req.header("idempotency-key"));

    const { data, error } = await adminClient.rpc("confirm_advance_proposal", {
      p_proposal_id: proposalId,
      p_actor_user_id: req.auth.user.id,
      p_organization_id: req.auth.organizationId,
      p_idempotency_key: idempotencyKey,
    });
    if (error) {
      if (error.message.includes("proposal_expired")) {
        throw new AppError(409, "proposal_expired", "A proposta expirou. Crie outra.");
      }
      if (error.message.includes("proposal_unavailable")) {
        throw new AppError(409, "proposal_unavailable", "A proposta não pode ser confirmada.");
      }
      throw error;
    }

    const result = data as {
      advance_id: string;
      proposal_id: string;
      idempotency_key: string;
      already_processed: boolean;
      confirmed_at: string;
    };
    const body: ConfirmAdvanceResponse = {
      advanceId: result.advance_id,
      proposalId: result.proposal_id,
      idempotencyKey: result.idempotency_key,
      alreadyProcessed: result.already_processed,
      confirmedAt: result.confirmed_at,
    };
    res.json(body);
  },
);

