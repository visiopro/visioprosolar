import "server-only";
import { LeitorClaude } from "./claude";
import { LeitorOpenRouter } from "./openrouter";
import type { LeitorDeConta } from "./tipos";

export type { LeituraConta } from "./tipos";

/** Ponto único para trocar o provedor de leitura */
export function obterLeitor(): LeitorDeConta | null {
  if (process.env.OPENROUTER_API_KEY) {
    return new LeitorOpenRouter(process.env.OPENROUTER_API_KEY, process.env.OPENROUTER_MODEL || undefined);
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return new LeitorClaude(process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_MODEL || undefined);
  }
  return null;
}
