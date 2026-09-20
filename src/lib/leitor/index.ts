import "server-only";
import { LeitorClaude } from "./claude";
import { LeitorOpenRouter } from "./openrouter";
import type { LeitorDeConta } from "./tipos";

export type { LeituraConta } from "./tipos";

/**
 * Ponto único para escolher o provedor de leitura:
 * - OPENROUTER_API_KEY (+ OPENROUTER_MODEL, ex.: anthropic/claude-sonnet-4.5) → OpenRouter
 * - ANTHROPIC_API_KEY (+ ANTHROPIC_MODEL) → API da Anthropic direto
 */
function limparEnv(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const s = v.trim().replace(/^["']|["']$/g, "").trim();
  return s.length > 0 ? s : undefined;
}

export function obterLeitor(): LeitorDeConta | null {
  const openRouterKey = limparEnv(process.env.OPENROUTER_API_KEY);
  if (openRouterKey) {
    const modelo = limparEnv(process.env.OPENROUTER_MODEL) || "anthropic/claude-sonnet-4.5";
    return new LeitorOpenRouter(openRouterKey, modelo);
  }

  const anthropicKey = limparEnv(process.env.ANTHROPIC_API_KEY);
  if (anthropicKey) {
    const modelo = limparEnv(process.env.ANTHROPIC_MODEL);
    return new LeitorClaude(anthropicKey, modelo || undefined);
  }

  return null;
}

