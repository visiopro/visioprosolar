-- Conta do Gmail lida sem dúvida vira fatura e é enviada sozinha
alter table usinas add column if not exists emissao_automatica boolean not null default false;
