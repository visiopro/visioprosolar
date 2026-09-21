import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { exigirSuperAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Cartao } from "@/components/ui";
import { NovaFaixaCip, NovaTabelaCip, RemoverFaixa } from "@/components/admin";
import { CLASSES, descreverFaixa, type ClasseCip, type FaixaCip } from "@/lib/cip";

export const dynamic = "force-dynamic";

type FaixaComId = FaixaCip & { id: string; tabela_id: string };

/** Painel Super Admin para manutenção de tabelas municipais de CIP/COSIP */
export default async function AdminCip() {
  await exigirSuperAdmin();
  const admin = supabaseAdmin();

  const [{ data: tabelas }, { data: faixas }] = await Promise.all([
    admin.from("cip_tabelas").select("id, municipio, uf, observacao, created_at").order("municipio"),
    admin.from("cip_faixas").select("id, tabela_id, classe, consumo_min, consumo_max, tipo, valor").order("consumo_min"),
  ]);

  const faixasPorTabela = new Map<string, FaixaComId[]>();
  for (const f of faixas ?? []) {
    const arr = faixasPorTabela.get(f.tabela_id) ?? [];
    arr.push({
      id: f.id,
      tabela_id: f.tabela_id,
      classe: f.classe as ClasseCip,
      consumo_min: Number(f.consumo_min),
      consumo_max: f.consumo_max !== null ? Number(f.consumo_max) : null,
      tipo: f.tipo as "percentual" | "fixo",
      valor: Number(f.valor),
    });
    faixasPorTabela.set(f.tabela_id, arr);
  }

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-5 py-10">
      <div>
        <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-nevoa hover:text-texto">
          <ChevronLeft className="h-4 w-4" /> Painel VisioPro
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Iluminação pública (CIP / COSIP)</h1>
        <p className="text-sm text-nevoa">
          Tabelas de municípios com regras por classe e faixa de consumo. Todas as usinas têm acesso a essas regras ao cadastrar clientes.
        </p>
      </div>

      <section>
        <h2 className="mb-2 font-semibold">Novo município</h2>
        <Cartao className="p-4 sm:p-5">
          <NovaTabelaCip />
        </Cartao>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold">Municípios cadastrados</h2>
        {!tabelas?.length ? (
          <p className="text-sm text-nevoa">Nenhum município cadastrado.</p>
        ) : (
          tabelas.map((t) => {
            const fs = faixasPorTabela.get(t.id) ?? [];
            return (
              <Cartao key={t.id} className="space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold">{t.municipio} - {t.uf}</h3>
                    {t.observacao ? <p className="text-xs text-nevoa">{t.observacao}</p> : null}
                  </div>
                  <span className="text-xs text-nevoa">{fs.length} {fs.length === 1 ? "faixa" : "faixas"}</span>
                </div>

                {fs.length ? (
                  <div className="divide-y divide-traco/50 rounded-[var(--radius-campo)] border border-traco bg-fundo/40">
                    {fs.map((f) => (
                      <div key={f.id} className="flex items-center justify-between px-3.5 py-2 text-sm">
                        <div>
                          <span className="font-medium">{CLASSES[f.classe] || f.classe}:</span>{" "}
                          <span className="text-nevoa">{descreverFaixa(f)}</span>
                        </div>
                        <RemoverFaixa id={f.id} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-nevoa">Nenhuma faixa cadastrada ainda. Adicione as faixas da lei municipal abaixo.</p>
                )}

                <NovaFaixaCip tabelaId={t.id} />
              </Cartao>
            );
          })
        )}
      </section>
    </main>
  );
}
