import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variante = "primario" | "secundario" | "fantasma" | "perigo";
const estilos: Record<Variante, string> = {
  primario: "bg-sol text-noite hover:bg-sol-forte font-semibold",
  secundario: "border border-traco bg-relevo hover:border-nevoa",
  fantasma: "text-nevoa hover:text-texto",
  perigo: "border border-erro/40 text-erro hover:bg-erro/10",
};
const baseBotao = "inline-flex items-center justify-center gap-2 rounded-[var(--radius-campo)] px-4 py-2.5 text-[15px] transition disabled:opacity-50 disabled:pointer-events-none";

export function Botao({ variante = "primario", className, ...p }: ComponentProps<"button"> & { variante?: Variante }) {
  return <button {...p} className={cx(baseBotao, estilos[variante], className)} />;
}

export function BotaoLink({ variante = "primario", className, ...p }: ComponentProps<typeof Link> & { variante?: Variante }) {
  return <Link {...p} className={cx(baseBotao, estilos[variante], className)} />;
}

export function Cartao({ className, ...p }: ComponentProps<"div">) {
  return <div {...p} className={cx("rounded-[var(--radius-cartao)] border border-traco bg-painel", className)} />;
}

export function Campo({ rotulo, ajuda, children, className }: { rotulo: string; ajuda?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-sm text-nevoa">{rotulo}</span>
      {children}
      {ajuda ? <span className="mt-1.5 block text-xs leading-relaxed text-nevoa/80">{ajuda}</span> : null}
    </label>
  );
}

export function Cabecalho({ titulo, sub, acao }: { titulo: string; sub?: ReactNode; acao?: ReactNode }) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight">{titulo}</h1>
        {sub ? <p className="mt-1 text-sm text-nevoa">{sub}</p> : null}
      </div>
      {acao}
    </header>
  );
}

const status = {
  pendente: "bg-alerta/12 text-alerta",
  paga: "bg-economia/12 text-economia",
  cancelada: "bg-nevoa/12 text-nevoa line-through",
  aguardando: "bg-relevo text-nevoa",
} as const;
const nomesStatus = { pendente: "Pendente", paga: "Paga", cancelada: "Cancelada", aguardando: "Sem fatura" } as const;

export function Status({ s, vencida }: { s: keyof typeof status; vencida?: boolean }) {
  if (s === "pendente" && vencida) return <span className="rounded-md bg-erro/12 px-2 py-0.5 text-xs font-medium text-erro">Vencida</span>;
  return <span className={cx("rounded-md px-2 py-0.5 text-xs font-medium", status[s])}>{nomesStatus[s]}</span>;
}

export function Vazio({ titulo, texto, acao }: { titulo: string; texto: string; acao?: ReactNode }) {
  return (
    <Cartao className="px-6 py-10 text-center">
      <p className="font-medium">{titulo}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-nevoa">{texto}</p>
      {acao ? <div className="mt-5">{acao}</div> : null}
    </Cartao>
  );
}

export function Aviso({ tipo, children }: { tipo: "erro" | "ok" | "info"; children: ReactNode }) {
  const c = { erro: "border-erro/40 text-erro", ok: "border-economia/40 text-economia", info: "border-traco text-nevoa" }[tipo];
  return <p role={tipo === "erro" ? "alert" : "status"} className={cx("rounded-[var(--radius-campo)] border px-3.5 py-2.5 text-sm", c)}>{children}</p>;
}

export { cx };
