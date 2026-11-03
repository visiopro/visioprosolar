import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { gerarPdfFatura, type DadosFaturaPdf } from "./pdf/fatura";
import { brl, data, mesExtenso, mesRef, nFatura } from "./format";
import { enviarDocumento, enviarTexto, usaWhatsAppOficial, whatsappDisponivel } from "./whatsapp";
import type { Usina } from "./usina";
import { cobrar, segredos } from "./cobranca";
import { pixDaFatura } from "./pix";
import { recebedorMercadoPago } from "./cobranca/mercadopago";
import { supabaseAdmin } from "./supabase/admin";
import { anexarContaOriginal } from "./pdf/anexar-conta";
import { desbloquearPdf, pdfComSenha, senhasDaUsina } from "./pdf-senha";

/** Carrega a fatura (respeitando o client recebido) e gera o PDF */
export async function pdfDaFatura(supabase: SupabaseClient, faturaId: string) {
  const { data: f, error } = await supabase.from("faturas").select("*").eq("id", faturaId).maybeSingle();
  if (error || !f) return null;

  const { data: anteriores } = await supabase
    .from("faturas")
    .select("economia_centavos")
    .eq("cliente_id", f.cliente_id)
    .neq("status", "cancelada")
    .lte("referencia", f.referencia);
  const acumulada = (anteriores ?? []).reduce((soma, r) => soma + Number(r.economia_centavos), 0);

  const [{ data: u }, { data: cli }] = await Promise.all([
    supabase.from("usinas").select("logo_path, contato_whatsapp, recebedor_nome, recebedor_documento, pix_favorecido, pix_documento, documento, gateway").eq("id", f.usina_id).maybeSingle(),
    supabase.from("clientes").select("portal_token").eq("id", f.cliente_id).maybeSingle(),
  ]);
  // logo: a gravada na emissão; faturas antigas usam a logo atual da usina
  const logoPath: string | null = (f.snapshot as { usina: { logo_path?: string | null } }).usina.logo_path ?? u?.logo_path ?? null;
  let logo: Buffer | null = null;
  if (logoPath) {
    const { data: arq } = await supabase.storage.from("logos").download(logoPath);
    if (arq) logo = Buffer.from(await arq.arrayBuffer());
  }

  const dados: DadosFaturaPdf = {
    logo,
    ...f,
    desconto_valor: Number(f.desconto_valor),
    compensada_kwh: Number(f.compensada_kwh),
    consumo_kwh: f.consumo_kwh === null ? null : Number(f.consumo_kwh),
    bandeira_centavos: Number(f.bandeira_centavos ?? 0),
    iluminacao_centavos: Number(f.iluminacao_centavos ?? 0),
    sem_usina_ajustado: !!f.sem_usina_ajustado,
    tarifa: Number(f.tarifa),
    valor_conta_centavos: Number(f.valor_conta_centavos),
    sem_usina_centavos: Number(f.sem_usina_centavos),
    total_centavos: Number(f.total_centavos),
    economia_centavos: Number(f.economia_centavos),
    economia_acumulada_centavos: acumulada,
    contato_whatsapp: (u?.contato_whatsapp as string | null) ?? null,
    portal_url: cli?.portal_token ? linkPortal(cli.portal_token as string) : null,
    pix_copia_cola: pixDaFatura(f, u?.gateway as string | undefined),
    // PIX fixo: titular da chave cadastrado em Ajustes
    recebedor: u?.pix_favorecido
      ? { nome: String(u.pix_favorecido), documento: (u.pix_documento as string | null) || (u.documento as string | null) || null }
      : null,
  };

  // PIX dinâmico do Mercado Pago: no banco aparece o titular da conta MP, não o nome da usina
  if (f.cobranca_gateway === "mercadopago") {
    if (u?.recebedor_nome) {
      dados.recebedor = { nome: u.recebedor_nome as string, documento: (u.recebedor_documento as string | null) ?? null };
    } else {
      const token = (await segredos(f.usina_id)).mpToken;
      const r = token ? await recebedorMercadoPago(token) : null;
      if (r) {
        dados.recebedor = r;
        await supabaseAdmin().from("usinas").update({ recebedor_nome: r.nome, recebedor_documento: r.documento }).eq("id", f.usina_id);
      }
    }
  }
  // Conta no nome da usina: anexa a conta original da distribuidora marcada "NÃO PAGAR" (transparência)
  let contaOriginal: { bytes: Uint8Array; tipo: string } | null = null;
  if (f.modo_desconto === "percentual_conta_cheia" && f.conta_id) {
    const { data: conta } = await supabase.from("contas_energia").select("arquivo_path, arquivo_tipo").eq("id", f.conta_id).maybeSingle();
    if (conta?.arquivo_path && ["application/pdf", "image/jpeg", "image/png"].includes(conta.arquivo_tipo)) {
      const { data: arq } = await supabase.storage.from("contas").download(conta.arquivo_path);
      if (arq) {
        let bytes: Uint8Array = new Uint8Array(await arq.arrayBuffer());
        if (conta.arquivo_tipo === "application/pdf" && pdfComSenha(bytes)) {
          bytes = (await desbloquearPdf(bytes, await senhasDaUsina(supabase, f.usina_id)).catch(() => null)) ?? new Uint8Array();
        }
        if (bytes.length) contaOriginal = { bytes, tipo: conta.arquivo_tipo };
      }
    }
  }
  dados.conta_anexa = !!contaOriginal;
  let pdf: Buffer = await gerarPdfFatura(dados);
  if (contaOriginal) {
    const distribuidora = String((f.snapshot as { cliente: { distribuidora?: string } }).cliente.distribuidora ?? "distribuidora").split(" (")[0];
    pdf = Buffer.from(await anexarContaOriginal(new Uint8Array(pdf), contaOriginal, distribuidora));
  }
  const nome = `Fatura_${nFatura(f.numero)}_${mesRef(f.referencia).replace("/", "-")}.pdf`;
  return { fatura: f, pdf, nome };
}

