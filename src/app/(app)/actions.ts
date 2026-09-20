"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { contexto, registrarEvento, type Usina } from "@/lib/usina";
import { calcularFatura, type ModoDesconto } from "@/lib/calculo";
import { gerarPix } from "@/lib/pix";
import { parseNumeroBR, soDigitos } from "@/lib/format";
import { pdfDaFatura, legendaWhatsapp } from "@/lib/faturas";
import { enviarDocumento, enviarTexto } from "@/lib/whatsapp";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { cobrar, obterGateway, segredos, NOMES_GATEWAY, type NomeGateway } from "@/lib/cobranca";
import { ambienteDaChave, gatewayAsaas } from "@/lib/cobranca/asaas";
import { gatewayMercadoPago } from "@/lib/cobranca/mercadopago";
import { hojeBR } from "@/lib/format";
import { CATEGORIAS } from "@/lib/financeiro";

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
  modo_desconto: z.enum(["percentual_conta_cheia", "percentual_compensada", "percentual_gasto_total", "tarifa_fixa"]),
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
  bandeira: string;     // R$
  iluminacao: string;   // R$
  valorConta: string;   // R$ total da conta que chegou
  semUsinaAjustado: string; // R$, vazio = usar o cálculo
  vencimentoConta: string;  // AAAA-MM-DD da conta da distribuidora (conta no nome da usina)
  vencimento: string;   // AAAA-MM-DD
  confirmado: boolean;
};

const reaisParaCentavos = (v: string) => Math.round((parseNumeroBR(v) ?? 0) * 100);

export async function emitirFatura(d: DadosEmissao): Promise<{ erro?: string; id?: string; aviso?: string }> {
  try {
    const { supabase, usina, user } = await contexto();
    if (!d.confirmado) return { erro: "Confirme que conferiu os dados com a conta original." };
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(d.referencia)) return { erro: "Mês de referência inválido." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.vencimento) || Number.isNaN(Date.parse(d.vencimento))) return { erro: "Data de vencimento inválida." };

    const { data: cliente } = await supabase.from("clientes").select("*").eq("id", d.clienteId).maybeSingle();
    if (!cliente) return { erro: "Selecione um cliente cadastrado." };
    if (!cliente.ativo) return { erro: "Esse cliente está inativo." };
    if (soDigitos(d.uc) !== cliente.uc) return { erro: `A UC da conta (${soDigitos(d.uc) || "vazia"}) não é a do cliente (${cliente.uc}).` };

    const modo = cliente.modo_desconto as ModoDesconto;
    const consumo = parseNumeroBR(d.consumoKwh);
    const compensada = parseNumeroBR(d.compensadaKwh);
    const tarifa = parseNumeroBR(d.tarifa) ?? 0;
    const valorConta = reaisParaCentavos(d.valorConta);
    const bandeira = reaisParaCentavos(d.bandeira);
    const iluminacao = reaisParaCentavos(d.iluminacao);
    const ajustado = d.semUsinaAjustado.trim() ? reaisParaCentavos(d.semUsinaAjustado) : null;

    const r = calcularFatura({
      modo,
      descontoValor: Number(cliente.desconto_valor),
      tarifa,
      consumoKwh: consumo ?? 0,
      compensadaKwh: compensada ?? 0,
      valorContaCentavos: valorConta,
      bandeiraCentavos: bandeira,
      iluminacaoCentavos: iluminacao,
      semUsinaAjustadoCentavos: modo === "percentual_conta_cheia" ? ajustado : null,
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
        bandeira_centavos: bandeira,
        iluminacao_centavos: iluminacao,
        valor_conta_centavos: valorConta,
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
        modo_desconto: modo,
        desconto_valor: cliente.desconto_valor,
        consumo_kwh: consumo,
        compensada_kwh: compensada ?? 0,
        tarifa,
        bandeira_centavos: modo === "percentual_conta_cheia" ? bandeira : 0,
        iluminacao_centavos: modo === "percentual_conta_cheia" ? iluminacao : 0,
        sem_usina_ajustado: modo === "percentual_conta_cheia" && ajustado !== null,
        valor_conta_centavos: valorConta,
        custo_usina_centavos: modo === "percentual_conta_cheia" ? valorConta : 0,
        sem_usina_centavos: r.semUsinaCentavos,
        total_centavos: r.totalCentavos,
        economia_centavos: r.economiaCentavos,
        pix_copia_cola: pix,
        snapshot: {
          cliente: { nome: cliente.nome, documento: cliente.documento, uc: cliente.uc, distribuidora: cliente.distribuidora },
          usina: { nome: usina.nome, documento: usina.documento, pix_favorecido: usina.pix_favorecido, logo_path: usina.logo_path },
        },
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") return { erro: "Esse cliente já tem fatura para esse mês. Cancele a anterior para reemitir." };
      return { erro: "Não foi possível emitir a fatura." };
    }

    await supabase.from("contas_energia").update({ status: "faturada" }).eq("id", d.contaId);
    await registrarEvento(supabase, usina.id, "fatura_emitida", fatura.id, { total: r.totalCentavos, referencia, ajustado: ajustado !== null });

    // Conta no nome da usina: vira conta a pagar no financeiro
    if (modo === "percentual_conta_cheia" && valorConta > 0) {
      const venc = /^\d{4}-\d{2}-\d{2}$/.test(d.vencimentoConta) ? d.vencimentoConta : d.vencimento;
      await supabase.from("despesas").insert({
        usina_id: usina.id,
        descricao: `Conta ${cliente.distribuidora.split(" ")[0]} · ${cliente.nome} · ${d.referencia.split("-").reverse().join("/")}`,
        categoria: "conta_distribuidora",
        valor_centavos: valorConta,
        vencimento: venc,
        cliente_id: cliente.id,
        fatura_id: fatura.id,
      });
    }

    let aviso: string | undefined;
    if (usina.gateway !== "nenhum") {
      const c = await cobrar(supabase, usina, fatura.id);
      if (c.erro) aviso = `Fatura emitida, mas a cobrança no ${NOMES_GATEWAY[usina.gateway]} não foi criada: ${c.erro}`;
    }
    revalidatePath("/");
    revalidatePath("/faturas");
    revalidatePath("/financeiro");
    return { id: fatura.id, aviso };
  } catch (e) {
    return { erro: erroDe(e) };
  }
}

