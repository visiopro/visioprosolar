import { Document, Font, Image, Link, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { brl, data, mesExtenso, nFatura, numero } from "../format";
import { descreverRegra, type ModoDesconto } from "../calculo";
import { descreverEncargo, type EncargoAtraso } from "../encargos";

// Sem hifenização: o código PIX não pode ganhar hífens ao quebrar linha
Font.registerHyphenationCallback((palavra) => [palavra]);

export type DadosFaturaPdf = {
  logo?: Buffer | null; // PNG/JPEG da usina
  numero: number;
  referencia: string;
  vencimento: string;
  status: "pendente" | "paga" | "cancelada";
  modo_desconto: ModoDesconto;
  desconto_valor: number;
  compensada_kwh: number;
  consumo_kwh: number | null;
  bandeira_centavos: number;
  iluminacao_centavos: number;
  sem_usina_ajustado: boolean;
  tarifa: number;
  valor_conta_centavos: number;
  sem_usina_centavos: number;
  total_centavos: number;
  economia_centavos: number;
  encargos_detalhe?: EncargoAtraso[] | null; // multa e juros de faturas anteriores pagas com atraso
  regra_atraso?: { multa: number; juros: number } | null; // regra da usina, quando ativa
  economia_acumulada_centavos: number;
  pix_copia_cola: string | null;
  cobranca_link?: string | null;
  contato_whatsapp?: string | null; // WhatsApp de atendimento da usina (55 + DDD + número)
  portal_url?: string | null;       // portal do cliente
  conta_anexa?: boolean;
  recebedor?: { nome: string; documento: string | null } | null; // quem aparece no banco ao pagar o PIX            // conta da distribuidora vai nas páginas seguintes, marcada "NÃO PAGAR"
  snapshot: {
    cliente: { nome: string; documento: string | null; uc: string; distribuidora: string };
    usina: { nome: string; documento: string | null; pix_favorecido: string | null; logo_path?: string | null };
  };
};

const NAVY = "#0B1A30";
const OURO = "#D97706";
const TINTA = "#0F172A";
const CINZA = "#475569";
const CINZA_CLARO = "#64748B";
const LINHA = "#CBD5E1";
const VERDE = "#15803D";
const FUNDO_VERDE = "#ECFDF5";
const FUNDO_BLOCO = "#F8FAFC";

const s = StyleSheet.create({
  pagina: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: TINTA,
    paddingBottom: 54,
    backgroundColor: "#FFFFFF",
  },
  topo: {
    backgroundColor: NAVY,
    paddingHorizontal: 36,
    paddingTop: 18,
    paddingBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  usina: {
    color: "#FFFFFF",
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
  },
  usinaDoc: {
    color: "#94A3B8",
    fontSize: 8.5,
    marginTop: 3,
  },
  logoCaixa: {
    backgroundColor: "#FFFFFF",
    borderRadius: 6,
    padding: 6,
    marginRight: 14,
    width: 110,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  selo: {
    alignItems: "flex-end",
  },
  seloTit: {
    color: "#FBBF24",
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
  },
  seloNum: {
    color: "#FFFFFF",
    fontSize: 17,
    fontFamily: "Helvetica-Bold",
    marginTop: 2,
  },
  seloRef: {
    color: "#94A3B8",
    fontSize: 9.5,
    marginTop: 2,
  },
  faixa: {
    height: 4,
    backgroundColor: OURO,
  },
  corpo: {
    paddingHorizontal: 36,
    paddingTop: 12,
  },

  // Card Cliente e Vencimento
  cardCliente: {
    borderWidth: 1,
    borderColor: LINHA,
    borderRadius: 6,
    backgroundColor: FUNDO_BLOCO,
    padding: 12,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  clienteRotulo: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: CINZA_CLARO,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  clienteNome: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    marginTop: 2,
  },
  clienteDetalhes: {
    fontSize: 9,
    color: CINZA,
    marginTop: 3,
  },
  vencimentoCaixa: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: "center",
    minWidth: 130,
  },
  vencimentoRotulo: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: CINZA_CLARO,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  vencimentoValor: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    marginTop: 2,
  },
  badgePaga: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: VERDE,
    marginTop: 3,
  },

  // Card Resumo Financeiro
  destaque: {
    borderWidth: 1,
    borderColor: LINHA,
    borderRadius: 6,
    flexDirection: "row",
    marginBottom: 10,
    overflow: "hidden",
  },
  destaqueLado: {
    flex: 1.2,
    padding: 12,
    backgroundColor: "#FFFFFF",
  },
  destaqueRotulo: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: CINZA_CLARO,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  total: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    marginTop: 2,
  },
  riscado: {
    fontSize: 10.5,
    color: CINZA_CLARO,
    textDecoration: "line-through",
    marginTop: 3,
  },
  economia: {
    backgroundColor: FUNDO_VERDE,
    borderLeftWidth: 1,
    borderLeftColor: "#A7F3D0",
    flex: 1,
    padding: 12,
  },
  economiaRotulo: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: VERDE,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  economiaValor: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: VERDE,
    marginTop: 2,
  },
  economiaAcumulada: {
    fontSize: 8.5,
    color: "#065F46",
    marginTop: 4,
  },

  // Tabela de Cálculo
  tabelaCard: {
    borderWidth: 1,
    borderColor: LINHA,
    borderRadius: 6,
    overflow: "hidden",
    marginBottom: 10,
  },
  tabelaCabecalho: {
    backgroundColor: NAVY,
    paddingVertical: 6,
    paddingHorizontal: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tabelaTitulo: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: "#FFFFFF",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  tabelaSub: {
    fontSize: 8,
    color: "#94A3B8",
  },
  linha: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: LINHA,
  },
  linhaPar: {
    backgroundColor: "#FFFFFF",
  },
  linhaImpar: {
    backgroundColor: FUNDO_BLOCO,
  },
  linhaDesconto: {
    backgroundColor: FUNDO_VERDE,
    borderBottomColor: "#A7F3D0",
  },
  linhaFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#F1F5F9",
  },
  itemTexto: {
    fontSize: 9.5,
    color: TINTA,
  },
  itemValor: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: TINTA,
  },
  descontoTexto: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: VERDE,
  },
  descontoValor: {
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
    color: VERDE,
  },
  totalTexto: {
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
  },
  totalValor: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
  },

  // PIX
  pix: {
    borderWidth: 1,
    borderColor: "#E5A93C",
    borderRadius: 6,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFDF5",
  },
  pixQr: {
    width: 96,
    height: 96,
    marginRight: 14,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  pixTitulo: {
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    fontSize: 11,
  },
  pixInstrucao: {
    fontSize: 8.5,
    color: CINZA,
    marginTop: 2,
  },
  pixFavorecido: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: TINTA,
    marginTop: 2,
  },
  pixOutras: {
    fontSize: 8.5,
    color: CINZA,
    marginTop: 3,
  },
  pixCaixaCodigo: {
    marginTop: 6,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 4,
    padding: 6,
  },
  pixCodigo: {
    fontFamily: "Courier",
    fontSize: 7,
    color: TINTA,
    lineHeight: 1.3,
  },

  // Informações importantes
  info: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: LINHA,
    borderRadius: 6,
  },
  infoTopo: {
    backgroundColor: FUNDO_BLOCO,
    borderBottomWidth: 1,
    borderBottomColor: LINHA,
    paddingHorizontal: 12,
    paddingVertical: 4,
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    color: NAVY,
    letterSpacing: 0.6,
  },
  infoColunas: { flexDirection: "row" },
  infoColuna: { flex: 1, paddingHorizontal: 10, paddingVertical: 7 },
  infoColunaMeio: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: "#E2E8F0" },
  infoTitulo: { fontFamily: "Helvetica-Bold", fontSize: 8.5, color: TINTA, marginBottom: 4 },
  infoItem: { flexDirection: "row", marginBottom: 2 },
  infoMarca: { width: 8, fontSize: 7.5, color: OURO, fontFamily: "Helvetica-Bold" },
  infoTexto: { flex: 1, fontSize: 7.5, color: CINZA, lineHeight: 1.35 },
  infoAtendimento: {
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingVertical: 4,
    fontSize: 7.5,
    color: CINZA,
  },

  // Rodapé
  rodape: {
    position: "absolute",
    bottom: 14,
    left: 36,
    right: 36,
    fontSize: 7.5,
    color: CINZA_CLARO,
    borderTopWidth: 1,
    borderTopColor: LINHA,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  marca: {
    position: "absolute",
    top: 310,
    left: 90,
    fontSize: 70,
    color: "#C0392B",
    opacity: 0.15,
    transform: "rotate(-25deg)",
    fontFamily: "Helvetica-Bold",
  },
});

