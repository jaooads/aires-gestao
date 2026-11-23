import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

export const authClient = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_PUBLISHABLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  },
);

export const adminClient = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_SECRET_KEY,
  {
    db: { schema: config.SUPABASE_DB_SCHEMA },
    auth: { autoRefreshToken: false, persistSession: false },
  },
);