import { legendaWhatsapp, linkPortal, type FaturaLegenda } from "./legenda";
export { legendaWhatsapp, linkPortal, type FaturaLegenda };

/** Envia o PDF da fatura, o PIX copia e cola e o link de pagamento no WhatsApp do cliente */
export async function enviarFaturaPorWhatsapp(supabase: SupabaseClient, usina: Usina, faturaId: string): Promise<{ erro?: string }> {
  if (!whatsappDisponivel(usina.whatsapp_instancia, "fatura")) {
    return { erro: usaWhatsAppOficial() ? "O número oficial da VisioPro ou o modelo de fatura ainda não está configurado." : "WhatsApp da usina não conectado. Fale com a VisioPro." };
  }
  // Cobrança automática ligada: a fatura só sai com o PIX da cobrança (que dá baixa sozinho)
  if (usina.gateway !== "nenhum") {
    const { data: atual } = await supabase.from("faturas").select("status, cobranca_id").eq("id", faturaId).maybeSingle();
    if (atual?.status === "pendente" && !atual.cobranca_id) {
      const c = await cobrar(supabase, usina, faturaId);
      if (c.erro) return { erro: `A cobrança não foi criada, então a fatura não foi enviada: ${c.erro}` };
    }
  }
  const r = await pdfDaFatura(supabase, faturaId);
  if (!r) return { erro: "Fatura não encontrada." };
  if (r.fatura.status === "cancelada") return { erro: "Fatura cancelada não pode ser enviada." };
  const { data: cliente } = await supabase.from("clientes").select("whatsapp, portal_token").eq("id", r.fatura.cliente_id).single();
  if (!cliente?.whatsapp) return { erro: "Cadastre o WhatsApp do cliente para enviar." };

  try {
    const token = usaWhatsAppOficial() ? null : (await segredos(usina.id)).evolutionToken;
    const clienteNome = (r.fatura.snapshot as DadosFaturaPdf["snapshot"]).cliente.nome;
    await enviarDocumento({
      instancia: usina.whatsapp_instancia,
      numero: cliente.whatsapp,
      legenda: legendaWhatsapp({ ...r.fatura, portal_token: cliente.portal_token }, usina.mensagem_fatura_texto),
      pdf: r.pdf,
      nomeArquivo: r.nome,
      usinaNome: usina.nome,
      dadosFatura: {
        clienteNome: clienteNome.split(" ")[0],
        referencia: mesExtenso(r.fatura.referencia),
        valor: brl(Number(r.fatura.total_centavos)),
        vencimento: data(r.fatura.vencimento),
        pix: r.fatura.status === "pendente" ? pixDaFatura(r.fatura, usina.gateway) ?? "" : "",
      },
      token,
    });
    // PIX em mensagem separada: no WhatsApp o cliente copia com um toque
    const pixEnvio = pixDaFatura(r.fatura, usina.gateway);
    if (!usaWhatsAppOficial() && pixEnvio && r.fatura.status === "pendente") {
      await enviarTexto({ instancia: usina.whatsapp_instancia, numero: cliente.whatsapp, texto: pixEnvio, usinaNome: usina.nome, token });
    }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha no envio pelo WhatsApp." };
  }
  await supabase.from("faturas").update({ enviada_em: new Date().toISOString() }).eq("id", faturaId);
  await supabase.from("eventos").insert({ usina_id: usina.id, acao: "fatura_enviada", alvo_id: faturaId });
  return {};
}
