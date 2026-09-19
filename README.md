# VisioPro Solar

Faturamento para usinas de geração compartilhada. A usina fotografa a conta de energia do cliente, a IA lê os dados, alguém confere, e o app emite a fatura da usina em PDF com PIX e envia pelo WhatsApp.

**Stack:** Next.js 15 (App Router) na Vercel · Supabase (Postgres, Auth, Storage, RLS) · OpenRouter / Claude com visão para ler a conta · Evolution API para WhatsApp · @react-pdf para a fatura.

## Estrutura

```
supabase/migrations/0001_init.sql   esquema, RLS, bucket de contas
src/lib/calculo.ts                  motor de cálculo (3 modos, centavos)  + calculo.test.ts
src/lib/pix.ts                      PIX copia e cola (EMV/BCB)
src/lib/leitor/                     leitura da conta (adaptadores OpenRouter e Claude)
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
1. Crie o projeto e rode `supabase/migrations/0001_init.sql` no **SQL Editor** (ou `supabase db push`).
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

### 4. Primeiro acesso
1. Abra o app, **Criar conta da usina**, confirme o e-mail.
2. Cadastre a usina (vira dono), complete PIX e WhatsApp em **Ajustes**.
3. Convide operadores em **Ajustes > Equipe**.

## Regras de cálculo

`base = energia compensada × tarifa da distribuidora (com tributos)`

| Modo | Fatura da usina | Economia do cliente |
|---|---|---|
| % sobre a energia compensada | base − X% | X% da base |
| % sobre o gasto total | (conta + base) × (1 − X%) − conta | X% do gasto total sem usina |
| Tarifa fixa por kWh | kWh × R$ X | base − fatura |

Tudo em centavos inteiros. `npm test` roda os testes do cálculo e do PIX.

## Garantias do fluxo
- Nenhuma fatura sai sem a pessoa marcar que conferiu com a conta original.
- A UC da conta precisa ser a do cliente.
- Uma fatura válida por cliente por mês (índice no banco). Cancelar libera a reemissão.
- Fatura nunca é apagada: cancelamento guarda data e motivo. Tudo fica em `eventos`.
- A foto/PDF original fica guardada no bucket privado `contas`, em pasta da usina.
- Dados da usina e do cliente são congelados na fatura (`snapshot`): editar o cadastro depois não altera faturas antigas.

## Limites conhecidos (v1)
- Fotos são reduzidas no celular antes do envio. PDFs da conta devem ter até 4 MB (limite de corpo da Vercel).
- PIX estático: a baixa é manual (**Marcar como paga**). Baixa automática exige integração bancária (fase 2).
- Cada usuário atua em uma usina.
- Antes de operar, valide o cálculo e a leitura com contas reais da distribuidora de cada cliente.
