-- Tarifa da bandeira usada quando a conta não traz a linha de bandeira (R$/kWh, com tributos)
alter table usinas add column if not exists bandeira_padrao numeric(10,6) not null default 0 check (bandeira_padrao >= 0);
