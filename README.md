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
   `0001_init.sql` → `0002_modo_conta_cheia.sql` (sozinha) → `0003_conta_cheia.sql` → `0004_financeiro_asaas.sql` → `0005_logo_usina.sql` → `0006_seguranca.sql` → `0007_mercadopago.sql` → `0008_whatsapp_automatico.sql` → `0009_uc_sem_zeros.sql` → `0010_token_instancia.sql` → `0011_bandeira_padrao.sql` → `0012_iluminacao_publica.sql` → `0013_cip_tabelas.sql` → `0014_portal_cliente.sql` → `0015_chat_portal.sql`.
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
2. No painel **/admin** (só e-mails em `SUPER_ADMIN_EMAILS`), informe a instância na linha da usina. Se a instância tiver token próprio, cole-o ali; sem token, o app usa a chave global `EVOLUTION_API_KEY`. A usina não consegue alterar esse campo: uma instância pertence a uma única usina.
3. `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` ficam só na Vercel; a usina nunca vê a chave.
4. Em **Ajustes > Dados da usina**, o dono pode ligar o envio automático: ao emitir, a fatura (PDF + PIX + link de pagamento) vai sozinha para o WhatsApp do cliente.

### 4. Cobrança automática (Asaas ou Mercado Pago)
Cada usina escolhe em **Ajustes > Cobrança automática**. O código de cada serviço fica em `src/lib/cobranca/` (contrato comum em `tipos.ts`); um serviço novo é um arquivo a mais.

**Mercado Pago**
1. Em mercadopago.com.br/developers, crie uma aplicação (pagamentos online) e copie o **Access Token de produção** (`APP_USR-...`). Não use a Public Key.
2. A conta precisa ter **chave Pix** cadastrada.
3. Cole o token em Ajustes e salve. Não há webhook para configurar: cada cobrança já leva o endereço de aviso da usina, e o app confirma o pagamento consultando o Mercado Pago.
4. O Mercado Pago exige e-mail do pagador; sem e-mail no cadastro do cliente, o app usa um endereço técnico.
5. Recebido por fora: o PIX do Mercado Pago é cancelado (não existe "recebido em dinheiro" lá). Se desfizer a baixa, gere uma nova cobrança na fatura.

**Asaas**
1. No Asaas: **Integrações > Chave de API**, gere a chave (sandbox para testar, produção depois).
2. No app: **Ajustes > Cobrança automática**, cole a chave, escolha o ambiente e salve. O app testa a conexão.
3. Ainda em Ajustes aparecem a **URL** e o **token** do webhook. No Asaas: **Integrações > Webhooks**, crie um webhook com essa URL, esse token e os eventos de cobrança.
4. Teste no sandbox: emita uma fatura, pague a cobrança pelo painel do sandbox e confira se ela vira "paga" sozinha.
5. Cliente precisa ter **CPF ou CNPJ** cadastrado para ser cobrado pelo Asaas.

Se "O Asaas avisa o cliente" estiver ligado, o Asaas manda e-mail/SMS (com custo por envio) e o app não manda lembretes próprios no WhatsApp para essas faturas.

### 5. Primeiro acesso
1. Em **/admin**, gere um código de convite e envie ao dono da usina.
2. O dono abre o app, **Criar conta da usina**, confirma o e-mail e informa o código. Cada código cria uma única usina.
3. Ele completa PIX, logo e Asaas em **Ajustes**.
3. Convide operadores em **Ajustes > Equipe**.

## Regras de cálculo

**Padrão: % sobre a conta cheia** (conta no nome da usina, chega com tarifa mínima)

```
conta sem usina = consumo do mês × (TUSD + TE com tributos) + bandeira + iluminação pública
fatura do cliente = conta sem usina − X%
```

A conta que chega (tarifa mínima) é custo da usina: fica registrada como `custo_usina_centavos` e aparece só para a equipe (resultado por fatura e no painel). Nunca vai para o PDF do cliente. O dono pode ajustar o valor da conta sem usina à mão; a fatura registra que houve ajuste.

A IA lê TUSD e TE separadas e o app soma no código, para evitar erro de conta do modelo.

**Bandeira tarifária:** o app usa o valor da própria conta, dividido pelos kWh faturados, e aplica ao consumo real (ex.: R$ 3,78 ÷ 149 kWh = R$ 0,0254/kWh). Quando a conta não traz essa linha, usa a tarifa cadastrada em **Ajustes > Bandeira tarifária (R$/kWh)**. **Iluminação pública (CIP/COSIP):** por padrão usa o valor da conta. No cadastro do cliente dá para definir **% sobre o valor da energia** (municípios que cobram por faixa de consumo, como Vitória da Conquista) ou **valor fixo**, porque na conta em nome da usina a CIP chega como o mínimo fixo da geração distribuída. O valor sugerido aparece na conferência e pode ser editado. Também dá para o cliente **seguir a tabela do município**: em `/admin/cip` a VisioPro cadastra as faixas da lei municipal (classe, intervalo de kWh, percentual ou valor fixo) e o app escolhe a alíquota conforme o consumo do mês.

