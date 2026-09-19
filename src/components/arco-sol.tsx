/** Arco do sol: a fração do faturado no mês que já foi recebida */
export function ArcoSol({ fracao }: { fracao: number }) {
  const f = Math.max(0, Math.min(1, fracao));
  const r = 90;
  const total = Math.PI * r;
  const ang = Math.PI * (1 - f);
  const x = 110 + r * Math.cos(ang);
  const y = 105 - r * Math.sin(ang);
  return (
    <svg viewBox="0 0 220 120" className="w-full max-w-[300px]" role="img" aria-label={`${Math.round(f * 100)}% recebido`}>
      <path d="M20 105a90 90 0 0 1 180 0" fill="none" stroke="var(--color-traco)" strokeWidth="10" strokeLinecap="round" />
      <path
        d="M20 105a90 90 0 0 1 180 0"
        fill="none"
        stroke="var(--color-sol)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={total}
        strokeDashoffset={total * (1 - f)}
        className="arco-progresso"
        style={{ ["--arco-total" as string]: total }}
      />
      {f > 0 ? <circle cx={x} cy={y} r="11" fill="var(--color-sol)" stroke="var(--color-noite)" strokeWidth="5" /> : null}
      <line x1="4" y1="113" x2="216" y2="113" stroke="var(--color-traco)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
