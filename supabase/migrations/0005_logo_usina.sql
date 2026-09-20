-- Logo da usina (aparece na fatura e no app)
alter table usinas add column if not exists logo_path text;

-- Bucket público: logo não é dado sensível e o PDF lê sem assinatura.
-- Só PNG e JPEG (formatos que o gerador de PDF aceita); o app converte antes de enviar.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 2097152, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;

-- Só o dono envia ou apaga a logo da própria usina (pasta = id da usina)
create policy logos_enviar on storage.objects for insert
  with check (bucket_id = 'logos' and sou_dono((storage.foldername(name))[1]::uuid));
create policy logos_apagar on storage.objects for delete
  using (bucket_id = 'logos' and sou_dono((storage.foldername(name))[1]::uuid));
