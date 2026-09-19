import { contexto } from "@/lib/usina";
import { pdfDaFatura } from "@/lib/faturas";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await contexto();
  const r = await pdfDaFatura(supabase, id);
  if (!r) return new Response("Fatura não encontrada.", { status: 404 });
  const baixar = new URL(req.url).searchParams.has("baixar");
  return new Response(new Uint8Array(r.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${baixar ? "attachment" : "inline"}; filename="${r.nome}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
