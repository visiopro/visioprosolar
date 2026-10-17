"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Camera, FileUp, Loader2, Check, Send } from "lucide-react";
import { emitirFatura, enviarWhatsapp } from "@/app/(app)/actions";
import { calcularFatura, descreverRegra, usaCompensada, type ModoDesconto } from "@/lib/calculo";
import { brl, parseNumeroBR } from "@/lib/format";
import { normalizarUC, type LeituraConta } from "@/lib/leitor/tipos";
import { cipDaTabela, type ClasseCip, type FaixaCip } from "@/lib/cip";
import { conferirVariacao, type HistoricoCliente } from "@/lib/conferencia";
import { Aviso, Botao, Campo, Cartao, cx } from "./ui";

type Cliente = { id: string; nome: string; uc: string; whatsapp: string | null; modo_desconto: ModoDesconto; desconto_valor: number; cip_modo: "da_conta" | "percentual" | "fixo" | "tabela"; cip_valor: number; cip_tabela_id: string | null; cip_classe: ClasseCip | null };
export type Resposta = { contaId: string; leitura: LeituraConta | null; aviso: string; clienteId: string | null; arquivoUrl: string | null; arquivoTipo: string };

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

export function LancarConta(p: { clientes: Cliente[]; clienteInicial: string | null; vencimentoPadrao: string; whatsappConfigurado: boolean; bandeiraPadrao: number; faixasCip: (FaixaCip & { tabela_id: string })[]; historico: HistoricoCliente[]; contaInicial?: Resposta | null }) {
  const [etapa, setEtapa] = useState<"enviar" | "lendo" | "conferir" | "emitida">(p.contaInicial ? "conferir" : "enviar");
  const [erro, setErro] = useState<string | null>(null);
  const [resp, setResp] = useState<Resposta | null>(p.contaInicial ?? null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [emitida, setEmitida] = useState<string | null>(null);
  const [envio, setEnvio] = useState<{ erro?: string; ok?: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const camera = useRef<HTMLInputElement>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  const inicial = p.contaInicial?.leitura;
  const [f, setF] = useState({
    clienteId: p.contaInicial?.clienteId ?? p.clienteInicial ?? "",
    uc: inicial?.uc ?? "", referencia: inicial?.referencia ?? "",
    consumoKwh: txt(inicial?.consumo_kwh), compensadaKwh: txt(inicial?.compensada_kwh),
    tarifa: txt(inicial?.tarifa),
    bandeira: inicial?.bandeira ? txt(inicial.bandeira) : inicial?.consumo_kwh && p.bandeiraPadrao ? txt(Math.round(inicial.consumo_kwh * p.bandeiraPadrao * 100) / 100) : "",
    iluminacao: txt(inicial?.iluminacao_publica), valorConta: txt(inicial?.valor_conta),
    semUsinaAjustado: "", vencimentoConta: inicial?.vencimento_conta ?? "",
    vencimento: p.vencimentoPadrao, confirmado: false,
  });
  const [avisoEmissao, setAvisoEmissao] = useState<string | null>(null);
  const [enviadaAuto, setEnviadaAuto] = useState(false);
  const [ajustando, setAjustando] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((a) => ({ ...a, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  const cliente = p.clientes.find((c) => c.id === f.clienteId);
  const duvidoso = (campo: string) => !!resp?.leitura?.duvidosos.includes(campo);

  const modo: ModoDesconto = cliente?.modo_desconto ?? "percentual_conta_cheia";
  const contaCheia = modo === "percentual_conta_cheia";
  const centavos = (v: string) => Math.round((parseNumeroBR(v) ?? 0) * 100);

  // Iluminação pública pela regra do cliente (a conta em nome da usina traz só o mínimo fixo)
  const [cipManual, setCipManual] = useState(false);
  const energiaReais = (parseNumeroBR(f.consumoKwh) ?? 0) * (parseNumeroBR(f.tarifa) ?? 0);
  const cipSugerida = !cliente || cliente.cip_modo === "da_conta"
    ? null
    : cliente.cip_modo === "percentual"
      ? Math.round(energiaReais * cliente.cip_valor) / 100
      : cliente.cip_modo === "fixo"
        ? cliente.cip_valor
        : cliente.cip_tabela_id && cliente.cip_classe
          ? cipDaTabela(
              p.faixasCip.filter((x) => x.tabela_id === cliente.cip_tabela_id),
              cliente.cip_classe,
              parseNumeroBR(f.consumoKwh) ?? 0,
              energiaReais,
            )
          : null;
  useEffect(() => {
    if (cipSugerida === null || cipManual || !cipSugerida) return;
    const atual = parseNumeroBR(f.iluminacao) ?? 0;
    if (Math.abs(atual - cipSugerida) < 0.005) return;
    setF((a) => ({ ...a, iluminacao: String(cipSugerida.toFixed(2)).replace(".", ",") }));
  }, [cipSugerida, cipManual, f.iluminacao]);

  const alertas = useMemo(() => {
    if (!cliente) return [];
    return conferirVariacao({
      historico: p.historico.find((h) => h.cliente_id === cliente.id) ?? null,
      referencia: f.referencia,
      consumoKwh: parseNumeroBR(f.consumoKwh),
      tarifa: parseNumeroBR(f.tarifa),
      totalCentavos: null,
    });
  }, [cliente, f.referencia, f.consumoKwh, f.tarifa, p.historico]);
  const bloqueado = alertas.some((a) => a.campo === "referencia" && a.grave);

  const calculo = useMemo(() => {
    if (!cliente) return null;
    try {
      return calcularFatura({
        modo: cliente.modo_desconto,
        descontoValor: cliente.desconto_valor,
        tarifa: parseNumeroBR(f.tarifa) ?? 0,
        consumoKwh: parseNumeroBR(f.consumoKwh) ?? 0,
        compensadaKwh: parseNumeroBR(f.compensadaKwh) ?? 0,
        valorContaCentavos: centavos(f.valorConta),
        bandeiraCentavos: centavos(f.bandeira),
        iluminacaoCentavos: centavos(f.iluminacao),
        semUsinaAjustadoCentavos: ajustando && f.semUsinaAjustado.trim() ? centavos(f.semUsinaAjustado) : null,
      });
    } catch (e) {
      return { erro: (e as Error).message };
    }
  }, [cliente, f, ajustando]);

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
        // conta sem linha de bandeira: usa a tarifa padrão da usina sobre o consumo real
        bandeira: l?.bandeira ? txt(l.bandeira) : l?.consumo_kwh && p.bandeiraPadrao ? txt(Math.round(l.consumo_kwh * p.bandeiraPadrao * 100) / 100) : "",
        iluminacao: txt(l?.iluminacao_publica),
        valorConta: txt(l?.valor_conta),
        semUsinaAjustado: "",
        vencimentoConta: l?.vencimento_conta ?? "",
      }));
      setAjustando(false);
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
      const r = await emitirFatura({ ...f, semUsinaAjustado: ajustando ? f.semUsinaAjustado : "", contaId: resp.contaId });
      if (r.erro) setErro(r.erro);
      else {
        setAvisoEmissao(r.aviso ?? null);
        setEnviadaAuto(!!r.enviada);
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
    setAjustando(false);
    setCipManual(false);
    setF({ clienteId: "", uc: "", referencia: "", consumoKwh: "", compensadaKwh: "", tarifa: "", bandeira: "", iluminacao: "", valorConta: "", semUsinaAjustado: "", vencimentoConta: "", vencimento: p.vencimentoPadrao, confirmado: false });
    setAvisoEmissao(null);
    setEnviadaAuto(false);
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        {avisoEmissao ? <div className="mx-auto mt-3 max-w-md text-left"><Aviso tipo="erro">{avisoEmissao}</Aviso></div> : null}
        <p className="mt-1 text-sm text-nevoa">
          {cliente?.nome} · {calculo && !("erro" in calculo) ? brl(calculo.totalCentavos) : ""}
        </p>
        <div className="mx-auto mt-6 flex max-w-md flex-col gap-2.5">
          {enviadaAuto ? <Aviso tipo="ok">Enviada no WhatsApp do cliente.</Aviso> : null}
          {p.whatsappConfigurado && cliente?.whatsapp && !envio?.ok && !enviadaAuto ? (
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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="lg:sticky lg:top-6 lg:self-start">
        {resp?.arquivoUrl ? <a href={resp.arquivoUrl} target="_blank" rel="noreferrer" className="mb-3 block text-sm text-sol underline">Abrir original em outra aba (inclusive PDF com senha)</a> : null}
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
          {cliente && f.uc && normalizarUC(f.uc) !== normalizarUC(cliente.uc) ? (
            <p className="text-sm text-erro">A UC da conta não é a desse cliente ({cliente.uc}).</p>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <Campo rotulo="UC na conta">
              <input value={f.uc} onChange={set("uc")} inputMode="numeric" className={cx("campo", duvidoso("uc") && "duvidoso")} />
            </Campo>
            <Campo rotulo="Mês de referência">
              <input type="month" value={f.referencia} onChange={set("referencia")} className={cx("campo", duvidoso("referencia") && "duvidoso")} />
            </Campo>
            <Campo rotulo="Consumo do mês (kWh)">
              <input value={f.consumoKwh} onChange={set("consumoKwh")} inputMode="decimal" className={cx("campo", duvidoso("consumo_kwh") && "duvidoso")} />
            </Campo>
            {usaCompensada(modo) ? (
              <Campo rotulo="Energia compensada (kWh)">
                <input value={f.compensadaKwh} onChange={set("compensadaKwh")} inputMode="decimal" className={cx("campo", duvidoso("compensada_kwh") && "duvidoso")} />
              </Campo>
            ) : (
              <Campo rotulo="Tarifa TUSD + TE (R$/kWh)">
                <input value={f.tarifa} onChange={set("tarifa")} inputMode="decimal" className={cx("campo", duvidoso("tarifa") && "duvidoso")} />
              </Campo>
            )}
            {usaCompensada(modo) ? (
              <Campo rotulo="Tarifa TUSD + TE (R$/kWh)">
                <input value={f.tarifa} onChange={set("tarifa")} inputMode="decimal" className={cx("campo", duvidoso("tarifa") && "duvidoso")} />
              </Campo>
            ) : (
              <>
                <Campo rotulo="Bandeira tarifária (R$)">
                  <input value={f.bandeira} onChange={set("bandeira")} inputMode="decimal" placeholder="0,00" className={cx("campo", duvidoso("bandeira") && "duvidoso")} />
                </Campo>
                <Campo
                  rotulo="Iluminação pública (R$)"
                  ajuda={
                    cipSugerida !== null && !cipManual
                      ? cliente?.cip_modo === "percentual"
                        ? `${cliente.cip_valor}% sobre a energia, pela regra do cliente`
                        : cliente?.cip_modo === "tabela"
                          ? "pela tabela do município, na faixa deste consumo"
                          : "valor fixo cadastrado no cliente"
                      : undefined
                  }
                >
                  <input
                    value={f.iluminacao}
                    onChange={(e) => {
                      setCipManual(true);
                      set("iluminacao")(e);
                    }}
                    inputMode="decimal"
                    placeholder="0,00"
                    className={cx("campo", duvidoso("iluminacao_publica") && !cipSugerida && "duvidoso")}
                  />
                </Campo>
              </>
            )}
            <Campo
              rotulo={contaCheia ? "Conta que chegou (R$)" : "Total da conta (R$)"}
              ajuda={contaCheia ? "Valor pago pela usina. Não aparece para o cliente." : undefined}
            >
              <input value={f.valorConta} onChange={set("valorConta")} inputMode="decimal" className={cx("campo", duvidoso("valor_conta") && "duvidoso")} />
            </Campo>
            {contaCheia ? (
              <Campo rotulo="Vencimento da conta" ajuda="Entra em contas a pagar da usina.">
                <input type="date" value={f.vencimentoConta} onChange={set("vencimentoConta")} className="campo" />
              </Campo>
            ) : null}
          </div>
          {contaCheia && !leitura?.bandeira && parseNumeroBR(f.bandeira) ? (
            <p className="text-xs text-nevoa">Bandeira estimada pela tarifa padrão da usina, porque a conta não trouxe essa linha.</p>
          ) : null}
          {contaCheia && !leitura?.bandeira && !parseNumeroBR(f.bandeira) && !p.bandeiraPadrao ? (
            <p className="text-xs text-alerta">A conta não tem linha de bandeira. Cadastre a tarifa da bandeira em Ajustes ou informe o valor aqui.</p>
          ) : null}
          {alertas.length ? (
            <ul className="space-y-1.5">
              {alertas.map((a, i) => (
                <li key={i} className={cx("flex gap-2 text-xs", a.grave ? "text-erro" : "text-alerta")}>
                  <span aria-hidden="true">•</span> {a.texto}
                </li>
              ))}
            </ul>
          ) : null}
          {leitura?.duvidosos.length ? <p className="text-xs text-alerta">Campos em laranja: leitura incerta ou ausente. Confira na imagem.</p> : null}
        </Cartao>

        <Cartao className="p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-medium">Fatura do cliente</p>
            {cliente ? <p className="text-xs text-nevoa">{descreverRegra(cliente.modo_desconto, cliente.desconto_valor)}</p> : null}
          </div>
          {!cliente ? (
            <p className="mt-2 text-sm text-nevoa">Selecione o cliente para ver o cálculo.</p>
          ) : !calculo || "erro" in calculo ? (
            <>
              <p className={cx("mt-2 text-sm", calculo ? "text-erro" : "text-nevoa")}>{calculo && "erro" in calculo ? calculo.erro : "Preencha os campos da conta."}</p>
              {calculo && "erro" in calculo && usaCompensada(modo) && !parseNumeroBR(f.compensadaKwh) ? (
                <p className="mt-2 text-sm text-nevoa">
                  Se a conta está no nome da usina,{" "}
                  <Link href={`/clientes/${cliente.id}`} className="text-sol hover:underline">
                    mude a regra desse cliente para “% sobre a conta cheia”
                  </Link>
                  .
                </p>
              ) : null}
            </>
          ) : (
            <div className="mt-3">
              {contaCheia ? (
                <dl className="mb-3 space-y-1.5 border-b border-traco pb-3 text-sm">
                  {!ajustando ? (
                    <>
                      <div className="flex justify-between"><dt className="text-nevoa">Energia (consumo × tarifa)</dt><dd>{brl(calculo.energiaCentavos)}</dd></div>
                      <div className="flex justify-between"><dt className="text-nevoa">Bandeira tarifária</dt><dd>{brl(centavos(f.bandeira))}</dd></div>
                      <div className="flex justify-between"><dt className="text-nevoa">Iluminação pública</dt><dd>{brl(centavos(f.iluminacao))}</dd></div>
                    </>
                  ) : null}
                  <div className="flex items-center justify-between gap-3">
                    <dt>Conta sem a usina</dt>
                    <dd className="font-medium">{brl(calculo.semUsinaCentavos)}</dd>
                  </div>
                  {ajustando ? (
                    <Campo rotulo="Valor da conta sem a usina (R$)" ajuda="Use quando o cálculo não bater com a realidade do cliente. Fica registrado na fatura.">
                      <input value={f.semUsinaAjustado} onChange={set("semUsinaAjustado")} inputMode="decimal" autoFocus className="campo" />
                    </Campo>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setAjustando((v) => !v);
                      setF((a) => ({ ...a, semUsinaAjustado: ajustando ? "" : (calculo.semUsinaCentavos / 100).toFixed(2).replace(".", ",") }));
                    }}
                    className="text-xs text-sol hover:underline"
                  >
                    {ajustando ? "Voltar ao cálculo automático" : "Ajustar valor manualmente"}
                  </button>
                </dl>
              ) : (
                <p className="text-sm text-nevoa line-through">Sem a usina: {brl(calculo.semUsinaCentavos)}</p>
              )}
              <p className="text-[34px] font-semibold leading-tight tracking-tight">{brl(calculo.totalCentavos)}</p>
              <p className="text-sm text-economia">Economia do cliente: {brl(calculo.economiaCentavos)}</p>
              {contaCheia && centavos(f.valorConta) > 0 ? (
                <p className="mt-3 rounded-[var(--radius-campo)] bg-relevo px-3 py-2 text-xs text-nevoa">
                  Só você vê: a usina recebe {brl(calculo.totalCentavos)} e pagou {brl(centavos(f.valorConta))} de conta. Resultado{" "}
                  <span className={calculo.totalCentavos - centavos(f.valorConta) >= 0 ? "text-economia" : "text-erro"}>
                    {brl(calculo.totalCentavos - centavos(f.valorConta))}
                  </span>
                  .
                </p>
              ) : null}
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
          <Botao onClick={emitir} disabled={pendente || bloqueado || !f.confirmado || !calculo || "erro" in calculo} className="sm:flex-1">
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
