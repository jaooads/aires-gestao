import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { formatBrl } from "@aires/shared";
import {
  Banknote, BriefcaseBusiness, Building2, CalendarDays, Check, ChevronLeft, Clock3,
  ChevronRight, CircleDollarSign, ClipboardList, FileText, HardHat, Home,
  Landmark, LogOut, Menu, MoreHorizontal, Pencil, Plus, ReceiptText, Search,
  Settings, ShieldCheck, TrendingDown, TrendingUp, UserPlus, UsersRound, WalletCards, X,
} from "lucide-react";
import { api } from "../lib/api";
import { BrandLogo } from "./BrandLogo";
import { WorkforceModule } from "./WorkforceModule";
import type { AppData, Contract, LedgerEntry, ModalKind, Project, ProjectStatus, Section, Worker } from "../types";

type ModalState = { kind: ModalKind; project?: Project; worker?: Worker; contract?: Contract };
type Props = { session: Session; initialData: AppData; onSignOut: () => void };

const sectionMeta: Record<Section, { label: string; icon: typeof Home }> = {
  home: { label: "Início", icon: Home }, projects: { label: "Obras", icon: HardHat },
  finance: { label: "Financeiro", icon: WalletCards }, people: { label: "Pessoas", icon: UsersRound },
  more: { label: "Mais", icon: MoreHorizontal },
};
const projectStatus: Record<ProjectStatus, string> = { planning: "Planejamento", active: "Ativa", paused: "Pausada", completed: "Concluída" };
const movementLabels: Record<LedgerEntry["type"], string> = {
  worker_advance: "Vale", worker_payment: "Pagamento", daily_payment: "Diária", advance: "Adiantamento",
  expense: "Despesa", receipt: "Recebimento", reversal: "Estorno",
};
const today = new Intl.DateTimeFormat("fr-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const formatDate = (value: string) => new Intl.DateTimeFormat("pt-BR").format(new Date(`${value.slice(0, 10)}T12:00:00`));
const moneyToCents = (value: FormDataEntryValue | null) => {
  const normalized = String(value ?? "").trim().replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Informe um valor maior que zero.");
  return Math.round(amount * 100);
};
const nullableMoney = (value: FormDataEntryValue | null) => String(value ?? "").trim() ? moneyToCents(value) : null;
const nonNegativeMoneyToCents = (value: FormDataEntryValue | null) => {
  const normalized = String(value ?? "").trim().replace(/\./g, "").replace(",", ".");
  const amount = normalized ? Number(normalized) : 0;
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Informe um valor válido, sem números negativos.");
  return Math.round(amount * 100);
};

export function ProductApp({ session, initialData, onSignOut }: Props) {
  const [data, setData] = useState(initialData);
  const [section, setSection] = useState<Section>("home");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState("");

  const refresh = async () => {
    setRefreshing(true);
    try { setData(await api.app(session)); } finally { setRefreshing(false); }
  };
  const completed = async (message: string) => {
    await refresh();
    setToast(message);
    window.setTimeout(() => setToast(""), 3500);
  };
  const navigate = (next: Section) => {
    setSection(next); setSelectedProjectId(null); setSelectedWorkerId(null);
  };
  const selectedProject = data.projects.find((project) => project.id === selectedProjectId) ?? null;
  const selectedWorker = data.workers.find((worker) => worker.id === selectedWorkerId) ?? null;

  return (
    <div className="product-shell">
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Navegação principal">
          {(Object.keys(sectionMeta) as Section[]).map((key) => <NavButton key={key} item={key} active={section === key} onClick={() => navigate(key)} />)}
        </nav>
        <div className="sidebar-company"><span>{data.organization.name.slice(0, 2).toUpperCase()}</span><div><strong>{data.organization.name}</strong><small>{roleLabel(data.role)}</small></div></div>
        <button className="sidebar-logout" onClick={onSignOut}><LogOut size={18} /> Sair</button>
      </aside>

      <div className="product-main">
        <header className="mobile-header"><Brand compact /><button aria-label="Sair" onClick={onSignOut}><LogOut size={19} /></button></header>
        <main className="page-container" aria-busy={refreshing}>
          {section === "home" && <HomePage data={data} open={setModal} openProject={(id) => { setSelectedProjectId(id); setSection("projects"); }} />}
          {section === "projects" && <ProjectsPage data={data} selected={selectedProject} setSelected={setSelectedProjectId} open={setModal} />}
          {section === "finance" && <FinancePage data={data} open={setModal} />}
          {section === "people" && <PeoplePage session={session} data={data} selected={selectedWorker} setSelected={setSelectedWorkerId} open={setModal} refresh={refresh} />}
          {section === "more" && <MorePage data={data} onSignOut={onSignOut} />}
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Navegação principal">
        {(Object.keys(sectionMeta) as Section[]).map((key) => <NavButton key={key} item={key} active={section === key} onClick={() => navigate(key)} />)}
      </nav>
      {modal && <EntityModal state={modal} data={data} session={session} close={() => setModal(null)} completed={completed} />}
      {toast && <div className="toast" role="status"><Check size={18} />{toast}</div>}
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`product-brand ${compact ? "compact" : ""}`}><BrandLogo compact={compact} /></div>;
}
function roleLabel(role: AppData["role"]) { return ({ owner: "Proprietário", admin: "Administrador", finance: "Financeiro", viewer: "Consulta" })[role]; }
function NavButton({ item, active, onClick }: { item: Section; active: boolean; onClick: () => void }) {
  const { label, icon: Icon } = sectionMeta[item];
  return <button className={active ? "active" : ""} onClick={onClick}><Icon size={20} /><span>{label}</span></button>;
}
function PageHeader({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}
function EmptyState({ icon: Icon = ClipboardList, title, text, action }: { icon?: typeof ClipboardList; title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><span><Icon size={25} /></span><h3>{title}</h3><p>{text}</p>{action}</div>;
}
function StatusBadge({ status }: { status: ProjectStatus }) { return <span className={`status-badge ${status}`}>{projectStatus[status]}</span>; }

function HomePage({ data, open, openProject }: { data: AppData; open: (m: ModalState) => void; openProject: (id: string) => void }) {
  const active = data.projects.filter((project) => project.status === "active");
  const cards = [
    ["Saldo geral", data.summary.balanceCents, Landmark, "primary"], ["A receber", data.summary.receivableCents, TrendingUp, "positive"],
    ["Despesas do período", data.summary.expensesCents, TrendingDown, "negative"], ["Vales e adiantamentos", data.summary.advancesCents, WalletCards, "neutral"],
    ["Lucro previsto", data.summary.expectedProfitCents, CircleDollarSign, "positive"], ["Lucro realizado", data.summary.realizedProfitCents, Banknote, "primary"],
  ] as const;
  return <>
    <PageHeader eyebrow="VISÃO GERAL" title="Olá, vamos cuidar das obras?" subtitle={`${data.organization.name} · resumo financeiro atualizado`} />
    <section className="money-grid">{cards.map(([label, value, Icon, tone]) => <article className={`money-card ${tone}`} key={label}><div><span>{label}</span><Icon size={19} /></div><strong>{formatBrl(value)}</strong><small>Consolidado da operação</small></article>)}</section>
    <section className="quick-actions" aria-label="Ações rápidas">
      <button onClick={() => open({ kind: "advance" })}><span><WalletCards size={20} /></span><div><strong>Novo vale</strong><small>Para um trabalhador</small></div><ChevronRight size={18} /></button>
      <button onClick={() => open({ kind: "expense" })}><span><ReceiptText size={20} /></span><div><strong>Nova despesa</strong><small>Da obra ou geral</small></div><ChevronRight size={18} /></button>
      <button onClick={() => open({ kind: "receipt" })}><span><CircleDollarSign size={20} /></span><div><strong>Novo recebimento</strong><small>Vinculado à obra</small></div><ChevronRight size={18} /></button>
    </section>
    <div className="dashboard-columns">
      <section className="content-card"><div className="section-title"><div><h2>Obras ativas</h2><p>{active.length} em andamento</p></div></div>
        {active.length ? <div className="compact-projects">{active.slice(0, 4).map((project) => <button key={project.id} onClick={() => openProject(project.id)}><div><strong>{project.name}</strong><small>{project.client || project.address || "Sem cliente informado"}</small></div><div><b>{formatBrl(project.realizedProfitCents)}</b><small>lucro realizado</small></div><ChevronRight size={18} /></button>)}</div> : <EmptyState icon={HardHat} title="Nenhuma obra ativa" text="Cadastre ou ative uma obra para acompanhar seus números." />}
      </section>
      <section className="content-card"><div className="section-title"><div><h2>Últimos lançamentos</h2><p>Movimentações recentes</p></div></div><MovementList entries={data.ledger.slice(0, 5)} /></section>
    </div>
  </>;
}

function ProjectsPage({ data, selected, setSelected, open }: { data: AppData; selected: Project | null; setSelected: (id: string | null) => void; open: (m: ModalState) => void }) {
  const [query, setQuery] = useState(""); const [status, setStatus] = useState<"all" | ProjectStatus>("all");
  const filtered = data.projects.filter((project) => (status === "all" || project.status === status) && `${project.name} ${project.client ?? ""} ${project.address ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  if (selected) return <ProjectDetail project={selected} ledger={data.ledger} workers={data.workers} back={() => setSelected(null)} open={open} />;
  return <>
    <PageHeader eyebrow="OPERAÇÃO" title="Obras" subtitle="Contratos, equipe e resultado de cada projeto." action={<button className="primary-button" onClick={() => open({ kind: "project" })}><Plus size={18} />Nova obra</button>} />
    <div className="filter-bar"><label className="search-field"><Search size={18} /><input aria-label="Buscar obras" placeholder="Buscar obra, cliente ou endereço" value={query} onChange={(e) => setQuery(e.target.value)} /></label><select aria-label="Filtrar situação" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}><option value="all">Todas as situações</option>{Object.entries(projectStatus).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
    {filtered.length ? <section className="project-grid">{filtered.map((project) => <button className="project-card" key={project.id} onClick={() => setSelected(project.id)}><div className="project-card-top"><span className="project-icon"><HardHat size={21} /></span><StatusBadge status={project.status} /></div><h2>{project.name}</h2><p>{project.client || "Cliente não informado"}</p><div className="project-numbers"><div><span>Contrato</span><strong>{formatBrl(project.contractedCents)}</strong></div><div><span>Recebido</span><strong>{formatBrl(project.receivedCents)}</strong></div><div><span>Gasto</span><strong>{formatBrl(project.spentCents)}</strong></div><div className={project.realizedProfitCents >= 0 ? "profit" : "loss"}><span>Lucro</span><strong>{formatBrl(project.realizedProfitCents)}</strong></div></div><div className="card-link">Ver detalhes <ChevronRight size={17} /></div></button>)}</section> : <EmptyState icon={HardHat} title="Nenhuma obra encontrada" text="Ajuste os filtros ou cadastre a primeira obra." action={<button className="primary-button" onClick={() => open({ kind: "project" })}><Plus size={18} />Cadastrar obra</button>} />}
  </>;
}

function ProjectDetail({ project, ledger, workers, back, open }: { project: Project; ledger: LedgerEntry[]; workers: Worker[]; back: () => void; open: (m: ModalState) => void }) {
  const projectLedger = ledger.filter((entry) => entry.projectId === project.id);
  return <>
    <button className="back-link" onClick={back}><ChevronLeft size={18} />Voltar para obras</button>
    <div className="detail-hero"><div><div className="detail-title"><span><HardHat size={24} /></span><div><p className="eyebrow">DETALHES DA OBRA</p><h1>{project.name}</h1></div></div><p>{project.client || "Cliente não informado"} {project.address ? `· ${project.address}` : ""}</p></div><div className="detail-actions"><StatusBadge status={project.status} /><button className="secondary-button" onClick={() => open({ kind: "project", project })}><Pencil size={17} />Editar</button></div></div>
    <section className="summary-strip"><div><span>Contratado</span><strong>{formatBrl(project.contractedCents)}</strong></div><div><span>Recebido</span><strong>{formatBrl(project.receivedCents)}</strong></div><div><span>Custos</span><strong>{formatBrl(project.spentCents)}</strong></div><div><span>Lucro previsto</span><strong>{formatBrl(project.expectedProfitCents)}</strong></div><div className="highlight"><span>Lucro realizado</span><strong>{formatBrl(project.realizedProfitCents)}</strong></div></section>
    <div className="detail-grid">
      <section className="content-card span-2"><div className="section-title"><div><h2>Contratos e etapas</h2><p>Escopo financeiro da obra</p></div><button className="text-button" onClick={() => open({ kind: "contract", project })}><Plus size={16} />Contrato</button></div>
        {project.contracts.length ? project.contracts.map((contract) => <article className="contract-row" key={contract.id}><div className="contract-head"><span><FileText size={19} /></span><div><strong>{contract.name}</strong><small>{pricingLabel(contract.pricingModel)} · {contract.contractedAmountCents ? formatBrl(contract.contractedAmountCents) : contract.hourlyRateCents ? `${formatBrl(contract.hourlyRateCents)}/h` : "Por etapas"}</small></div><button className="icon-text" onClick={() => open({ kind: "stage", project, contract })}><Plus size={15} />Etapa</button></div>{contract.stages.length > 0 && <div className="stage-list">{contract.stages.map((stage) => <div key={stage.id}><span>{stage.sequence}</span><p>{stage.name}</p><strong>{formatBrl(stage.plannedAmountCents)}</strong></div>)}</div>}</article>) : <EmptyState icon={FileText} title="Sem contrato cadastrado" text="Adicione o primeiro contrato para calcular o lucro previsto." />}
      </section>
      <section className="content-card"><div className="section-title"><div><h2>Equipe vinculada</h2><p>{project.workers.length} trabalhadores</p></div><button className="text-button" onClick={() => open({ kind: "link-worker", project })}><UserPlus size={16} />Vincular</button></div>{project.workers.length ? <div className="people-mini-list">{project.workers.map((worker) => <div key={worker.id}><span>{worker.name.slice(0, 2).toUpperCase()}</span><div><strong>{worker.name}</strong><small>{worker.role || "Função não informada"}</small></div></div>)}</div> : <EmptyState icon={UsersRound} title="Equipe ainda vazia" text={workers.length ? "Vincule trabalhadores cadastrados a esta obra." : "Cadastre um trabalhador na área Pessoas."} />}</section>
      <section className="content-card"><div className="section-title"><div><h2>Histórico financeiro</h2><p>Despesas e recebimentos</p></div></div><MovementList entries={projectLedger.slice(0, 6)} /></section>
    </div>
  </>;
}

function FinancePage({ data, open }: { data: AppData; open: (m: ModalState) => void }) {
  const [type, setType] = useState("all"); const [project, setProject] = useState("all"); const [worker, setWorker] = useState("all");
  const [query, setQuery] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [status, setStatus] = useState("all");
  const entries = data.ledger.filter((entry) => (type === "all" || entry.type === type) && (project === "all" || entry.projectId === project) &&
    (worker === "all" || entry.workerId === worker) && (status === "all" || entry.status === status) &&
    (!from || entry.occurredOn >= from) && (!to || entry.occurredOn <= to) &&
    `${entry.description} ${entry.workerName ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <PageHeader eyebrow="MOVIMENTAÇÕES" title="Financeiro" subtitle="Entradas, saídas e histórico em um só lugar." />
    <section className="finance-overview"><div className="balance-feature"><span>Saldo geral</span><strong>{formatBrl(data.summary.balanceCents)}</strong><small>Recebimentos menos saídas realizadas</small></div><div><span>Entradas</span><strong>{formatBrl(data.ledger.filter((e) => e.direction === "in").reduce((sum, e) => sum + e.amountCents, 0))}</strong></div><div><span>Saídas</span><strong>{formatBrl(data.ledger.filter((e) => e.direction === "out").reduce((sum, e) => sum + e.amountCents, 0))}</strong></div></section>
    <section className="finance-actions"><button onClick={() => open({ kind: "advance" })}><WalletCards size={18} />Novo vale</button><button onClick={() => open({ kind: "expense" })}><TrendingDown size={18} />Nova despesa</button><button onClick={() => open({ kind: "receipt" })}><TrendingUp size={18} />Novo recebimento</button></section>
    <section className="content-card ledger-card"><div className="section-title"><div><h2>Histórico unificado</h2><p>{entries.length} lançamentos encontrados</p></div></div><div className="filter-bar finance-filters"><label className="search-field"><Search size={17} /><input aria-label="Buscar lançamento" placeholder="Buscar descrição ou pessoa" value={query} onChange={(e) => setQuery(e.target.value)} /></label><select value={type} onChange={(e) => setType(e.target.value)} aria-label="Tipo"><option value="all">Todos os tipos</option>{Object.entries(movementLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select value={project} onChange={(e) => setProject(e.target.value)} aria-label="Obra"><option value="all">Todas as obras</option>{data.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={worker} onChange={(e) => setWorker(e.target.value)} aria-label="Trabalhador"><option value="all">Todos os trabalhadores</option>{data.workers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><label className="date-filter">De<input aria-label="Data inicial" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label className="date-filter">Até<input aria-label="Data final" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label><select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Situação"><option value="all">Todas as situações</option><option value="confirmed">Confirmados</option></select></div>
      {entries.length ? <div className="ledger-table"><div className="ledger-table-head"><span>Lançamento</span><span>Obra / pessoa</span><span>Data</span><span>Valor</span></div>{entries.map((entry) => <MovementRow key={entry.id} entry={entry} />)}</div> : <EmptyState icon={ReceiptText} title="Nenhum lançamento encontrado" text="Ajuste os filtros ou registre uma nova movimentação." />}
    </section>
  </>;
}

function PeoplePage({ session, data, selected, setSelected, open, refresh }: { session: Session; data: AppData; selected: Worker | null; setSelected: (id: string | null) => void; open: (m: ModalState) => void; refresh: () => Promise<void> }) {
  const [query, setQuery] = useState(""); const [active, setActive] = useState("all"); const [area, setArea] = useState<"people" | "time" | "payroll">("people"); const [workerModule, setWorkerModule] = useState<"time" | "payroll" | null>(null);
  const filtered = data.workers.filter((worker) => (active === "all" || worker.active === (active === "active")) && `${worker.name} ${worker.role ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  if (area !== "people" && !selected) return <WorkforceModule session={session} data={data} initialView={area} onBack={() => setArea("people")} onChanged={refresh} />;
  if (selected) {
    const history = data.ledger.filter((entry) => entry.workerId === selected.id);
    if (workerModule) return <WorkforceModule session={session} data={data} initialView={workerModule} initialWorkerId={selected.id} onBack={() => setWorkerModule(null)} onChanged={refresh} />;
    const configuredRate = selected.paymentType === "daily" ? selected.dailyRateCents : selected.paymentType === "hourly" ? selected.hourlyRateCents : selected.weeklyRateCents;
    const paymentLabel = selected.paymentType === "daily" ? "Por diária" : selected.paymentType === "hourly" ? "Por hora" : "Semanal fixo";
    const frequencyLabel = ({ daily: "Diário", weekly: "Semanal", biweekly: "Quinzenal", monthly: "Mensal" })[selected.paymentFrequency ?? "weekly"];
    return <><button className="back-link" onClick={() => setSelected(null)}><ChevronLeft size={18} />Voltar para pessoas</button><div className="detail-hero person-hero"><div className="detail-title"><span className="avatar-large">{selected.name.slice(0, 2).toUpperCase()}</span><div><p className="eyebrow">TRABALHADOR</p><h1>{selected.name}</h1><p>{selected.role || "Função não informada"}</p></div></div><button className="secondary-button" onClick={() => open({ kind: "worker", worker: selected })}><Pencil size={17} />Editar</button></div><section className="summary-strip worker-summary extended"><div><span>Situação</span><strong>{selected.active ? "Ativo" : "Inativo"}</strong></div><div><span>Cálculo</span><strong>{paymentLabel}</strong></div><div><span>Frequência</span><strong>{frequencyLabel}</strong></div><div><span>Valor configurado</span><strong>{formatBrl(configuredRate ?? 0)}</strong></div><div><span>Vales pendentes</span><strong>{formatBrl(selected.advancesTotalCents ?? 0)}</strong></div><div><span>Próximo fechamento</span><strong>{selected.nextClosingOn ? formatDate(selected.nextClosingOn) : "A definir"}</strong></div></section><section className="worker-operational-actions"><button onClick={() => setWorkerModule("time")}><Clock3 size={19} /><div><strong>Consultar jornadas</strong><small>Ponto diário e semanal</small></div><ChevronRight size={17} /></button><button onClick={() => setWorkerModule("payroll")}><BriefcaseBusiness size={19} /><div><strong>Novo fechamento</strong><small>Calcular e revisar pagamento</small></div><ChevronRight size={17} /></button><button onClick={() => open({ kind: "advance", worker: selected })}><WalletCards size={19} /><div><strong>Novo vale</strong><small>Adiantamento do trabalhador</small></div><ChevronRight size={17} /></button></section><section className="content-card"><div className="section-title"><div><h2>Pagamentos e vales</h2><p>Histórico financeiro do trabalhador</p></div></div><MovementList entries={history} /></section></>;
  }
  return <><PageHeader eyebrow="EQUIPE" title="Pessoas" subtitle="Trabalhadores, jornadas e pagamentos." action={<button className="primary-button" onClick={() => open({ kind: "worker" })}><UserPlus size={18} />Novo trabalhador</button>} /><div className="people-area-links"><button onClick={() => setArea("time")}><Clock3 size={20} /><div><strong>Ponto e jornadas</strong><small>Registrar presença em lote</small></div><ChevronRight size={17} /></button><button onClick={() => setArea("payroll")}><FileText size={20} /><div><strong>Fechamentos</strong><small>Revisar e confirmar pagamentos</small></div><ChevronRight size={17} /></button></div><div className="filter-bar"><label className="search-field"><Search size={18} /><input aria-label="Buscar trabalhador" placeholder="Buscar por nome ou função" value={query} onChange={(e) => setQuery(e.target.value)} /></label><select aria-label="Situação" value={active} onChange={(e) => setActive(e.target.value)}><option value="all">Ativos e inativos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></div>{filtered.length ? <section className="people-grid">{filtered.map((worker) => { const rate = worker.paymentType === "daily" ? worker.dailyRateCents : worker.paymentType === "hourly" ? worker.hourlyRateCents : worker.weeklyRateCents; return <button className="person-card" key={worker.id} onClick={() => setSelected(worker.id)}><span className="avatar">{worker.name.slice(0, 2).toUpperCase()}</span><div className="person-info"><div><h2>{worker.name}</h2><span className={`activity-dot ${worker.active ? "active" : ""}`}>{worker.active ? "Ativo" : "Inativo"}</span></div><p>{worker.role || "Função não informada"}</p><dl><div><dt>Cálculo</dt><dd>{worker.paymentType === "daily" ? "Diária" : worker.paymentType === "hourly" ? "Hora" : "Semanal"}</dd></div><div><dt>Valor</dt><dd>{formatBrl(rate ?? 0)}</dd></div><div><dt>Fechamento</dt><dd>{({ daily: "Diário", weekly: "Semanal", biweekly: "Quinzenal", monthly: "Mensal" })[worker.paymentFrequency ?? "weekly"]}</dd></div></dl></div><ChevronRight size={18} /></button>; })}</section> : <EmptyState icon={UsersRound} title="Nenhum trabalhador encontrado" text="Ajuste a busca ou cadastre a primeira pessoa." />}</>;
}

function MorePage({ data, onSignOut }: { data: AppData; onSignOut: () => void }) {
  const items = [[Building2, "Dados da empresa", data.organization.name, false], [ShieldCheck, "Usuários e permissões", roleLabel(data.role), true], [ReceiptText, "Categorias financeiras", "Organize seus lançamentos", true], [ClipboardList, "Auditoria", `${data.audit.length} eventos recentes`, true], [Settings, "Configurações", "Preferências do sistema", true]] as const;
  return <><PageHeader eyebrow="ADMINISTRAÇÃO" title="Mais" subtitle="Empresa, segurança e configurações." /><section className="more-card">{items.map(([Icon, title, subtitle, soon]) => <button key={title} disabled={soon}><span><Icon size={20} /></span><div><strong>{title}</strong><small>{subtitle}</small></div>{soon ? <em>Em breve</em> : <ChevronRight size={18} />}</button>)}<button className="danger-link" onClick={onSignOut}><span><LogOut size={20} /></span><div><strong>Sair</strong><small>Encerrar esta sessão</small></div></button></section><div className="security-panel"><ShieldCheck size={22} /><div><strong>Dados protegidos</strong><p>Seu acesso é autenticado e todas as alterações financeiras mantêm responsável, data e histórico.</p></div></div></>;
}

function MovementList({ entries }: { entries: LedgerEntry[] }) {
  return entries.length ? <div className="movement-list">{entries.map((entry) => <MovementRow key={entry.id} entry={entry} compact />)}</div> : <EmptyState icon={ReceiptText} title="Sem lançamentos" text="As movimentações aparecerão aqui." />;
}
function MovementRow({ entry, compact = false }: { entry: LedgerEntry; compact?: boolean }) {
  const Icon = entry.direction === "in" ? TrendingUp : TrendingDown;
  return <div className={`movement-row ${compact ? "compact" : ""}`}><span className={`movement-icon ${entry.direction}`}><Icon size={18} /></span><div className="movement-main"><strong>{entry.description}</strong><small>{movementLabels[entry.type]}</small></div>{!compact && <div className="movement-context"><strong>{entry.projectName || "Despesa geral"}</strong><small>{entry.workerName || "—"}</small></div>}<time>{formatDate(entry.occurredOn)}</time><b className={entry.direction}>{entry.direction === "out" ? "− " : "+ "}{formatBrl(entry.amountCents)}</b></div>;
}

function EntityModal({ state, data, session, close, completed }: { state: ModalState; data: AppData; session: Session; close: () => void; completed: (message: string) => Promise<void> }) {
  const [step, setStep] = useState<"form" | "review" | "success">("form");
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [proposalId, setProposalId] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const financial = ["advance", "expense", "receipt"].includes(state.kind);
  const title = modalTitle(state);
  useEffect(() => { document.body.classList.add("modal-open"); return () => document.body.classList.remove("modal-open"); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const form = new FormData(event.currentTarget); const next = buildPayload(state, form);
      if (state.kind === "advance") {
        const proposal = await api.createProposal(session, { mode: "structured", draft: next as { workerId: string; projectId: string; amountCents: number; paidOn: string; note: string | null } });
        setProposalId(proposal.id);
      }
      if (financial) setIdempotencyKey(crypto.randomUUID());
      setPayload(next);
      if (financial) setStep("review"); else { await executeMutation(state, next, session); await completed(`${title} salvo com sucesso.`); close(); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar."); } finally { setLoading(false); }
  }
  async function confirm() {
    if (!payload) return; setLoading(true); setError("");
    try {
      if (state.kind === "advance") await api.confirmProposal(session, proposalId, idempotencyKey);
      else await executeMutation(state, payload, session, idempotencyKey);
      await completed(`${title} confirmado com sucesso.`); setStep("success");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível confirmar."); } finally { setLoading(false); }
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}><section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><div><p className="eyebrow">{financial ? `ETAPA ${step === "form" ? "1 DE 2" : "2 DE 2"}` : "CADASTRO"}</p><h2 id="modal-title">{step === "review" ? `Confirmar ${title.toLowerCase()}` : title}</h2></div><button className="close-button" onClick={close} aria-label="Fechar"><X size={21} /></button></header>
    {step === "success" ? <div className="modal-success"><span><Check size={30} /></span><h3>Lançamento concluído</h3><p>O histórico financeiro e os indicadores já foram atualizados.</p><button className="primary-button" onClick={close}>Concluir</button></div> : step === "review" && payload ? <Review state={state} payload={payload} data={data} error={error} loading={loading} back={() => setStep("form")} confirm={confirm} /> : <form className="entity-form" onSubmit={submit}><FormFields state={state} data={data} />{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="secondary-button" onClick={close}>Cancelar</button><button className="primary-button" disabled={loading}>{loading ? "Salvando…" : financial ? "Revisar lançamento" : "Salvar"}<ChevronRight size={17} /></button></div></form>}
    </section></div>;
}

function FormFields({ state, data }: { state: ModalState; data: AppData }) {
  const p = state.project; const w = state.worker; const c = state.contract;
  switch (state.kind) {
    case "project": return <><label>Nome da obra<input name="name" required minLength={2} defaultValue={p?.name} placeholder="Ex.: Residência Jardim América" /></label><div className="form-row"><label>Cliente<input name="client" required minLength={2} defaultValue={p?.client ?? ""} placeholder="Nome do cliente" /></label><label>Situação<select name="status" defaultValue={p?.status ?? "planning"}>{Object.entries(projectStatus).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div><label>Endereço<input name="address" defaultValue={p?.address ?? ""} placeholder="Rua, número, bairro e cidade" /></label><label>Custo previsto (R$)<input name="expectedCost" inputMode="decimal" defaultValue={p ? centsInput(p.plannedCostCents) : "0,00"} /></label></>;
    case "worker": return <><label>Nome completo<input name="name" required minLength={2} defaultValue={w?.name} /></label><div className="form-row"><label>Função<input name="role" required minLength={2} defaultValue={w?.role ?? ""} placeholder="Ex.: Pedreiro" /></label><label>Situação<select name="active" defaultValue={String(w?.active ?? true)}><option value="true">Ativo</option><option value="false">Inativo</option></select></label></div><div className="form-row"><label>Forma de cálculo<select name="paymentType" defaultValue={w?.paymentType ?? "daily"}><option value="daily">Por diária</option><option value="hourly">Por hora</option><option value="weekly">Semanal fixo</option></select></label><label>Valor configurado (R$)<input name="rate" required inputMode="decimal" defaultValue={w ? centsInput((w.paymentType === "daily" ? w.dailyRateCents : w.paymentType === "hourly" ? w.hourlyRateCents : w.weeklyRateCents) ?? 0) : ""} placeholder="0,00" /></label></div><div className="form-row"><label>Frequência do fechamento<select name="paymentFrequency" defaultValue={w?.paymentFrequency ?? "weekly"}><option value="daily">Diária</option><option value="weekly">Semanal</option><option value="biweekly">Quinzenal</option><option value="monthly">Mensal</option></select></label><label>Dias normais por semana<input name="normalWeekDays" type="number" min="1" max="7" required defaultValue={w?.normalWeekDays ?? 6} /></label></div></>;
    case "advance": return <><label>Trabalhador<select name="workerId" required defaultValue={w?.id ?? ""}><option value="">Selecione</option>{data.workers.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Obra<select name="projectId" required defaultValue={p?.id ?? ""}><option value="">Selecione</option>{data.projects.filter((item) => item.status !== "completed").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="form-row"><label>Valor (R$)<input name="amount" required inputMode="decimal" placeholder="0,00" /></label><label>Data<input name="date" required type="date" defaultValue={today} /></label></div><label>Observação <small>opcional</small><textarea name="note" rows={3} maxLength={500} placeholder="Motivo ou referência do vale" /></label></>;
    case "expense": return <><label>Descrição<input name="description" required minLength={2} placeholder="Ex.: Compra de cimento" /></label><div className="form-row"><label>Categoria<select name="category" required defaultValue="Material"><option>Material</option><option>Mão de obra</option><option>Transporte</option><option>Equipamento</option><option>Alimentação</option><option>Administrativo</option><option>Outros</option></select></label><label>Vinculação<select name="projectId" defaultValue={p?.id ?? ""}><option value="">Despesa geral</option>{data.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><div className="form-row"><label>Valor (R$)<input name="amount" required inputMode="decimal" placeholder="0,00" /></label><label>Data<input name="date" required type="date" defaultValue={today} /></label></div></>;
    case "receipt": return <><label>Descrição<input name="description" required minLength={2} placeholder="Ex.: Parcela de entrada" /></label><label>Obra<select name="projectId" required defaultValue={p?.id ?? ""}><option value="">Selecione</option>{data.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="form-row"><label>Valor recebido (R$)<input name="amount" required inputMode="decimal" placeholder="0,00" /></label><label>Data<input name="date" required type="date" defaultValue={today} /></label></div></>;
    case "contract": return <><input type="hidden" name="projectId" value={p?.id} /><label>Nome do contrato<input name="name" required minLength={2} placeholder="Ex.: Empreitada principal" /></label><label>Modelo<select name="pricingModel" defaultValue="fixed_contract"><option value="fixed_contract">Empreitada</option><option value="stage">Por etapa</option><option value="hourly">Por hora</option></select></label><div className="form-row"><label>Valor contratado (R$)<input name="contractedAmount" inputMode="decimal" placeholder="0,00" /></label><label>Valor por hora (R$)<input name="hourlyRate" inputMode="decimal" placeholder="Somente contrato por hora" /></label></div><label>Custo previsto (R$)<input name="expectedCost" inputMode="decimal" defaultValue="0,00" /></label><div className="form-row"><label>Início<input name="startsOn" type="date" /></label><label>Previsão de término<input name="endsOn" type="date" /></label></div></>;
    case "stage": return <><input type="hidden" name="contractId" value={c?.id} /><label>Nome da etapa<input name="name" required minLength={2} placeholder="Ex.: Fundação" /></label><div className="form-row"><label>Ordem<input name="sequence" type="number" min="1" required defaultValue={(c?.stages.length ?? 0) + 1} /></label><label>Valor previsto (R$)<input name="plannedAmount" required inputMode="decimal" placeholder="0,00" /></label></div><label>Custo previsto (R$)<input name="expectedCost" inputMode="decimal" defaultValue="0,00" /></label></>;
    case "link-worker": return <><input type="hidden" name="projectId" value={p?.id} /><label>Trabalhador<select name="workerId" required><option value="">Selecione</option>{data.workers.filter((item) => item.active && !p?.workers.some((linked) => linked.id === item.id)).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role || "Sem função"}</option>)}</select></label><p className="form-hint">O vínculo permite acompanhar vales e pagamentos desta pessoa na obra.</p></>;
  }
}

function Review({ state, payload, data, error, loading, back, confirm }: { state: ModalState; payload: Record<string, unknown>; data: AppData; error: string; loading: boolean; back: () => void; confirm: () => void }) {
  const project = data.projects.find((item) => item.id === payload.projectId); const worker = data.workers.find((item) => item.id === payload.workerId);
  return <div className="review-body"><div className="review-amount"><span>VALOR DO LANÇAMENTO</span><strong>{formatBrl(Number(payload.amountCents))}</strong></div><dl className="review-list"><div><dt>Tipo</dt><dd>{state.kind === "advance" ? "Vale / adiantamento" : state.kind === "expense" ? (project ? "Despesa da obra" : "Despesa geral") : "Recebimento"}</dd></div>{worker && <div><dt>Trabalhador</dt><dd>{worker.name}</dd></div>}<div><dt>Obra</dt><dd>{project?.name || "Geral"}</dd></div><div><dt>Data</dt><dd>{formatDate(String(payload.paidOn ?? payload.incurredOn ?? payload.receivedOn))}</dd></div>{typeof payload.description === "string" && payload.description && <div><dt>Descrição</dt><dd>{payload.description}</dd></div>}</dl><div className="safe-callout"><ShieldCheck size={19} /><span>Confira os dados. O registro definitivo mantém data e responsável no histórico de auditoria.</span></div>{error && <p className="form-error">{error}</p>}<div className="form-actions"><button className="secondary-button" onClick={back}><ChevronLeft size={17} />Corrigir</button><button className="primary-button" disabled={loading} onClick={confirm}>{loading ? "Confirmando…" : "Confirmar lançamento"}<Check size={17} /></button></div></div>;
}

function buildPayload(state: ModalState, form: FormData): Record<string, unknown> {
  const value = (name: string) => String(form.get(name) ?? "").trim();
  switch (state.kind) {
    case "project": return { name: value("name"), client: value("client"), address: value("address") || null, description: null, status: value("status"), expectedCostCents: nonNegativeMoneyToCents(form.get("expectedCost")), startsOn: null, endsOn: null };
    case "worker": { const paymentType = value("paymentType"); const rate = moneyToCents(form.get("rate")); return { name: value("name"), role: value("role") || null, paymentType, paymentFrequency: value("paymentFrequency"), normalWeekDays: Number(value("normalWeekDays")), dailyRateCents: paymentType === "daily" ? rate : null, hourlyRateCents: paymentType === "hourly" ? rate : null, weeklyRateCents: paymentType === "weekly" ? rate : null, active: value("active") === "true" }; }
    case "advance": return { workerId: value("workerId"), projectId: value("projectId"), amountCents: moneyToCents(form.get("amount")), paidOn: value("date"), note: value("note") || null };
    case "expense": return { projectId: value("projectId") || null, description: value("description"), category: value("category"), amountCents: moneyToCents(form.get("amount")), incurredOn: value("date") };
    case "receipt": return { projectId: value("projectId"), contractId: null, description: value("description"), amountCents: moneyToCents(form.get("amount")), receivedOn: value("date") };
    case "contract": return { projectId: value("projectId"), name: value("name"), pricingModel: value("pricingModel"), contractedAmountCents: nullableMoney(form.get("contractedAmount")), hourlyRateCents: nullableMoney(form.get("hourlyRate")), expectedCostCents: nonNegativeMoneyToCents(form.get("expectedCost")), startsOn: value("startsOn") || null, endsOn: value("endsOn") || null };
    case "stage": return { contractId: value("contractId"), name: value("name"), sequence: Number(value("sequence")), plannedAmountCents: moneyToCents(form.get("plannedAmount")), expectedCostCents: nonNegativeMoneyToCents(form.get("expectedCost")), completedOn: null };
    case "link-worker": return { workerId: value("workerId") };
  }
}
async function executeMutation(state: ModalState, payload: Record<string, unknown>, session: Session, idempotencyKey = "") {
  switch (state.kind) {
    case "project": return state.project ? api.updateProject(session, state.project.id, payload) : api.createProject(session, payload);
    case "worker": return state.worker ? api.updateWorker(session, state.worker.id, payload) : api.createWorker(session, payload);
    case "expense": return api.createExpense(session, payload, idempotencyKey); case "receipt": return api.createReceipt(session, payload, idempotencyKey);
    case "contract": return api.createContract(session, payload); case "stage": return api.createContractStage(session, payload);
    case "link-worker": return api.linkProjectWorker(session, state.project!.id, payload); case "advance": return;
  }
}
function modalTitle(state: ModalState) { return ({ project: state.project ? "Editar obra" : "Nova obra", worker: state.worker ? "Editar trabalhador" : "Novo trabalhador", advance: "Novo vale", expense: "Nova despesa", receipt: "Novo recebimento", contract: "Novo contrato", stage: "Nova etapa", "link-worker": "Vincular trabalhador" })[state.kind]; }
function pricingLabel(value: Contract["pricingModel"]) { return ({ fixed_contract: "Empreitada", stage: "Por etapa", hourly: "Por hora" })[value]; }
function centsInput(cents: number) { return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
