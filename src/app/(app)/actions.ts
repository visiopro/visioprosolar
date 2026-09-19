"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { contexto, registrarEvento } from "@/lib/usina";
import { calcularFatura, type ModoDesconto } from "@/lib/calculo";
import { gerarPix } from "@/lib/pix";
import { parseNumeroBR, soDigitos } from "@/lib/format";
import { pdfDaFatura, legendaWhatsapp } from "@/lib/faturas";
import { enviarDocumento, enviarTexto } from "@/lib/whatsapp";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export type Estado = { erro?: string; ok?: string } | undefined;

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const erroDe = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível concluir. Tente novamente.");

// ------------------------------------------------------------------ clientes

const esquemaCliente = z.object({
  nome: z.string().min(2, "Informe o nome do cliente.").max(120),
  documento: z.string().max(20).optional(),
  uc: z.string().regex(/^\d{3,40}$/, "A UC deve ter só números."),
  distribuidora: z.string().min(2, "Informe a distribuidora.").max(80),
  whatsapp: z.string().regex(/^55\d{10,11}$/, "WhatsApp: use 55 + DDD + número.").optional(),
  email: z.string().email("E-mail inválido.").optional(),
  modo_desconto: z.enum(["percentual_compensada", "percentual_gasto_total", "tarifa_fixa"]),
  desconto_valor: z.number({ invalid_type_error: "Informe o desconto." }).min(0),
});

export async function salvarCliente(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, usina } = await contexto();
  const id = txt(form, "id");
  const whats = soDigitos(txt(form, "whatsapp"));
  const bruto = {
    nome: txt(form, "nome"),
    documento: txt(form, "documento") || undefined,
    uc: soDigitos(txt(form, "uc")),
    distribuidora: txt(form, "distribuidora"),
    whatsapp: whats ? (whats.startsWith("55") ? whats : `55${whats}`) : undefined,
    email: txt(form, "email") || undefined,
    modo_desconto: txt(form, "modo_desconto"),
    desconto_valor: parseNumeroBR(txt(form, "desconto_valor")) ?? NaN,
  };
  const v = esquemaCliente.safeParse(bruto);
  if (!v.success) return { erro: v.error.issues[0].message };
  if (v.data.modo_desconto !== "tarifa_fixa" && v.data.desconto_valor > 100) return { erro: "O desconto não pode passar de 100%." };

  const linha = { ...v.data, documento: v.data.documento ?? null, whatsapp: v.data.whatsapp ?? null, email: v.data.email ?? null, usina_id: usina.id };
  const { error } = id
    ? await supabase.from("clientes").update(linha).eq("id", id)
    : await supabase.from("clientes").insert(linha);
  if (error) return { erro: error.code === "23505" ? "Já existe um cliente com essa UC." : "Não foi possível salvar o cliente." };

  revalidatePath("/clientes");
  redirect("/clientes");
}

