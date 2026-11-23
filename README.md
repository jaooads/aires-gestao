# Aires Gestão

MVP mobile-first para a gestão financeira da Aires Construções. A primeira entrega implementa login, autorização por papel e o fluxo seguro de lançamento de vale: preparação, revisão, confirmação idempotente, saída de caixa e auditoria.

## Estrutura

- `apps/web` — React + TypeScript + Vite
- `apps/api` — Node.js + TypeScript + Express
- `packages/shared` — tipos e validações compartilhados
- `supabase` — banco PostgreSQL, RLS, transação e dados iniciais
- `docs/ARCHITECTURE.md` — decisões, escopo e evolução do produto

## Pré-requisitos

- Node.js 22 ou mais recente
- Um projeto Supabase
- OpenAI API apenas para o modo de linguagem natural; o formulário funciona sem ela

## Configuração local

1. Instale as dependências na raiz:

   ```bash
   npm install
   ```

2. Copie `apps/api/.env.example` para `apps/api/.env` e `apps/web/.env.example` para `apps/web/.env`.

3. No Supabase, aplique `supabase/migrations/202611230001_initial.sql` e depois `supabase/seed.sql`.

4. Crie o primeiro usuário em Authentication > Users e associe o UUID dele à organização usando o comando comentado no final de `supabase/seed.sql`.

5. Preencha as variáveis:

   - No frontend: `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
   - Somente na API: `SUPABASE_SECRET_KEY` e, quando desejado, `OPENAI_API_KEY`.
   - Nunca use a chave secreta do Supabase nem a chave da OpenAI em uma variável `VITE_*`.

6. Inicie os dois aplicativos:

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

## Comportamento do vale

- A proposta expira em 15 minutos e é vinculada ao usuário autenticado.
- `owner`, `admin` e `finance` podem lançar; `viewer` possui somente leitura.
- A confirmação exige `Idempotency-Key` UUID. Repetições retornam o mesmo lançamento.
- Vale, movimentação do caixa e auditoria são gravados na mesma transação.
- O valor do vale é adiantamento e será compensado no saldo do trabalhador; não é custo adicional à diária.

## Próximas entregas sugeridas

1. Cadastros de obras, trabalhadores e contratos.
2. Apuração de diárias/horas e compensação automática de adiantamentos.
3. Despesas gerais ou por obra e recebimentos de contratos/etapas.
4. Estornos auditáveis.
5. Dashboard com lucro previsto, realizado e fluxo de caixa separados.
