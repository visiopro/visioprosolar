-- Quem recebe o PIX dinâmico (nome e CPF/CNPJ da conta do gateway), mostrado no rodapé da fatura
alter table usinas add column if not exists recebedor_nome text;
alter table usinas add column if not exists recebedor_documento text;
