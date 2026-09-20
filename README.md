# VisioPro Solar

Faturamento para usinas de geração compartilhada. A usina fotografa a conta de energia do cliente, a IA lê os dados, alguém confere, e o app emite a fatura da usina em PDF com PIX e envia pelo WhatsApp.

**Stack:** Next.js 15 (App Router) na Vercel · Supabase (Postgres, Auth, Storage, RLS) · leitura da conta por IA (OpenRouter ou Anthropic) · Evolution API para WhatsApp · @react-pdf para a fatura.

Leitura: defina `OPENROUTER_API_KEY` + `OPENROUTER_MODEL` (ex.: `anthropic/claude-sonnet-4.5`) **ou** `ANTHROPIC_API_KEY`. Se as duas existirem, usa o OpenRouter.

## Estrutura

```
supabase/migrations/0001_init.sql   esquema, RLS, bucket de contas
src/lib/calculo.ts                  motor de cálculo (3 modos, centavos)  + calculo.test.ts
src/lib/pix.ts                      PIX copia e cola (EMV/BCB)
src/lib/leitor/                     leitura da conta (OpenRouter ou Anthropic)
src/lib/pdf/fatura.tsx              PDF da fatura (QR code PIX)
src/lib/whatsapp.ts                 Evolution API
src/app/(app)/actions.ts            ações de servidor (clientes, faturas, ajustes, equipe)
src/app/api/contas/leitura          upload + leitura
src/app/api/faturas/[id]/pdf        PDF da fatura
src/app/api/faturas/csv             planilha das faturas
src/app/api/cron/lembretes          lembrete diário de vencimento
```

## Deploy passo a passo

### 1. Supabase
1. Crie o projeto e rode as migrações no **SQL Editor**, uma de cada vez e nesta ordem:
   `0001_init.sql` → `0002_modo_conta_cheia.sql` (sozinha) → `0003_conta_cheia.sql` → `0004_financeiro_asaas.sql`.
2. **Authentication > URL Configuration**
   - Site URL: `https://solar.visiopro.app.br` (a URL final do app)
   - Redirect URLs: `https://solar.visiopro.app.br/auth/callback`
3. **Authentication > Email Templates**, troque o link dos modelos para o formato com `token_hash` (o app valida no servidor):
   - *Invite user*: `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite&next=/definir-senha`
   - *Reset password*: `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/definir-senha`
   - *Confirm signup*: `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup&next=/onboarding`
4. Para e-mails saírem com o nome da VisioPro, configure um SMTP próprio em **Project Settings > Auth > SMTP** (o SMTP padrão do Supabase tem limite baixo de envios).

### 2. Vercel
1. Importe o repositório. Framework: Next.js.
2. Variáveis de ambiente: copie de `.env.example` e preencha.
   - `CRON_SECRET`: gere uma senha longa. A Vercel envia esse valor ao chamar o cron.
3. O `vercel.json` agenda os lembretes todo dia às 12h UTC (9h de Brasília).

### 3. WhatsApp (Evolution API)
1. Crie uma instância para a usina e conecte o número dela pelo QR code.
2. No app, em **Ajustes**, preencha **Instância do WhatsApp** com o nome dessa instância.
3. `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` ficam só na Vercel; a usina nunca vê a chave.

### 4. Asaas (cobrança com baixa automática)
1. No Asaas: **Integrações > Chave de API**, gere a chave (sandbox para testar, produção depois).
2. No app: **Ajustes > Cobrança automática**, cole a chave, escolha o ambiente e salve. O app testa a conexão.
3. Ainda em Ajustes aparecem a **URL** e o **token** do webhook. No Asaas: **Integrações > Webhooks**, crie um webhook com essa URL, esse token e os eventos de cobrança.
4. Teste no sandbox: emita uma fatura, pague a cobrança pelo painel do sandbox e confira se ela vira "paga" sozinha.
5. Cliente precisa ter **CPF ou CNPJ** cadastrado para ser cobrado pelo Asaas.

Se "O Asaas avisa o cliente" estiver ligado, o Asaas manda e-mail/SMS (com custo por envio) e o app não manda lembretes próprios no WhatsApp para essas faturas.

### 5. Primeiro acesso
1. Abra o app, **Criar conta da usina**, confirme o e-mail.
2. Cadastre a usina (vira dono), complete PIX e WhatsApp em **Ajustes**.
3. Convide operadores em **Ajustes > Equipe**.

## Regras de cálculo

**Padrão: % sobre a conta cheia** (conta no nome da usina, chega com tarifa mínima)

```
conta sem usina = consumo do mês × (TUSD + TE com tributos) + bandeira + iluminação pública
fatura do cliente = conta sem usina − X%
```

A conta que chega (tarifa mínima) é custo da usina: fica registrada como `custo_usina_centavos` e aparece só para a equipe (resultado por fatura e no painel). Nunca vai para o PDF do cliente. O dono pode ajustar o valor da conta sem usina à mão; a fatura registra que houve ajuste.

A IA lê TUSD e TE separadas e o app soma no código, para evitar erro de conta do modelo.

**Outros modos** (conta no nome do cliente), com `base = energia compensada × tarifa`:

| Modo | Fatura da usina |
|---|---|
| % sobre a energia compensada | base − X% |
| % sobre o gasto total | (conta + base) × (1 − X%) − conta |
| Tarifa fixa por kWh | kWh compensados × R$ X |

Tudo em centavos inteiros. `npm test` roda os testes do cálculo e do PIX.

## Garantias do fluxo
- Nenhuma fatura sai sem a pessoa marcar que conferiu com a conta original.
- A UC da conta precisa ser a do cliente.
- Uma fatura válida por cliente por mês (índice no banco). Cancelar libera a reemissão.
- Fatura nunca é apagada: cancelamento guarda data e motivo. Tudo fica em `eventos`.
- A foto/PDF original fica guardada no bucket privado `contas`, em pasta da usina.
- Dados da usina e do cliente são congelados na fatura (`snapshot`): editar o cadastro depois não altera faturas antigas.

## Financeiro
- **Entradas**: faturas pagas (baixa manual ou automática pelo Asaas), pelo dia do pagamento.
- **Saídas**: despesas da usina. A conta da distribuidora de cada fatura no modelo "conta cheia" entra sozinha em contas a pagar, com o vencimento lido da conta. A taxa do Asaas de cada pagamento entra sozinha como despesa paga.
- Despesas recorrentes (mensal, trimestral, anual) e parceladas geram os lançamentos de uma vez.
- Alerta no painel e no financeiro quando uma conta da distribuidora vence em até 3 dias.

## Limites conhecidos (v1)
- Fotos são reduzidas no celular antes do envio. PDFs da conta devem ter até 4 MB (limite de corpo da Vercel).
- Sem o Asaas ligado, o PIX é estático e a baixa é manual (**Marcar como paga**).
- Cada usuário atua em uma usina.
- Antes de operar, valide o cálculo e a leitura com contas reais da distribuidora de cada cliente.