**Conta que já chega com os créditos (tarifa mínima):** a coluna "CONSUMO kWh" vem descontada (ex.: 11,10 kWh). O app calcula o consumo real pelas leituras do medidor, `(leitura atual − anterior) × constante` (ex.: 5.659 − 5.568 = 91 kWh), e ajusta a bandeira na mesma proporção. Encargos "TUSD GDII"/Fio B, multa e juros ficam só no custo da usina.

**Outros modos** (conta no nome do cliente), com `base = energia compensada × tarifa`:

| Modo | Fatura da usina |
|---|---|
| % sobre a energia compensada | base − X% |
| % sobre o gasto total | (conta + base) × (1 − X%) − conta |
| Tarifa fixa por kWh | kWh compensados × R$ X |

Tudo em centavos inteiros. `npm test` roda os testes do cálculo e do PIX.

## Garantias do fluxo
- Nenhuma fatura sai sem a pessoa marcar que conferiu com a conta original.
- Alerta de variação na conferência: tarifa mais de 5% fora da última fatura, consumo ou valor mais de 60% fora, mês anterior ao último faturado. Mês já faturado bloqueia a emissão (`src/lib/conferencia.ts`).
- A UC da conta precisa ser a do cliente.
- Uma fatura válida por cliente por mês (índice no banco). Cancelar libera a reemissão.
- Fatura nunca é apagada: cancelamento guarda data e motivo. Tudo fica em `eventos`.
- A foto/PDF original fica guardada no bucket privado `contas`, em pasta da usina.
- Dados da usina e do cliente são congelados na fatura (`snapshot`): editar o cadastro depois não altera faturas antigas.

## Portal do cliente final
Cada cliente tem um link fixo `/c/<token>` (32 caracteres aleatórios), aberto sem senha, que vai junto com a fatura no WhatsApp e aparece no cadastro do cliente para copiar. Mostra a fatura do mês com QR code e PIX copia e cola, PDF, link de pagamento, economia acumulada e as 12 últimas faturas. É só leitura e só do próprio cliente; as páginas e o PDF validam o token.

## Portal do cliente final
Cada cliente tem um link fixo `/c/<token>` (sem senha, não indexado). Mostra a fatura do mês com QR code e PIX copia e cola, PDF, link de pagamento, as 12 últimas faturas e a economia acumulada, com a logo da usina. O link vai junto com a fatura no WhatsApp e aparece no cadastro do cliente para copiar ou enviar.

## Atendimento no portal
Chat com IA dentro do portal (`src/lib/atendimento.ts` monta as instruções, `src/lib/chat.ts` chama o provedor — OpenRouter ou Anthropic, os mesmos da leitura). O atendente só pode repetir os dados daquele cliente (fatura em aberto, vencimento, situação, economia e as 12 últimas faturas): não calcula, não projeta, não negocia desconto, prazo ou cancelamento, e encaminha para o WhatsApp da usina (**Ajustes > WhatsApp de contato**). Limite de 20 perguntas por cliente a cada 24 h; tudo fica gravado em `portal_conversas`.

## Financeiro
- **Entradas**: faturas pagas (baixa manual ou automática pelo Asaas), pelo dia do pagamento.
- **Saídas**: despesas da usina. A conta da distribuidora de cada fatura no modelo "conta cheia" entra sozinha em contas a pagar, com o vencimento lido da conta. A taxa do Asaas de cada pagamento entra sozinha como despesa paga.
- Despesas recorrentes (mensal, trimestral, anual) e parceladas geram os lançamentos de uma vez.
- Alerta no painel e no financeiro quando uma conta da distribuidora vence em até 3 dias.

## Segurança multi-usina
- RLS em todas as tabelas: cada usuário só acessa dados das usinas das quais é membro.
- Nova usina só com convite da VisioPro (não há criação livre de usina).
- Gatilhos no banco impedem vincular registros de usinas diferentes e mudar um registro de usina.
- Valores da fatura ficam travados após a emissão; fatura cancelada não muda mais.
- Exclusões (clientes, contas, despesas) só pelo dono; operador lê, cria e edita.
- Chave do Asaas e convites em tabelas sem acesso pelo navegador (só o servidor).
- Instância do WhatsApp definida só pela VisioPro.

## Limites conhecidos (v1)
- Fotos são reduzidas no celular antes do envio. PDFs da conta devem ter até 4 MB (limite de corpo da Vercel).
- Sem o Asaas ligado, o PIX é estático e a baixa é manual (**Marcar como paga**).
- Cada usuário atua em uma usina.
- Antes de operar, valide o cálculo e a leitura com contas reais da distribuidora de cada cliente.
