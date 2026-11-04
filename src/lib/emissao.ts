import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Usina } from "./usina";
import { calcularFatura, type ModoDesconto } from "./calculo";
import { gerarPix } from "./pix";
import { brl, hojeBR, parseNumeroBR } from "./format";
import { enviarFaturaPorWhatsapp } from "./faturas";
import { whatsappDisponivel } from "./whatsapp";
import { cobrar, NOMES_GATEWAY } from "./cobranca";
import { normalizarUC } from "./leitor/tipos";
import { registrarContaAPagar } from "./contas-pagar";
import { calcularEncargo, totalEncargos, type EncargoAtraso } from "./encargos";

export type DadosEmissao = {
  contaId: string;
  clienteId: string;
  uc: string;
  referencia: string;   // AAAA-MM
  consumoKwh: string;
  compensadaKwh: string;
  tarifa: string;
  bandeira: string;     // R$
  iluminacao: string;   // R$
  valorConta: string;   // R$ total da conta que chegou
  semUsinaAjustado: string; // R$, vazio = usar o cálculo
  vencimentoConta: string;  // AAAA-MM-DD da conta da distribuidora (conta no nome da usina)
  vencimento: string;   // AAAA-MM-DD
  confirmado: boolean;
  cobrarEncargos?: boolean; // multa e juros de faturas anteriores pagas com atraso (padrão: sim)
};

export type ResultadoEmissao = { erro?: string; id?: string; aviso?: string; enviada?: boolean };

const reaisParaCentavos = (v: string) => Math.round((parseNumeroBR(v) ?? 0) * 100);

/**
 * Emite a fatura de uma conta conferida. Usado pela tela "Lançar conta" (userId = quem conferiu)
 * e pela emissão automática das contas do Gmail (userId = null).
 */
