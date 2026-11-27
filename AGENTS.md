# AGENTS.md — Aires Gestão

## Objetivo
Desenvolver e manter o **Aires Gestão**, sistema mobile-first de administração da Aires Construções (Brusque/SC). Priorizar simplicidade para usuários pouco familiarizados com tecnologia, dados confiáveis, segurança e baixo custo operacional.

## Stack-alvo (validar contra o repositório antes de alterar)
- Frontend: React + TypeScript; Tailwind CSS e componentes reutilizáveis.
- Backend: Node.js + TypeScript.
- Banco e autenticação: PostgreSQL / Supabase.
- IA: OpenAI API **somente via backend**.
- Não migrar bibliotecas, trocar stack ou adicionar dependências sem necessidade demonstrada.

## Regras de negócio essenciais
1. **Obras e clientes:** cadastro, contrato, status, valores, custos previstos e realizados.
2. **Recebimento do cliente:** acordo individual por empreitada, etapa ou hora; permitir parcelas, pagamentos parciais, datas previstas e valor efetivamente recebido.
3. **Trabalhadores:** registros por obra, jornadas/diárias, valores individuais e formas flexíveis de pagamento (semanal, pontual etc.).
4. **Vales/adiantamentos:** vinculados ao trabalhador, com obra quando aplicável. São pagamentos antecipados, **não um custo adicional** à remuneração que será apurada. Manter saldo a compensar e evitar dupla contabilização.
5. **Despesas:** combustível, alimentação/marmitas, aluguel de máquinas, manutenção, imprevistos e outras; permitir vincular a uma obra ou classificar como despesa geral.
6. **Materiais:** geralmente comprados pelo cliente, mas a responsabilidade varia conforme o contrato; registrar essa condição por obra.
7. **Indicadores financeiros:** separar valores previstos, devidos, pagos e recebidos; apresentar caixa e lucro projetado/realizado sem confundi-los. Não somar adiantamentos duas vezes.
8. **Histórico:** lançamentos financeiros devem ter autoria, data e trilha de auditoria. Corrigir mediante ajuste/estorno rastreável, evitando exclusão silenciosa.

## Assistente GPT — limites de atuação
- O GPT interpreta comandos em português e propõe operações; **não altera o banco diretamente**.
- Fluxo obrigatório: mensagem -> interpretação estruturada -> resolução de IDs -> validação no servidor -> prévia -> confirmação explícita -> transação atômica -> resposta de sucesso.
- Nunca presumir trabalhador/obra quando nomes forem ambíguos. Perguntar apenas o indispensável.
- Usar idempotência para evitar lançamentos duplicados em retries e duplo clique.
- Calcular saldos e lucros no backend, nunca confiar em cálculo livre do modelo.
- Não enviar dados pessoais ou financeiros desnecessários ao modelo.
- Chaves, tokens e credenciais somente no backend/ambiente seguro; nunca em frontend, logs ou Git.
- OpenAI API possui cobrança própria; não pressupor uso da assinatura ChatGPT Plus.

## Segurança e qualidade
- Verificar autenticação e autorização no backend em toda operação sensível; aplicar menor privilégio e isolamento por empresa/usuário.
- Validar entradas e valores monetários; usar centavos inteiros ou tipo decimal apropriado, nunca ponto flutuante para contabilidade.
- Usar transações para mudanças financeiras correlacionadas e constraints no banco.
- Cobrir regras críticas com testes: vale, compensação, duplicidade, pagamentos parciais e projeção de lucro.
- Não alterar dados reais, executar migrações destrutivas ou disparar operações financeiras externas sem autorização explícita.

## Economia de tokens e disciplina de execução
- **Escopo mínimo:** implementar somente a tarefa solicitada. Não ampliar a demanda por iniciativa própria.
- **Leitura direcionada:** localizar os arquivos necessários primeiro; não varrer, reler ou resumir todo o repositório a cada tarefa.
- Consultar este arquivo uma vez por tarefa; usar os padrões e componentes existentes.
- Preferir diffs pequenos e incrementais. Não refatorar código não relacionado.
- Não repetir contexto, conteúdo integral de arquivos ou logs extensos na resposta.
- Fazer perguntas apenas quando uma decisão bloquear a implementação; caso contrário, escolher a opção reversível mais simples e registrar a suposição brevemente.
- Executar primeiro testes/lint focados nos arquivos alterados; ampliar apenas se necessário.
- Não rodar builds ou suítes completas repetidamente sem motivo.
- Se uma tarefa for grande ou arriscada, apresentar plano **curto** (até 5 passos) antes de alterar arquivos.
- Não sacrificar validação, segurança ou testes financeiros para economizar tokens.

## Formato da resposta após cada tarefa
Responder em português do Brasil, de forma breve:
1. **Feito:** resultado em 1–3 frases.
2. **Arquivos:** apenas os arquivos alterados.
3. **Verificação:** testes executados e resultado (ou motivo de não execução).
4. **Pendência:** somente se houver bloqueio ou próximo passo relevante.

## Primeira entrega prioritária
Fluxo seguro de registro de **vale de R$ 200 para Marcelo na Obra do Centro**, partindo de uma mensagem ao assistente e exigindo confirmação antes da persistência. O exemplo é fictício; não criar esses registros como dados reais sem instrução.