function FaturaDoc({ f, qr }: { f: DadosFaturaPdf; qr: string | null }) {
  const { cliente, usina } = f.snapshot;
  const regra = descreverRegra(f.modo_desconto, f.desconto_valor);
  const ref = mesExtenso(f.referencia);

  return (
    <Document title={`Fatura ${nFatura(f.numero)} - ${usina.nome}`} author={usina.nome}>
      <Page size="A4" style={s.pagina}>
        <View style={s.topo}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {f.logo ? (
              <View style={s.logoCaixa}>
                <Image src={f.logo} style={{ maxWidth: 98, maxHeight: 42, objectFit: "contain" }} />
              </View>
            ) : null}
            <View>
              <Text style={s.usina}>{usina.nome}</Text>
              {usina.documento ? <Text style={s.usinaDoc}>CNPJ/CPF {usina.documento}</Text> : null}
            </View>
          </View>
          <View style={s.selo}>
            <Text style={s.seloTit}>FATURA DE ENERGIA SOLAR</Text>
            <Text style={s.seloNum}>Nº {nFatura(f.numero)}</Text>
            <Text style={s.seloRef}>{ref.charAt(0).toUpperCase() + ref.slice(1)}</Text>
          </View>
        </View>
        <View style={s.faixa} />

        {f.status === "cancelada" ? <Text style={s.marca}>CANCELADA</Text> : null}

        <View style={s.corpo}>
          {/* Card Cliente e Vencimento */}
          <View style={s.cardCliente}>
            <View style={{ flex: 1 }}>
              <Text style={s.clienteRotulo}>Unidade Consumidora / Cliente</Text>
              <Text style={s.clienteNome}>{cliente.nome}</Text>
              <Text style={s.clienteDetalhes}>
                UC {cliente.uc} · {cliente.distribuidora}
                {cliente.documento ? ` · ${cliente.documento}` : ""}
              </Text>
            </View>
            <View style={s.vencimentoCaixa}>
              <Text style={s.vencimentoRotulo}>Data de Vencimento</Text>
              <Text style={s.vencimentoValor}>{data(f.vencimento)}</Text>
              {f.status === "paga" ? <Text style={s.badgePaga}>Pagamento confirmado</Text> : null}
            </View>
          </View>

          {/* Destaque Financeiro */}
          <View style={s.destaque}>
            <View style={s.destaqueLado}>
              <Text style={s.destaqueRotulo}>Total a pagar</Text>
              <Text style={s.total}>{brl(f.total_centavos)}</Text>
              <Text style={s.riscado}>Sem a usina: {brl(f.sem_usina_centavos)}</Text>
            </View>
            <View style={s.economia}>
              <Text style={s.economiaRotulo}>Sua economia neste mês</Text>
              <Text style={s.economiaValor}>{brl(f.economia_centavos)}</Text>
              <Text style={s.economiaAcumulada}>
                Economia total acumulada: {brl(f.economia_acumulada_centavos)}
              </Text>
            </View>
          </View>

          {/* Tabela de Detalhamento do Cálculo */}
          <View style={s.tabelaCard}>
            <View style={s.tabelaCabecalho}>
              <Text style={s.tabelaTitulo}>Detalhamento do Cálculo</Text>
              <Text style={s.tabelaSub}>Referência: {ref}</Text>
            </View>

            {f.modo_desconto === "percentual_conta_cheia" ? (
              f.sem_usina_ajustado ? (
                <View style={[s.linha, s.linhaPar]}>
                  <Text style={s.itemTexto}>Sua conta de energia no mês ({numero(f.consumo_kwh ?? 0)} kWh)</Text>
                  <Text style={s.itemValor}>{brl(f.sem_usina_centavos)}</Text>
                </View>
              ) : (
                <>
                  <View style={[s.linha, s.linhaPar]}>
                    <Text style={s.itemTexto}>Consumo do mês</Text>
                    <Text style={s.itemValor}>{numero(f.consumo_kwh ?? 0)} kWh</Text>
                  </View>
                  <View style={[s.linha, s.linhaImpar]}>
                    <Text style={s.itemTexto}>Tarifa da distribuidora (com tributos)</Text>
                    <Text style={s.itemValor}>R$ {numero(f.tarifa, 8)}/kWh</Text>
                  </View>
                  <View style={[s.linha, s.linhaPar]}>
                    <Text style={s.itemTexto}>Energia (consumo × tarifa)</Text>
                    <Text style={s.itemValor}>{brl(f.sem_usina_centavos - f.bandeira_centavos - f.iluminacao_centavos)}</Text>
                  </View>
                  {f.bandeira_centavos > 0 ? (
                    <View style={[s.linha, s.linhaImpar]}>
                      <Text style={s.itemTexto}>Bandeira tarifária</Text>
                      <Text style={s.itemValor}>{brl(f.bandeira_centavos)}</Text>
                    </View>
                  ) : null}
                  {f.iluminacao_centavos > 0 ? (
                    <View style={[s.linha, s.linhaPar]}>
                      <Text style={s.itemTexto}>Iluminação pública</Text>
                      <Text style={s.itemValor}>{brl(f.iluminacao_centavos)}</Text>
                    </View>
                  ) : null}
                  <View style={[s.linha, s.linhaImpar]}>
                    <Text style={[s.itemTexto, { fontFamily: "Helvetica-Bold" }]}>Sua conta de energia sem a usina</Text>
                    <Text style={[s.itemValor, { fontFamily: "Helvetica-Bold" }]}>{brl(f.sem_usina_centavos)}</Text>
                  </View>
                </>
              )
            ) : (
              <>
                <View style={[s.linha, s.linhaPar]}>
                  <Text style={s.itemTexto}>Energia recebida da usina</Text>
                  <Text style={s.itemValor}>{numero(f.compensada_kwh)} kWh</Text>
                </View>
                <View style={[s.linha, s.linhaImpar]}>
                  <Text style={s.itemTexto}>Tarifa da distribuidora (com tributos)</Text>
                  <Text style={s.itemValor}>R$ {numero(f.tarifa, 8)}/kWh</Text>
                </View>
                <View style={[s.linha, s.linhaPar]}>
                  <Text style={s.itemTexto}>Valor dessa energia sem a usina</Text>
                  <Text style={s.itemValor}>{brl(f.sem_usina_centavos)}</Text>
                </View>
              </>
            )}

            {/* Linha de Economia */}
            <View style={[s.linha, s.linhaDesconto]}>
              <Text style={s.descontoTexto}>{regra}</Text>
              <Text style={s.descontoValor}>- {brl(f.economia_centavos)}</Text>
            </View>

            {(f.encargos_detalhe ?? []).map((e) => (
              <View key={e.fatura_id} style={[s.linha, s.linhaImpar]}>
                <Text style={s.itemTexto}>{descreverEncargo(e)}</Text>
                <Text style={s.itemValor}>{brl(e.multa_centavos + e.juros_centavos)}</Text>
              </View>
            ))}

            {/* Total Final */}
            <View style={s.linhaFinal}>
              <Text style={s.totalTexto}>Total da fatura da usina</Text>
              <Text style={s.totalValor}>{brl(f.total_centavos)}</Text>
            </View>
          </View>

          {/* Seção PIX */}
          {f.pix_copia_cola && f.status === "pendente" ? (
            <View style={s.pix} wrap={false}>
              {qr ? <Image src={qr} style={s.pixQr} /> : null}
              <View style={{ flex: 1 }}>
                <Text style={s.pixTitulo}>Pague com PIX</Text>
                <Text style={s.pixInstrucao}>
                  Aponte a câmera do aplicativo do seu banco para o QR code ou utilize o código copia e cola abaixo.
                </Text>
                {f.cobranca_link ? (
                  <Text style={s.pixOutras}>
                    Prefere cartão ou boleto? <Link src={f.cobranca_link} style={{ color: NAVY, fontFamily: "Helvetica-Bold" }}>Abrir página de pagamento</Link>
                  </Text>
                ) : null}
                <View style={s.pixCaixaCodigo}>
                  {(f.pix_copia_cola.match(/.{1,64}/g) ?? []).map((trecho, i) => (
                    <Text key={i} style={s.pixCodigo}>{trecho}</Text>
                  ))}
                </View>
              </View>
            </View>
          ) : null}
          <Informacoes f={f} />
        </View>

        <View style={s.rodape} fixed>
          <View style={{ flex: 1 }}>
            <Text style={{ color: TINTA, fontFamily: "Helvetica-Bold" }}>
              Favorecido do PIX: {recebedorDe(f).nome}{recebedorDe(f).documento ? `  ·  ${documentoFmt(recebedorDe(f).documento!)}` : ""}
            </Text>
            <Text style={{ marginTop: 2 }}>{f.modo_desconto === "percentual_conta_cheia" ? "Fatura calculada a partir da conta da distribuidora do mês de referência." : "Fatura de geração compartilhada. A conta da distribuidora continua sendo paga à parte."}</Text>
          </View>
          <Text>VisioPro Solar</Text>
        </View>
      </Page>
    </Document>
  );
}

