"use client";

import { useActionState, useState, useTransition } from "react";
import { convidarMembro, removerMembro, salvarAsaas, salvarUsina, type Estado } from "@/app/(app)/actions";
import { Copy } from "lucide-react";
import type { Usina } from "@/lib/usina";
import { Aviso, Botao, Campo, Cartao } from "./ui";

export function FormUsina({ usina, podeEditar }: { usina: Usina; podeEditar: boolean }) {
  const [estado, acao, enviando] = useActionState<Estado, FormData>(salvarUsina, undefined);
  return (
    <form action={acao} className="space-y-5">
      <fieldset disabled={!podeEditar} className="grid gap-5 disabled:opacity-70 sm:grid-cols-2">
        <Campo rotulo="Nome da usina" className="sm:col-span-2">
          <input name="nome" required defaultValue={usina.nome} className="campo" />
        </Campo>
        <Campo rotulo="CNPJ ou CPF">
          <input name="documento" defaultValue={usina.documento ?? ""} className="campo" />
        </Campo>
        <Campo rotulo="Prazo de vencimento (dias)" ajuda="Contados a partir do lançamento da conta.">
          <input name="dias_vencimento" type="number" min={1} max={60} defaultValue={usina.dias_vencimento} className="campo" />
        </Campo>
        <Campo rotulo="Chave PIX" className="sm:col-span-2">
          <input name="pix_chave" defaultValue={usina.pix_chave ?? ""} className="campo" />
        </Campo>
        <Campo rotulo="Favorecido do PIX" ajuda="Como aparece no banco. Até 25 letras.">
          <input name="pix_favorecido" maxLength={25} defaultValue={usina.pix_favorecido ?? ""} className="campo" />
        </Campo>
        <Campo rotulo="Cidade do PIX" ajuda="Até 15 letras.">
          <input name="pix_cidade" maxLength={15} defaultValue={usina.pix_cidade ?? ""} className="campo" />
        </Campo>
        <Campo rotulo="Instância do WhatsApp" ajuda="Nome da instância conectada na Evolution API. Sem ela, o envio automático fica desligado." className="sm:col-span-2">
          <input name="whatsapp_instancia" defaultValue={usina.whatsapp_instancia ?? ""} className="campo" />
        </Campo>
      </fieldset>
      {estado ? <Aviso tipo={estado.erro ? "erro" : "ok"}>{estado.erro ?? estado.ok}</Aviso> : null}
      {podeEditar ? (
        <Botao disabled={enviando}>{enviando ? "Salvando…" : "Salvar dados"}</Botao>
      ) : (
        <p className="text-sm text-nevoa">Só o dono da usina altera esses dados.</p>
      )}
    </form>
  );
}

