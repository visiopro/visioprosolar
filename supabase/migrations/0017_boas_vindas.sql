-- Mensagem de boas-vindas enviada ao cadastrar um cliente
alter table usinas
  add column if not exists boas_vindas_ativo boolean not null default false,
  add column if not exists boas_vindas_texto text;

alter table clientes add column if not exists boas_vindas_em timestamptz;
