/** Avisos de variação: compara a conta que está sendo lançada com a última fatura do cliente */
export type HistoricoCliente = {
  cliente_id: string;
  referencia: string; // AAAA-MM-01 da última fatura válida
  consumo_kwh: number | null;
  tarifa: number;
  total_centavos: number;
  referencias: string[]; // meses já faturados (não cancelados)
};

export type Alerta = { campo: "referencia" | "consumo" | "tarifa" | "total"; texto: string; grave: boolean };

const pct = (novo: number, velho: number) => (novo - velho) / velho;
const fmt = (v: number, casas = 2) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(v);
const mes = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function conferirVariacao(p: {
  historico: HistoricoCliente | null;
  referencia: string; // AAAA-MM
  consumoKwh: number | null;
  tarifa: number | null;
  totalCentavos: number | null;
}): Alerta[] {
  const alertas: Alerta[] = [];
  const h = p.historico;
  const ref = p.referencia ? `${p.referencia}-01` : "";

  if (h && ref) {
    if (h.referencias.includes(ref)) {
      alertas.push({ campo: "referencia", texto: `Esse cliente já tem fatura de ${mes(ref)}. Cancele a anterior antes de emitir outra.`, grave: true });
    } else if (ref < h.referencia) {
      alertas.push({ campo: "referencia", texto: `Mês anterior ao da última fatura (${mes(h.referencia)}). Confira se a conta é a certa.`, grave: false });
    }
  }

  if (h && p.tarifa && h.tarifa) {
    const d = pct(p.tarifa, Number(h.tarifa));
    if (Math.abs(d) > 0.05) {
      alertas.push({
        campo: "tarifa",
        texto: `Tarifa ${d > 0 ? "acima" : "abaixo"} da última fatura em ${fmt(Math.abs(d) * 100, 1)}% (antes R$ ${fmt(Number(h.tarifa), 6)}). Confira os dígitos.`,
        grave: Math.abs(d) > 0.15,
      });
    }
  }

  if (h && p.consumoKwh && h.consumo_kwh) {
    const d = pct(p.consumoKwh, Number(h.consumo_kwh));
    if (Math.abs(d) > 0.6) {
      alertas.push({
        campo: "consumo",
        texto: `Consumo ${d > 0 ? "muito acima" : "muito abaixo"} do mês passado: ${fmt(p.consumoKwh)} kWh contra ${fmt(Number(h.consumo_kwh))} kWh.`,
        grave: Math.abs(d) > 2,
      });
    }
  }

  if (h && p.totalCentavos && h.total_centavos) {
    const d = pct(p.totalCentavos, Number(h.total_centavos));
    if (Math.abs(d) > 0.6) {
      alertas.push({
        campo: "total",
        texto: `Fatura ${d > 0 ? "bem maior" : "bem menor"} que a última (R$ ${fmt(Number(h.total_centavos) / 100)}).`,
        grave: Math.abs(d) > 2,
      });
    }
  }

  return alertas;
}
