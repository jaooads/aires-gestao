import { useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AdvanceProposalResponse, BootstrapResponse } from "@aires/shared";
import { formatBrl } from "@aires/shared";
import { ArrowLeft, Bot, CalendarDays, Check, CircleCheck, HardHat, Sparkles, UserRound, WalletCards } from "lucide-react";
import { api } from "../lib/api";

type Props = { session: Session; bootstrap: BootstrapResponse };

const today = new Intl.DateTimeFormat("fr-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const parseBrlToCents = (value: string): number => {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  return Math.round(Number(normalized) * 100);
};

export function AdvanceFlow({ session, bootstrap }: Props) {
  const [mode, setMode] = useState<"structured" | "natural_language">(
    bootstrap.aiEnabled ? "natural_language" : "structured",
  );
  const [message, setMessage] = useState("Hoje paguei R$ 200 de vale para o Marcelo na Obra do Centro.");
  const [workerId, setWorkerId] = useState(bootstrap.workers[0]?.id ?? "");
  const [projectId, setProjectId] = useState(bootstrap.projects[0]?.id ?? "");
  const [amount, setAmount] = useState("200,00");
  const [paidOn, setPaidOn] = useState(today);
  const [note, setNote] = useState("");
  const [proposal, setProposal] = useState<AdvanceProposalResponse | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const expiresLabel = useMemo(() => proposal
    ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(proposal.expiresAt))
    : "", [proposal]);

  async function prepare(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const body = mode === "natural_language"
        ? { mode, message } as const
        : {
            mode,
            draft: {
              workerId,
              projectId,
              amountCents: parseBrlToCents(amount),
              paidOn,
              note: note.trim() || null,
            },
          } as const;
      const created = await api.createProposal(session, body);
      setProposal(created);
      setIdempotencyKey(crypto.randomUUID());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível preparar o vale.");
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (!proposal) return;
    setLoading(true);
    setError("");
    try {
      await api.confirmProposal(session, proposal.id, idempotencyKey);
      setSuccess(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível confirmar.");
    } finally {
      setLoading(false);
    }
  }

  if (success && proposal) {
    return (
      <section className="success-card">
        <div className="success-icon"><CircleCheck size={42} /></div>
        <p className="eyebrow">LANÇAMENTO CONCLUÍDO</p>
        <h2>Vale registrado</h2>
        <p>{formatBrl(proposal.amountCents)} para <strong>{proposal.worker.name}</strong> foi lançado com segurança.</p>
        <button className="secondary-button" onClick={() => { setSuccess(false); setProposal(null); }}>
          Lançar outro vale
        </button>
      </section>
    );
  }

  if (proposal) {
    return (
      <section className="flow-card review-card">
        <button className="back-button" onClick={() => setProposal(null)}><ArrowLeft size={18} /> Corrigir</button>
        <div className="review-heading">
          <span className="step-chip">2 de 2</span>
          <h2>Confirme o vale</h2>
          <p className="muted">Confira os dados. O registro só será feito após confirmar.</p>
        </div>
        <div className="amount-hero">
          <span>VALOR DO VALE</span>
          <strong>{formatBrl(proposal.amountCents)}</strong>
        </div>
        <dl className="summary-list">
          <div><dt><UserRound size={17} /> Trabalhador</dt><dd>{proposal.worker.name}</dd></div>
          <div><dt><HardHat size={17} /> Obra</dt><dd>{proposal.project.name}</dd></div>
          <div><dt><CalendarDays size={17} /> Data</dt><dd>{new Date(`${proposal.paidOn}T12:00:00`).toLocaleDateString("pt-BR")}</dd></div>
          {proposal.note && <div><dt>Observação</dt><dd>{proposal.note}</dd></div>}
        </dl>
        <div className="safe-callout"><Check size={18} /><span>Proteção contra lançamento duplicado e histórico de auditoria ativados.</span></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button confirm-button" disabled={loading} onClick={confirm}>
          {loading ? "Confirmando…" : "Confirmar lançamento"}<Check size={18} />
        </button>
        <p className="expiry">Esta confirmação expira às {expiresLabel}.</p>
      </section>
    );
  }

  return (
    <section className="flow-card">
      <div className="flow-heading">
        <div>
          <p className="eyebrow">NOVO LANÇAMENTO</p>
          <h2>Lançar vale</h2>
        </div>
        <span className="step-chip">1 de 2</span>
      </div>

      <div className="mode-tabs">
        <button className={mode === "structured" ? "active" : ""} onClick={() => setMode("structured")}><WalletCards size={17} /> Formulário</button>
        <button disabled={!bootstrap.aiEnabled} className={mode === "natural_language" ? "active" : ""} onClick={() => setMode("natural_language")}><Sparkles size={17} /> Assistente</button>
      </div>

      <form onSubmit={prepare}>
        {mode === "natural_language" ? (
          <label>
            Conte o que foi pago
            <div className="assistant-input">
              <Bot size={21} />
              <textarea required rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>
            <span className="field-help">Aires entende a mensagem e pede sua confirmação antes de registrar.</span>
          </label>
        ) : (
          <>
            <label>Trabalhador<select required value={workerId} onChange={(e) => setWorkerId(e.target.value)}><option value="">Selecione</option>{bootstrap.workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</select></label>
            <label>Obra<select required value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">Selecione</option>{bootstrap.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
            <div className="field-row">
              <label>Valor (R$)<input inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
              <label>Data<input type="date" required value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></label>
            </div>
            <label>Observação <span className="optional">opcional</span><input maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: vale semanal" /></label>
          </>
        )}
        {!bootstrap.aiEnabled && <p className="ai-note"><Sparkles size={15} /> O assistente será liberado quando a chave da API for configurada no servidor.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" disabled={loading || !bootstrap.workers.length || !bootstrap.projects.length}>
          {loading ? "Preparando…" : "Revisar lançamento"}<Check size={18} />
        </button>
      </form>
    </section>
  );
}

