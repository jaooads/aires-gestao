import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/202611230001_initial.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

const seed = readFileSync(
  fileURLToPath(new URL("../../../supabase/seed.sql", import.meta.url)),
  "utf8",
);

describe("isolamento do banco compartilhado", () => {
  it("cria objetos de negócio somente no schema aires", () => {
    expect(migration).toContain("create schema if not exists aires;");
    expect(migration).toContain("create table aires.organizations");
    expect(migration).not.toMatch(/create table public\./i);
    expect(seed).not.toMatch(/insert into public\./i);
  });

  it("mantém as funções auxiliares fora da Data API", () => {
    expect(migration).toContain("create schema if not exists aires_private;");
    expect(migration).toContain("revoke all on schema aires_private from public;");
    expect(migration).not.toContain("grant usage on schema aires_private to anon");
  });
});
