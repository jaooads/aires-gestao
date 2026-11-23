import { Router } from "express";
import type { BootstrapResponse, LookupItem } from "@aires/shared";
import { AppError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { adminClient } from "../supabase.js";
import { config } from "../config.js";

export const bootstrapRouter = Router();

bootstrapRouter.get("/", requireAuth, async (req, res) => {
  const organizationId = req.auth.organizationId;
  const [organizationResult, projectsResult, workersResult] = await Promise.all([
    adminClient.from("organizations").select("id, name").eq("id", organizationId).single(),
    adminClient
      .from("projects")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name"),
    adminClient
      .from("workers")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name"),
  ]);

  const firstError = organizationResult.error ?? projectsResult.error ?? workersResult.error;
  if (firstError) throw firstError;
  if (!organizationResult.data) {
    throw new AppError(404, "organization_not_found", "Empresa não encontrada.");
  }

  const body: BootstrapResponse = {
    organization: organizationResult.data,
    role: req.auth.role,
    projects: (projectsResult.data ?? []) as LookupItem[],
    workers: (workersResult.data ?? []) as LookupItem[],
    aiEnabled: Boolean(config.OPENAI_API_KEY),
  };
  res.json(body);
});

