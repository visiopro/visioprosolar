-- Cobrança com serviço trocável por usina: Asaas ou Mercado Pago

alter table usinas
  add column if not exists gateway text not null default 'nenhum' check (gateway in ('nenhum', 'asaas', 'mercadopago'));
update usinas set gateway = 'asaas' where asaas_ativo and gateway = 'nenhum';

alter table usina_integracoes add column if not exists mp_access_token text;

-- colunas genéricas da cobrança na fatura
alter table faturas
  add column if not exists cobranca_gateway text check (cobranca_gateway in ('asaas', 'mercadopago')),
  add column if not exists cobranca_id text,
  add column if not exists cobranca_link text;

update faturas
   set cobranca_gateway = 'asaas', cobranca_id = asaas_payment_id, cobranca_link = asaas_link
 where asaas_payment_id is not null and cobranca_id is null;

create unique index if not exists faturas_cobranca_unica on faturas (cobranca_gateway, cobranca_id) where cobranca_id is not null;
-- asaas_payment_id / asaas_link / asaas_ativo ficam só por compatibilidade; o app usa as colunas novas

-- baixa automática pode vir de qualquer serviço
alter table faturas drop constraint if exists faturas_pagamento_origem_check;
alter table faturas add constraint faturas_pagamento_origem_check
  check (pagamento_origem in ('manual', 'asaas', 'mercadopago'));
