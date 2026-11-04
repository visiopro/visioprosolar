import { processarPagamentoMP } from "@/lib/mercadopago-pagamentos";

export const runtime = "nodejs";

/**
 * Notificações do Mercado Pago, um endereço por usina: /api/mercadopago/webhook/<id da usina>
 * O aviso só diz "o pagamento X mudou". O app nunca confia no corpo: consulta o pagamento
 * no Mercado Pago com o token da própria usina e confere fatura, usina e valor.
 */
export async function POST(req: Request, { params }: { params: Promise<{ usina: string }> }) {
  const { usina } = await params;
  if (!/^[0-9a-f-]{36}$/.test(usina)) return new Response("usina inválida", { status: 400 });

  const url = new URL(req.url);
  const corpo = (await req.json().catch(() => null)) as { type?: string; topic?: string; data?: { id?: string | number } } | null;
  const tipo = corpo?.type ?? corpo?.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
  const id = String(corpo?.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");
  if (tipo !== "payment" || !/^\d+$/.test(id)) return Response.json({ ok: true, ignorado: "não é pagamento" });

  return processarPagamentoMP(usina, id);
}
