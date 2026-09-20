"use server";

import { revalidatePath } from "next/cache";
import { exigirSuperAdmin, gerarCodigo, gerarSenha } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function gerarConvite(_: { erro?: string; codigo?: string } | undefined, form: FormData) {
  await exigirSuperAdmin();
  const nota = String(form.get("nota") ?? "").trim().slice(0, 120) || null;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const codigo = gerarCodigo();
    const { error } = await supabaseAdmin().from("convites_usina").insert({ codigo, nota });
    if (!error) {
      revalidatePath("/admin");
      return { codigo };
    }
  }
  return { erro: "Não foi possível gerar o convite." };
}

export async function revogarConvite(codigo: string) {
  await exigirSuperAdmin();
  await supabaseAdmin().from("convites_usina").delete().eq("codigo", codigo).is("usado_em", null);
  revalidatePath("/admin");
}

export async function definirInstancia(usinaId: string, _: { erro?: string; ok?: string } | undefined, form: FormData) {
  await exigirSuperAdmin();
  const instancia = String(form.get("instancia") ?? "").trim();
  if (instancia && !/^[\w.-]{2,60}$/.test(instancia)) return { erro: "Use letras, números, ponto, hífen ou _." };
  const admin = supabaseAdmin();
  if (instancia) {
    // uma instância (número de WhatsApp) pertence a uma única usina
    const { data: outra } = await admin.from("usinas").select("nome").eq("whatsapp_instancia", instancia).neq("id", usinaId).maybeSingle();
    if (outra) return { erro: `Essa instância já é da usina ${outra.nome}.` };
  }
  const { error } = await admin.from("usinas").update({ whatsapp_instancia: instancia || null }).eq("id", usinaId);
  if (error) return { erro: "Não foi possível salvar." };
  const token = String(form.get("token") ?? "").trim();
  const limpar = form.get("limpar_token") === "on";
  if (token || limpar || !instancia) {
    const { error: e2 } = await admin.from("usina_integracoes").upsert({ usina_id: usinaId, evolution_token: limpar || !instancia ? null : token, updated_at: new Date().toISOString() });
    if (e2) return { erro: `Instância salva, mas o token não: ${e2.message}. Rode a migração 0010.` };
  }
  revalidatePath("/admin");
  return { ok: "Salvo." };
}

type Resultado = { erro?: string; mensagem?: string };

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

/** Cria a usina já com a conta do dono (sem depender de e-mail) e devolve o texto para mandar no WhatsApp */
export async function criarUsinaComConta(_: Resultado | undefined, form: FormData): Promise<Resultado> {
  await exigirSuperAdmin();
  const nome = String(form.get("nome") ?? "").trim();
  const documento = String(form.get("documento") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const senha = String(form.get("senha") ?? "").trim() || gerarSenha();
  if (nome.length < 2) return { erro: "Informe o nome da usina." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { erro: "Informe o e-mail do dono." };
  if (senha.length < 8) return { erro: "A senha precisa de pelo menos 8 caracteres." };

  const admin = supabaseAdmin();
  let userId: string;
  const criado = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (criado.data.user) userId = criado.data.user.id;
  else {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existente = data.users.find((u) => u.email?.toLowerCase() === email);
    if (!existente) return { erro: `Não foi possível criar a conta: ${criado.error?.message ?? "erro"}` };
    const { count } = await admin.from("usina_membros").select("*", { count: "exact", head: true }).eq("user_id", existente.id);
    if (count) return { erro: "Esse e-mail já participa de uma usina. Use outro e-mail para o dono." };
    // conta existente sem usina: define a senha informada para o dono conseguir entrar
    await admin.auth.admin.updateUserById(existente.id, { password: senha, email_confirm: true });
    userId = existente.id;
  }

  const { data: usina, error } = await admin.from("usinas").insert({ nome, documento: documento || null }).select("id").single();
  if (error || !usina) return { erro: "Conta criada, mas não foi possível cadastrar a usina." };
  await admin.from("usina_membros").insert({ usina_id: usina.id, user_id: userId, papel: "dono", email });
  revalidatePath("/admin");

  return {
    mensagem: [
      `Olá! Seu acesso ao VisioPro Solar (${nome}) está pronto.`,
      ``,
      `Endereço: ${appUrl() || "https://solar.visiopro.app.br"}`,
      `E-mail: ${email}`,
      `Senha provisória: ${senha}`,
      ``,
      `No primeiro acesso, vá em Ajustes para colocar a logo, o PIX e a cobrança automática.`,
    ].join("\n"),
  };
}

/** Gera uma senha provisória para um membro de qualquer usina (quando o e-mail não chega) */
export async function redefinirSenha(userId: string): Promise<Resultado> {
  await exigirSuperAdmin();
  const senha = gerarSenha();
  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.updateUserById(userId, { password: senha, email_confirm: true });
  if (error || !data.user) return { erro: "Não foi possível redefinir a senha." };
  return {
    mensagem: [`Seu acesso ao VisioPro Solar:`, ``, `Endereço: ${appUrl() || "https://solar.visiopro.app.br"}`, `E-mail: ${data.user.email}`, `Senha provisória: ${senha}`].join("\n"),
  };
}

/** Adiciona um operador a uma usina criando a conta com senha provisória */
export async function adicionarOperador(usinaId: string, _: Resultado | undefined, form: FormData): Promise<Resultado> {
  await exigirSuperAdmin();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { erro: "Informe um e-mail válido." };
  const senha = gerarSenha();
  const admin = supabaseAdmin();
  let userId: string | undefined;
  let novaConta = true;
  const criado = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (criado.data.user) userId = criado.data.user.id;
  else {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id;
    novaConta = false;
  }
  if (!userId) return { erro: `Não foi possível criar a conta: ${criado.error?.message ?? "erro"}` };
  const { error } = await admin.from("usina_membros").insert({ usina_id: usinaId, user_id: userId, papel: "operador", email });
  if (error) return { erro: error.code === "23505" ? "Essa pessoa já está nessa usina." : "Não foi possível adicionar." };
  revalidatePath(`/admin/usinas/${usinaId}`);
  return novaConta
    ? { mensagem: [`Seu acesso ao VisioPro Solar:`, ``, `Endereço: ${appUrl() || "https://solar.visiopro.app.br"}`, `E-mail: ${email}`, `Senha provisória: ${senha}`].join("\n") }
    : { mensagem: `${email} já tinha conta e foi adicionado. Se ele não souber a senha, use "Nova senha" na lista.` };
}
