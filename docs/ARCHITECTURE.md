# Aires Gestão — arquitetura e escopo do MVP

## Decisões consolidadas

- Interface React + TypeScript, mobile-first e instalável como PWA em uma etapa posterior.
- Supabase Auth para identidade e PostgreSQL para dados financeiros.
- Dados do produto isolados nos schemas `aires` e `aires_private`, permitindo compartilhar uma instância Supabase sem misturar tabelas.
- API Node.js + TypeScript como única porta de escrita financeira.
- OpenAI Responses API apenas no backend. A assinatura ChatGPT Plus não é usada como crédito de API.
- Todo lançamento sugerido pela IA vira uma proposta temporária e exige confirmação humana.
- Valores monetários são inteiros em centavos; datas de negócio usam `date`; instantes de auditoria usam `timestamptz`.
- Lançamentos confirmados não são apagados. Correções serão estornos vinculados ao lançamento original.

## Limites do MVP

1. Login por e-mail e senha.
2. Organizações, usuários e papéis (`owner`, `admin`, `finance`, `viewer`).
3. Cadastro-base de obras e trabalhadores.
4. Criação e confirmação de vale/adiantamento com idempotência e auditoria.
5. Base de dados pronta para contratos por empreitada, etapa ou hora; diárias; despesas por obra ou gerais; recebimentos; lucro previsto e realizado.

Ficam para as próximas entregas: telas completas de cadastro, apuração semanal de diárias, contratos/medições, contas a pagar/receber, estornos, anexos e dashboard financeiro.

## Fluxo seguro do vale

1. O navegador obtém uma sessão do Supabase Auth.
2. A API valida o token no Supabase, carrega a associação ativa e verifica o papel.
3. O usuário preenche os campos ou envia uma frase. Quando a frase é usada, a OpenAI devolve somente dados estruturados; a API ainda resolve trabalhador e obra no banco e nunca aceita IDs inventados pelo modelo.
4. A API grava uma proposta `pending`, ligada ao usuário e com expiração curta.
5. O navegador mostra o resumo imutável e pede confirmação.
6. Ao confirmar, envia uma `Idempotency-Key` exclusiva.
7. Uma função transacional bloqueia a proposta, confere estado e validade e cria o vale, a saída de caixa e o evento de auditoria juntos. Repetir a mesma chave retorna o mesmo vale.

## Componentes

- `apps/web`: login, formulário, revisão e confirmação.
- `apps/api`: autenticação, autorização, interpretação opcional por IA e orquestração.
- `packages/shared`: schemas de validação e tipos compartilhados.
- `supabase/migrations`: modelo relacional, RLS, função transacional e auditoria.

## Modelo financeiro

- Contratos possuem `pricing_model`: `fixed_contract`, `stage` ou `hourly`.
- Trabalhadores podem ter valor de diária; os vales reduzem o saldo a pagar, mas não aumentam o custo da mão de obra.
- Despesas aceitam `project_id` nulo para gastos gerais e preenchido para gastos da obra.
- Recebimentos pertencem a uma obra/contrato.
- Lucro previsto deriva de valores contratados menos custos previstos; lucro realizado deriva de recebimentos menos custos reconhecidos. Caixa e competência não são misturados.

## Segurança

- Chaves `OPENAI_API_KEY` e `SUPABASE_SECRET_KEY` existem somente na API.
- O frontend recebe apenas URL do Supabase e chave publicável.
- O schema `aires` é a única superfície de dados exposta ao app; `aires_private` contém auxiliares de autorização e permanece fora da Data API.
- Tabelas expostas usam RLS e o cliente autenticado recebe somente leitura do próprio tenant.
- Toda escrita financeira exige a API, papel autorizado e validação de schema.
- A auditoria guarda ator, ação, entidade e metadados, sem armazenar segredos.
