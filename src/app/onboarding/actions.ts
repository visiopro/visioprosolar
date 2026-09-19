"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export async function criarUsina(_: { erro?: string } | undefined, form: FormData) {
  const nome = String(form.get("nome") ?? "").trim();
  const documento = String(form.get("documento") ?? "").trim();
  if (nome.length < 2) return { erro: "Informe o nome da usina." };
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("criar_usina", { p_nome: nome, p_documento: documento || null });
  if (error) return { erro: "Não foi possível cadastrar a usina." };
  redirect("/configuracoes");
}
