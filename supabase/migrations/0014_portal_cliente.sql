-- Portal do cliente final: link próprio e permanente por cliente
alter table clientes add column if not exists portal_token text;
update clientes set portal_token = encode(gen_random_bytes(16), 'hex') where portal_token is null;
alter table clientes alter column portal_token set default encode(gen_random_bytes(16), 'hex');
alter table clientes alter column portal_token set not null;
create unique index if not exists clientes_portal_token on clientes (portal_token);