export async function marcarPaga(id: string, paga: boolean): Promise<{ erro?: string }> {
  const { supabase, usina } = await contexto();
  const { data: f } = await supabase.from("faturas").select("status, total_centavos, cobranca_gateway, cobranca_id").eq("id", id).maybeSingle();
  if (!f || f.status === "cancelada") return { erro: "Fatura não encontrada ou cancelada." };

  // Mantém o serviço de cobrança em dia com a baixa feita por fora
  let manterCobranca = true;
  if (f.cobranca_id && f.cobranca_gateway) {
    const g = await obterGateway(usina, f.cobranca_gateway as NomeGateway);
    if (g) {
      try {
        manterCobranca = paga ? await g.baixaManual(f.cobranca_id, Number(f.total_centavos), hojeBR()) : await g.desfazerBaixa(f.cobranca_id);
      } catch (e) {
        return { erro: `Não foi possível atualizar no ${NOMES_GATEWAY[g.nome]}: ${e instanceof Error ? e.message : "erro"}` };
      }
    }
  }
  const semCobranca = manterCobranca ? {} : { cobranca_id: null, cobranca_link: null, cobranca_gateway: null };

  await supabase
    .from("faturas")
    .update(
      paga
        ? { status: "paga", paga_em: new Date().toISOString(), pagamento_origem: "manual", valor_recebido_centavos: f.total_centavos, ...semCobranca }
        : { status: "pendente", paga_em: null, pagamento_origem: null, valor_recebido_centavos: null, ...semCobranca },
    )
    .eq("id", id);
  await registrarEvento(supabase, usina.id, paga ? "fatura_paga" : "pagamento_desfeito", id);
  revalidatePath(`/faturas/${id}`);
  revalidatePath("/faturas");
  revalidatePath("/financeiro");
  revalidatePath("/");
  return {};
}

