/** Mensagem de boas-vindas: texto da usina com as variáveis preenchidas */

export const PADRAO = `☀️ Bem-vindo à {{usina}}!

Sua unidade {{uc}} ({{distribuidora}}) já está no nosso sistema e passou pela transferência de titularidade. O próximo passo é a homologação junto à {{distribuidora}}, que é o que libera os créditos de energia solar para a sua conta.

⏳ *Sobre a primeira fatura*
Ela ainda pode vir com o valor cheio, porque o desconto só começa depois que a homologação é concluída. Isso leva alguns dias e é normal. A partir daí, a economia aparece todo mês.

📅 *Como vai funcionar*
- O vencimento continua o mesmo de sempre.
- Perto da data, você recebe aqui no WhatsApp o demonstrativo do consumo, o valor a pagar e o código Pix para pagamento.
- Nada muda no seu dia a dia: a energia é a mesma, só o valor fica menor.

📱 *Suas faturas, quando quiser*
Acompanhe tudo, inclusive segunda via e a economia acumulada: {{portal}}

💚 Obrigado pela confiança!
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
