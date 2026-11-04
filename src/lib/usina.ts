import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";

export type Usina = {
  id: string;
  nome: string;
  documento: string | null;
  pix_chave: string | null;
  pix_favorecido: string | null;
  pix_cidade: string | null;
  pix_documento?: string | null;
  encargos_ativos?: boolean;
  emissao_automatica?: boolean;
  encargos_desde?: string | null;
  multa_percentual?: number;
  juros_mensal?: number;
  whatsapp_instancia: string | null;
  dias_vencimento: number;
  asaas_ativo: boolean;
  asaas_ambiente: "sandbox" | "producao";
  asaas_forma: "PIX" | "UNDEFINED";
  asaas_notificar: boolean;
  logo_path: string | null;
  gateway: "nenhum" | "asaas" | "mercadopago";
  whatsapp_auto: boolean;
  bandeira_padrao: number;
  contato_whatsapp: string | null;
  boas_vindas_ativo: boolean;
  boas_vindas_texto: string | null;
  mensagem_fatura_texto: string | null;
};

/** URL pública da logo (bucket "logos") */
export const urlLogo = (path: string | null) =>
  path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/logos/${path}` : null;

/**
 * Usuário logado + usina em que ele atua.
 * v1: cada usuário atua em uma usina (a primeira em que é membro).
 */
export const contexto = cache(async () => {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membro } = await supabase
    .from("usina_membros")
    .select("papel, usinas(*)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (!membro?.usinas) redirect("/onboarding");
  return {
    supabase,
    user,
    usina: membro.usinas as unknown as Usina,
    papel: membro.papel as "dono" | "operador",
  };
});

export async function registrarEvento(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  usinaId: string,
  acao: string,
  alvoId?: string,
  detalhes?: Record<string, unknown>,
) {
  await supabase.from("eventos").insert({ usina_id: usinaId, acao, alvo_id: alvoId ?? null, detalhes: detalhes ?? null });
}
