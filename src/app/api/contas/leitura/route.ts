import { NextResponse } from "next/server";
import { contexto } from "@/lib/usina";
import { obterLeitor, type LeituraConta } from "@/lib/leitor";

export const runtime = "nodejs";
export const maxDuration = 60;

const TIPOS = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

/** Recebe a foto/PDF da conta, guarda o original e devolve a leitura para conferência */
export async function POST(req: Request) {
  const { supabase, usina } = await contexto();
  const form = await req.formData();
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || !TIPOS.includes(arquivo.type) || arquivo.size === 0 || arquivo.size > 10 * 1024 * 1024) {
    return NextResponse.json({ erro: "Envie uma foto (JPG, PNG, WebP) ou PDF de até 10 MB." }, { status: 400 });
  }

  const bytes = await arquivo.arrayBuffer();
  const caminho = `${usina.id}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${EXT[arquivo.type]}`;
  const envio = await supabase.storage.from("contas").upload(caminho, bytes, { contentType: arquivo.type });
  if (envio.error) return NextResponse.json({ erro: "Não foi possível guardar o arquivo. Tente novamente." }, { status: 500 });

  const { data: conta, error } = await supabase
    .from("contas_energia")
    .insert({ usina_id: usina.id, arquivo_path: caminho, arquivo_tipo: arquivo.type })
    .select("id")
    .single();
  if (error) return NextResponse.json({ erro: "Não foi possível registrar a conta." }, { status: 500 });

  let leitura: LeituraConta | null = null;
  let aviso: string;
  const leitor = obterLeitor();
  if (!leitor) {
    aviso = "Leitura automática desligada. Preencha os campos olhando a conta.";
  } else {
    try {
      leitura = await leitor.ler({ bytes, tipo: arquivo.type });
      await supabase.from("contas_energia").update({ leitura_ia: leitura }).eq("id", conta.id);
      aviso = leitura.duvidosos.length
        ? "Leitura concluída. Confira com atenção os campos destacados."
        : "Leitura concluída. Confira os valores com a conta antes de emitir.";
    } catch (e) {
      console.error("leitura da conta", e);
      aviso = "A conta foi guardada, mas a leitura automática falhou. Preencha os campos olhando a conta.";
    }
  }

  // Sugere o cliente pela UC lida
  let clienteId: string | null = null;
  if (leitura?.uc) {
    const { data: c } = await supabase.from("clientes").select("id").eq("usina_id", usina.id).eq("uc", leitura.uc).maybeSingle();
    clienteId = c?.id ?? null;
  }

  const { data: assinada } = await supabase.storage.from("contas").createSignedUrl(caminho, 60 * 60);
  return NextResponse.json({ contaId: conta.id, leitura, aviso, clienteId, arquivoUrl: assinada?.signedUrl ?? null, arquivoTipo: arquivo.type });
}
