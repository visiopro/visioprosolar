import { contexto, urlLogo } from "@/lib/usina";
import { Cabecalho, Cartao } from "@/components/ui";
import { FormUsina, Equipe, FormCobranca, LogoUsina, TrocarSenha } from "@/components/form-ajustes";
import { segredos, NOMES_GATEWAY } from "@/lib/cobranca";
import { usaWhatsAppOficial, whatsappDisponivel } from "@/lib/whatsapp";
import { sair } from "../actions";

export default async function Ajustes() {
  const { supabase, usina, papel, user } = await contexto();
  const { data: membros } = await supabase.from("usina_membros").select("user_id, email, papel").eq("usina_id", usina.id).order("created_at");
  const cred = papel === "dono" ? await segredos(usina.id).catch(() => null) : null;
  const urlWebhook = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/asaas/webhook/${usina.id}`;

  return (
    <div className="max-w-2xl space-y-8">
      <Cabecalho titulo="Ajustes" />

      <section>
        <h2 className="mb-3 font-semibold">Minha conta</h2>
        <Cartao className="p-5 sm:p-6">
          <p className="mb-3 text-sm text-nevoa">{user.email}</p>
          <TrocarSenha email={user.email!} />
        </Cartao>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Dados da usina</h2>
        <Cartao className="mb-4 p-5 sm:p-6">
          <p className="mb-3 text-sm text-nevoa">Logo</p>
          <LogoUsina usinaId={usina.id} url={urlLogo(usina.logo_path)} podeEditar={papel === "dono"} />
        </Cartao>
        <Cartao className="p-5 sm:p-6">
          <FormUsina
            usina={usina}
            podeEditar={papel === "dono"}
            whatsappOficial={usaWhatsAppOficial()}
            whatsappFaturaConfigurado={whatsappDisponivel(usina.whatsapp_instancia, "fatura")}
            whatsappTextoConfigurado={whatsappDisponivel(usina.whatsapp_instancia, "texto")}
          />
        </Cartao>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Cobrança automática</h2>
        <Cartao className="p-5 sm:p-6">
          {papel === "dono" ? (
            <FormCobranca
              usina={usina}
              asaasConfigurado={!!cred?.asaasKey}
              mpConfigurado={!!cred?.mpToken}
              webhookUrl={urlWebhook}
              webhookToken={cred?.asaasWebhookToken ?? null}
            />
          ) : (
            <p className="text-sm text-nevoa">
              {usina.gateway === "nenhum" ? "Desligada." : `Ativa pelo ${NOMES_GATEWAY[usina.gateway]}: as faturas saem com cobrança e a baixa é automática.`}
            </p>
          )}
        </Cartao>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Equipe</h2>
        <Equipe membros={membros ?? []} eu={user.id} dono={papel === "dono"} />
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Assinatura</h2>
        <Cartao className="flex items-center justify-between gap-4 p-5">
          <p className="text-sm text-nevoa">Mensalidade do sistema, cobrada pela VisioPro conforme os clientes ativos.</p>
          <a href="/assinatura" className="shrink-0 text-sm text-sol hover:underline">Ver assinatura</a>
        </Cartao>
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
