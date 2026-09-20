import "server-only";
import { PROMPT_LEITURA } from "./prompt";
import { normalizarLeitura, type LeitorDeConta } from "./tipos";

/** Leitor via OpenRouter (formato OpenAI chat/completions) */
export class LeitorOpenRouter implements LeitorDeConta {
  constructor(
    private readonly apiKey: string,
    private readonly modelo: string,
  ) {}

  async ler({ bytes, tipo }: { bytes: ArrayBuffer; tipo: string }) {
    const dataUrl = `data:${tipo};base64,${Buffer.from(bytes).toString("base64")}`;

    const isPdf = tipo === "application/pdf";
    const anexo = isPdf
      ? { type: "file" as const, file: { filename: "conta.pdf", file_data: dataUrl } }
      : { type: "image_url" as const, image_url: { url: dataUrl } };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: Record<string, any> = {
      model: this.modelo,
      temperature: 0,
      max_tokens: 4096,
      messages: [
        { role: "system", content: PROMPT_LEITURA },
        { role: "user", content: [anexo, { type: "text", text: "Extraia os dados desta conta." }] },
      ],
    };

    // Plugin para converter PDF em markdown (gratuito) se for PDF
    if (isPdf) {
      body.plugins = [{ id: "file-parser", pdf: { engine: "cloudflare-ai" } }];
    }

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://visiopro.app.br",
        "X-Title": "VisioPro Solar",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });

    if (!res.ok) {
      const errBody = (await res.text()).slice(0, 600);
      console.error(`[OpenRouter] ${res.status} modelo=${this.modelo}`, errBody);
      throw new Error(`OpenRouter respondeu ${res.status}: ${errBody}`);
    }

    const corpo = (await res.json()) as { choices?: { message?: { content?: string | { type: string; text?: string }[] } }[] };
    const c = corpo.choices?.[0]?.message?.content;
    const texto = typeof c === "string" ? c : (c ?? []).map((p) => p.text ?? "").join("");
    const inicio = texto.indexOf("{");
    const fim = texto.lastIndexOf("}");
    if (inicio < 0 || fim < inicio) throw new Error("Leitor não retornou JSON.");
    return normalizarLeitura(JSON.parse(texto.slice(inicio, fim + 1)));
  }
}
