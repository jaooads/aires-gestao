import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(url && publishableKey);

// O cliente de fallback nunca é usado para requisições. Ele permite que a
// interface mostre instruções de configuração em vez de uma tela branca.
export const supabase = createClient(
  url || "http://127.0.0.1:54321",
  publishableKey || "supabase-not-configured",
);

