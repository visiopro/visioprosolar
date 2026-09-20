"use server";

import { revalidatePath } from "next/cache";
import { exigirSuperAdmin, gerarCodigo } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function gerarConvite(_: { erro?: string; codigo?: string } | undefined, form: FormData) {
  await exigirSuperAdmin();
  const nota = String(form.get("nota") ?? "").trim().slice(0, 120) || null;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const codigo = gerarCodigo();
    const { error } = await supabaseAdmin().from("convites_usina").insert({ codigo, nota });
    if (!error) {
      revalidatePath("/admin");
      return { codigo };
    }
  }
  return { erro: "Não foi possível gerar o convite." };
}

export async function revogarConvite(codigo: string) {
  await exigirSuperAdmin();
  await supabaseAdmin().from("convites_usina").delete().eq("codigo", codigo).is("usado_em", null);
  revalidatePath("/admin");
}

export async function definirInstancia(usinaId: string, _: { erro?: string; ok?: string } | undefined, form: FormData) {
  await exigirSuperAdmin();
  const instancia = String(form.get("instancia") ?? "").trim();
  if (instancia && !/^[\w.-]{2,60}$/.test(instancia)) return { erro: "Use letras, números, ponto, hífen ou _." };
  const admin = supabaseAdmin();
  if (instancia) {
    // uma instância (número de WhatsApp) pertence a uma única usina
    const { data: outra } = await admin.from("usinas").select("nome").eq("whatsapp_instancia", instancia).neq("id", usinaId).maybeSingle();
    if (outra) return { erro: `Essa instância já é da usina ${outra.nome}.` };
  }
  const { error } = await admin.from("usinas").update({ whatsapp_instancia: instancia || null }).eq("id", usinaId);
  if (error) return { erro: "Não foi possível salvar." };
  revalidatePath("/admin");
  return { ok: "Salvo." };
}
