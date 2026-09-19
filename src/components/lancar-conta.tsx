"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { Camera, FileUp, Loader2, Check, Send } from "lucide-react";
import { emitirFatura, enviarWhatsapp } from "@/app/(app)/actions";
import { calcularFatura, MODOS, type ModoDesconto } from "@/lib/calculo";
import { brl, numero, parseNumeroBR, soDigitos } from "@/lib/format";
import type { LeituraConta } from "@/lib/leitor/tipos";
import { Aviso, Botao, Campo, Cartao, cx } from "./ui";

type Cliente = { id: string; nome: string; uc: string; whatsapp: string | null; modo_desconto: ModoDesconto; desconto_valor: number };
type Resposta = { contaId: string; leitura: LeituraConta | null; aviso: string; clienteId: string | null; arquivoUrl: string | null; arquivoTipo: string };

const LIMITE_PDF = 4 * 1024 * 1024; // limite de corpo da Vercel ~4,5 MB

/** Reduz a foto para no máximo 2200px em JPEG: legível para a leitura e leve para enviar */
async function prepararArquivo(f: File): Promise<File> {
  if (f.type === "application/pdf") {
    if (f.size > LIMITE_PDF) throw new Error("PDF acima de 4 MB. Envie uma foto da conta ou um PDF menor.");
    return f;
  }
  const img = await createImageBitmap(f);
  const escala = Math.min(1, 2200 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.86));
  if (!blob) throw new Error("Não foi possível processar a foto.");
  return new File([blob], "conta.jpg", { type: "image/jpeg" });
}

const txt = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

