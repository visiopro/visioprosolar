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
    const anexo =
      tipo === "application/pdf"
        ? { type: "file", file: { filename: "conta.pdf", file_data: dataUrl } }
        : { type: "image_url", image_url: { url: dataUrl } };

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://visiopro.app.br",
        "X-Title": "VisioPro Solar",
      },
      body: JSON.stringify({
        model: this.modelo,
        temperature: 0,
        max_tokens: 1500,
        messages: [
          { role: "system", content: PROMPT_LEITURA },
          { role: "user", content: [anexo, { type: "text", text: "Extraia os dados desta conta." }] },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`OpenRouter respondeu ${res.status}: ${(await res.text()).slice(0, 400)}`);

    const corpo = (await res.json()) as { choices?: { message?: { content?: string | { type: string; text?: string }[] } }[] };
    const c = corpo.choices?.[0]?.message?.content;
    const texto = typeof c === "string" ? c : (c ?? []).map((p) => p.text ?? "").join("");
    const inicio = texto.indexOf("{");
    const fim = texto.lastIndexOf("}");
    if (inicio < 0 || fim < inicio) throw new Error("Leitor não retornou JSON.");
    return normalizarLeitura(JSON.parse(texto.slice(inicio, fim + 1)));
  }
}
