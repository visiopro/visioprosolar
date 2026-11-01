-- Coluna para guardar o motivo do erro quando a leitura automática falha (upload manual)
alter table contas_energia add column if not exists leitura_erro text;