export function LancarConta(p: { clientes: Cliente[]; clienteInicial: string | null; vencimentoPadrao: string; whatsappConfigurado: boolean }) {
  const [etapa, setEtapa] = useState<"enviar" | "lendo" | "conferir" | "emitida">("enviar");
  const [erro, setErro] = useState<string | null>(null);
  const [resp, setResp] = useState<Resposta | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [emitida, setEmitida] = useState<string | null>(null);
  const [envio, setEnvio] = useState<{ erro?: string; ok?: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const camera = useRef<HTMLInputElement>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  const [f, setF] = useState({
    clienteId: p.clienteInicial ?? "",
    uc: "",
    referencia: "",
    consumoKwh: "",
    compensadaKwh: "",
    tarifa: "",
    valorConta: "",
    vencimento: p.vencimentoPadrao,
    confirmado: false,
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((a) => ({ ...a, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  const cliente = p.clientes.find((c) => c.id === f.clienteId);
  const duvidoso = (campo: string) => !!resp?.leitura?.duvidosos.includes(campo);

  const calculo = useMemo(() => {
    if (!cliente) return null;
    const compensadaKwh = parseNumeroBR(f.compensadaKwh);
    const tarifa = parseNumeroBR(f.tarifa);
    if (!compensadaKwh || !tarifa) return null;
    try {
      return calcularFatura({
        modo: cliente.modo_desconto,
        descontoValor: cliente.desconto_valor,
        compensadaKwh,
        tarifa,
        valorContaCentavos: Math.round((parseNumeroBR(f.valorConta) ?? 0) * 100),
      });
    } catch (e) {
      return { erro: (e as Error).message };
    }
  }, [cliente, f.compensadaKwh, f.tarifa, f.valorConta]);

  async function enviar(file: File | undefined) {
    if (!file) return;
    setErro(null);
    setEtapa("lendo");
    try {
      const pronto = await prepararArquivo(file);
      setPrevia(pronto.type.startsWith("image/") ? URL.createObjectURL(pronto) : null);
      const form = new FormData();
      form.append("arquivo", pronto);
      const r = await fetch("/api/contas/leitura", { method: "POST", body: form });
      const json = await r.json();
      if (!r.ok) throw new Error(json.erro || "Falha ao enviar a conta.");
      const d = json as Resposta;
      const l = d.leitura;
      setResp(d);
      setF((a) => ({
        ...a,
        clienteId: d.clienteId ?? a.clienteId,
        uc: l?.uc ?? "",
        referencia: l?.referencia ?? "",
        consumoKwh: txt(l?.consumo_kwh),
        compensadaKwh: txt(l?.compensada_kwh),
        tarifa: txt(l?.tarifa),
        valorConta: txt(l?.valor_conta),
      }));
      setEtapa("conferir");
    } catch (e) {
      setErro((e as Error).message);
      setEtapa("enviar");
    }
  }

  function emitir() {
    if (!resp) return;
    setErro(null);
    iniciar(async () => {
      const r = await emitirFatura({ ...f, contaId: resp.contaId });
      if (r.erro) setErro(r.erro);
      else {
        setEmitida(r.id!);
        setEtapa("emitida");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  function mandarWhatsapp() {
    if (!emitida) return;
    iniciar(async () => setEnvio(await enviarWhatsapp(emitida)));
  }

  function recomecar() {
    setEtapa("enviar");
    setResp(null);
    setPrevia(null);
    setEmitida(null);
    setEnvio(null);
    setErro(null);
    setF({ clienteId: "", uc: "", referencia: "", consumoKwh: "", compensadaKwh: "", tarifa: "", valorConta: "", vencimento: p.vencimentoPadrao, confirmado: false });
  }

  // ------------------------------------------------------------ etapas

  if (etapa === "enviar" || etapa === "lendo") {
    return (
      <Cartao className="p-6 sm:p-8">
        {etapa === "lendo" ? (
          <div className="flex flex-col items-center py-10 text-center" aria-live="polite">
            <Loader2 className="animate-spin text-sol" size={34} />
            <p className="mt-4 font-medium">Lendo a conta…</p>
            <p className="mt-1 text-sm text-nevoa">Isso leva alguns segundos.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => camera.current?.click()}
              className="flex flex-col items-center gap-3 rounded-[var(--radius-cartao)] border border-sol/60 bg-sol/5 px-6 py-10 text-center hover:bg-sol/10"
            >
              <Camera size={30} className="text-sol" />
              <span className="font-semibold">Fotografar a conta</span>
              <span className="text-sm text-nevoa">Conta inteira no enquadramento, sem reflexo.</span>
            </button>
            <button
              type="button"
              onClick={() => arquivo.current?.click()}
              className="flex flex-col items-center gap-3 rounded-[var(--radius-cartao)] border border-traco px-6 py-10 text-center hover:border-nevoa"
            >
              <FileUp size={30} className="text-nevoa" />
              <span className="font-semibold">Escolher arquivo</span>
              <span className="text-sm text-nevoa">Foto ou PDF da conta.</span>
            </button>
            <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => enviar(e.target.files?.[0])} />
            <input ref={arquivo} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden onChange={(e) => enviar(e.target.files?.[0])} />
          </div>
        )}
        {erro ? <div className="mt-4"><Aviso tipo="erro">{erro}</Aviso></div> : null}
      </Cartao>
    );
  }

  if (etapa === "emitida" && emitida) {
    return (
      <Cartao className="p-6 text-center sm:p-10">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-economia/15 text-economia">
          <Check size={24} />
        </span>
        <p className="mt-4 text-xl font-semibold">Fatura emitida</p>
        <p className="mt-1 text-sm text-nevoa">
          {cliente?.nome} · {calculo && !("erro" in calculo) ? brl(calculo.totalCentavos) : ""}
        </p>
        <div className="mx-auto mt-6 flex max-w-md flex-col gap-2.5">
          {p.whatsappConfigurado && cliente?.whatsapp && !envio?.ok ? (
            <Botao onClick={mandarWhatsapp} disabled={pendente}>
              {pendente ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />} Enviar no WhatsApp
            </Botao>
          ) : null}
          {envio ? <Aviso tipo={envio.erro ? "erro" : "ok"}>{envio.erro ?? envio.ok}</Aviso> : null}
          <Link href={`/faturas/${emitida}`} className="rounded-[var(--radius-campo)] border border-traco px-4 py-2.5 hover:border-nevoa">
            Ver fatura
          </Link>
          <Botao variante="fantasma" onClick={recomecar}>
            Lançar outra conta
          </Botao>
        </div>
      </Cartao>
    );
  }

  // conferir
  const leitura = resp?.leitura;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="lg:sticky lg:top-6 lg:self-start">
        <Cartao className="overflow-hidden">
          {previa ? (
            <a href={previa} target="_blank" rel="noreferrer" title="Abrir em tamanho real">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previa} alt="Conta enviada" className="max-h-[70vh] w-full object-contain bg-white" />
            </a>
          ) : resp?.arquivoUrl ? (
            <iframe src={resp.arquivoUrl} title="Conta enviada" className="h-[70vh] w-full bg-white" />
          ) : null}
        </Cartao>
        {leitura?.observacoes ? <p className="mt-3 text-sm text-alerta">{leitura.observacoes}</p> : null}
      </div>

      <div className="space-y-5">
        {resp ? <Aviso tipo={leitura?.duvidosos.length ? "info" : "ok"}>{resp.aviso}</Aviso> : null}

        <Cartao className="space-y-4 p-5">
          <Campo rotulo="Cliente">
            <select value={f.clienteId} onChange={set("clienteId")} className="campo">
              <option value="">Selecione…</option>
              {p.clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} · UC {c.uc}
                </option>
              ))}
            </select>
          </Campo>
          {leitura?.uc && !resp?.clienteId ? (
            <p className="text-sm text-alerta">Nenhum cliente com a UC {leitura.uc}. Selecione o cliente ou cadastre essa UC.</p>
          ) : null}
          {cliente && f.uc && soDigitos(f.uc) !== cliente.uc ? (
            <p className="text-sm text-erro">A UC da conta não é a desse cliente ({cliente.uc}).</p>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <Campo rotulo="UC na conta">
              <input value={f.uc} onChange={set("uc")} inputMode="numeric" className={cx("campo", duvidoso("uc") && "duvidoso")} />
            </Campo>
            <Campo rotulo="Mês de referência">
              <input type="month" value={f.referencia} onChange={set("referencia")} className={cx("campo", duvidoso("referencia") && "duvidoso")} />
            </Campo>
            <Campo rotulo="Consumo (kWh)">
              <input value={f.consumoKwh} onChange={set("consumoKwh")} inputMode="decimal" className={cx("campo", duvidoso("consumo_kwh") && "duvidoso")} />
            </Campo>
            <Campo rotulo="Energia compensada (kWh)">
              <input value={f.compensadaKwh} onChange={set("compensadaKwh")} inputMode="decimal" className={cx("campo", duvidoso("compensada_kwh") && "duvidoso")} />
            </Campo>
            <Campo rotulo="Tarifa com tributos (R$/kWh)">
              <input value={f.tarifa} onChange={set("tarifa")} inputMode="decimal" className={cx("campo", duvidoso("tarifa") && "duvidoso")} />
            </Campo>
            <Campo rotulo="Total da conta (R$)">
              <input value={f.valorConta} onChange={set("valorConta")} inputMode="decimal" className={cx("campo", duvidoso("valor_conta") && "duvidoso")} />
            </Campo>
          </div>
          {leitura?.duvidosos.length ? <p className="text-xs text-alerta">Campos em laranja: leitura incerta ou ausente. Confira na imagem.</p> : null}
        </Cartao>

        <Cartao className="p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-medium">Fatura da usina</p>
            {cliente ? (
              <p className="text-xs text-nevoa">
                {MODOS[cliente.modo_desconto].rotulo}: {cliente.modo_desconto === "tarifa_fixa" ? `R$ ${numero(cliente.desconto_valor, 4)}/kWh` : `${numero(cliente.desconto_valor)}%`}
              </p>
            ) : null}
          </div>
          {!cliente ? (
            <p className="mt-2 text-sm text-nevoa">Selecione o cliente para ver o cálculo.</p>
          ) : !calculo ? (
            <p className="mt-2 text-sm text-nevoa">Preencha energia compensada e tarifa.</p>
          ) : "erro" in calculo ? (
            <p className="mt-2 text-sm text-erro">{calculo.erro}</p>
          ) : (
            <div className="mt-3">
              <p className="text-sm text-nevoa line-through">Sem a usina: {brl(calculo.semUsinaCentavos)}</p>
              <p className="text-[34px] font-semibold leading-tight tracking-tight">{brl(calculo.totalCentavos)}</p>
              <p className="text-sm text-economia">Economia do cliente: {brl(calculo.economiaCentavos)}</p>
            </div>
          )}
          <Campo rotulo="Vencimento da fatura" className="mt-4 max-w-52">
            <input type="date" value={f.vencimento} onChange={set("vencimento")} className="campo" />
          </Campo>
        </Cartao>

        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={f.confirmado} onChange={set("confirmado")} className="mt-0.5 h-4 w-4 accent-[var(--color-sol)]" />
          Conferi os valores com a conta original.
        </label>

        {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Botao onClick={emitir} disabled={pendente || !f.confirmado || !calculo || "erro" in calculo} className="sm:flex-1">
            {pendente ? <Loader2 size={17} className="animate-spin" /> : null} Emitir fatura
          </Botao>
          <Botao variante="secundario" onClick={recomecar} disabled={pendente}>
            Trocar foto
          </Botao>
        </div>
      </div>
    </div>
  );
}
