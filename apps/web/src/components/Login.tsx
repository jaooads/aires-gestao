import { useState, type FormEvent } from "react";
import { ArrowRight, Building2, LockKeyhole } from "lucide-react";
import { supabase } from "../lib/supabase";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) setError("E-mail ou senha incorretos.");
    setLoading(false);
  }

  return (
    <main className="auth-page">
      <section className="brand-panel">
        <div className="brand-mark"><Building2 size={28} /></div>
        <p className="eyebrow">AIRES CONSTRUÇÕES</p>
        <h1>Gestão clara.<br />Obra no controle.</h1>
        <p className="brand-copy">Vales, despesas e recebimentos organizados em um só lugar.</p>
      </section>

      <section className="login-card">
        <div className="lock-icon"><LockKeyhole size={22} /></div>
        <h2>Bem-vindo</h2>
        <p className="muted">Entre para acessar a gestão da empresa.</p>
        <form onSubmit={submit}>
          <label>
            E-mail
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@aires.com.br" />
          </label>
          <label>
            Senha
            <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Sua senha" />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}<ArrowRight size={18} />
          </button>
        </form>
        <p className="security-note"><LockKeyhole size={14} /> Seus dados financeiros são protegidos.</p>
      </section>
    </main>
  );
}

