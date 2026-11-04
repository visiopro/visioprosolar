-- Dia fixo de vencimento por cliente (opcional). Vazio = prazo padrão da usina.
alter table clientes add column if not exists dia_vencimento smallint check (dia_vencimento between 1 and 31);
