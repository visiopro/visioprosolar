-- Texto da mensagem que acompanha a fatura no WhatsApp, editável por usina
alter table usinas add column if not exists mensagem_fatura_texto text;
