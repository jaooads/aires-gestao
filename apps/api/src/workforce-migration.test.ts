import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const baseMigration = readFileSync(fileURLToPath(new URL(
  "../../../supabase/migrations/202611240002_workforce_payroll.sql",
  import.meta.url,
)), "utf8");
const hardeningMigration = readFileSync(fileURLToPath(new URL(
  "../../../supabase/migrations/202611250001_workforce_payroll_hardening.sql",
  import.meta.url,
)), "utf8");
const migration = `${baseMigration}\n${hardeningMigration}`;

describe("integridade de jornadas e pagamentos", () => {
  it("isola as novas tabelas por organização com RLS", () => {
    for (const table of ["payroll_closures", "time_entries", "payroll_adjustments", "payroll_allocations", "payroll_closure_advances"]) {
      expect(migration).toContain(`alter table aires.${table} enable row level security`);
      expect(migration).toContain(`create policy ${table}_select`);
    }
  });

  it("bloqueia alteração de jornada fechada e anexação concorrente", () => {
    expect(migration).toContain("raise exception 'closed_time_entry'");
    expect(migration).toContain("create or replace function aires.attach_payroll_time_entries");
    expect(migration).toContain("for update;");
    expect(migration).toContain("raise exception 'time_entry_unavailable'");
  });

  it("impede compensação duplicada e valida integralmente o vale", () => {
    expect(migration).toContain("create unique index payroll_closure_advances_active_uidx");
    expect(migration).toContain("wa.compensated_by_closure_id is not null");
    expect(migration).toContain("wa.amount_cents <> ca.amount_cents");
  });

  it("confirma pagamento com idempotência e acesso somente do service role", () => {
    expect(migration).toContain("v_closure.idempotency_key = p_idempotency_key");
    expect(migration).toContain("raise exception 'payment_already_confirmed'");
    expect(migration).toContain("revoke all on function aires.confirm_payroll_closure");
    expect(migration).toContain("grant execute on function aires.confirm_payroll_closure");
    expect(migration).toContain("to service_role");
  });
});
