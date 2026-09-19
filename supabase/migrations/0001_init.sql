-- VisioPro Solar — esquema inicial
-- Multi-usina: todo dado pertence a uma usina; o acesso é liberado por RLS
-- para quem é membro dessa usina.

create extension if not exists "pgcrypto";

-- ============================================================
-- Tipos
-- ============================================================
create type papel_membro as enum ('dono', 'operador');
create type modo_desconto as enum ('percentual_compensada', 'percentual_gasto_total', 'tarifa_fixa');
create type status_conta as enum ('lida', 'conferida', 'faturada');
create type status_fatura as enum ('pendente', 'paga', 'cancelada');

-- ============================================================
-- Usinas e membros
-- ============================================================
create table usinas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 2 and 100),
  documento text,                      -- CNPJ/CPF da usina
  pix_chave text,
  pix_favorecido text check (pix_favorecido is null or char_length(pix_favorecido) <= 25),
  pix_cidade text check (pix_cidade is null or char_length(pix_cidade) <= 15),
  whatsapp_instancia text,             -- nome da instância na Evolution API
  dias_vencimento int not null default 10 check (dias_vencimento between 1 and 60),
  created_at timestamptz not null default now()
);

create table usina_membros (
  usina_id uuid not null references usinas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  papel papel_membro not null default 'operador',
  email text,
  created_at timestamptz not null default now(),
  primary key (usina_id, user_id)
);
create index on usina_membros (user_id);

-- Funções auxiliares usadas pelas políticas (security definer evita recursão de RLS)
create or replace function minhas_usinas() returns setof uuid
language sql stable security definer set search_path = public as $$
  select usina_id from usina_membros where user_id = auth.uid()
$$;

create or replace function sou_dono(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from usina_membros where usina_id = u and user_id = auth.uid() and papel = 'dono')
$$;

