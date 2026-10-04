import { supabaseAdmin } from "@/lib/supabase/admin";
import { enviarTexto, usaWhatsAppOficial, whatsappDisponivel } from "@/lib/whatsapp";
import { segredos } from "@/lib/cobranca";
import { brl, data, hojeBR, mesRef, somarDias } from "@/lib/format";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Roda uma vez por dia (vercel.json). Envia um lembrete por fatura pendente:
 * 2 dias antes do vencimento, ou no dia seguinte ao vencimento se ainda não houve lembrete.
 */
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || segredo.length < 16 || req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return new Response("Não autorizado", { status: 401 });
  }
  const admin = supabaseAdmin();
  const hoje = hojeBR();
  const { data: faturas, error } = await admin
    .from("faturas")
    .select("id, usina_id, referencia, vencimento, total_centavos, pix_copia_cola, cobranca_gateway, cobranca_link, snapshot, clientes(whatsapp), usinas(whatsapp_instancia, nome, asaas_notificar)")
    .eq("status", "pendente")
    .is("lembrete_em", null)
    .in("vencimento", [somarDias(hoje, 2), somarDias(hoje, -1)]);
  if (error) return Response.json({ erro: error.message }, { status: 500 });

  let enviados = 0;
  const falhas: string[] = [];
  for (const f of faturas ?? []) {
    const cliente = f.clientes as unknown as { whatsapp: string | null } | null;
    const usina = f.usinas as unknown as { whatsapp_instancia: string | null; nome: string; asaas_notificar: boolean } | null;
    if (!cliente?.whatsapp || !usina || !whatsappDisponivel(usina.whatsapp_instancia, "texto")) continue;
    // o Asaas já avisa esse cliente: evita mensagem duplicada
    if (f.cobranca_gateway === "asaas" && usina.asaas_notificar) continue;
    const vencida = f.vencimento < hoje;
    const nome = (f.snapshot as { cliente: { nome: string } }).cliente.nome.split(" ")[0];
    const texto = [
      vencida
        ? `Olá, ${nome}. A fatura de energia solar de ${mesRef(f.referencia)} da ${usina.nome} venceu em ${data(f.vencimento)} e ainda consta em aberto.`
        : `Olá, ${nome}! Lembrete: a fatura de energia solar de ${mesRef(f.referencia)} da ${usina.nome} vence em ${data(f.vencimento)}.`,
      `Valor: ${brl(Number(f.total_centavos))}`,
      f.pix_copia_cola ? `\nPIX copia e cola:\n${f.pix_copia_cola}` : "",
      f.cobranca_link ? `\nPágina de pagamento: ${f.cobranca_link}` : "",
      `\nSe já pagou, desconsidere esta mensagem.`,
    ].join("\n");
    try {
      const token = usaWhatsAppOficial() ? null : (await segredos(f.usina_id)).evolutionToken;
      await enviarTexto({ instancia: usina.whatsapp_instancia, numero: cliente.whatsapp, texto, usinaNome: usina.nome, token });
      await admin.from("faturas").update({ lembrete_em: new Date().toISOString() }).eq("id", f.id);
      await admin.from("eventos").insert({ usina_id: f.usina_id, user_id: null, acao: "lembrete_enviado", alvo_id: f.id });
      enviados++;
    } catch (e) {
      falhas.push(`${f.id}: ${e instanceof Error ? e.message : "erro"}`);
    }
  }
  return Response.json({ enviados, falhas });
}
