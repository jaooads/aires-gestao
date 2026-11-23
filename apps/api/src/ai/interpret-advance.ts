import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { config } from "../config.js";
import { AppError } from "../errors.js";

const interpretedAdvanceSchema = z.object({
  intent: z.enum(["create_advance", "unsupported"]),
  workerName: z.string().nullable(),
  projectName: z.string().nullable(),
  amountCents: z.number().int().positive().nullable(),
  paidOn: z.string().nullable(),
  note: z.string().nullable(),
});

export type InterpretedAdvance = z.infer<typeof interpretedAdvanceSchema>;

let openai: OpenAI | undefined;

export async function interpretAdvance(
  message: string,
  today: string,
): Promise<InterpretedAdvance> {
  if (!config.OPENAI_API_KEY) {
    throw new AppError(
      503,
      "ai_not_configured",
      "A interpretação por IA ainda não foi configurada. Use o formulário por enquanto.",
    );
  }

  openai ??= new OpenAI({ apiKey: config.OPENAI_API_KEY });
  const response = await openai.responses.parse({
    model: config.OPENAI_MODEL,
    input: [
      {
        role: "system",
        content: [
          "Extraia somente uma intenção de vale/adiantamento financeiro.",
          "Não invente trabalhador, obra, valor ou data.",
          `Hoje é ${today}. Converta reais para centavos sem arredondar.`,
          "Se não for claramente um vale/adiantamento, use unsupported.",
        ].join(" "),
      },
      { role: "user", content: message },
    ],
    text: {
      format: zodTextFormat(interpretedAdvanceSchema, "advance_intent"),
    },
  });

  if (!response.output_parsed) {
    throw new AppError(422, "ai_unusable_response", "Não consegui interpretar o lançamento.");
  }
  return response.output_parsed;
}

