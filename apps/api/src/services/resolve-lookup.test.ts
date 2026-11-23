import { describe, expect, it } from "vitest";
import { AppError } from "../errors.js";
import { resolveByName } from "./resolve-lookup.js";

const workers = [
  { id: "1", name: "Marcelo Silva" },
  { id: "2", name: "João" },
];

describe("resolveByName", () => {
  it("resolve nomes sem depender de acentos ou caixa", () => {
    expect(resolveByName(workers, "JOAO", "Trabalhador").id).toBe("2");
  });

  it("aceita um único nome parcial", () => {
    expect(resolveByName(workers, "Marcelo", "Trabalhador").id).toBe("1");
  });

  it("nunca inventa uma entidade ausente", () => {
    expect(() => resolveByName(workers, "Carlos", "Trabalhador")).toThrow(AppError);
  });
});
