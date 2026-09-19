import { contexto } from "@/lib/usina";
import { Marca } from "@/components/marca";
import { NavInferior, NavLateral } from "@/components/navegacao";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { usina } = await contexto();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="hidden border-r border-traco px-5 py-6 lg:block">
        <div className="mb-8 flex items-center gap-2.5">
          <Marca />
          <div className="min-w-0">
            <p className="truncate font-semibold leading-tight">{usina.nome}</p>
            <p className="text-xs text-nevoa">VisioPro Solar</p>
          </div>
        </div>
        <NavLateral />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center gap-2.5 border-b border-traco bg-noite/95 px-5 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur lg:hidden">
          <Marca className="h-6 w-6" />
          <p className="truncate font-semibold">{usina.nome}</p>
        </header>
        <main className="mx-auto max-w-5xl px-5 pb-32 pt-6 lg:px-10 lg:pb-12 lg:pt-10">{children}</main>
      </div>
      <NavInferior />
    </div>
  );
}
