import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { instrucoesAtendente, type FaturaResumo } from "@/lib/atendimento";
import { responder, type Mensagem } from "@/lib/chat";

export const runtime = "nodejs";

const LIMITE_24H = 20;

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{32}$/.test(token)) {
    return NextResponse.json({ erro: "Token inválido." }, { status: 401 });
  }

  const admin = supabaseAdmin();

  const { data: cliente } = await admin
    .from("clientes")
    .select("id, nome, uc, distribuidora, usina_id, usinas(nome, contato_whatsapp)")
    .eq("portal_token", token)
    .maybeSingle();

  if (!cliente) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const usina = cliente.usinas as unknown as { nome: string; contato_whatsapp: string | null };

  // Limite de perguntas nas últimas 24h
  const ontem = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await admin
    .from("portal_conversas")
    .select("id", { count: "exact", head: true })
    .eq("cliente_id", cliente.id)
    .gte("created_at", ontem);

  if ((count ?? 0) >= LIMITE_24H) {
    return NextResponse.json(
      { erro: `Você atingiu o limite de ${LIMITE_24H} perguntas por dia. Tente novamente amanhã${usina.contato_whatsapp ? " ou fale com a usina no WhatsApp" : ""}.` },
      { status: 429 },
    );
  }

  let body: { mensagens?: Mensagem[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  const mensagens = body.mensagens;
  if (!Array.isArray(mensagens) || !mensagens.length) {
    return NextResponse.json({ erro: "Envie ao menos uma mensagem." }, { status: 400 });
  }
  const ultima = mensagens[mensagens.length - 1];
  if (ultima.papel !== "cliente" || !ultima.texto?.trim()) {
    return NextResponse.json({ erro: "Mensagem inválida." }, { status: 400 });
  }

  // Buscar faturas para contexto
  const { data: faturas } = await admin
    .from("faturas")
    .select("referencia, vencimento, status, total_centavos, economia_centavos, paga_em")
    .eq("cliente_id", cliente.id)
    .neq("status", "cancelada")
    .order("referencia", { ascending: false })
    .limit(12);

  const lista: FaturaResumo[] = (faturas ?? []).map((f) => ({
    referencia: f.referencia,
    vencimento: f.vencimento,
    status: f.status,
    total_centavos: Number(f.total_centavos),
    economia_centavos: Number(f.economia_centavos),
    paga_em: f.paga_em,
  }));

  const economiaTotal = lista.reduce((s, f) => s + f.economia_centavos, 0);

  const sistema = instrucoesAtendente({
    usina: usina.nome,
    cliente: cliente.nome,
    uc: cliente.uc,
    distribuidora: cliente.distribuidora ?? "distribuidora",
    faturas: lista,
    economiaTotal,
    temContato: !!usina.contato_whatsapp,
  });

  try {
    const resposta = await responder(sistema, mensagens);
    const transferiu = /fale com|entre em contato|whatsapp/i.test(resposta);

    // Gravar no banco
    await admin.from("portal_conversas").insert({
      usina_id: cliente.usina_id,
      cliente_id: cliente.id,
      pergunta: ultima.texto.slice(0, 500),
      resposta: resposta.slice(0, 2000),
      transferiu,
    });

    return NextResponse.json({ resposta });
  } catch (e) {
    console.error("[chat-portal]", e);
    return NextResponse.json({ erro: (e as Error).message || "Erro no atendimento." }, { status: 502 });
  }
}
