import "server-only";
import { supabaseAdmin } from "./supabase/admin";
import type { Usina } from "./usina";
import { emitirFaturaDaConta } from "./emissao";
import { conferirVariacao, type HistoricoCliente } from "./conferencia";
import { cipDaTabela, type ClasseCip, type FaixaCip } from "./cip";
import { usaCompensada, type ModoDesconto } from "./calculo";
import { hojeBR, proximoVencimento, somarDias } from "./format";
import type { LeituraConta } from "./leitor/tipos";

const txt = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

/**
 * Conta do Gmail lida pela IA: se estiver tudo certo, emite a fatura e envia no WhatsApp sem ninguém conferir.
 * Qualquer dúvida (campo duvidoso, variação estranha, cliente sem nome real ou sem WhatsApp) segura a conta
 * em "Contas recebidas" com o motivo, para o operador conferir e emitir pela tela.
 */
export async function emitirAutomatico(usinaId: string, contaId: string): Promise<{ id?: string; motivo?: string }> {
  const db = supabaseAdmin();
  const { data: usina } = await db.from("usinas").select("*").eq("id", usinaId).maybeSingle();
  if (!usina?.emissao_automatica) return {};

  const segurar = async (motivo: string) => {
    await db.from("contas_energia").update({ importacao_erro: `Não foi emitida sozinha: ${motivo} Confira e emita.` }).eq("id", contaId).neq("status", "faturada");
    return { motivo };
  };

  const { data: conta } = await db.from("contas_energia").select("leitura_ia, cliente_id, status, importacao_status").eq("id", contaId).eq("usina_id", usinaId).maybeSingle();
  if (!conta || conta.status !== "lida" || conta.importacao_status !== "pronta") return {};
  const l = conta.leitura_ia as LeituraConta | null;
  if (!l) return segurar("a leitura não trouxe dados.");
  if (!conta.cliente_id) return segurar("a UC da conta não foi reconhecida.");

  const { data: cliente } = await db.from("clientes").select("*").eq("id", conta.cliente_id).maybeSingle();
  if (!cliente?.ativo) return segurar("o cliente está inativo.");
  if (cliente.cadastro_automatico && String(cliente.nome).startsWith("UC ")) return segurar("cliente novo, complete o nome dele no cadastro.");
  if (!cliente.whatsapp) return segurar("o cliente não tem WhatsApp cadastrado.");

  const modo = cliente.modo_desconto as ModoDesconto;
  if (l.duvidosos.length) return segurar(`a leitura ficou em dúvida em: ${l.duvidosos.join(", ")}.`);
  if (!l.uc || !l.referencia || !l.consumo_kwh || !l.tarifa || l.valor_conta === null) return segurar("faltou algum dado na leitura (UC, mês, consumo, tarifa ou valor).");
  if (usaCompensada(modo) && !l.compensada_kwh) return segurar("faltou a energia compensada na leitura.");

  // mesma conferência da tela: mês já faturado, tarifa ou consumo fora do normal
  const { data: anteriores } = await db
    .from("faturas")
    .select("referencia, consumo_kwh, tarifa, total_centavos")
    .eq("cliente_id", cliente.id)
    .neq("status", "cancelada")
    .order("referencia", { ascending: false })
    .limit(36);
  const historico: HistoricoCliente | null = anteriores?.length
    ? {
        cliente_id: cliente.id,
        referencia: anteriores[0].referencia,
        consumo_kwh: anteriores[0].consumo_kwh === null ? null : Number(anteriores[0].consumo_kwh),
        tarifa: Number(anteriores[0].tarifa),
        total_centavos: Number(anteriores[0].total_centavos),
        referencias: anteriores.map((a) => a.referencia),
      }
    : null;
  const alertas = conferirVariacao({ historico, referencia: l.referencia, consumoKwh: l.consumo_kwh, tarifa: l.tarifa, totalCentavos: null });
  if (alertas.length) return segurar(alertas.map((a) => a.texto).join(" "));

  // bandeira: a da conta; verde = 0; sem informação = tarifa padrão da usina
  const bandeira = l.bandeira ? l.bandeira : l.bandeira_vigente === "verde" ? 0 : Math.round(l.consumo_kwh * Number(usina.bandeira_padrao ?? 0) * 100) / 100;

  // iluminação pública pela regra do cliente (a conta em nome da usina traz só o mínimo)
  const energia = l.consumo_kwh * l.tarifa;
  let iluminacao = l.iluminacao_publica ?? 0;
  if (cliente.cip_modo === "percentual") iluminacao = Math.round(energia * Number(cliente.cip_valor)) / 100;
  else if (cliente.cip_modo === "fixo") iluminacao = Number(cliente.cip_valor);
  else if (cliente.cip_modo === "tabela") {
    if (!cliente.cip_tabela_id || !cliente.cip_classe) return segurar("a iluminação pública do cliente está sem município/classe.");
    const { data: faixas } = await db.from("cip_faixas").select("tabela_id, classe, consumo_min, consumo_max, tipo, valor").eq("tabela_id", cliente.cip_tabela_id);
    const v = cipDaTabela((faixas ?? []).map((f) => ({ ...f, valor: Number(f.valor) })) as FaixaCip[], cliente.cip_classe as ClasseCip, l.consumo_kwh, energia);
    if (v === null) return segurar("nenhuma faixa de iluminação pública serve para esse consumo.");
    iluminacao = v;
  }

  const hoje = hojeBR();
  const vencimento = cliente.dia_vencimento ? proximoVencimento(hoje, Number(cliente.dia_vencimento)) : somarDias(hoje, Number(usina.dias_vencimento ?? 10));

  const r = await emitirFaturaDaConta(db, usina as Usina, null, {
    contaId,
    clienteId: cliente.id,
    uc: l.uc,
    referencia: l.referencia,
    consumoKwh: txt(l.consumo_kwh),
    compensadaKwh: txt(l.compensada_kwh),
    tarifa: txt(l.tarifa),
    bandeira: txt(bandeira),
    iluminacao: txt(iluminacao),
    valorConta: txt(l.valor_conta),
    semUsinaAjustado: "",
    vencimentoConta: l.vencimento_conta ?? "",
    vencimento,
    confirmado: true,
  }, { enviar: true });
  if (r.erro) return segurar(r.erro);
  if (r.id && r.aviso) await db.from("eventos").insert({ usina_id: usinaId, acao: "emissao_auto_aviso", alvo_id: r.id, detalhes: { aviso: r.aviso } });
  return { id: r.id };
}
