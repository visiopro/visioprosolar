import "server-only";
import { PROMPT_LEITURA } from "./prompt";
import { normalizarLeitura, type LeitorDeConta } from "./tipos";

/**
 * Leitor usando OpenRouter (OpenAI-compatible) com suporte a visão e documentos (PDF e imagem).
 * Permite usar Claude 3.5 Sonnet, Gemini 2.5, GPT-4o, etc.
 */
export class LeitorOpenRouter implements LeitorDeConta {
  constructor(
    private readonly apiKey: string,
    private readonly modelo = process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-5",
  ) {}

  async ler({ bytes, tipo }: { bytes: ArrayBuffer; tipo: string }) {
    const data = Buffer.from(bytes).toString("base64");

    const conteudoUsuario: unknown[] = [
      {
        type: "text",
        text: "Extraia os dados desta conta de energia elétrica conforme as instruções do sistema.",
      },
    ];

    if (tipo === "application/pdf") {
      conteudoUsuario.push({
        type: "file",
        file: {
          filename: "conta.pdf",
          file_data: `data:application/pdf;base64,${data}`,
        },
      });
    } else {
      conteudoUsuario.push({
        type: "image_url",
        image_url: {
          url: `data:${tipo};base64,${data}`,
        },
      });
    }

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
        "http-referer": process.env.NEXT_PUBLIC_APP_URL || "https://solar.visiopro.app.br",
        "x-title": "VisioPro Solar",
      },
      body: JSON.stringify({
        model: this.modelo,
        max_tokens: 1500,
        temperature: 0,
        messages: [
          { role: "system", content: PROMPT_LEITURA },
          { role: "user", content: conteudoUsuario },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const errTexto = await res.text().catch(() => "");
      throw new Error(`OpenRouter respondeu ${res.status}: ${errTexto.slice(0, 300)}`);
    }

    const corpo = (await res.json()) as {
      choices?: {
        message?: {
          content?: string | { type?: string; text?: string }[];
        };
      }[];
    };

    let texto = "";
    const rawContent = corpo.choices?.[0]?.message?.content;
    if (typeof rawContent === "string") {
      texto = rawContent;
    } else if (Array.isArray(rawContent)) {
      texto = rawContent
        .filter((b) => b.type === "text" || typeof b.text === "string")
        .map((b) => b.text || "")
        .join("");
    }

    const inicio = texto.indexOf("{");
    const fim = texto.lastIndexOf("}");
    if (inicio < 0 || fim < inicio) {
      throw new Error("Leitor OpenRouter não retornou JSON válido.");
    }

    return normalizarLeitura(JSON.parse(texto.slice(inicio, fim + 1)));
  }
}
