import { exigirSuperAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { data } from "@/lib/format";
import { Marca } from "@/components/marca";
import { Cartao } from "@/components/ui";
import { GerarConvite, Instancia, RevogarConvite } from "@/components/admin";

export const dynamic = "force-dynamic";

/** Painel interno da VisioPro: convites de novas usinas e números de WhatsApp */
export default async function Admin() {
  const eu = await exigirSuperAdmin();
  const admin = supabaseAdmin();
  const [{ data: usinas }, { data: membros }, { data: convites }] = await Promise.all([
    admin.from("usinas").select("id, nome, documento, whatsapp_instancia, gateway, created_at").order("created_at", { ascending: false }),
    admin.from("usina_membros").select("usina_id, email, papel"),
    admin.from("convites_usina").select("*").order("criado_em", { ascending: false }).limit(50),
  ]);
  const pendentes = (convites ?? []).filter((c) => !c.usado_em);
  const usados = (convites ?? []).filter((c) => c.usado_em);

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-5 py-10">
      <header className="flex items-center gap-3">
        <Marca className="h-9 w-9" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Painel VisioPro</h1>
          <p className="text-sm text-nevoa">{eu.email}</p>
        </div>
      </header>

      <section>
        <h2 className="mb-3 font-semibold">Convidar nova usina</h2>
        <Cartao className="space-y-4 p-5">
          <GerarConvite />
          {pendentes.length ? (
            <ul className="divide-y divide-traco border-t border-traco">
              {pendentes.map((c) => (
                <li key={c.codigo} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span>
                    <span className="font-mono tracking-wider">{c.codigo}</span>
                    <span className="ml-3 text-nevoa">{c.nota ?? ""} · criado {data(c.criado_em)}</span>
                  </span>
                  <RevogarConvite codigo={c.codigo} />
                </li>
              ))}
            </ul>
          ) : null}
          {usados.length ? (
            <p className="text-xs text-nevoa">{usados.length} convite{usados.length > 1 ? "s" : ""} já usado{usados.length > 1 ? "s" : ""}.</p>
          ) : null}
        </Cartao>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Usinas ({usinas?.length ?? 0})</h2>
        <Cartao className="divide-y divide-traco">
          {(usinas ?? []).map((u) => {
            const dono = (membros ?? []).find((m) => m.usina_id === u.id && m.papel === "dono");
            const equipe = (membros ?? []).filter((m) => m.usina_id === u.id).length;
            return (
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="font-medium">{u.nome}</p>
                  <p className="text-xs text-nevoa">
                    {dono?.email ?? "sem dono"} · {equipe} pessoa{equipe > 1 ? "s" : ""} · desde {data(u.created_at)}
                    {u.gateway === "asaas" ? " · Asaas" : u.gateway === "mercadopago" ? " · Mercado Pago" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-nevoa">WhatsApp</span>
                  <Instancia usinaId={u.id} atual={u.whatsapp_instancia} />
                </div>
              </div>
            );
          })}
        </Cartao>
      </section>
    </main>
  );
}
