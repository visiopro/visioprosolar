import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DadosFaturaPdf } from "./pdf/fatura";
import { brl, data, mesRef, nFatura } from "./format";

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

  // logo: a gravada na emissão; faturas antigas usam a logo atual da usina
  let logoPath: string | null = (f.snapshot as { usina: { logo_path?: string | null } }).usina.logo_path ?? null;
  if (!logoPath) {
    const { data: u } = await supabase.from("usinas").select("logo_path").eq("id", f.usina_id).maybeSingle();
    logoPath = u?.logo_path ?? null;
  }
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
  };
  const { gerarPdfFatura } = await import("./pdf/fatura");
  const pdf = await gerarPdfFatura(dados);
  const nome = `Fatura_${nFatura(f.numero)}_${mesRef(f.referencia).replace("/", "-")}.pdf`;
  return { fatura: f, pdf, nome };
}

export function legendaWhatsapp(f: { snapshot: DadosFaturaPdf["snapshot"]; referencia: string; total_centavos: number; vencimento: string; economia_centavos: number; asaas_link?: string | null }) {
  const primeiroNome = f.snapshot.cliente.nome.split(" ")[0];
  return [
    `Olá, ${primeiroNome}! Segue a fatura de energia solar de ${mesRef(f.referencia)} da ${f.snapshot.usina.nome}.`,
    ``,
    `Valor: ${brl(Number(f.total_centavos))}`,
    `Vencimento: ${data(f.vencimento)}`,
    `Economia neste mês: ${brl(Number(f.economia_centavos))}`,
    ``,
    `Na próxima mensagem vai o código PIX copia e cola.`,
    ...(f.asaas_link ? [``, `Outras formas de pagamento: ${f.asaas_link}`] : []),
  ].join("\n");
}
