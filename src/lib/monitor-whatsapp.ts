import "server-only";
import { supabaseAdmin } from "./supabase/admin";
import { segredos } from "./cobranca";
import { usaWhatsAppOficial } from "./whatsapp";
import { enviarAlertaEmail, enviarAlertaNtfy } from "./alerta-email";

const SEIS_HORAS = 6 * 3600 * 1000;

async function estado(url: string, key: string, instancia: string): Promise<string> {
  try {
    const res = await fetch(`${url}/instance/connectionState/${encodeURIComponent(instancia)}`, { headers: { apikey: key }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return `erro_${res.status}`;
    const j = (await res.json().catch(() => null)) as { instance?: { state?: string }; state?: string } | null;
    return j?.instance?.state ?? j?.state ?? "desconhecido";
  } catch {
    return "sem_resposta";
  }
}

/** Reinicia a instância travada (o "reiniciar a Evolution" que resolveu o problema antes) */
async function reiniciar(url: string, key: string, instancia: string) {
  for (const method of ["POST", "PUT"]) {
    const res = await fetch(`${url}/instance/restart/${encodeURIComponent(instancia)}`, { method, headers: { apikey: key }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
    if (res?.ok) return;
  }
}

/**
 * Checagem de hora em hora: se a instância de uma usina não estiver conectada, tenta reiniciar;
 * continuando fora, grava o estado (aparece um aviso no app) e manda e-mail para a equipe e o dono (no máximo a cada 6 h).
 */
export async function monitorarWhatsapp() {
  if (usaWhatsAppOficial()) return [];
  const url = (process.env.EVOLUTION_API_URL ?? "").trim().replace(/\/+$/, "");
  if (!url) return [];
  const db = supabaseAdmin();
  const { data: usinas } = await db.from("usinas").select("id, nome, whatsapp_instancia, whatsapp_alerta_em, whatsapp_estado").not("whatsapp_instancia", "is", null);
  const resultado: { usina: string; estado: string; email?: string }[] = [];
  for (const u of usinas ?? []) {
    const instancia = u.whatsapp_instancia as string;
    const key = (await segredos(u.id)).evolutionToken || (process.env.EVOLUTION_API_KEY ?? "").trim();
    if (!key) continue;
    let e = await estado(url, key, instancia);
    if (e !== "open") {
      await reiniciar(url, key, instancia);
      await new Promise((r) => setTimeout(r, 8000));
      e = await estado(url, key, instancia);
    }
    const agora = new Date();
    // só alerta na segunda checagem seguida fora do ar (evita alarme durante uma reconexão rápida)
    let email: string | undefined;
    const alertar = e !== "open" && !!u.whatsapp_estado && u.whatsapp_estado !== "open" && (!u.whatsapp_alerta_em || agora.getTime() - Date.parse(u.whatsapp_alerta_em) > SEIS_HORAS);
    if (alertar) {
      const { data: donos } = await db.from("usina_membros").select("user_id").eq("usina_id", u.id).eq("papel", "dono");
      const emails: string[] = (process.env.ALERTA_EMAILS ?? "").split(",");
      for (const d of donos ?? []) {
        const { data } = await db.auth.admin.getUserById(d.user_id);
        if (data.user?.email) emails.push(data.user.email);
      }
      email = await enviarAlertaEmail(
        emails,
        `WhatsApp desconectado · ${u.nome}`,
        `O WhatsApp da ${u.nome} (instância ${instancia}) está fora do ar (estado: ${e}).\n\nEnquanto isso, as faturas são emitidas mas NÃO são enviadas aos clientes, e os lembretes não saem.\n\nO sistema já tentou reiniciar sozinho. Se continuar, reconecte o número lendo o QR code no painel da Evolution ou fale com a VisioPro.\n\nVisioPro Solar`,
      );
      await enviarAlertaNtfy(`WhatsApp fora do ar · ${u.nome}`, `Instância ${instancia} (${e}). As faturas não estão indo para os clientes. Reconecte o número no painel da Evolution.`);
      await db.from("eventos").insert({ usina_id: u.id, user_id: null, acao: "whatsapp_fora", detalhes: { instancia, estado: e } });
    }
    await db
      .from("usinas")
      .update({
        whatsapp_estado: e,
        whatsapp_estado_em: agora.toISOString(),
        ...(alertar ? { whatsapp_alerta_em: agora.toISOString() } : e === "open" ? { whatsapp_alerta_em: null } : {}),
      })
      .eq("id", u.id);
    resultado.push({ usina: u.nome, estado: e, ...(email ? { email } : {}) });
  }
  return resultado;
}
