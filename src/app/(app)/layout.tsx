import { contexto, urlLogo } from "@/lib/usina";
import Link from "next/link";
import { Settings, ShieldCheck } from "lucide-react";
import { ehSuperAdmin } from "@/lib/admin";
import { Marca } from "@/components/marca";
import { NavInferior, NavLateral } from "@/components/navegacao";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { usina, user } = await contexto();
  const superAdmin = ehSuperAdmin(user.email);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="hidden border-r border-traco px-5 py-6 lg:block">
        <div className="mb-8">
          {usina.logo_path ? (
            <div className="space-y-3">
              <div className="flex h-20 w-full items-center justify-center overflow-hidden rounded-xl border border-traco bg-painel/90 p-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={urlLogo(usina.logo_path)!}
                  alt={usina.nome}
                  className="max-h-16 max-w-full object-contain"
                  style={{ width: "auto", height: "auto", maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                />
              </div>
              <div className="min-w-0 px-0.5">
                <p className="truncate font-semibold leading-tight">{usina.nome}</p>
                <p className="text-xs text-nevoa">VisioPro Solar</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <Marca />
              <div className="min-w-0">
                <p className="truncate font-semibold leading-tight">{usina.nome}</p>
                <p className="text-xs text-nevoa">VisioPro Solar</p>
              </div>
            </div>
          )}
        </div>
        <NavLateral />
        {superAdmin ? (
          <Link href="/admin" className="mt-6 flex items-center gap-2.5 rounded-[var(--radius-campo)] border border-traco px-3.5 py-2.5 text-sm text-nevoa hover:text-texto">
            <ShieldCheck size={17} /> Painel VisioPro
          </Link>
        ) : null}
      </aside>

      <div className="min-w-0 overflow-x-clip">
        <header className="sticky top-0 z-20 flex items-center gap-2.5 border-b border-traco bg-noite/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur sm:px-5 lg:hidden">
          {usina.logo_path ? (
            <div className="flex h-8 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-traco bg-painel p-0.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={urlLogo(usina.logo_path)!}
                alt={usina.nome}
                className="max-h-full max-w-full object-contain"
                style={{ width: "auto", height: "auto", maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
              />
            </div>
          ) : (
            <Marca className="h-6 w-6" />
          )}
          <p className="flex-1 truncate font-semibold">{usina.nome}</p>
          {superAdmin ? (
            <Link href="/admin" aria-label="Painel VisioPro" className="rounded-lg p-1.5 text-nevoa hover:text-texto">
              <ShieldCheck size={20} />
            </Link>
          ) : null}
          <Link href="/configuracoes" aria-label="Ajustes" className="rounded-lg p-1.5 text-nevoa hover:text-texto">
            <Settings size={20} />
          </Link>
        </header>
        <main className="mx-auto max-w-5xl px-4 pb-28 pt-4 sm:px-6 sm:pb-32 sm:pt-6 lg:px-10 lg:pb-12 lg:pt-10">{children}</main>
      </div>
      <NavInferior />
    </div>
  );
}
