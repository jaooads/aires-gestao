import { AppError } from "../errors.js";
import { adminClient } from "../supabase.js";

export async function requireOrganizationRecord(
  table: "projects" | "workers" | "contracts" | "contract_stages",
  id: string,
  organizationId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await adminClient
    .from(table)
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError(404, "record_not_found", "Registro não encontrado.");
  return data;
}
