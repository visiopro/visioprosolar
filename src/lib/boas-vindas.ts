/** Mensagem de boas-vindas: texto da usina com as variáveis preenchidas */

export const PADRAO = `Olá, {{cliente}}! Seja bem-vindo(a) à {{usina}}. 🌞

A partir de agora a energia solar da nossa usina abate a conta da sua unidade {{uc}} ({{distribuidora}}).

Como funciona:
• Todo mês você continua recebendo a conta da distribuidora, com valor bem menor.
• Nós enviamos aqui pelo WhatsApp a fatura da usina, com {{regra}}.
• O pagamento é por PIX, no link ou no QR code da fatura.
• Você acompanha faturas, segunda via e sua economia aqui: {{portal}}

Qualquer dúvida, é só responder esta mensagem.`;

export const VARIAVEIS = ["cliente", "usina", "uc", "distribuidora", "regra", "portal"] as const;

export function montarBoasVindas(p: {
  texto: string | null;
  cliente: string;
  usina: string;
  uc: string;
  distribuidora: string;
  regra: string; // ex.: "desconto de 20% sobre a conta de energia"
  portal: string;
}) {
  const valores: Record<string, string> = {
    cliente: p.cliente.split(" ")[0],
    usina: p.usina,
    uc: p.uc,
    distribuidora: p.distribuidora,
    regra: p.regra.toLowerCase(),
    portal: p.portal,
  };
  return (p.texto?.trim() || PADRAO).replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (todo, chave: string) => valores[chave] ?? todo);
}
