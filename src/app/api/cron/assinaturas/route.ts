import { supabaseAdmin } from "@/lib/supabase/admin";
import { calcularMensalidade } from "@/lib/assinatura";
import { gatewayVisioPro } from "@/lib/assinatura-cobranca";
import { hojeBR, mesRef, somarDias } from "@/lib/format";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Roda diariamente às 11:30 (vercel.json).
 * Gera a mensalidade de cada usina no mês corrente a partir de dia_geracao,
 * calculando o valor pelo número de clientes ativos e emitindo cobrança PIX no gateway da VisioPro (Mercado Pago).
 */
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || segredo.length < 16 || req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return new Response("Não autorizado", { status: 401 });
  }

  const admin = supabaseAdmin();
  const hoje = hojeBR();
  const diaAtual = Number(hoje.slice(8, 10));
  const mes = `${hoje.slice(0, 7)}-01`;

  const { data: assinaturas, error } = await admin
    .from("assinaturas")
    .select("*, usinas(id, nome, documento)")
    .eq("ativa", true);

  if (error) {
    return Response.json({ erro: error.message }, { status: 500 });
  }

  let geradas = 0;
  const falhas: string[] = [];
  const gateway = gatewayVisioPro();

  for (const ass of assinaturas ?? []) {
    // Só gera se já chegou o dia de geração configurado para a usina
    if (diaAtual < ass.dia_geracao) continue;

    // Evita duplicidade se já houver fatura para este mês
    const { data: existente } = await admin
      .from("assinatura_faturas")
      .select("id")
      .eq("usina_id", ass.usina_id)
      .eq("referencia", mes)
      .maybeSingle();

    if (existente) continue;

    // Conta clientes ativos
    const { count: clientesAtivos, error: erroClientes } = await admin
      .from("clientes")
      .select("id", { count: "exact", head: true })
      .eq("usina_id", ass.usina_id)
      .eq("ativo", true);

    if (erroClientes) {
      falhas.push(`${ass.usina_id}: erro ao contar clientes - ${erroClientes.message}`);
      continue;
    }

    const qtdClientes = clientesAtivos ?? 0;
    const valor = calcularMensalidade(qtdClientes, {
      preco_ate_30_centavos: Number(ass.preco_ate_30_centavos),
      preco_acima_centavos: Number(ass.preco_acima_centavos),
      minimo_centavos: Number(ass.minimo_centavos),
    });

    if (valor <= 0) continue;

    let vencimento = `${hoje.slice(0, 7)}-${String(ass.dia_vencimento).padStart(2, "0")}`;
    if (vencimento <= hoje) {
      vencimento = somarDias(hoje, 5);
    }

    let cobrancaId: string | null = null;
    let cobrancaLink: string | null = null;
    let pixCopiaCola: string | null = null;
    let customerId = ass.asaas_customer_id;

    if (gateway) {
      const { data: dono } = await admin
        .from("usina_membros")
        .select("email")
        .eq("usina_id", ass.usina_id)
        .eq("papel", "dono")
        .maybeSingle();

      const usina = ass.usinas as unknown as { id: string; nome: string; documento: string | null } | null;
      try {
        const cobranca = await gateway.criar({
          usinaId: ass.usina_id,
          cliente: {
            id: ass.usina_id,
            nome: usina?.nome ?? "Usina Solar",
            documento: (usina?.documento ?? "").replace(/\D/g, ""),
            email: dono?.email ?? null,
            whatsapp: null,
            uc: "USINA",
            idExterno: customerId ?? null,
          },
          faturaId: `ass_${ass.usina_id}_${mes}`,
          valorCentavos: valor,
          vencimento,
          descricao: `Mensalidade VisioPro Solar · ${mesRef(mes)} (${qtdClientes} cliente${qtdClientes === 1 ? "" : "s"})`,
        });

        cobrancaId = cobranca.id;
        cobrancaLink = cobranca.link;
        pixCopiaCola = cobranca.pix;

        if (cobranca.clienteIdExterno && cobranca.clienteIdExterno !== customerId) {
          customerId = cobranca.clienteIdExterno;
          await admin.from("assinaturas").update({ asaas_customer_id: customerId }).eq("usina_id", ass.usina_id);
        }
      } catch (err) {
        console.error(`Erro ao criar cobrança para assinatura da usina ${ass.usina_id}:`, err);
      }
    }

    const { error: erroInsert } = await admin.from("assinatura_faturas").insert({
      usina_id: ass.usina_id,
      referencia: mes,
      clientes_ativos: qtdClientes,
      valor_centavos: valor,
      vencimento,
      status: "pendente",
      cobranca_id: cobrancaId,
      cobranca_link: cobrancaLink,
      pix_copia_cola: pixCopiaCola,
      asaas_payment_id: cobrancaId,
      asaas_link: cobrancaLink,
    });

    if (erroInsert) {
      falhas.push(`${ass.usina_id}: ${erroInsert.message}`);
    } else {
      geradas++;
      await admin.from("eventos").insert({
        usina_id: ass.usina_id,
        user_id: null,
        acao: "assinatura_gerada",
        detalhes: { mes, valor, clientes: qtdClientes, gateway: gateway?.nome ?? null, cobrancaId },
      });
    }
  }

  return Response.json({ ok: true, geradas, falhas });
}
