import { supabaseAdmin } from "@/lib/supabase/admin";
import { pdfDaFatura } from "@/lib/faturas";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string; faturaId: string }> }) {
  const { token, faturaId } = await params;
  if (!/^[0-9a-f]{32}$/.test(token)) {
    return new Response("Não autorizado.", { status: 401 });
  }

  const admin = supabaseAdmin();
  const { data: cliente } = await admin
    .from("clientes")
    .select("id")
    .eq("portal_token", token)
    .maybeSingle();

  if (!cliente) {
    return new Response("Não autorizado.", { status: 401 });
  }

  if (!faturaId) {
    return new Response("Fatura não informada.", { status: 400 });
  }

  // Garante que a fatura pertence ao cliente do token
  const { data: f } = await admin
    .from("faturas")
    .select("id")
    .eq("id", faturaId)
    .eq("cliente_id", cliente.id)
    .maybeSingle();

  if (!f) {
    return new Response("Fatura não encontrada.", { status: 404 });
  }

  const r = await pdfDaFatura(admin, faturaId);
  if (!r) {
    return new Response("Erro ao carregar fatura.", { status: 500 });
  }

  return new Response(new Uint8Array(r.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${r.nome}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
