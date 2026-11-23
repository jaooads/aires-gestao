import type { LookupItem } from "@aires/shared";
import { AppError } from "../errors.js";

const normalize = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");

export function resolveByName(
  items: LookupItem[],
  requestedName: string | null,
  entityLabel: string,
): LookupItem {
  if (!requestedName) {
    throw new AppError(422, "missing_entity", `${entityLabel} não informado.`);
  }

  const requested = normalize(requestedName);
  const exact = items.filter((item) => normalize(item.name) === requested);
  if (exact.length === 1 && exact[0]) return exact[0];

  const partial = items.filter((item) => normalize(item.name).includes(requested));
  if (partial.length === 1 && partial[0]) return partial[0];

  if (exact.length > 1 || partial.length > 1) {
    throw new AppError(
      409,
      "ambiguous_entity",
      `${entityLabel} ambíguo. Escolha uma opção no formulário.`,
      { matches: (exact.length ? exact : partial).map(({ id, name }) => ({ id, name })) },
    );
  }

  throw new AppError(422, "entity_not_found", `${entityLabel} não encontrado.`);
}

