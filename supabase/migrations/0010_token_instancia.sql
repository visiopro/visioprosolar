-- Token próprio da instância da Evolution (opcional; sem ele usa a chave global EVOLUTION_API_KEY)
alter table usina_integracoes add column if not exists evolution_token text;