export async function cancelarFatura(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, usina } = await contexto();
  const id = txt(form, "id");
  const motivo = txt(form, "motivo");
  if (motivo.length < 5) return { erro: "Descreva o motivo do cancelamento." };

  const { data: atual } = await supabase.from("faturas").select("status, cobranca_gateway, cobranca_id").eq("id", id).maybeSingle();
  if (!atual || atual.status !== "pendente") return { erro: "Só é possível cancelar faturas pendentes." };
  if (atual.cobranca_id && atual.cobranca_gateway) {
    const g = await obterGateway(usina, atual.cobranca_gateway as NomeGateway);
    if (g) {
      try {
        await g.cancelar(atual.cobranca_id);
      } catch (e) {
        return { erro: `O ${NOMES_GATEWAY[g.nome]} não cancelou a cobrança: ${e instanceof Error ? e.message : "erro"}. Nada foi cancelado.` };
      }
    }
  }

  const { data, error } = await supabase
    .from("faturas")
    .update({ status: "cancelada", cancelada_em: new Date().toISOString(), motivo_cancelamento: motivo })
    .eq("id", id)
    .eq("status", "pendente")
    .select("id, conta_id")
    .maybeSingle();
  if (error || !data) return { erro: "Só é possível cancelar faturas pendentes." };
  if (data.conta_id) await supabase.from("contas_energia").update({ status: "conferida" }).eq("id", data.conta_id);
  // a conta da distribuidora ligada a essa fatura sai do financeiro se ainda não foi paga
  // (feito pelo servidor: o operador cancela a fatura, mas não apaga despesas diretamente)
  await supabaseAdmin().from("despesas").delete().eq("fatura_id", id).eq("usina_id", usina.id).is("pago_em", null);
  await registrarEvento(supabase, usina.id, "fatura_cancelada", id, { motivo });
  revalidatePath(`/faturas/${id}`);
  revalidatePath("/faturas");
  revalidatePath("/financeiro");
  revalidatePath("/");
  return { ok: "Fatura cancelada. Você já pode emitir uma nova para esse mês." };
}

export async function gerarCobranca(id: string): Promise<{ erro?: string; ok?: string }> {
  const { supabase, usina } = await contexto();
  const r = await cobrar(supabase, usina, id);
  revalidatePath(`/faturas/${id}`);
  return r.erro ? { erro: r.erro } : { ok: `Cobrança criada no ${usina.gateway === "nenhum" ? "serviço" : NOMES_GATEWAY[usina.gateway]}.` };
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
      dias_vencimento: dias,
    })
    .eq("id", usina.id);
  if (error) return { erro: "Não foi possível salvar." };
  revalidatePath("/", "layout");
  return { ok: "Dados da usina salvos." };
}

