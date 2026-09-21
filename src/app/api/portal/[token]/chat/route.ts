import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { responder, type Mensagem } from "@/lib/chat";
import { instrucoesAtendente } from "@/lib/atendimento";

export const runtime = "nodejs";
export const maxDuration = 45;

const LIMITE_DIA = 20;

/** Atendente virtual do portal: responde só com os dados do próprio cliente */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{32}$/.test(token)) return NextResponse.json({ erro: "não encontrado" }, { status: 404 });

  const corpo = (await req.json().catch(() => null)) as { mensagens?: Mensagem[] } | null;
  const mensagens = (corpo?.mensagens ?? []).filter((m) => m && typeof m.texto === "string").slice(-8);
  const pergunta = mensagens.filter((m) => m.papel === "cliente").at(-1)?.texto?.trim();
  if (!pergunta) return NextResponse.json({ erro: "Escreva sua dúvida." }, { status: 400 });
  if (pergunta.length > 500) return NextResponse.json({ erro: "Pergunta muito longa. Resuma em poucas linhas." }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: cliente } = await admin
    .from("clientes")
    .select("id, nome, uc, distribuidora, usina_id, usinas(nome, contato_whatsapp)")
    .eq("portal_token", token)
    .maybeSingle();
  if (!cliente) return NextResponse.json({ erro: "não encontrado" }, { status: 404 });
  const usina = cliente.usinas as unknown as { nome: string; contato_whatsapp: string | null };

  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin
    .from("portal_conversas")
    .select("*", { count: "exact", head: true })
    .eq("cliente_id", cliente.id)
    .gte("created_at", desde);
  if ((count ?? 0) >= LIMITE_DIA) {
    return NextResponse.json({ erro: "Você já fez várias perguntas hoje. Fale com a equipe da usina para continuar." }, { status: 429 });
  }

  const { data: faturas } = await admin
    .from("faturas")
    .select("referencia, vencimento, status, total_centavos, economia_centavos, paga_em")
    .eq("cliente_id", cliente.id)
    .neq("status", "cancelada")
    .order("referencia", { ascending: false })
    .limit(12);

  const sistema = instrucoesAtendente({
    usina: usina.nome,
    cliente: cliente.nome,
    uc: cliente.uc,
    distribuidora: cliente.distribuidora,
    faturas: (faturas ?? []).map((f) => ({ ...f, total_centavos: Number(f.total_centavos), economia_centavos: Number(f.economia_centavos) })),
    economiaTotal: (faturas ?? []).reduce((s, f) => s + Number(f.economia_centavos), 0),
    contato: usina.contato_whatsapp,
  });

  let resposta: string;
  try {
    resposta = await responder(sistema, mensagens);
  } catch (e) {
    console.error("chat portal", e);
    return NextResponse.json({ erro: "O atendimento está fora do ar agora. Tente de novo em instantes ou fale com a usina." }, { status: 503 });
  }
  if (!resposta) resposta = "Não consegui entender. Pode escrever de outro jeito?";

  await admin.from("portal_conversas").insert({
    usina_id: cliente.usina_id,
    cliente_id: cliente.id,
    pergunta,
    resposta,
    transferiu: /falar com a usina|equipe da usina/i.test(resposta),
  });

  return NextResponse.json({ resposta });
}