/** Quem recebe o PIX (no banco aparece esse nome) */
export const recebedorDe = (f: DadosFaturaPdf) =>
  f.recebedor?.nome ? f.recebedor : { nome: f.snapshot.usina.pix_favorecido || f.snapshot.usina.nome, documento: f.snapshot.usina.documento };

const documentoFmt = (v: string) => {
  const d = v.replace(/\D/g, "");
  if (d.length === 14) return `CNPJ ${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `CPF ${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return v;
};

const telefone = (v: string) => {
  const d = v.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : v;
};

function Itens({ titulo, itens, meio }: { titulo: string; itens: string[]; meio?: boolean }) {
  return (
    <View style={meio ? [s.infoColuna, s.infoColunaMeio] : s.infoColuna}>
      <Text style={s.infoTitulo}>{titulo}</Text>
      {itens.map((t, i) => (
        <View key={i} style={s.infoItem}>
          <Text style={s.infoMarca}>•</Text>
          <Text style={s.infoTexto}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

const pct = (n: number) => String(n).replace(".", ",");

/** Bloco de orientações ao cliente, no estilo das contas de energia */
function Informacoes({ f }: { f: DadosFaturaPdf }) {
  const { usina, cliente } = f.snapshot;
  const favorecido = recebedorDe(f).nome;
  const distribuidora = (cliente.distribuidora || "distribuidora").split(" (")[0];
  const contaCheia = f.modo_desconto === "percentual_conta_cheia";
  const zap = f.contato_whatsapp ? telefone(f.contato_whatsapp) : null;

  const pagar = f.status === "paga"
    ? ["Esta fatura já está paga. Obrigado!", "Guarde este documento como comprovante."]
    : [
        `Pague até ${data(f.vencimento)} pelo PIX acima${f.cobranca_link ? " ou pelo link de pagamento" : ""}.`,
        `Confira se o favorecido é ${favorecido}.`,
        ...(f.regra_atraso ? [`Após o vencimento: multa de ${pct(f.regra_atraso.multa)}% e juros de ${pct(f.regra_atraso.juros)}% ao mês, cobrados na próxima fatura.`] : []),
        f.cobranca_link ? "O pagamento é reconhecido sozinho. Guarde o comprovante." : "Guarde o comprovante do pagamento.",
      ];

  const conta = contaCheia
    ? [
        `A conta da ${distribuidora} desta unidade está no nome da usina e é paga por ela: você paga só esta fatura.`,
        f.conta_anexa
          ? "A cópia da conta segue na próxima página, marcada NÃO PAGAR."
          : "\"Sem a usina\" é o que você pagaria à distribuidora, com bandeira e iluminação pública.",
      ]
    : [
        `Continue pagando a conta da ${distribuidora} normalmente. Esta fatura é só a energia da usina.`,
        "A energia da usina aparece na sua conta como créditos compensados.",
      ];

  const dicas = [
    "Chuveiro no modo verão e banhos mais curtos.",
    "Geladeira bem fechada e com a borracha em bom estado.",
    "Tire da tomada aparelhos em espera.",
  ];

  return (
    <View style={s.info} wrap={false}>
      <Text style={s.infoTopo}>INFORMAÇÕES IMPORTANTES</Text>
      <View style={s.infoColunas}>
        <Itens titulo="Como pagar" itens={pagar} />
        <Itens titulo="Sobre sua fatura" itens={conta} meio />
        <Itens titulo="Dicas para economizar" itens={dicas} />
      </View>
      {zap || f.portal_url ? (
        <Text style={s.infoAtendimento}>
          Atendimento {usina.nome}:{zap ? ` WhatsApp ${zap}` : ""}{zap && f.portal_url ? "  ·  " : " "}
          {f.portal_url ? <>Faturas e histórico em <Link src={f.portal_url} style={{ color: NAVY, fontFamily: "Helvetica-Bold" }}>{f.portal_url.replace(/^https?:\/\//, "")}</Link></> : null}
        </Text>
      ) : null}
    </View>
  );
}

export async function gerarPdfFatura(f: DadosFaturaPdf) {
  const qr = f.pix_copia_cola && f.status === "pendente" ? await QRCode.toDataURL(f.pix_copia_cola, { margin: 0, width: 300, errorCorrectionLevel: "M" }) : null;
  return renderToBuffer(<FaturaDoc f={f} qr={qr} />);
}
