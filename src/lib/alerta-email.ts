import "server-only";
import nodemailer from "nodemailer";
import { createHash } from "node:crypto";

/** E-mail de alerta para a equipe (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS). Sem SMTP configurado, não faz nada. */
export async function enviarAlertaEmail(para: string[], assunto: string, texto: string): Promise<string> {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const destinos = [...new Set(para.map((e) => e.trim()).filter((e) => /^\S+@\S+\.\S+$/.test(e)))];
  if (!host || !user || !pass) return `sem configuração (${[!host && "SMTP_HOST", !user && "SMTP_USER", !pass && "SMTP_PASS"].filter(Boolean).join(", ")})`;
  if (!destinos.length) return "sem destinatário";
  const port = Number(process.env.SMTP_PORT ?? 587);
  const enviar = (authMethod: "PLAIN" | "LOGIN") =>
    nodemailer
      .createTransport({ host, port, secure: port === 465, requireTLS: port === 587, authMethod, auth: { user, pass } })
      .sendMail({ from: `VisioPro Solar <${user}>`, to: destinos.join(", "), subject: assunto, text: texto });
  try {
    try {
      await enviar("PLAIN");
    } catch (e) {
      // alguns servidores só aceitam AUTH LOGIN
      if (e instanceof Error && /535|auth/i.test(e.message)) await enviar("LOGIN");
      else throw e;
    }
    return `enviado para ${destinos.length} endereço(s)`;
  } catch (e) {
    console.error("alerta e-mail", e);
    // referência da senha (hash curto) para conferir a configuração sem expor o valor
    const ref = createHash("sha256").update(pass).digest("hex").slice(0, 8);
    return `erro: ${e instanceof Error ? e.message.slice(0, 160) : "falha no envio"} [${host}:${port}, ${user}, senha ${pass.length} car. ref ${ref}]`;
  }
}

/** Notificação no celular pelo app ntfy (NTFY_TOPICO; NTFY_URL opcional, padrão ntfy.sh). Sem tópico, não faz nada. */
export async function enviarAlertaNtfy(titulo: string, texto: string): Promise<boolean> {
  const topico = process.env.NTFY_TOPICO?.trim();
  if (!topico) return false;
  const base = (process.env.NTFY_URL?.trim() || "https://ntfy.sh").replace(/\/+$/, "");
  try {
    // publicação em JSON: aceita acentos no título
    const res = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic: topico, title: titulo, message: texto, priority: 4, tags: ["warning"] }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
