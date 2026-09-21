import { contexto } from "@/lib/usina";
import { Cabecalho, Cartao } from "@/components/ui";
import { FormCliente } from "@/components/form-cliente";

export default async function NovoCliente() {
  const { supabase } = await contexto();
  const { data: tabelas } = await supabase.from("cip_tabelas").select("id, municipio, uf").order("municipio");
  return (
    <div className="max-w-2xl">
      <Cabecalho titulo="Novo cliente" />
      <Cartao className="p-5 sm:p-6">
        <FormCliente tabelas={tabelas ?? []} />
      </Cartao>
    </div>
  );
}
