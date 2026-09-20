import { contexto } from "@/lib/usina";

// emitir pode incluir cobrança + PDF + WhatsApp: dá mais tempo à função
export const maxDuration = 60;
import { hojeBR, somarDias } from "@/lib/format";
import { LancarConta } from "@/components/lancar-conta";
import { BotaoLink, Cabecalho, Vazio } from "@/components/ui";
import type { ModoDesconto } from "@/lib/calculo";

export default async function NovaConta({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const { supabase, usina } = await contexto();
  const { cliente } = await searchParams;
  const { data: clientes } = await supabase
    .from("clientes")
    .select("id, nome, uc, whatsapp, modo_desconto, desconto_valor, cip_modo, cip_valor")
    .eq("usina_id", usina.id)
    .eq("ativo", true)
    .order("nome");

  if (!clientes?.length) {
    return (
      <Vazio
        titulo="Cadastre um cliente primeiro"
        texto="A fatura é gerada para um cliente cadastrado, com a regra de desconto dele."
        acao={<BotaoLink href="/clientes/novo">Cadastrar cliente</BotaoLink>}
      />
    );
  }

  return (
    <div className="max-w-4xl">
      <Cabecalho titulo="Lançar conta" sub="Fotografe a conta da distribuidora. A leitura preenche os campos para você conferir." />
      <LancarConta
        clientes={clientes.map((c) => ({ ...c, modo_desconto: c.modo_desconto as ModoDesconto, desconto_valor: Number(c.desconto_valor), cip_modo: c.cip_modo as "da_conta", cip_valor: Number(c.cip_valor ?? 0) }))}
        clienteInicial={cliente ?? null}
        vencimentoPadrao={somarDias(hojeBR(), usina.dias_vencimento)}
        whatsappConfigurado={!!usina.whatsapp_instancia}
        bandeiraPadrao={Number(usina.bandeira_padrao ?? 0)}
      />
    </div>
  );
}
