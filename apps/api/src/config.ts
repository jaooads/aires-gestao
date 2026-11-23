import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(10),
  SUPABASE_SECRET_KEY: z.string().min(10),
  SUPABASE_DB_SCHEMA: z.string().regex(/^[a-z][a-z0-9_]*$/).default("aires"),
  OPENAI_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(10).optional(),
  ),
  OPENAI_MODEL: z.string().min(1).default("gpt-6.2-astra"),
});

export const config = envSchema.parse(process.env);

