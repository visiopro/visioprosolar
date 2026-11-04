import "server-only";
import nodemailer from "nodemailer";

/** E-mail de alerta para a equipe (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS). Sem SMTP configurado, não faz nada. */
export async function enviarAlertaEmail(para: string[], assunto: string, texto: string): Promise<boolean> {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const destinos = [...new Set(para.map((e) => e.trim()).filter((e) => /^\S+@\S+\.\S+$/.test(e)))];
  if (!host || !user || !pass || !destinos.length) return false;
  const port = Number(process.env.SMTP_PORT ?? 587);
  try {
    await nodemailer
      .createTransport({ host, port, secure: port === 465, requireTLS: port === 587, auth: { user, pass } })
      .sendMail({ from: `VisioPro Solar <${user}>`, to: destinos.join(", "), subject: assunto, text: texto });
    return true;
  } catch (e) {
    console.error("alerta e-mail", e);
    return false;
  }
}
