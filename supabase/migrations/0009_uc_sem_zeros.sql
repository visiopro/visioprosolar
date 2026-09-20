-- UC sem zeros à esquerda ("0003714154" = "3714154"), igual ao que o app grava agora
update clientes set uc = regexp_replace(uc, '^0+(?=[0-9])', '') where uc ~ '^0[0-9]';
