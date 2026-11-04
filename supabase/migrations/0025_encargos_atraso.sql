-- Multa e juros por atraso cobrados na fatura seguinte (como nas distribuidoras)
alter table usinas add column if not exists encargos_ativos boolean not null default false;
alter table usinas add column if not exists multa_percentual numeric(5,2) not null default 2 check (multa_percentual between 0 and 20);
alter table usinas add column if not exists juros_mensal numeric(5,2) not null default 1 check (juros_mensal between 0 and 10);
-- na fatura nova: valor e de onde veio
-- só faturas com vencimento a partir da ativação (não cobra atrasos de antes da regra existir)
alter table usinas add column if not exists encargos_desde date;
alter table faturas add column if not exists encargos_centavos bigint not null default 0;
alter table faturas add column if not exists encargos_detalhe jsonb;
-- na fatura paga com atraso: em qual fatura o encargo foi cobrado (cobra uma vez só)
alter table faturas add column if not exists encargo_fatura_id uuid references faturas(id) on delete set null;
