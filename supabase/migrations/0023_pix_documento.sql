-- CPF/CNPJ do titular da chave PIX (aparece no rodapé da fatura como favorecido)
alter table usinas add column if not exists pix_documento text;
