# VisioPro Solar — desenho aprovado (set/2026)

**Objetivo:** usina de geração compartilhada fatura seus clientes a partir da foto da conta da distribuidora.

**Fluxo:** foto → leitura por IA → conferência humana obrigatória → cálculo pela regra do cliente → fatura PDF com PIX → envio no WhatsApp → lembrete de vencimento → baixa manual.

**Multi-usina:** usinas → usina_membros (dono/operador) → clientes → contas_energia → faturas → eventos. RLS por participação na usina.

**Regras de desconto por cliente:** % sobre energia compensada, % sobre gasto total, tarifa fixa por kWh.

**Fora da v1:** baixa automática de PIX, portal do cliente final, nota fiscal, leitura em lote, múltiplas usinas por usuário.

**Visual:** azul-marinho com dourado. O elemento marcante é o arco do sol no painel (recebido sobre faturado no mês); o resto é discreto. Fonte Onest, números tabulares.

**Referência:** protótipo gerado no ChatGPT (VisioPro_Solar_App.zip), usado só para regras de conferência e PIX.
