alter table public.restaurants
  add column if not exists logo_url text,
  add column if not exists hero_url text,
  add column if not exists accent_color text,
  add column if not exists tagline_top text,
  add column if not exists tagline_bottom text,
  add column if not exists welcome_copy text;

drop policy if exists "branding_public_read" on storage.objects;
drop policy if exists "branding_staff_insert" on storage.objects;
drop policy if exists "branding_staff_update" on storage.objects;
drop policy if exists "branding_staff_delete" on storage.objects;

create policy "branding_public_read" on storage.objects
  for select using (bucket_id = 'branding');

create policy "branding_staff_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'branding' and public.is_staff(auth.uid()));

create policy "branding_staff_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'branding' and public.is_staff(auth.uid()))
  with check (bucket_id = 'branding' and public.is_staff(auth.uid()));

create policy "branding_staff_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'branding' and public.is_staff(auth.uid()));