export async function alternarCliente(id: string, ativo: boolean) {
  const { supabase } = await contexto();
  await supabase.from("clientes").update({ ativo }).eq("id", id);
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id}`);
}

// ------------------------------------------------------------------ faturas

export type DadosEmissao = {
  contaId: string;
  clienteId: string;
  uc: string;
  referencia: string;   // AAAA-MM
  consumoKwh: string;
  compensadaKwh: string;
  tarifa: string;
  valorConta: string;   // R$
  vencimento: string;   // AAAA-MM-DD
  confirmado: boolean;
};

export async function emitirFatura(d: DadosEmissao): Promise<{ erro?: string; id?: string }> {
  try {
    const { supabase, usina, user } = await contexto();
    if (!d.confirmado) return { erro: "Confirme que conferiu os dados com a conta original." };
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(d.referencia)) return { erro: "Mês de referência inválido." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.vencimento) || Number.isNaN(Date.parse(d.vencimento))) return { erro: "Data de vencimento inválida." };

    const { data: cliente } = await supabase.from("clientes").select("*").eq("id", d.clienteId).maybeSingle();
    if (!cliente) return { erro: "Selecione um cliente cadastrado." };
    if (!cliente.ativo) return { erro: "Esse cliente está inativo." };
    if (soDigitos(d.uc) !== cliente.uc) return { erro: `A UC da conta (${soDigitos(d.uc) || "vazia"}) não é a do cliente (${cliente.uc}).` };

    const compensada = parseNumeroBR(d.compensadaKwh);
    const tarifa = parseNumeroBR(d.tarifa);
    const valorConta = parseNumeroBR(d.valorConta) ?? 0;
    const consumo = parseNumeroBR(d.consumoKwh);
    if (compensada === null || tarifa === null) return { erro: "Preencha energia compensada e tarifa." };

    const r = calcularFatura({
      modo: cliente.modo_desconto as ModoDesconto,
      descontoValor: Number(cliente.desconto_valor),
      compensadaKwh: compensada,
      tarifa,
      valorContaCentavos: Math.round(valorConta * 100),
    });

    const referencia = `${d.referencia}-01`;
    const pix = gerarPix({
      chave: usina.pix_chave ?? "",
      favorecido: usina.pix_favorecido ?? "",
      cidade: usina.pix_cidade ?? "",
      centavos: r.totalCentavos,
      txid: `SOL${d.referencia.replace("-", "")}${cliente.uc.slice(-8)}`,
    });

    const { data: conta } = await supabase
      .from("contas_energia")
      .update({
        cliente_id: cliente.id,
        uc: cliente.uc,
        referencia,
        consumo_kwh: consumo,
        compensada_kwh: compensada,
        tarifa,
        valor_conta_centavos: Math.round(valorConta * 100),
        status: "conferida",
        conferida_por: user.id,
        conferida_em: new Date().toISOString(),
      })
      .eq("id", d.contaId)
      .select("id")
      .maybeSingle();
    if (!conta) return { erro: "A conta enviada não foi encontrada. Envie a foto novamente." };

    const { data: fatura, error } = await supabase
      .from("faturas")
      .insert({
        usina_id: usina.id,
        numero: 0, // definido pelo gatilho
        cliente_id: cliente.id,
        conta_id: d.contaId,
        referencia,
        vencimento: d.vencimento,
        modo_desconto: cliente.modo_desconto,
        desconto_valor: cliente.desconto_valor,
        compensada_kwh: compensada,
        tarifa,
        valor_conta_centavos: Math.round(valorConta * 100),
        sem_usina_centavos: r.semUsinaCentavos,
        total_centavos: r.totalCentavos,
        economia_centavos: r.economiaCentavos,
        pix_copia_cola: pix,
        snapshot: {
          cliente: { nome: cliente.nome, documento: cliente.documento, uc: cliente.uc, distribuidora: cliente.distribuidora },
          usina: { nome: usina.nome, documento: usina.documento, pix_favorecido: usina.pix_favorecido },
        },
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") return { erro: "Esse cliente já tem fatura para esse mês. Cancele a anterior para reemitir." };
      return { erro: "Não foi possível emitir a fatura." };
    }

    await supabase.from("contas_energia").update({ status: "faturada" }).eq("id", d.contaId);
    await registrarEvento(supabase, usina.id, "fatura_emitida", fatura.id, { total: r.totalCentavos, referencia });
    revalidatePath("/");
    revalidatePath("/faturas");
    return { id: fatura.id };
  } catch (e) {
    return { erro: erroDe(e) };
  }
}

export async function marcarPaga(id: string, paga: boolean) {
  const { supabase, usina } = await contexto();
  await supabase
    .from("faturas")
    .update({ status: paga ? "paga" : "pendente", paga_em: paga ? new Date().toISOString() : null })
    .eq("id", id)
    .neq("status", "cancelada");
  await registrarEvento(supabase, usina.id, paga ? "fatura_paga" : "pagamento_desfeito", id);
  revalidatePath(`/faturas/${id}`);
  revalidatePath("/faturas");
  revalidatePath("/");
}

export async function cancelarFatura(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, usina } = await contexto();
  const id = txt(form, "id");
  const motivo = txt(form, "motivo");
  if (motivo.length < 5) return { erro: "Descreva o motivo do cancelamento." };
  const { data, error } = await supabase
    .from("faturas")
    .update({ status: "cancelada", cancelada_em: new Date().toISOString(), motivo_cancelamento: motivo })
    .eq("id", id)
    .eq("status", "pendente")
    .select("id, conta_id")
    .maybeSingle();
  if (error || !data) return { erro: "Só é possível cancelar faturas pendentes." };
  if (data.conta_id) await supabase.from("contas_energia").update({ status: "conferida" }).eq("id", data.conta_id);
  await registrarEvento(supabase, usina.id, "fatura_cancelada", id, { motivo });
  revalidatePath(`/faturas/${id}`);
  revalidatePath("/faturas");
  revalidatePath("/");
  return { ok: "Fatura cancelada. Você já pode emitir uma nova para esse mês." };
}

export async function enviarWhatsapp(id: string): Promise<{ erro?: string; ok?: string }> {
  try {
    const { supabase, usina } = await contexto();
    if (!usina.whatsapp_instancia) return { erro: "Configure a instância do WhatsApp em Ajustes." };
    const r = await pdfDaFatura(supabase, id);
    if (!r) return { erro: "Fatura não encontrada." };
    if (r.fatura.status === "cancelada") return { erro: "Fatura cancelada não pode ser enviada." };
    const { data: cliente } = await supabase.from("clientes").select("whatsapp").eq("id", r.fatura.cliente_id).single();
    if (!cliente?.whatsapp) return { erro: "Cadastre o WhatsApp do cliente para enviar." };

    await enviarDocumento({
      instancia: usina.whatsapp_instancia,
      numero: cliente.whatsapp,
      legenda: legendaWhatsapp(r.fatura),
      pdf: r.pdf,
      nomeArquivo: r.nome,
    });
    // PIX em mensagem separada: no WhatsApp o cliente copia com um toque
    if (r.fatura.pix_copia_cola && r.fatura.status === "pendente") {
      await enviarTexto({ instancia: usina.whatsapp_instancia, numero: cliente.whatsapp, texto: r.fatura.pix_copia_cola });
    }
    await supabase.from("faturas").update({ enviada_em: new Date().toISOString() }).eq("id", id);
    await registrarEvento(supabase, usina.id, "fatura_enviada", id);
    revalidatePath(`/faturas/${id}`);
    return { ok: "Fatura enviada no WhatsApp do cliente." };
  } catch (e) {
    return { erro: erroDe(e) };
  }
}

// ------------------------------------------------------------------ ajustes

export async function salvarUsina(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, usina, papel } = await contexto();
  if (papel !== "dono") return { erro: "Só o dono da usina altera esses dados." };
  const nome = txt(form, "nome");
  const pixChave = txt(form, "pix_chave");
  const favorecido = txt(form, "pix_favorecido");
  const cidade = txt(form, "pix_cidade");
  const dias = Number(txt(form, "dias_vencimento"));
  if (nome.length < 2) return { erro: "Informe o nome da usina." };
  if (pixChave && (!favorecido || !cidade)) return { erro: "Para gerar o PIX, informe favorecido e cidade." };
  if (favorecido.length > 25) return { erro: "O favorecido do PIX aceita até 25 caracteres." };
  if (cidade.length > 15) return { erro: "A cidade do PIX aceita até 15 caracteres." };
  if (!Number.isInteger(dias) || dias < 1 || dias > 60) return { erro: "Prazo de vencimento entre 1 e 60 dias." };

  const { error } = await supabase
    .from("usinas")
    .update({
      nome,
      documento: txt(form, "documento") || null,
      pix_chave: pixChave || null,
      pix_favorecido: favorecido || null,
      pix_cidade: cidade || null,
      whatsapp_instancia: txt(form, "whatsapp_instancia") || null,
      dias_vencimento: dias,
    })
    .eq("id", usina.id);
  if (error) return { erro: "Não foi possível salvar." };
  revalidatePath("/", "layout");
  return { ok: "Dados da usina salvos." };
}

export async function convidarMembro(_: Estado, form: FormData): Promise<Estado> {
  const { usina, papel } = await contexto();
  if (papel !== "dono") return { erro: "Só o dono da usina convida pessoas." };
  const email = txt(form, "email").toLowerCase();
  if (!z.string().email().safeParse(email).success) return { erro: "Informe um e-mail válido." };
  try {
    const admin = supabaseAdmin();
    const volta = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/definir-senha`;
    let userId: string | undefined;
    const convite = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: volta });
    if (convite.data.user) userId = convite.data.user.id;
    else {
      // já tem conta: localizar pelo e-mail
      const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
      userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id;
    }
    if (!userId) return { erro: "Não foi possível convidar esse e-mail." };
    const { error } = await admin.from("usina_membros").insert({ usina_id: usina.id, user_id: userId, papel: "operador", email });
    if (error) return { erro: error.code === "23505" ? "Essa pessoa já faz parte da equipe." : "Não foi possível adicionar à equipe." };
  } catch (e) {
    return { erro: erroDe(e) };
  }
  revalidatePath("/configuracoes");
  return { ok: `Convite enviado para ${email}.` };
}

export async function removerMembro(userId: string) {
  const { supabase, usina, papel } = await contexto();
  if (papel !== "dono") return;
  await supabase.from("usina_membros").delete().eq("usina_id", usina.id).eq("user_id", userId);
  revalidatePath("/configuracoes");
}

export async function sair() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}
