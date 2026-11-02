-- Filtro opcional por assunto do e-mail (além dos remetentes)
alter table gmail_conexoes add column if not exists assuntos text[] not null default '{}';
