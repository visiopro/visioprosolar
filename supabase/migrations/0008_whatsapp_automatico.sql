-- Envio automático da fatura no WhatsApp ao emitir
alter table usinas add column if not exists whatsapp_auto boolean not null default false;
