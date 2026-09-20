import { Document, Font, Image, Link, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { brl, data, mesExtenso, nFatura, numero } from "../format";
import { descreverRegra, type ModoDesconto } from "../calculo";

// Sem hifenização: o código PIX não pode ganhar hífens ao quebrar linha
Font.registerHyphenationCallback((palavra) => [palavra]);

export type DadosFaturaPdf = {
  logo?: Buffer | null;       // PNG/JPEG da usina
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
  economia_acumulada_centavos: number;
  pix_copia_cola: string | null;
  cobranca_link?: string | null;
  snapshot: {
    cliente: { nome: string; documento: string | null; uc: string; distribuidora: string };
    usina: { nome: string; documento: string | null; pix_favorecido: string | null; logo_path?: string | null };
  };
};

const NAVY = "#0B1A30";
const OURO = "#C9962E";
const TINTA = "#1B2638";
const CINZA = "#6B7890";
const LINHA = "#E3E7EE";
const VERDE = "#1F8A5B";

const s = StyleSheet.create({
  pagina: { fontFamily: "Helvetica", fontSize: 10, color: TINTA, paddingBottom: 50 },
  topo: { backgroundColor: NAVY, paddingHorizontal: 40, paddingTop: 34, paddingBottom: 28, flexDirection: "row", justifyContent: "space-between" },
  usina: { color: "#FFFFFF", fontSize: 20, fontFamily: "Helvetica-Bold" },
  usinaDoc: { color: "#9FB0CA", fontSize: 9, marginTop: 4 },
  logoCaixa: { backgroundColor: "#FFFFFF", borderRadius: 6, padding: 6, marginRight: 14, width: 116, height: 60, alignItems: "center", justifyContent: "center" },
  selo: { alignItems: "flex-end" },
  seloTit: { color: OURO, fontSize: 9, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  seloNum: { color: "#FFFFFF", fontSize: 16, fontFamily: "Helvetica-Bold", marginTop: 3 },
  seloRef: { color: "#9FB0CA", fontSize: 9, marginTop: 3 },
  faixa: { height: 4, backgroundColor: OURO },
  corpo: { paddingHorizontal: 40, paddingTop: 24 },
  bloco: { flexDirection: "row", justifyContent: "space-between", marginBottom: 22 },
  rotulo: { fontSize: 8, color: CINZA, marginBottom: 3 },
  valor: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  destaque: { borderWidth: 1, borderColor: LINHA, borderRadius: 6, flexDirection: "row", marginBottom: 22 },
  destaqueLado: { flex: 1, padding: 16 },
  total: { fontSize: 26, fontFamily: "Helvetica-Bold", color: NAVY, marginTop: 2 },
  riscado: { fontSize: 12, color: CINZA, textDecoration: "line-through", marginTop: 4 },
  economia: { backgroundColor: "#EDF7F1", borderLeftWidth: 1, borderLeftColor: LINHA, flex: 1, padding: 16 },
  economiaValor: { fontSize: 18, fontFamily: "Helvetica-Bold", color: VERDE, marginTop: 2 },
  tituloSecao: { fontSize: 11, fontFamily: "Helvetica-Bold", color: NAVY, marginBottom: 8 },
  linha: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: LINHA },
  linhaFinal: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 9 },
  pix: { marginTop: 22, borderWidth: 1, borderColor: OURO, borderRadius: 6, padding: 14, flexDirection: "row", alignItems: "center" },
  pixCodigo: { fontFamily: "Courier", fontSize: 7.5, color: TINTA, lineHeight: 1.35 },
  rodape: { position: "absolute", bottom: 22, left: 40, right: 40, fontSize: 7.5, color: CINZA, borderTopWidth: 1, borderTopColor: LINHA, paddingTop: 8, flexDirection: "row", justifyContent: "space-between" },
  marca: { position: "absolute", top: 330, left: 90, fontSize: 70, color: "#C0392B", opacity: 0.15, transform: "rotate(-25deg)", fontFamily: "Helvetica-Bold" },
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
                <Image src={f.logo} style={{ maxWidth: 104, maxHeight: 48, objectFit: "contain" }} />
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
          <View style={s.bloco}>
            <View style={{ flex: 2 }}>
              <Text style={s.rotulo}>Cliente</Text>
              <Text style={s.valor}>{cliente.nome}</Text>
              <Text style={{ fontSize: 9, color: CINZA, marginTop: 3 }}>
                UC {cliente.uc} · {cliente.distribuidora}
                {cliente.documento ? ` · ${cliente.documento}` : ""}
              </Text>
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <Text style={s.rotulo}>Vencimento</Text>
              <Text style={s.valor}>{data(f.vencimento)}</Text>
              {f.status === "paga" ? <Text style={{ fontSize: 9, color: VERDE, marginTop: 3 }}>Pagamento confirmado</Text> : null}
            </View>
          </View>

          <View style={s.destaque}>
            <View style={s.destaqueLado}>
              <Text style={s.rotulo}>Total a pagar</Text>
              <Text style={s.total}>{brl(f.total_centavos)}</Text>
              <Text style={s.riscado}>Sem a usina: {brl(f.sem_usina_centavos)}</Text>
            </View>
            <View style={s.economia}>
              <Text style={s.rotulo}>Sua economia neste mês</Text>
              <Text style={s.economiaValor}>{brl(f.economia_centavos)}</Text>
              <Text style={{ fontSize: 9, color: CINZA, marginTop: 6 }}>
                Economia acumulada: {brl(f.economia_acumulada_centavos)}
              </Text>
            </View>
          </View>

          <Text style={s.tituloSecao}>Como calculamos</Text>
          {f.modo_desconto === "percentual_conta_cheia" ? (
            f.sem_usina_ajustado ? (
              <View style={s.linha}>
                <Text>Sua conta de energia no mês ({numero(f.consumo_kwh ?? 0)} kWh)</Text>
                <Text>{brl(f.sem_usina_centavos)}</Text>
              </View>
            ) : (
              <>
                <View style={s.linha}>
                  <Text>Consumo do mês</Text>
                  <Text>{numero(f.consumo_kwh ?? 0)} kWh</Text>
                </View>
                <View style={s.linha}>
                  <Text>Tarifa da distribuidora (com tributos)</Text>
                  <Text>R$ {numero(f.tarifa, 8)}/kWh</Text>
                </View>
                <View style={s.linha}>
                  <Text>Energia (consumo × tarifa)</Text>
                  <Text>{brl(f.sem_usina_centavos - f.bandeira_centavos - f.iluminacao_centavos)}</Text>
                </View>
                {f.bandeira_centavos > 0 ? (
                  <View style={s.linha}>
                    <Text>Bandeira tarifária</Text>
                    <Text>{brl(f.bandeira_centavos)}</Text>
                  </View>
                ) : null}
                {f.iluminacao_centavos > 0 ? (
                  <View style={s.linha}>
                    <Text>Iluminação pública</Text>
                    <Text>{brl(f.iluminacao_centavos)}</Text>
                  </View>
                ) : null}
                <View style={s.linha}>
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>Sua conta de energia sem a usina</Text>
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>{brl(f.sem_usina_centavos)}</Text>
                </View>
              </>
            )
          ) : (
            <>
              <View style={s.linha}>
                <Text>Energia recebida da usina</Text>
                <Text>{numero(f.compensada_kwh)} kWh</Text>
              </View>
              <View style={s.linha}>
                <Text>Tarifa da distribuidora (com tributos)</Text>
                <Text>R$ {numero(f.tarifa, 8)}/kWh</Text>
              </View>
              <View style={s.linha}>
                <Text>Valor dessa energia sem a usina</Text>
                <Text>{brl(f.sem_usina_centavos)}</Text>
              </View>
            </>
          )}
          <View style={s.linha}>
            <Text>{regra}</Text>
            <Text style={{ color: VERDE }}>- {brl(f.economia_centavos)}</Text>
          </View>
          <View style={s.linhaFinal}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>Total da fatura da usina</Text>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{brl(f.total_centavos)}</Text>
          </View>

          {f.pix_copia_cola && f.status === "pendente" ? (
            <View style={s.pix} wrap={false}>
              {qr ? <Image src={qr} style={{ width: 96, height: 96, marginRight: 16 }} /> : null}
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "Helvetica-Bold", color: NAVY }}>Pague com PIX</Text>
                <Text style={{ fontSize: 8.5, color: CINZA, marginTop: 2 }}>
                  Aponte a câmera do app do banco para o QR code ou use o copia e cola. Favorecido: {usina.pix_favorecido || usina.nome}.
                </Text>
                {f.cobranca_link ? (
                  <Text style={{ fontSize: 8.5, color: CINZA, marginTop: 4 }}>
                    Outras formas de pagamento: <Link src={f.cobranca_link} style={{ color: NAVY }}>{f.cobranca_link}</Link>
                  </Text>
                ) : null}
                <View style={{ marginTop: 6 }}>
                  {(f.pix_copia_cola.match(/.{1,64}/g) ?? []).map((trecho, i) => (
                    <Text key={i} style={s.pixCodigo}>{trecho}</Text>
                  ))}
                </View>
              </View>
            </View>
          ) : null}
        </View>

        <View style={s.rodape} fixed>
          <Text>{f.modo_desconto === "percentual_conta_cheia" ? "Fatura de energia solar calculada a partir da conta da distribuidora do mês de referência." : "Fatura de energia por geração compartilhada. A conta da distribuidora continua sendo paga à parte."}</Text>
          <Text>VisioPro Solar</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function gerarPdfFatura(f: DadosFaturaPdf) {
  const qr = f.pix_copia_cola && f.status === "pendente" ? await QRCode.toDataURL(f.pix_copia_cola, { margin: 0, width: 300, errorCorrectionLevel: "M" }) : null;
  return renderToBuffer(<FaturaDoc f={f} qr={qr} />);
}
