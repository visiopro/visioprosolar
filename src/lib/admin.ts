import "server-only";
import { notFound } from "next/navigation";
import { supabaseServer } from "./supabase/server";

/** E-mails da equipe VisioPro com acesso ao painel /admin (SUPER_ADMIN_EMAILS, separados por vírgula) */
const lista = () =>
  (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export const ehSuperAdmin = (email?: string | null) => !!email && lista().includes(email.toLowerCase());

export async function exigirSuperAdmin() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // 404 em vez de 403: não revela que a página existe
  if (!user?.email || !lista().includes(user.email.toLowerCase())) notFound();
  return user;
}

/** Código legível, sem letras que confundem (0/O, 1/I/L) */
export function gerarCodigo() {
  const alfabeto = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const c = Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
  return `${c.slice(0, 5)}-${c.slice(5)}`;
}

/** Senha provisória legível: 3 blocos, ex.: "Sol-7KQ4-M9TX" */
export function gerarSenha() {
  const alfabeto = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const c = Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
  return `Sol-${c.slice(0, 4)}-${c.slice(4)}`;
}
