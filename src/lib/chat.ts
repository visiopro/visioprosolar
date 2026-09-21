import "server-only";

/** Uma resposta de chat pelo mesmo provedor usado na leitura das contas */
export type Mensagem = { papel: "cliente" | "atendente"; texto: string };

export async function responder(sistema: string, mensagens: Mensagem[]): Promise<string> {
  const openrouter = process.env.OPENROUTER_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;
  const historico = mensagens.slice(-8);

  if (openrouter) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${openrouter}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://visiopro.app.br",
        "X-Title": "VisioPro Solar",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL_CHAT || process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5",
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          { role: "system", content: sistema },
          ...historico.map((m) => ({ role: m.papel === "cliente" ? "user" : "assistant", content: m.texto })),
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Chat indisponível (${res.status}).`);
    const corpo = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return corpo.choices?.[0]?.message?.content?.trim() || "";
  }

  if (anthropic) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": anthropic, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
        max_tokens: 400,
        temperature: 0.2,
        system: sistema,
        messages: historico.map((m) => ({ role: m.papel === "cliente" ? "user" : "assistant", content: m.texto })),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Chat indisponível (${res.status}).`);
    const corpo = (await res.json()) as { content: { type: string; text?: string }[] };
    return corpo.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  }

  throw new Error("Chat não configurado no servidor.");
}
