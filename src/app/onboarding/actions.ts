"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Cria a usina a partir de um código de convite gerado pela VisioPro */
export async function criarUsina(_: { erro?: string } | undefined, form: FormData) {
  const nome = String(form.get("nome") ?? "").trim();
  const documento = String(form.get("documento") ?? "").trim();
  const codigo = String(form.get("codigo") ?? "").trim().toUpperCase().replace(/\s/g, "");
  if (nome.length < 2) return { erro: "Informe o nome da usina." };
  if (!/^[A-Z0-9]{5}-?[A-Z0-9]{5}$/.test(codigo)) return { erro: "Código de convite inválido." };
  const cod = codigo.includes("-") ? codigo : `${codigo.slice(0, 5)}-${codigo.slice(5)}`;

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = supabaseAdmin();
  const { count } = await admin.from("usina_membros").select("*", { count: "exact", head: true }).eq("user_id", user.id);
  if (count) redirect("/");

  // reserva o convite de forma atômica: só um cadastro consegue usar cada código
  const { data: convite } = await admin
    .from("convites_usina")
    .update({ usado_em: new Date().toISOString(), usado_por: user.id })
    .eq("codigo", cod)
    .is("usado_em", null)
    .select("codigo")
    .maybeSingle();
  if (!convite) return { erro: "Código de convite inválido ou já usado." };

  const { data: usina, error } = await admin.from("usinas").insert({ nome, documento: documento || null }).select("id").single();
  if (error || !usina) {
    await admin.from("convites_usina").update({ usado_em: null, usado_por: null }).eq("codigo", cod);
    return { erro: "Não foi possível cadastrar a usina." };
  }
  await admin.from("usina_membros").insert({ usina_id: usina.id, user_id: user.id, papel: "dono", email: user.email });
  await admin.from("convites_usina").update({ usina_id: usina.id }).eq("codigo", cod);
  redirect("/configuracoes");
}
