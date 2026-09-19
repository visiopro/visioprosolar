import "server-only";
import { PROMPT_LEITURA } from "./prompt";
import { normalizarLeitura, type LeitorDeConta } from "./tipos";

/** Leitor usando Claude com visão (imagem ou PDF) via Messages API */
export class LeitorClaude implements LeitorDeConta {
  constructor(
    private readonly apiKey: string,
    private readonly modelo = "claude-sonnet-5",
  ) {}

  async ler({ bytes, tipo }: { bytes: ArrayBuffer; tipo: string }) {
    const data = Buffer.from(bytes).toString("base64");
    const anexo =
      tipo === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
        : { type: "image", source: { type: "base64", media_type: tipo, data } };

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.modelo,
        max_tokens: 1500,
        temperature: 0,
        system: PROMPT_LEITURA,
        messages: [{ role: "user", content: [anexo, { type: "text", text: "Extraia os dados desta conta." }] }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Leitor respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`);

    const corpo = (await res.json()) as { content: { type: string; text?: string }[] };
    const texto = corpo.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const inicio = texto.indexOf("{");
    const fim = texto.lastIndexOf("}");
    if (inicio < 0 || fim < inicio) throw new Error("Leitor não retornou JSON.");
    return normalizarLeitura(JSON.parse(texto.slice(inicio, fim + 1)));
  }
}
