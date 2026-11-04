import { contexto } from "@/lib/usina";
import type { HistoricoCliente } from "@/lib/conferencia";

// emitir pode incluir cobrança + PDF + WhatsApp: dá mais tempo à função
export const maxDuration = 60;
import { hojeBR, somarDias } from "@/lib/format";
import { LancarConta, type Resposta } from "@/components/lancar-conta";
import { BotaoLink, Cabecalho, Vazio } from "@/components/ui";
import type { ModoDesconto } from "@/lib/calculo";
import { whatsappDisponivel } from "@/lib/whatsapp";

export default async function NovaConta({ searchParams }: { searchParams: Promise<{ cliente?: string; conta?: string }> }) {
  const { supabase, usina } = await contexto();
  const { cliente, conta: contaId } = await searchParams;
  let contaInicial: Resposta | null = null;
  if (contaId) {
    const {data: conta, error} = await supabase.from("contas_energia").select("id,arquivo_path,arquivo_tipo,leitura_ia,cliente_id,status,importacao_erro,leitura_lock_ate").eq("id",contaId).eq("usina_id",usina.id).eq("origem","gmail").maybeSingle();
    if (error || !conta || conta.status === "faturada" || (conta.leitura_lock_ate && Date.parse(conta.leitura_lock_ate)>Date.now())) return <Vazio titulo="Conta indisponível" texto="A conta não foi encontrada, já foi faturada ou está sendo lida. Atualize a lista e tente novamente." acao={<BotaoLink href="/contas/recebidas">Voltar às contas</BotaoLink>}/>;
    const {data: url} = await supabase.storage.from("contas").createSignedUrl(conta.arquivo_path,3600);
    contaInicial={contaId:conta.id,leitura:conta.leitura_ia,clienteId:conta.cliente_id,arquivoUrl:url?.signedUrl??null,arquivoTipo:conta.arquivo_tipo,aviso:conta.importacao_erro??(conta.leitura_ia?"Confira a leitura com o PDF original antes de emitir.":"Conta recebida. Preencha os campos olhando o PDF ou use Ler com IA na lista.")};
  }
  const { data: clientes } = await supabase
    .from("clientes")
    .select("id, nome, uc, whatsapp, modo_desconto, desconto_valor, cip_modo, cip_valor, cip_tabela_id, cip_classe, dia_vencimento")
    .eq("usina_id", usina.id)
    .eq("ativo", true)
    .order("nome");

  // última fatura e meses já faturados de cada cliente, para avisar variação estranha
  const { data: historico } = await supabase
    .from("faturas")
    .select("cliente_id, referencia, consumo_kwh, tarifa, total_centavos")
    .eq("usina_id", usina.id)
    .neq("status", "cancelada")
    .order("referencia", { ascending: false })
    .limit(600);
  const porCliente = new Map<string, HistoricoCliente>();
  for (const f of historico ?? []) {
    const atual = porCliente.get(f.cliente_id);
    if (!atual) {
      porCliente.set(f.cliente_id, {
        cliente_id: f.cliente_id,
        referencia: f.referencia,
        consumo_kwh: f.consumo_kwh === null ? null : Number(f.consumo_kwh),
        tarifa: Number(f.tarifa),
        total_centavos: Number(f.total_centavos),
        referencias: [f.referencia],
      });
    } else {
      atual.referencias.push(f.referencia);
    }
  }

  const tabelasUsadas = [...new Set((clientes ?? []).map((c) => c.cip_tabela_id).filter(Boolean))] as string[];
  const { data: faixas } = tabelasUsadas.length
    ? await supabase.from("cip_faixas").select("tabela_id, classe, consumo_min, consumo_max, tipo, valor").in("tabela_id", tabelasUsadas)
    : { data: [] };

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
      <Cabecalho titulo="Lançar conta" sub="Envie uma conta ou abra um PDF já importado para conferir." acao={<BotaoLink href="/contas/recebidas" variante="secundario">Recebidas</BotaoLink>} />
      <LancarConta
        key={contaId ?? "nova"}
        contaInicial={contaInicial}
        clientes={clientes.map((c) => ({ ...c, modo_desconto: c.modo_desconto as ModoDesconto, desconto_valor: Number(c.desconto_valor), cip_modo: c.cip_modo as "da_conta", cip_valor: Number(c.cip_valor ?? 0), cip_tabela_id: c.cip_tabela_id, cip_classe: c.cip_classe as "B1" | null }))}
        clienteInicial={cliente ?? null}
        vencimentoPadrao={somarDias(hojeBR(), usina.dias_vencimento)}
        whatsappConfigurado={whatsappDisponivel(usina.whatsapp_instancia, "fatura")}
        bandeiraPadrao={Number(usina.bandeira_padrao ?? 0)}
        encargosAtivos={!!usina.encargos_ativos}
        historico={[...porCliente.values()]}
        faixasCip={(faixas ?? []).map((f) => ({ ...f, classe: f.classe as "B1", tipo: f.tipo as "percentual", valor: Number(f.valor) }))}
      />
    </div>
  );
}
