-- Modelo "conta no nome da usina": o cliente paga a conta cheia (sem usina) com desconto.
-- A conta que chega da distribuidora (tarifa mínima) é custo da usina e nunca aparece para o cliente.


alter table clientes alter column modo_desconto set default 'percentual_conta_cheia';

alter table contas_energia
  add column if not exists bandeira_centavos bigint not null default 0,
  add column if not exists iluminacao_centavos bigint not null default 0;

alter table faturas
  add column if not exists consumo_kwh numeric(12,3),
  add column if not exists bandeira_centavos bigint not null default 0,
  add column if not exists iluminacao_centavos bigint not null default 0,
  add column if not exists sem_usina_ajustado boolean not null default false,
  -- quanto a usina pagou à distribuidora por essa conta (uso interno)
  add column if not exists custo_usina_centavos bigint not null default 0;

alter table faturas alter column compensada_kwh set default 0;