export async function salvarLogo(caminho: string | null): Promise<{ erro?: string }> {
  const { supabase, usina, papel } = await contexto();
  if (papel !== "dono") return { erro: "Só o dono da usina altera a logo." };
  if (caminho !== null && !caminho.startsWith(`${usina.id}/`)) return { erro: "Arquivo inválido." };
  const { error } = await supabase.from("usinas").update({ logo_path: caminho }).eq("id", usina.id);
  if (error) return { erro: "Não foi possível salvar a logo." };
  // apaga a anterior para não acumular arquivos
  if (usina.logo_path && usina.logo_path !== caminho) await supabase.storage.from("logos").remove([usina.logo_path]);
  revalidatePath("/", "layout");
  return {};
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

// ------------------------------------------------------------------ cobrança automática

const limparCredencial = (v: string) => v.replace(/^["']|["']$/g, "").trim();

export async function salvarCobranca(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, usina, papel } = await contexto();
  if (papel !== "dono") return { erro: "Só o dono da usina configura a cobrança." };

  const gateway = (["nenhum", "asaas", "mercadopago"].includes(txt(form, "gateway")) ? txt(form, "gateway") : "nenhum") as Usina["gateway"];
  const chaveAsaas = limparCredencial(txt(form, "asaas_api_key"));
  const tokenMP = limparCredencial(txt(form, "mp_access_token"));
  const forma = txt(form, "asaas_forma") === "UNDEFINED" ? "UNDEFINED" : "PIX";
  const notificar = form.get("asaas_notificar") === "on";
  let ambiente: "sandbox" | "producao" = txt(form, "asaas_ambiente") === "producao" ? "producao" : "sandbox";

  if (chaveAsaas && !chaveAsaas.startsWith("$aact_")) return { erro: "Essa não parece uma chave do Asaas (ela começa com $aact_)." };
  if (tokenMP && !/^(APP_USR|TEST)-/.test(tokenMP)) return { erro: "Use o Access Token do Mercado Pago (começa com APP_USR- ou TEST-), não a Public Key." };

  const atuais = await segredos(usina.id);
  const asaasKey = chaveAsaas || atuais.asaasKey;
  const mpToken = tokenMP || atuais.mpToken;
  if (asaasKey) ambiente = ambienteDaChave(asaasKey, ambiente);

  let conectado = "";
  try {
    // testa só o que foi colado agora ou o serviço que está sendo ativado
    if (asaasKey && (chaveAsaas || gateway === "asaas")) {
      const r = await gatewayAsaas(asaasKey, ambiente, { forma, notificar }).testar();
      if (gateway === "asaas") conectado = r;
    } else if (gateway === "asaas") return { erro: "Cole a chave de API do Asaas." };

    if (mpToken && (tokenMP || gateway === "mercadopago")) {
      const r = await gatewayMercadoPago(mpToken, "").testar();
      if (gateway === "mercadopago") conectado = r;
    } else if (gateway === "mercadopago") return { erro: "Cole o Access Token do Mercado Pago." };
  } catch (e) {
    const cred = gateway === "mercadopago" || (tokenMP && !chaveAsaas) ? mpToken : asaasKey;
    return { erro: `${erroDe(e)} A credencial começa com ${(cred ?? "").slice(0, 11)}… e tem ${(cred ?? "").length} caracteres.` };
  }

  const { error: erroSegredo } = await supabaseAdmin().from("usina_integracoes").upsert({
    usina_id: usina.id,
    asaas_api_key: asaasKey,
    asaas_webhook_token: atuais.asaasWebhookToken || crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, ""),
    mp_access_token: mpToken,
    updated_at: new Date().toISOString(),
  });
  if (erroSegredo) {
    console.error("salvar credenciais", erroSegredo);
    return { erro: `Conexão OK, mas não foi possível guardar a credencial: ${erroSegredo.message}. Confira se a migração 0007 foi rodada.` };
  }

  const { error } = await supabase
    .from("usinas")
    .update({ gateway, asaas_ativo: gateway === "asaas", asaas_ambiente: ambiente, asaas_forma: forma, asaas_notificar: notificar })
    .eq("id", usina.id);
  if (error) {
    console.error("salvar cobrança", error);
    return { erro: `Conexão OK, mas não foi possível salvar: ${error.message}. Confira se a migração 0007 foi rodada.` };
  }
  revalidatePath("/", "layout");
  return { ok: gateway === "nenhum" ? "Cobrança automática desligada." : `${conectado} conectado. As próximas faturas já saem com cobrança.` };
}

// ------------------------------------------------------------------ financeiro


function somarMeses(iso: string, n: number) {
  const [a, m, d] = iso.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + n, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

export async function salvarDespesa(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, usina } = await contexto();
  const descricao = txt(form, "descricao");
  const categoria = txt(form, "categoria");
  const valor = Math.round((parseNumeroBR(txt(form, "valor")) ?? 0) * 100);
  const vencimento = txt(form, "vencimento");
  const repetir = txt(form, "repetir"); // nenhuma | mensal | trimestral | anual | parcelado
  const vezes = Math.min(120, Math.max(1, Number(txt(form, "vezes")) || 1));
  const jaPaga = form.get("paga") === "on";

  if (descricao.length < 2) return { erro: "Descreva a despesa." };
  if (!CATEGORIAS[categoria]) return { erro: "Escolha a categoria." };
  if (!(valor > 0)) return { erro: "Informe o valor." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) return { erro: "Informe o vencimento." };

  const passo = { mensal: 1, trimestral: 3, anual: 12, parcelado: 1 }[repetir] ?? 0;
  const total = passo ? (repetir === "parcelado" ? vezes : Math.min(vezes, repetir === "mensal" ? 24 : 12)) : 1;
  const grupo = total > 1 ? crypto.randomUUID() : null;
  const linhas = Array.from({ length: total }, (_, i) => ({
    usina_id: usina.id,
    descricao,
    categoria,
    valor_centavos: valor,
    vencimento: somarMeses(vencimento, i * passo),
    pago_em: jaPaga && i === 0 ? hojeBR() : null,
    grupo_id: grupo,
    parcela: total > 1 ? i + 1 : null,
    parcelas: total > 1 ? total : null,
    observacao: txt(form, "observacao") || null,
  }));
  const { error } = await supabase.from("despesas").insert(linhas);
  if (error) return { erro: "Não foi possível lançar a despesa." };
  revalidatePath("/financeiro");
  return { ok: total > 1 ? `${total} lançamentos criados.` : "Despesa lançada." };
}

export async function pagarDespesa(id: string, paga: boolean) {
  const { supabase } = await contexto();
  await supabase.from("despesas").update({ pago_em: paga ? hojeBR() : null }).eq("id", id);
  revalidatePath("/financeiro");
  revalidatePath("/");
}

export async function excluirDespesa(id: string, serie: boolean) {
  const { supabase, papel } = await contexto();
  if (papel !== "dono") return;
  const { data } = await supabase.from("despesas").select("grupo_id, vencimento").eq("id", id).maybeSingle();
  if (serie && data?.grupo_id) {
    // apaga esta e as próximas ainda não pagas da série
    await supabase.from("despesas").delete().eq("grupo_id", data.grupo_id).gte("vencimento", data.vencimento).is("pago_em", null);
  } else {
    await supabase.from("despesas").delete().eq("id", id);
  }
  revalidatePath("/financeiro");
}

export async function sair() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}