export async function emitirFaturaDaConta(
  supabase: SupabaseClient,
  usina: Usina,
  userId: string | null,
  d: DadosEmissao,
  opcoes: { enviar?: boolean } = {},
): Promise<ResultadoEmissao> {
    if (!d.confirmado) return { erro: "Confirme que conferiu os dados com a conta original." };
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(d.referencia)) return { erro: "Mês de referência inválido." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.vencimento) || Number.isNaN(Date.parse(d.vencimento))) return { erro: "Data de vencimento inválida." };

    const { data: cliente } = await supabase.from("clientes").select("*").eq("id", d.clienteId).maybeSingle();
    if (!cliente) return { erro: "Selecione um cliente cadastrado." };
    if (!cliente.ativo) return { erro: "Esse cliente está inativo." };
    if (normalizarUC(d.uc) !== normalizarUC(cliente.uc)) return { erro: `A UC da conta (${normalizarUC(d.uc) || "vazia"}) não é a do cliente (${cliente.uc}).` };

    const modo = cliente.modo_desconto as ModoDesconto;
    const consumo = parseNumeroBR(d.consumoKwh);
    const compensada = parseNumeroBR(d.compensadaKwh);
    const tarifa = parseNumeroBR(d.tarifa) ?? 0;
    const valorConta = reaisParaCentavos(d.valorConta);
    const bandeira = reaisParaCentavos(d.bandeira);
    const iluminacao = reaisParaCentavos(d.iluminacao);
    const ajustado = d.semUsinaAjustado.trim() ? reaisParaCentavos(d.semUsinaAjustado) : null;

    const r = calcularFatura({
      modo,
      descontoValor: Number(cliente.desconto_valor),
      tarifa,
      consumoKwh: consumo ?? 0,
      compensadaKwh: compensada ?? 0,
      valorContaCentavos: valorConta,
      bandeiraCentavos: bandeira,
      iluminacaoCentavos: iluminacao,
      semUsinaAjustadoCentavos: modo === "percentual_conta_cheia" ? ajustado : null,
    });

    const referencia = `${d.referencia}-01`;

    // Faturas anteriores desse cliente pagas com atraso e ainda sem encargo cobrado: multa e juros entram nesta
    let encargos: EncargoAtraso[] = [];
    if (usina.encargos_ativos && d.cobrarEncargos !== false) {
      const { data: atrasadas } = await supabase
        .from("faturas")
        .select("id, numero, referencia, vencimento, paga_em, total_centavos, valor_recebido_centavos")
        .eq("cliente_id", cliente.id)
        .eq("status", "paga")
        .is("encargo_fatura_id", null)
        .not("paga_em", "is", null)
        .gte("vencimento", usina.encargos_desde ?? hojeBR());
      const diaBR = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
      encargos = (atrasadas ?? [])
        .map((a) => calcularEncargo(
          { id: a.id, numero: a.numero, referencia: a.referencia, vencimento: a.vencimento, paga_em: diaBR(a.paga_em!), total_centavos: Number(a.total_centavos) },
          Number(usina.multa_percentual ?? 2),
          Number(usina.juros_mensal ?? 1),
        ))
        .filter((e): e is EncargoAtraso => !!e);
    }
    const valorEncargos = totalEncargos(encargos);
    const totalComEncargos = r.totalCentavos + valorEncargos;
    // Cobrança automática ligada: o PIX vem da cobrança; a chave fixa não é usada
    const pix = usina.gateway !== "nenhum" ? null : gerarPix({
      chave: usina.pix_chave ?? "",
      favorecido: usina.pix_favorecido ?? "",
      cidade: usina.pix_cidade ?? "",
      centavos: totalComEncargos,
      txid: `SOL${d.referencia.replace("-", "")}${cliente.uc.slice(-8)}`,
    });

    const { data: conta } = await supabase
      .from("contas_energia")
      .update({
        cliente_id: cliente.id,
        uc: cliente.uc,
        referencia,
        consumo_kwh: consumo,
        compensada_kwh: compensada,
        tarifa,
        bandeira_centavos: bandeira,
        iluminacao_centavos: iluminacao,
        valor_conta_centavos: valorConta,
        status: "conferida",
        conferida_por: userId,
        conferida_em: new Date().toISOString(),
      })
      .eq("id", d.contaId)
      .eq("usina_id", usina.id)
      .neq("status", "faturada")
      .or(`leitura_lock_ate.is.null,leitura_lock_ate.lt.${new Date().toISOString()}`)
      .select("id")
      .maybeSingle();
    if (!conta) return { erro: "A conta não está disponível: pode estar em leitura, já ter sido faturada ou não pertencer à sua usina." };

    const { data: fatura, error } = await supabase
      .from("faturas")
      .insert({
        usina_id: usina.id,
        numero: 0, // definido pelo gatilho
        cliente_id: cliente.id,
        conta_id: d.contaId,
        referencia,
        vencimento: d.vencimento,
        modo_desconto: modo,
        desconto_valor: cliente.desconto_valor,
        consumo_kwh: consumo,
        compensada_kwh: compensada ?? 0,
        tarifa,
        bandeira_centavos: modo === "percentual_conta_cheia" ? bandeira : 0,
        iluminacao_centavos: modo === "percentual_conta_cheia" ? iluminacao : 0,
        sem_usina_ajustado: modo === "percentual_conta_cheia" && ajustado !== null,
        valor_conta_centavos: valorConta,
        custo_usina_centavos: modo === "percentual_conta_cheia" ? valorConta : 0,
        sem_usina_centavos: r.semUsinaCentavos,
        total_centavos: totalComEncargos,
        economia_centavos: r.economiaCentavos,
        encargos_centavos: valorEncargos,
        encargos_detalhe: encargos.length ? encargos : null,
        pix_copia_cola: pix,
        snapshot: {
          cliente: { nome: cliente.nome, documento: cliente.documento, uc: cliente.uc, distribuidora: cliente.distribuidora },
          usina: { nome: usina.nome, documento: usina.documento, pix_favorecido: usina.pix_favorecido, logo_path: usina.logo_path },
        },
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") return { erro: "Esse cliente já tem fatura para esse mês. Cancele a anterior para reemitir." };
      return { erro: "Não foi possível emitir a fatura." };
    }

    await supabase.from("contas_energia").update({ status: "faturada" }).eq("id", d.contaId);
    if (encargos.length) {
      await supabase.from("faturas").update({ encargo_fatura_id: fatura.id }).in("id", encargos.map((e) => e.fatura_id)).is("encargo_fatura_id", null);
    }
    await supabase.from("eventos").insert({ usina_id: usina.id, acao: "fatura_emitida", alvo_id: fatura.id, detalhes: { total: totalComEncargos, referencia, ajustado: ajustado !== null, encargos: valorEncargos || undefined, automatica: userId === null || undefined } });

    // Conta no nome da usina: vira (ou atualiza) a conta a pagar no financeiro, com o código de barras
    if (modo === "percentual_conta_cheia" && valorConta > 0) {
      const venc = /^\d{4}-\d{2}-\d{2}$/.test(d.vencimentoConta) ? d.vencimentoConta : d.vencimento;
      const { data: contaInfo } = await supabase.from("contas_energia").select("codigo_barras, leitura_ia").eq("id", d.contaId).maybeSingle();
      const codigo = (contaInfo?.codigo_barras as string | null) ?? ((contaInfo?.leitura_ia as { codigo_barras?: string | null } | null)?.codigo_barras ?? null);
      await registrarContaAPagar(supabase, {
        usinaId: usina.id,
        contaId: d.contaId,
        cliente: { id: cliente.id, nome: cliente.nome, distribuidora: cliente.distribuidora },
        referencia: d.referencia,
        valorCentavos: valorConta,
        vencimento: venc,
        codigoBarras: codigo,
        faturaId: fatura.id,
      });
    }

    let aviso: string | undefined = valorEncargos
      ? `Incluídos ${brl(valorEncargos)} de multa e juros por atraso (fatura${encargos.length > 1 ? "s" : ""} nº ${encargos.map((e) => e.numero).join(", ")}).`
      : undefined;
    if (usina.gateway !== "nenhum") {
      const c = await cobrar(supabase, usina, fatura.id);
      if (c.erro) aviso = [aviso, `Fatura emitida, mas a cobrança no ${NOMES_GATEWAY[usina.gateway]} não foi criada: ${c.erro} Corrija e clique em "Gerar cobrança automática" antes de enviar.`].filter(Boolean).join(" ");
    }
    // envio automático no WhatsApp (depois da cobrança, para já sair com o PIX dinâmico)
    let enviada = false;
    if ((opcoes.enviar ?? usina.whatsapp_auto) && whatsappDisponivel(usina.whatsapp_instancia, "fatura") && cliente.whatsapp) {
      const w = await enviarFaturaPorWhatsapp(supabase, usina, fatura.id);
      if (w.erro) aviso = [aviso, `Não foi enviada no WhatsApp: ${w.erro}`].filter(Boolean).join(" ");
      else enviada = true;
    }

    return { id: fatura.id, aviso, enviada };
}
