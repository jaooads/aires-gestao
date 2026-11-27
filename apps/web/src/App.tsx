import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AppData } from "./types";
import { Login } from "./components/Login";
import { ProductApp } from "./components/ProductApp";
import { SupabaseSetup } from "./components/SupabaseSetup";
import { api, ApiError } from "./lib/api";
import { supabase, supabaseConfigured } from "./lib/supabase";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [appData, setAppData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabaseConfigured) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      let validSession = data.session;
      if (validSession) {
        const { error: userError } = await supabase.auth.getUser(validSession.access_token);
        if (userError) {
          const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
          validSession = refreshError ? null : refreshed.session;
        }
      }
      if (cancelled) return;
      if (!validSession && data.session) await supabase.auth.signOut();
      setSession(validSession);
      setLoading(false);
      const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
        if (!nextSession) setAppData(null);
      });
      unsubscribe = () => authListener.subscription.unsubscribe();
    })();
    return () => { cancelled = true; unsubscribe?.(); };
  }, []);

  useEffect(() => {
    if (!session) return;
    setError("");
    void api.app(session).then(setAppData).catch(async (requestError: unknown) => {
      if (requestError instanceof ApiError && requestError.code === "invalid_token") {
        const { data, error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError && data.session?.access_token !== session.access_token) {
          setSession(data.session);
          return;
        }
        await supabase.auth.signOut();
        return;
      }
      setError(requestError instanceof Error ? requestError.message : "Falha ao carregar.");
    });
  }, [session]);

  if (!supabaseConfigured) return <SupabaseSetup />;
  if (loading) return <div className="loading-page"><span className="spinner" />Carregando…</div>;
  if (!session) return <Login />;
  if (error) return <div className="fatal-state"><h1>Não foi possível abrir a gestão</h1><p>{error}</p><button className="primary-button" onClick={() => window.location.reload()}>Tentar novamente</button></div>;
  if (!appData) return <div className="loading-page"><span className="spinner" />Preparando sua empresa…</div>;

  return <ProductApp session={session} initialData={appData} onSignOut={() => void supabase.auth.signOut()} />;
}
