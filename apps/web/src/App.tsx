import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { BootstrapResponse } from "@aires/shared";
import { Building2, LogOut, Menu, ShieldCheck } from "lucide-react";
import { AdvanceFlow } from "./components/AdvanceFlow";
import { Login } from "./components/Login";
import { SupabaseSetup } from "./components/SupabaseSetup";
import { api } from "./lib/api";
import { supabase, supabaseConfigured } from "./lib/supabase";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabaseConfigured) return;
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) setBootstrap(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    setError("");
    void api.bootstrap(session)
      .then(setBootstrap)
      .catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : "Falha ao carregar."));
  }, [session]);

  if (!supabaseConfigured) return <SupabaseSetup />;
  if (loading) return <div className="loading-page">Carregando…</div>;
  if (!session) return <Login />;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand"><span><Building2 size={21} /></span><div><strong>Aires</strong><small>GESTÃO</small></div></div>
        <div className="topbar-actions">
          {bootstrap && <span className="company-name">{bootstrap.organization.name}</span>}
          <button aria-label="Sair" title="Sair" onClick={() => void supabase.auth.signOut()}><LogOut size={19} /></button>
          <button className="menu-button" aria-label="Menu"><Menu size={21} /></button>
        </div>
      </header>
      <main className="dashboard">
        <div className="page-intro">
          <div><p className="eyebrow">FINANCEIRO</p><h1>Olá, vamos organizar a obra?</h1></div>
          <div className="secure-badge"><ShieldCheck size={17} /> Operação protegida</div>
        </div>
        {error && <div className="page-error">{error}</div>}
        {!bootstrap && !error && <div className="loading-card">Preparando sua empresa…</div>}
        {bootstrap && <AdvanceFlow session={session} bootstrap={bootstrap} />}
      </main>
      <footer>AIRES CONSTRUÇÕES · DADOS PROTEGIDOS</footer>
    </div>
  );
}

