-- Monitor da instância do WhatsApp (Evolution): estado da última checagem e último alerta enviado
alter table usinas add column if not exists whatsapp_estado text;
alter table usinas add column if not exists whatsapp_estado_em timestamptz;
alter table usinas add column if not exists whatsapp_alerta_em timestamptz;