-- Cria a usina e registra quem criou como dono, numa única transação
create or replace function criar_usina(p_nome text, p_documento text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare novo uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  insert into usinas (nome, documento) values (trim(p_nome), nullif(trim(p_documento), '')) returning id into novo;
  insert into usina_membros (usina_id, user_id, papel, email)
    values (novo, auth.uid(), 'dono', (select email from auth.users where id = auth.uid()));
  return novo;
end $$;

-- ============================================================
-- Clientes da usina
-- ============================================================
create table clientes (
  id uuid primary key default gen_random_uuid(),
  usina_id uuid not null references usinas(id) on delete cascade,
  nome text not null check (char_length(nome) between 2 and 120),
  documento text,
  uc text not null check (uc ~ '^[0-9]{3,40}$'),
  distribuidora text not null,
  whatsapp text check (whatsapp is null or whatsapp ~ '^55[0-9]{10,11}$'),
  email text,
  modo_desconto modo_desconto not null default 'percentual_compensada',
  -- percentual (0–100) nos modos percentuais; R$/kWh no modo tarifa_fixa
  desconto_valor numeric(12,6) not null check (desconto_valor >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (usina_id, uc),
  check (modo_desconto = 'tarifa_fixa' or desconto_valor <= 100)
);
create index on clientes (usina_id, ativo);

-- ============================================================
-- Contas da distribuidora (foto/PDF + leitura)
-- ============================================================
create table contas_energia (
  id uuid primary key default gen_random_uuid(),
  usina_id uuid not null references usinas(id) on delete cascade,
  cliente_id uuid references clientes(id) on delete set null,
  arquivo_path text not null,           -- caminho no bucket "contas"
  arquivo_tipo text not null,
  leitura_ia jsonb,                     -- resposta bruta do leitor, para auditoria
  status status_conta not null default 'lida',
  -- campos conferidos por uma pessoa
  uc text,
  referencia date,                      -- sempre dia 1 do mês de referência
  consumo_kwh numeric(12,3),
  compensada_kwh numeric(12,3),
  tarifa numeric(14,8),                 -- R$/kWh com tributos
  valor_conta_centavos bigint,
  conferida_por uuid references auth.users(id),
  conferida_em timestamptz,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index on contas_energia (usina_id, created_at desc);

-- ============================================================
-- Faturas da usina
-- ============================================================
create table faturas (
  id uuid primary key default gen_random_uuid(),
  usina_id uuid not null references usinas(id) on delete cascade,
  numero int not null,
  cliente_id uuid not null references clientes(id) on delete restrict,
  conta_id uuid references contas_energia(id) on delete set null,
  referencia date not null,
  vencimento date not null,
  modo_desconto modo_desconto not null,
  desconto_valor numeric(12,6) not null,
  compensada_kwh numeric(12,3) not null,
  tarifa numeric(14,8) not null,
  valor_conta_centavos bigint not null default 0,
  sem_usina_centavos bigint not null,   -- o que o cliente pagaria sem a usina
  total_centavos bigint not null check (total_centavos > 0),
  economia_centavos bigint not null,
  pix_copia_cola text,
  snapshot jsonb not null,              -- dados de cliente e usina no momento da emissão
  status status_fatura not null default 'pendente',
  paga_em timestamptz,
  cancelada_em timestamptz,
  motivo_cancelamento text,
  enviada_em timestamptz,
  lembrete_em timestamptz,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (usina_id, numero)
);
-- uma fatura válida por cliente por mês (canceladas liberam reemissão)
create unique index faturas_cliente_mes_unico on faturas (cliente_id, referencia) where status <> 'cancelada';
create index on faturas (usina_id, referencia desc);
create index on faturas (status, vencimento);

-- Numeração sequencial por usina
create or replace function numerar_fatura() returns trigger
language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.usina_id::text));
  select coalesce(max(numero), 0) + 1 into new.numero from faturas where usina_id = new.usina_id;
  return new;
end $$;
create trigger faturas_numero before insert on faturas for each row execute function numerar_fatura();

-- ============================================================
-- Auditoria
-- ============================================================
create table eventos (
  id bigint generated always as identity primary key,
  usina_id uuid not null references usinas(id) on delete cascade,
  user_id uuid references auth.users(id) default auth.uid(),
  acao text not null,                   -- ex.: fatura_emitida, fatura_cancelada
  alvo_id uuid,
  detalhes jsonb,
  created_at timestamptz not null default now()
);
create index on eventos (usina_id, created_at desc);

-- ============================================================
-- RLS
-- ============================================================
alter table usinas enable row level security;
alter table usina_membros enable row level security;
alter table clientes enable row level security;
alter table contas_energia enable row level security;
alter table faturas enable row level security;
alter table eventos enable row level security;

create policy usinas_ler on usinas for select using (id in (select minhas_usinas()));
create policy usinas_editar on usinas for update using (sou_dono(id)) with check (sou_dono(id));

create policy membros_ler on usina_membros for select using (usina_id in (select minhas_usinas()));
create policy membros_remover on usina_membros for delete using (sou_dono(usina_id) and user_id <> auth.uid());

create policy clientes_tudo on clientes for all
  using (usina_id in (select minhas_usinas())) with check (usina_id in (select minhas_usinas()));

create policy contas_tudo on contas_energia for all
  using (usina_id in (select minhas_usinas())) with check (usina_id in (select minhas_usinas()));

create policy faturas_ler on faturas for select using (usina_id in (select minhas_usinas()));
create policy faturas_criar on faturas for insert with check (usina_id in (select minhas_usinas()));
create policy faturas_atualizar on faturas for update
  using (usina_id in (select minhas_usinas())) with check (usina_id in (select minhas_usinas()));
-- faturas nunca são apagadas: cancelamento é um status

create policy eventos_ler on eventos for select using (usina_id in (select minhas_usinas()));
create policy eventos_criar on eventos for insert with check (usina_id in (select minhas_usinas()));

-- ============================================================
-- Storage: bucket privado "contas", pasta = id da usina
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contas', 'contas', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

create policy contas_arquivos_ler on storage.objects for select
  using (bucket_id = 'contas' and (storage.foldername(name))[1]::uuid in (select minhas_usinas()));
create policy contas_arquivos_enviar on storage.objects for insert
  with check (bucket_id = 'contas' and (storage.foldername(name))[1]::uuid in (select minhas_usinas()));