export function Equipe({ membros, eu, dono }: { membros: { user_id: string; email: string | null; papel: string }[]; eu: string; dono: boolean }) {
  const [estado, acao, enviando] = useActionState<Estado, FormData>(convidarMembro, undefined);
  const [pendente, iniciar] = useTransition();
  return (
    <Cartao>
      <ul className="divide-y divide-traco">
        {membros.map((m) => (
          <li key={m.user_id} className="flex items-center justify-between gap-3 px-5 py-3">
            <span className="min-w-0">
              <span className="block truncate">{m.email ?? "Usuário"}{m.user_id === eu ? " (você)" : ""}</span>
              <span className="text-xs text-nevoa">{m.papel === "dono" ? "Dono" : "Operador"}</span>
            </span>
            {dono && m.user_id !== eu ? (
              <button disabled={pendente} onClick={() => iniciar(() => removerMembro(m.user_id))} className="text-sm text-nevoa hover:text-erro">
                Remover
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {dono ? (
        <form action={acao} className="space-y-3 border-t border-traco p-5">
          <Campo rotulo="Convidar operador" ajuda="A pessoa recebe um e-mail para criar a senha. Operadores lançam contas e emitem faturas.">
            <div className="flex gap-2">
              <input name="email" type="email" required placeholder="email@exemplo.com" className="campo" />
              <Botao variante="secundario" disabled={enviando} className="shrink-0">
                Convidar
              </Botao>
            </div>
          </Campo>
          {estado ? <Aviso tipo={estado.erro ? "erro" : "ok"}>{estado.erro ?? estado.ok}</Aviso> : null}
        </form>
      ) : null}
    </Cartao>
  );
}

function Copiavel({ rotulo, valor }: { rotulo: string; valor: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div>
      <p className="mb-1.5 text-sm text-nevoa">{rotulo}</p>
      <div className="flex gap-2">
        <code className="campo block min-w-0 flex-1 truncate font-mono text-sm">{valor}</code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(valor);
            setOk(true);
            setTimeout(() => setOk(false), 1500);
          }}
          className="shrink-0 rounded-[var(--radius-campo)] border border-traco px-3 text-sm text-nevoa hover:text-texto"
        >
          {ok ? "Copiado" : <Copy size={16} aria-label="Copiar" />}
        </button>
      </div>
    </div>
  );
}

export function FormAsaas(p: { usina: Usina; chaveConfigurada: boolean; webhookUrl: string; webhookToken: string | null }) {
  const [estado, acao, enviando] = useActionState<Estado, FormData>(salvarAsaas, undefined);
  return (
    <form action={acao} className="space-y-5">
      <p className="text-sm leading-relaxed text-nevoa">
        Com o Asaas ligado, cada fatura emitida vira uma cobrança com PIX dinâmico. Quando o cliente paga, a fatura muda para paga sozinha e a taxa do Asaas entra no financeiro.
      </p>
      <label className="flex items-center gap-3">
        <input type="checkbox" name="asaas_ativo" defaultChecked={p.usina.asaas_ativo} className="h-4 w-4 accent-[var(--color-sol)]" />
        <span>Cobrar pelo Asaas</span>
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <Campo rotulo="Ambiente" ajuda="Teste no sandbox antes de ir para produção.">
          <select name="asaas_ambiente" defaultValue={p.usina.asaas_ambiente} className="campo">
            <option value="sandbox">Sandbox (teste)</option>
            <option value="producao">Produção</option>
          </select>
        </Campo>
        <Campo rotulo="Forma de pagamento">
          <select name="asaas_forma" defaultValue={p.usina.asaas_forma} className="campo">
            <option value="PIX">Só PIX</option>
            <option value="UNDEFINED">Cliente escolhe (PIX, boleto ou cartão)</option>
          </select>
        </Campo>
        <Campo
          rotulo="Chave de API"
          className="sm:col-span-2"
          ajuda={p.chaveConfigurada ? "Já configurada. Cole uma nova só se quiser trocar." : "No Asaas: Integrações > Chave de API. Ela é guardada só no servidor."}
        >
          <input name="asaas_api_key" type="password" autoComplete="off" placeholder={p.chaveConfigurada ? "••••••••••••" : "$aact_..."} className="campo" />
        </Campo>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="asaas_notificar" defaultChecked={p.usina.asaas_notificar} className="mt-0.5 h-4 w-4 accent-[var(--color-sol)]" />
        <span>
          O Asaas avisa o cliente (e-mail e SMS ao criar a cobrança, no vencimento e em atraso)
          <span className="block text-xs text-nevoa">O Asaas cobra por notificação enviada. Com isso ligado, o app não manda lembretes próprios no WhatsApp.</span>
        </span>
      </label>

      {p.webhookToken ? (
        <div className="space-y-3 rounded-[var(--radius-campo)] border border-traco p-4">
          <p className="text-sm">
            Para a baixa automática, crie um webhook no Asaas (Integrações &gt; Webhooks) com os eventos de <b className="font-medium">cobrança</b>, usando:
          </p>
          <Copiavel rotulo="URL" valor={p.webhookUrl} />
          <Copiavel rotulo="Token de autenticação" valor={p.webhookToken} />
        </div>
      ) : null}

      {estado ? <Aviso tipo={estado.erro ? "erro" : "ok"}>{estado.erro ?? estado.ok}</Aviso> : null}
      <Botao disabled={enviando}>{enviando ? "Conectando…" : "Salvar e testar conexão"}</Botao>
    </form>
  );
}
