# Aires Gestão

MVP mobile-first para a gestão financeira e operacional da Aires Construções. A aplicação reúne dashboard, obras, contratos e etapas, trabalhadores, histórico financeiro e os fluxos confirmados de vale, despesa e recebimento.

## Estrutura

- `apps/web` — React + TypeScript + Vite
- `apps/api` — Node.js + TypeScript + Express
- `packages/shared` — tipos e validações compartilhados
- `supabase` — banco PostgreSQL, RLS, transação e dados iniciais
- `docs/ARCHITECTURE.md` — decisões, escopo e evolução do produto

## Pré-requisitos

- Node.js 22 ou mais recente
- Um projeto Supabase, que pode ser compartilhado com outro sistema

## Configuração local

1. Instale as dependências na raiz:

   ```bash
   npm install
   ```

2. Copie `apps/api/.env.example` para `apps/api/.env` e `apps/web/.env.example` para `apps/web/.env`.

3. No SQL Editor do Supabase, aplique as migrations ainda pendentes em ordem. Se `202611240002_workforce_payroll.sql` já foi executada, não a reaplique: execute somente `202611250001_workforce_payroll_hardening.sql` para receber os ajustes posteriores.

4. Em **Integrations > Data API > Settings**, adicione somente `aires` em **Exposed schemas**. Não exponha `aires_private`.

5. Aplique `supabase/seed.sql`, crie o primeiro usuário em Authentication > Users e associe o UUID dele à organização usando o comando comentado no final do arquivo.

6. Preencha as variáveis:

   - No frontend: `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
   - Somente na API: `SUPABASE_SECRET_KEY` e `SUPABASE_DB_SCHEMA=aires`.
   - Nunca use a chave secreta do Supabase em uma variável `VITE_*`.

7. Inicie os dois aplicativos:

   ```bash
   npm run dev
   ```

   Interface: `http://localhost:5173` · API: `http://localhost:3000`

## Verificações

```bash
npm run typecheck
npm test
npm run build
```

## Fluxos principais

- As cinco áreas — Início, Obras, Financeiro, Pessoas e Mais — usam dados persistidos do Supabase.
- Obras aceitam planejamento, ativa, pausada e concluída, com contratos, etapas, equipe e indicadores.
- Despesas gerais ou por obra e recebimentos por obra exigem revisão e chave de idempotência.
- Jornadas possuem visão diária/semanal, registro em lote e bloqueio após inclusão em fechamento.
- Fechamentos recalculam remuneração, vales, ajustes e rateios no backend antes do pagamento idempotente.
- Valores monetários são enviados e calculados como inteiros em centavos.

### Comportamento do vale

- A proposta expira em 15 minutos e é vinculada ao usuário autenticado.
- `owner`, `admin` e `finance` podem lançar; `viewer` possui somente leitura.
- A confirmação exige `Idempotency-Key` UUID. Repetições retornam o mesmo lançamento.
- Vale, movimentação do caixa e auditoria são gravados na mesma transação.
- O valor do vale é adiantamento e será compensado no saldo do trabalhador; não é custo adicional à diária.

## Compartilhamento seguro do projeto Supabase

- O Aires usa somente os schemas `aires` e `aires_private` e não cria tabelas em `public`.
- `aires_private` nunca deve ser exposto pela Data API.
- O Supabase Auth é compartilhado pelo projeto, mas associação à empresa e autorização ficam nas tabelas e políticas do Aires.
- Cotas, indisponibilidade e manutenção continuam compartilhadas com o outro sistema hospedado no mesmo projeto.

## Próximas entregas sugeridas

1. Apuração e pagamento de diárias/horas, com compensação automática de adiantamentos.
2. Estornos auditáveis.
3. Gestão de usuários, permissões e categorias pela interface.
4. Anexos e exportações financeiras.
