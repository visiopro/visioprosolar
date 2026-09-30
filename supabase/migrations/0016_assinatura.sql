-- Mensalidade da VisioPro cobrada de cada usina, por cliente ativo

create table if not exists assinaturas (
  usina_id uuid primary key references usinas(id) on delete cascade,
  ativa boolean not null default true,
  preco_ate_30_centavos bigint not null default 600 check (preco_ate_30_centavos >= 0),
  preco_acima_centavos bigint not null default 800 check (preco_acima_centavos >= 0),
  minimo_centavos bigint not null default 0 check (minimo_centavos >= 0),
  dia_geracao int not null default 1 check (dia_geracao between 1 and 28),
  dia_vencimento int not null default 10 check (dia_vencimento between 1 and 28),
  asaas_customer_id text,
  observacao text,
  created_at timestamptz not null default now()
);

create table if not exists assinatura_faturas (
  id uuid primary key default gen_random_uuid(),
  usina_id uuid not null references usinas(id) on delete cascade,
  referencia date not null,                      -- dia 1 do mês de competência
  clientes_ativos int not null,
  valor_centavos bigint not null check (valor_centavos > 0),
  vencimento date not null,
  status text not null default 'pendente' check (status in ('pendente', 'paga', 'cancelada')),
  cobranca_id text unique,
  cobranca_link text,
  pix_copia_cola text,
  asaas_payment_id text,
  asaas_link text,
  paga_em timestamptz,
  valor_recebido_centavos bigint,
  created_at timestamptz not null default now(),
  unique (usina_id, referencia)
);
create index if not exists assinatura_faturas_status on assinatura_faturas (status, vencimento);
create index if not exists assinatura_faturas_cobranca on assinatura_faturas (cobranca_id);

alter table assinaturas enable row level security;
alter table assinatura_faturas enable row level security;
-- a usina vê a própria assinatura e suas faturas; quem cria e altera é o servidor da VisioPro
create policy assinaturas_ler on assinaturas for select using (usina_id in (select minhas_usinas()));
create policy assinatura_faturas_ler on assinatura_faturas for select using (usina_id in (select minhas_usinas()));

-- toda usina existente já entra na cobrança
insert into assinaturas (usina_id)
select id from usinas on conflict (usina_id) do nothing;

-- e as próximas também
create or replace function criar_assinatura() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into assinaturas (usina_id) values (new.id) on conflict (usina_id) do nothing;
  return new;
end $$;
drop trigger if exists usinas_assinatura on usinas;
create trigger usinas_assinatura after insert on usinas for each row execute function criar_assinatura();
