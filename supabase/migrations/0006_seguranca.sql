-- Reforço de segurança multi-usina

-- ============================================================
-- 1. Instância do WhatsApp: só a VisioPro (service role / SQL) altera
-- ============================================================
create or replace function proteger_usina() returns trigger
language plpgsql as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') in ('authenticated', 'anon')
     and new.whatsapp_instancia is distinct from old.whatsapp_instancia then
    raise exception 'A instância do WhatsApp é definida pela VisioPro.';
  end if;
  return new;
end $$;
drop trigger if exists usinas_proteger on usinas;
create trigger usinas_proteger before update on usinas for each row execute function proteger_usina();

-- ============================================================
-- 3. Nova usina só com convite (o servidor valida e cria)
-- ============================================================
drop function if exists criar_usina(text, text);

create table if not exists convites_usina (
  codigo text primary key,
  nota text,
  criado_em timestamptz not null default now(),
  usado_em timestamptz,
  usado_por uuid references auth.users(id) on delete set null,
  usina_id uuid references usinas(id) on delete set null
);
-- sem políticas: só o servidor lê e grava
alter table convites_usina enable row level security;

-- ============================================================
-- 5. Vínculos sempre dentro da mesma usina
-- ============================================================
create or replace function checar_vinculos_fatura() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from clientes where id = new.cliente_id and usina_id = new.usina_id) then
    raise exception 'Cliente não pertence a esta usina.';
  end if;
  if new.conta_id is not null and not exists (select 1 from contas_energia where id = new.conta_id and usina_id = new.usina_id) then
    raise exception 'Conta não pertence a esta usina.';
  end if;
  return new;
end $$;
drop trigger if exists faturas_vinculos on faturas;
create trigger faturas_vinculos before insert or update of cliente_id, conta_id, usina_id on faturas
  for each row execute function checar_vinculos_fatura();

create or replace function checar_vinculos_conta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.cliente_id is not null and not exists (select 1 from clientes where id = new.cliente_id and usina_id = new.usina_id) then
    raise exception 'Cliente não pertence a esta usina.';
  end if;
  return new;
end $$;
drop trigger if exists contas_vinculos on contas_energia;
create trigger contas_vinculos before insert or update of cliente_id, usina_id on contas_energia
  for each row execute function checar_vinculos_conta();

create or replace function checar_vinculos_despesa() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.cliente_id is not null and not exists (select 1 from clientes where id = new.cliente_id and usina_id = new.usina_id) then
    raise exception 'Cliente não pertence a esta usina.';
  end if;
  if new.fatura_id is not null and not exists (select 1 from faturas where id = new.fatura_id and usina_id = new.usina_id) then
    raise exception 'Fatura não pertence a esta usina.';
  end if;
  return new;
end $$;
drop trigger if exists despesas_vinculos on despesas;
create trigger despesas_vinculos before insert or update of cliente_id, fatura_id, usina_id on despesas
  for each row execute function checar_vinculos_despesa();

-- nenhum registro muda de usina
create or replace function usina_imutavel() returns trigger
language plpgsql as $$
begin
  if new.usina_id is distinct from old.usina_id then
    raise exception 'Registro não pode mudar de usina.';
  end if;
  return new;
end $$;
drop trigger if exists clientes_usina_fixa on clientes;
create trigger clientes_usina_fixa before update on clientes for each row execute function usina_imutavel();
drop trigger if exists contas_usina_fixa on contas_energia;
create trigger contas_usina_fixa before update on contas_energia for each row execute function usina_imutavel();
drop trigger if exists despesas_usina_fixa on despesas;
create trigger despesas_usina_fixa before update on despesas for each row execute function usina_imutavel();

-- ============================================================
-- 6. Fatura emitida: valores travados; cancelada não muda mais
-- ============================================================
create or replace function proteger_fatura() returns trigger
language plpgsql as $$
begin
  if old.status = 'cancelada' then
    raise exception 'Fatura cancelada não pode ser alterada.';
  end if;
  if (new.usina_id, new.numero, new.cliente_id, new.conta_id, new.referencia, new.vencimento, new.modo_desconto,
      new.desconto_valor, new.consumo_kwh, new.compensada_kwh, new.tarifa, new.bandeira_centavos,
      new.iluminacao_centavos, new.valor_conta_centavos, new.sem_usina_centavos, new.total_centavos,
      new.economia_centavos, new.custo_usina_centavos, new.sem_usina_ajustado, new.snapshot, new.created_by)
     is distinct from
     (old.usina_id, old.numero, old.cliente_id, old.conta_id, old.referencia, old.vencimento, old.modo_desconto,
      old.desconto_valor, old.consumo_kwh, old.compensada_kwh, old.tarifa, old.bandeira_centavos,
      old.iluminacao_centavos, old.valor_conta_centavos, old.sem_usina_centavos, old.total_centavos,
      old.economia_centavos, old.custo_usina_centavos, old.sem_usina_ajustado, old.snapshot, old.created_by) then
    raise exception 'Valores de fatura emitida não podem ser alterados. Cancele e reemita.';
  end if;
  return new;
end $$;
drop trigger if exists faturas_proteger on faturas;
create trigger faturas_proteger before update on faturas for each row execute function proteger_fatura();

-- Exclusões só pelo dono (operador lê, cria e edita)
drop policy if exists clientes_tudo on clientes;
create policy clientes_ler on clientes for select using (usina_id in (select minhas_usinas()));
create policy clientes_criar on clientes for insert with check (usina_id in (select minhas_usinas()));
create policy clientes_editar on clientes for update using (usina_id in (select minhas_usinas())) with check (usina_id in (select minhas_usinas()));
create policy clientes_apagar on clientes for delete using (sou_dono(usina_id));

drop policy if exists contas_tudo on contas_energia;
create policy contas_ler on contas_energia for select using (usina_id in (select minhas_usinas()));
create policy contas_criar on contas_energia for insert with check (usina_id in (select minhas_usinas()));
create policy contas_editar on contas_energia for update using (usina_id in (select minhas_usinas())) with check (usina_id in (select minhas_usinas()));
create policy contas_apagar on contas_energia for delete using (sou_dono(usina_id));

drop policy if exists despesas_tudo on despesas;
create policy despesas_ler on despesas for select using (usina_id in (select minhas_usinas()));
create policy despesas_criar on despesas for insert with check (usina_id in (select minhas_usinas()));
create policy despesas_editar on despesas for update using (usina_id in (select minhas_usinas())) with check (usina_id in (select minhas_usinas()));
create policy despesas_apagar on despesas for delete using (sou_dono(usina_id));

-- eventos: ninguém registra ação em nome de outro usuário
drop policy if exists eventos_criar on eventos;
create policy eventos_criar on eventos for insert
  with check (usina_id in (select minhas_usinas()) and user_id = auth.uid());
