-- Vencimento de fatura pendente pode ser corrigido (botão "Alterar vencimento"); demais valores seguem travados
create or replace function proteger_fatura() returns trigger
language plpgsql as $$
begin
  if old.status = 'cancelada' then
    raise exception 'Fatura cancelada não pode ser alterada.';
  end if;
  if new.vencimento is distinct from old.vencimento and old.status <> 'pendente' then
    raise exception 'Só fatura pendente pode ter o vencimento alterado.';
  end if;
  if (new.usina_id, new.numero, new.cliente_id, new.conta_id, new.referencia, new.modo_desconto,
      new.desconto_valor, new.consumo_kwh, new.compensada_kwh, new.tarifa, new.bandeira_centavos,
      new.iluminacao_centavos, new.valor_conta_centavos, new.sem_usina_centavos, new.total_centavos,
      new.economia_centavos, new.custo_usina_centavos, new.sem_usina_ajustado, new.snapshot, new.created_by)
     is distinct from
     (old.usina_id, old.numero, old.cliente_id, old.conta_id, old.referencia, old.modo_desconto,
      old.desconto_valor, old.consumo_kwh, old.compensada_kwh, old.tarifa, old.bandeira_centavos,
      old.iluminacao_centavos, old.valor_conta_centavos, old.sem_usina_centavos, old.total_centavos,
      old.economia_centavos, old.custo_usina_centavos, old.sem_usina_ajustado, old.snapshot, old.created_by) then
    raise exception 'Valores de fatura emitida não podem ser alterados. Cancele e reemita.';
  end if;
  return new;
end $$;
