import { Building2, Database, FileKey2, RefreshCw } from "lucide-react";

export function SupabaseSetup() {
  return (
    <main className="setup-page">
      <section className="setup-card">
        <div className="setup-brand">
          <span><Building2 size={23} /></span>
          <div><strong>Aires</strong><small>GESTÃO</small></div>
        </div>

        <div className="setup-icon"><Database size={29} /></div>
        <p className="eyebrow">CONFIGURAÇÃO INICIAL</p>
        <h1>Vamos conectar o Supabase</h1>
        <p className="setup-copy">
          A interface está pronta. Falta informar onde os dados da Aires Construções serão armazenados.
        </p>

        <ol className="setup-steps">
          <li>
            <span>1</span>
            <div><strong>Crie o arquivo de configuração</strong><small>Copie <code>apps/web/.env.example</code> para <code>apps/web/.env</code>.</small></div>
          </li>
          <li>
            <span>2</span>
            <div><strong>Informe as duas chaves públicas</strong><small>Preencha a URL do projeto e a chave publicável do Supabase.</small></div>
          </li>
          <li>
            <span>3</span>
            <div><strong>Reinicie o sistema</strong><small>Pare o servidor e execute <code>npm run dev</code> novamente.</small></div>
          </li>
        </ol>

        <div className="setup-note"><FileKey2 size={18} /><span>A chave secreta continua protegida somente no backend.</span></div>
        <button className="primary-button" onClick={() => window.location.reload()}>
          Já configurei, verificar novamente <RefreshCw size={17} />
        </button>
      </section>
    </main>
  );
}

