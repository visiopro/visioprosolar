-- Regra de iluminação pública (CIP/COSIP) por cliente.
-- Em municípios como Vitória da Conquista a CIP é um percentual sobre o valor do consumo,
-- mas na conta em nome da usina ela chega como valor mínimo fixo da geração distribuída.
alter table clientes
  add column if not exists cip_modo text not null default 'da_conta' check (cip_modo in ('da_conta', 'percentual', 'fixo')),
  add column if not exists cip_valor numeric(10,4) not null default 0 check (cip_valor >= 0);
