import { contexto } from "@/lib/usina";
import { Cabecalho, Cartao } from "@/components/ui";
import { FormUsina, Equipe } from "@/components/form-ajustes";
import { sair } from "../actions";

export default async function Ajustes() {
  const { supabase, usina, papel, user } = await contexto();
  const { data: membros } = await supabase.from("usina_membros").select("user_id, email, papel").eq("usina_id", usina.id).order("created_at");

  return (
    <div className="max-w-2xl space-y-8">
      <Cabecalho titulo="Ajustes" sub={user.email} />

      <section>
        <h2 className="mb-3 font-semibold">Dados da usina</h2>
        <Cartao className="p-5 sm:p-6">
          <FormUsina usina={usina} podeEditar={papel === "dono"} />
        </Cartao>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Equipe</h2>
        <Equipe membros={membros ?? []} eu={user.id} dono={papel === "dono"} />
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Relatórios</h2>
        <Cartao className="flex items-center justify-between gap-4 p-5">
          <p className="text-sm text-nevoa">Planilha com todas as faturas emitidas.</p>
          <a href="/api/faturas/csv" className="text-sm text-sol hover:underline">
            Baixar CSV
          </a>
        </Cartao>
      </section>

      <form action={sair}>
        <button className="text-sm text-nevoa hover:text-texto">Sair da conta</button>
      </form>
    </div>
  );
}
