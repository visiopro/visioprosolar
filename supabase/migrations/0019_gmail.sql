begin;
create table if not exists gmail_conexoes (
 usina_id uuid primary key references usinas(id) on delete cascade,
 email text not null unique, refresh_token_enc text not null,
 remetentes text[] not null default '{}', ativa boolean not null default true,
 conectada_em timestamptz not null default now(), ultima_tentativa timestamptz,
 ultima_sincronizacao timestamptz, erro text,
 buscar_desde timestamptz not null default (now()-interval '60 days'),
 janela_fim timestamptz, pagina text, lock_id uuid, lock_ate timestamptz
);
alter table gmail_conexoes enable row level security;
revoke all on gmail_conexoes from anon, authenticated;
create table if not exists gmail_oauth_estados (
 state_hash text primary key, user_id uuid not null references auth.users(id) on delete cascade,
 usina_id uuid not null references usinas(id) on delete cascade, verifier text not null, expira_em timestamptz not null
);
alter table gmail_oauth_estados enable row level security;
revoke all on gmail_oauth_estados from anon, authenticated;
create table if not exists gmail_mensagens (
 id uuid primary key default gen_random_uuid(), usina_id uuid not null references usinas(id) on delete cascade,
 email text not null, message_id text not null,
 status text not null default 'pendente' check(status in ('pendente','concluida','erro')),
 tentativas int not null default 0, proxima_tentativa timestamptz not null default now(),
 erro text, created_at timestamptz not null default now(), unique(usina_id,email,message_id)
);
alter table gmail_mensagens enable row level security;
revoke all on gmail_mensagens from anon, authenticated;
create index if not exists gmail_fila on gmail_mensagens(usina_id,status,proxima_tentativa);
alter table contas_energia add column if not exists origem text not null default 'manual';
alter table contas_energia add column if not exists arquivo_sha256 text;
alter table contas_energia add column if not exists nome_arquivo text;
alter table contas_energia add column if not exists importacao_status text;
alter table contas_energia add column if not exists importacao_erro text;
alter table contas_energia add column if not exists leitura_tentativas int not null default 0;
alter table contas_energia add column if not exists leitura_lock_ate timestamptz;
alter table contas_energia add column if not exists leitura_lock_id uuid;
create unique index if not exists contas_gmail_hash on contas_energia(usina_id,arquivo_sha256) where origem='gmail' and arquivo_sha256 is not null;
create index if not exists contas_gmail_pendentes on contas_energia(usina_id,importacao_status) where origem='gmail';
create or replace function gmail_travar(p_usina uuid,p_lock uuid)
returns setof gmail_conexoes language sql security definer set search_path=public as $$
 update gmail_conexoes set lock_id=p_lock,lock_ate=now()+interval '5 minutes',ultima_tentativa=now()
 where usina_id=p_usina and ativa and (lock_ate is null or lock_ate<now()) returning *;
$$;
revoke all on function gmail_travar(uuid,uuid) from public,anon,authenticated;
grant execute on function gmail_travar(uuid,uuid) to service_role;
create or replace function gmail_travar_leitura(p_usina uuid,p_conta uuid,p_lock uuid)
returns setof contas_energia language sql security definer set search_path=public as $$
 update contas_energia set leitura_lock_id=p_lock,leitura_lock_ate=now()+interval '3 minutes',importacao_status='lendo',leitura_tentativas=leitura_tentativas+1
 where id=p_conta and usina_id=p_usina and origem='gmail' and status='lida'
 and importacao_status in ('recebida','erro','lendo') and (leitura_lock_ate is null or leitura_lock_ate<now()) returning *;
$$;
revoke all on function gmail_travar_leitura(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function gmail_travar_leitura(uuid,uuid,uuid) to service_role;
grant all on gmail_conexoes,gmail_oauth_estados,gmail_mensagens to service_role;
commit;
