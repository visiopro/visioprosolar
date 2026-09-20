-- Financeiro (contas a pagar e despesas) + cobrança pelo Asaas com baixa automática

-- ============================================================
-- Asaas: flags na usina (visíveis à equipe) e segredos em tabela fechada
-- ============================================================
alter table usinas
  add column if not exists asaas_ativo boolean not null default false,
  add column if not exists asaas_ambiente text not null default 'sandbox' check (asaas_ambiente in ('sandbox', 'producao')),
  add column if not exists asaas_forma text not null default 'PIX' check (asaas_forma in ('PIX', 'UNDEFINED')),
  add column if not exists asaas_notificar boolean not null default true;

-- Sem nenhuma política de RLS: só o servidor (service role) lê e grava.
create table if not exists usina_integracoes (
  usina_id uuid primary key references usinas(id) on delete cascade,
  asaas_api_key text,
  asaas_webhook_token text,
  updated_at timestamptz not null default now()
);
alter table usina_integracoes enable row level security;

alter table clientes add column if not exists asaas_customer_id text;

alter table faturas
  add column if not exists asaas_payment_id text unique,
  add column if not exists asaas_link text,
  add column if not exists pagamento_origem text check (pagamento_origem in ('manual', 'asaas')),
  add column if not exists valor_recebido_centavos bigint,
  add column if not exists taxa_centavos bigint;

-- ============================================================
-- Financeiro: tudo que a usina paga
-- ============================================================
create table if not exists despesas (
  id uuid primary key default gen_random_uuid(),
  usina_id uuid not null references usinas(id) on delete cascade,
  descricao text not null check (char_length(descricao) between 2 and 140),
  categoria text not null check (categoria in (
    'conta_distribuidora', 'manutencao', 'limpeza', 'seguro', 'financiamento',
    'aluguel', 'impostos', 'taxas', 'pessoal', 'outros')),
  valor_centavos bigint not null check (valor_centavos > 0),
  vencimento date not null,
  pago_em date,
  -- vínculos (opcionais)
  cliente_id uuid references clientes(id) on delete set null,
  fatura_id uuid references faturas(id) on delete set null,
  -- séries (recorrentes ou parceladas)
  grupo_id uuid,
  parcela int,
  parcelas int,
  observacao text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists despesas_usina_venc on despesas (usina_id, vencimento);
create index if not exists despesas_usina_pago on despesas (usina_id, pago_em);
create index if not exists despesas_fatura on despesas (fatura_id);

alter table despesas enable row level security;
create policy despesas_tudo on despesas for all
  using (usina_id in (select minhas_usinas())) with check (usina_id in (select minhas_usinas()));

create index if not exists faturas_usina_paga on faturas (usina_id, paga_em);
