"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera, Mail, FileText, LayoutGrid, Settings, Users, Wallet } from "lucide-react";
import { cx } from "./ui";

const itens = [
  { href: "/", rotulo: "Painel", Icone: LayoutGrid },
  { href: "/clientes", rotulo: "Clientes", Icone: Users },
  { href: "/faturas", rotulo: "Faturas", Icone: FileText },
  { href: "/financeiro", rotulo: "Financeiro", Icone: Wallet },
  { href: "/contas/recebidas", rotulo: "Contas recebidas", Icone: Mail },
  { href: "/configuracoes", rotulo: "Ajustes", Icone: Settings },
];

const ativo = (atual: string, href: string) => (href === "/" ? atual === "/" : atual.startsWith(href));

export function NavLateral() {
  const atual = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      <Link
        href="/contas/nova"
        className="mb-4 flex items-center gap-2.5 rounded-[var(--radius-campo)] bg-sol px-3.5 py-3 font-semibold text-noite hover:bg-sol-forte"
      >
        <Camera size={19} /> Lançar conta
      </Link>
      {itens.map(({ href, rotulo, Icone }) => (
        <Link
          key={href}
          href={href}
          aria-current={ativo(atual, href) ? "page" : undefined}
          className={cx(
            "flex items-center gap-2.5 rounded-[var(--radius-campo)] px-3.5 py-2.5 text-[15px]",
            ativo(atual, href) ? "bg-relevo text-texto" : "text-nevoa hover:text-texto",
          )}
        >
          <Icone size={18} /> {rotulo}
        </Link>
      ))}
    </nav>
  );
}

export function NavInferior() {
  const atual = usePathname();
  // no celular, Ajustes fica no ícone do cabeçalho
  const [a, b, c, d] = itens;
  const Item = ({ href, rotulo, Icone }: (typeof itens)[number]) => (
    <Link
      href={href}
      aria-current={ativo(atual, href) ? "page" : undefined}
      className={cx("flex flex-1 flex-col items-center gap-1 py-2 text-[11px]", ativo(atual, href) ? "text-sol" : "text-nevoa")}
    >
      <Icone size={21} />
      {rotulo}
    </Link>
  );
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-traco bg-noite/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-md items-end">
        <Item {...a} />
        <Item {...b} />
        <Link href="/contas/nova" aria-label="Lançar conta" className="-mt-5 flex flex-1 flex-col items-center gap-1 pb-2 text-[11px] text-sol">
          <span className="grid h-13 w-13 place-items-center rounded-full bg-sol text-noite shadow-[0_0_0_5px_var(--color-noite)]">
            <Camera size={22} />
          </span>
          Conta
        </Link>
        <Item {...c} />
        <Item {...d} />
      </div>
    </nav>
  );
}
