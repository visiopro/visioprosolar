import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { exigirSuperAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { brl, data, hojeBR } from "@/lib/format";
import { Marca } from "@/components/marca";
import { Cartao } from "@/components/ui";
import { CriarUsinaComConta, GerarConvite, RevogarConvite } from "@/components/admin";

export const dynamic = "force-dynamic";

const quando = (iso: string | null | undefined) => {
  if (!iso) return "nunca";
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return dias <= 0 ? "hoje" : dias === 1 ? "ontem" : `há ${dias} dias`;
};

/** Painel interno da VisioPro: usinas, acessos e convites */
export default async function Admin() {
  const eu = await exigirSuperAdmin();
  const admin = supabaseAdmin();
  const mes = `${hojeBR().slice(0, 7)}-01`;
  const [{ data: usinas }, { data: membros }, { data: convites }, { data: clientes }, { data: faturas }, { data: eventos }] = await Promise.all([
    admin.from("usinas").select("id, nome, whatsapp_instancia, gateway, created_at").order("created_at", { ascending: false }),
    admin.from("usina_membros").select("usina_id, user_id, email, papel"),
    admin.from("convites_usina").select("*").order("criado_em", { ascending: false }).limit(50),
    admin.from("clientes").select("usina_id").eq("ativo", true),
    admin.from("faturas").select("usina_id, total_centavos, status").eq("referencia", mes).neq("status", "cancelada"),
    admin.from("eventos").select("usina_id, created_at").order("created_at", { ascending: false }).limit(2000),
  ]);
  const pendentes = (convites ?? []).filter((c) => !c.usado_em);

  const linhas = (usinas ?? []).map((u) => {
    const fs = (faturas ?? []).filter((f) => f.usina_id === u.id);
    return {
      ...u,
      dono: (membros ?? []).find((m) => m.usina_id === u.id && m.papel === "dono")?.email ?? "sem dono",
      clientes: (clientes ?? []).filter((c) => c.usina_id === u.id).length,
      faturas: fs.length,
      faturado: fs.reduce((s, f) => s + Number(f.total_centavos), 0),
      recebido: fs.filter((f) => f.status === "paga").reduce((s, f) => s + Number(f.total_centavos), 0),
      ultima: (eventos ?? []).find((e) => e.usina_id === u.id)?.created_at ?? null,
    };
  });

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-5 py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Marca className="h-9 w-9" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Painel VisioPro</h1>
            <p className="text-sm text-nevoa">{eu.email}</p>
          </div>
        </div>
        <span className="flex items-center gap-4 text-sm"><Link href="/admin/cip" className="text-sol hover:underline">Iluminação pública</Link><Link href="/" className="text-nevoa hover:text-texto">Voltar ao app</Link></span>
      </header>

      <section>
        <h2 className="mb-1 font-semibold">Nova usina</h2>
        <p className="mb-3 text-sm text-nevoa">Crie a usina já com o acesso do dono e mande o login pelo WhatsApp. Não depende de e-mail.</p>
        <Cartao className="p-5">
          <CriarUsinaComConta />
        </Cartao>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Usinas ({linhas.length})</h2>
        <Cartao className="divide-y divide-traco">
          {linhas.map((u) => (
            <Link key={u.id} href={`/admin/usinas/${u.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-relevo/50">
              <div className="min-w-0">
                <p className="truncate font-medium">{u.nome}</p>
                <p className="truncate text-xs text-nevoa">
                  {u.dono} · {u.clientes} cliente{u.clientes === 1 ? "" : "s"} · última atividade {quando(u.ultima)}
                </p>
                <p className="mt-1 text-xs">
                  <span className="text-nevoa">Este mês:</span> {u.faturas} fatura{u.faturas === 1 ? "" : "s"} · {brl(u.faturado)}
                  <span className="text-economia"> · recebido {brl(u.recebido)}</span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-xs text-nevoa">
                <span className="hidden text-right sm:block">
                  {u.whatsapp_instancia ? "WhatsApp ok" : <span className="text-alerta">sem WhatsApp</span>}
                  <br />
                  {u.gateway === "nenhum" ? "cobrança manual" : u.gateway === "asaas" ? "Asaas" : "Mercado Pago"}
                </span>
                <ChevronRight size={18} />
              </div>
            </Link>
          ))}
        </Cartao>
      </section>

      <section>
        <h2 className="mb-1 font-semibold">Código de convite</h2>
        <p className="mb-3 text-sm text-nevoa">Alternativa: a própria usina cria a conta e informa o código.</p>
        <Cartao className="space-y-4 p-5">
          <GerarConvite />
          {pendentes.length ? (
            <ul className="divide-y divide-traco border-t border-traco">
              {pendentes.map((c) => (
                <li key={c.codigo} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-mono tracking-wider">{c.codigo}</span>
                    <span className="ml-3 text-nevoa">{c.nota ?? ""} · {data(c.criado_em)}</span>
                  </span>
                  <RevogarConvite codigo={c.codigo} />
                </li>
              ))}
            </ul>
          ) : null}
        </Cartao>
      </section>
    </main>
  );
}
