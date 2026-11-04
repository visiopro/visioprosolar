-- Código de barras (linha digitável) da conta da distribuidora e conta a pagar criada já na leitura
alter table contas_energia add column if not exists codigo_barras text;
alter table despesas add column if not exists codigo_barras text;
alter table despesas add column if not exists conta_id uuid references contas_energia(id) on delete set null;
create unique index if not exists despesas_conta_unica on despesas (conta_id) where conta_id is not null;
