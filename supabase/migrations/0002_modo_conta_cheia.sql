-- Rode SOZINHO, antes do 0003 (o Postgres exige que o novo valor do enum seja gravado antes de ser usado).
alter type modo_desconto add value if not exists 'percentual_conta_cheia';
