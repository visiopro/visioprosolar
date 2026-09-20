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
export function obterLeitor(): LeitorDeConta | null {
  if (process.env.OPENROUTER_API_KEY) {
    return new LeitorOpenRouter(process.env.OPENROUTER_API_KEY, process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5");
  }
  if (process.env.ANTHROPIC_API_KEY) return new LeitorClaude(process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_MODEL || undefined);
  return null;
}
