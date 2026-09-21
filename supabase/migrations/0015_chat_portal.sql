-- Chat de atendimento no portal do cliente
alter table usinas add column if not exists contato_whatsapp text
  check (contato_whatsapp is null or contato_whatsapp ~ '^55[0-9]{10,11}$');

create table if not exists portal_conversas (
  id bigint generated always as identity primary key,
  usina_id uuid not null references usinas(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  pergunta text not null,
  resposta text not null,
  transferiu boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists portal_conversas_usina on portal_conversas (usina_id, created_at desc);
create index if not exists portal_conversas_cliente on portal_conversas (cliente_id, created_at desc);

alter table portal_conversas enable row level security;
-- a usina lê as dúvidas dos seus clientes; a gravação é feita pelo servidor
create policy portal_conversas_ler on portal_conversas for select using (usina_id in (select minhas_usinas()));
