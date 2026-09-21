-- Tabelas municipais de iluminação pública (CIP/COSIP) por classe e faixa de consumo.
-- São fatos do município: a VisioPro mantém em /admin e todas as usinas usam.

create table if not exists cip_tabelas (
  id uuid primary key default gen_random_uuid(),
  municipio text not null,
  uf text not null default 'BA' check (char_length(uf) = 2),
  observacao text,
  created_at timestamptz not null default now(),
  unique (municipio, uf)
);

create table if not exists cip_faixas (
  id uuid primary key default gen_random_uuid(),
  tabela_id uuid not null references cip_tabelas(id) on delete cascade,
  classe text not null check (classe in ('B1', 'B2', 'B3', 'outros')),
  consumo_min int not null default 0 check (consumo_min >= 0),
  consumo_max int check (consumo_max is null or consumo_max >= consumo_min), -- nulo = sem teto
  tipo text not null check (tipo in ('percentual', 'fixo')),
  valor numeric(10,4) not null check (valor >= 0),
  created_at timestamptz not null default now()
);
create index if not exists cip_faixas_tabela on cip_faixas (tabela_id, classe, consumo_min);

alter table cip_tabelas enable row level security;
alter table cip_faixas enable row level security;
-- leitura para qualquer usuário logado; a escrita é só pelo painel da VisioPro (service role)
create policy cip_tabelas_ler on cip_tabelas for select to authenticated using (true);
create policy cip_faixas_ler on cip_faixas for select to authenticated using (true);

-- cliente pode seguir a tabela do município
alter table clientes drop constraint if exists clientes_cip_modo_check;
alter table clientes add constraint clientes_cip_modo_check check (cip_modo in ('da_conta', 'percentual', 'fixo', 'tabela'));
alter table clientes
  add column if not exists cip_tabela_id uuid references cip_tabelas(id) on delete set null,
  add column if not exists cip_classe text check (cip_classe is null or cip_classe in ('B1', 'B2', 'B3', 'outros'));
alter table clientes alter column cip_valor drop not null;

insert into cip_tabelas (municipio, uf, observacao)
values ('Vitória da Conquista', 'BA', 'COSIP-MU, Lei Complementar 3.077/2025. Preencha as faixas conforme a lei.')
on conflict (municipio, uf) do nothing;
