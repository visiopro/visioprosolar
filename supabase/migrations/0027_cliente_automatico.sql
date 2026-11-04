-- Cliente criado sozinho a partir de uma conta importada do Gmail (UC ainda não cadastrada)
alter table clientes add column if not exists cadastro_automatico boolean not null default false;
