-- Klown: restaurant floor staff + SMS payment alerts to the waiter and cashier. 2026-10-07.
-- Who gets a text when a table pays: the waiter whose order it is (bills.server_name, the first
-- name Odoo gives us) and every active cashier. Managed by the owner at klown.io/owner (Settings).

create table if not exists public.restaurant_staff (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  role text not null check (role in ('waiter', 'cashier', 'manager')),
  phone text,                                   -- Ghana MSISDN 233XXXXXXXXX, or null (no SMS)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists restaurant_staff_restaurant_idx on public.restaurant_staff (restaurant_id);
alter table public.restaurant_staff enable row level security;

drop policy if exists restaurant_staff_owner_all on public.restaurant_staff;
create policy restaurant_staff_owner_all on public.restaurant_staff
  for all to authenticated
  using (restaurant_id in (select public.owner_restaurant_ids()))
  with check (restaurant_id in (select public.owner_restaurant_ids()));
drop policy if exists restaurant_staff_staff_read on public.restaurant_staff;
create policy restaurant_staff_staff_read on public.restaurant_staff
  for select to authenticated using (public.is_staff(auth.uid()));

-- Ghana phone normaliser shared by the owner RPCs (same rules as owner_save_notify_phones).
create or replace function public.klown_gh_msisdn(p_raw text)
 returns text language sql immutable as $$
  select case
    when d ~ '^233[0-9]{9}$' then d
    when d ~ '^0[0-9]{9}$' then '233' || substr(d, 2)
    when d ~ '^[0-9]{9}$' then '233' || d
    else null end
  from (select regexp_replace(coalesce(p_raw, ''), '\D', '', 'g') as d) x;
$$;

create or replace function public.owner_staff_list()
 returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_rid uuid;
begin
  v_rid := owner_primary_restaurant();
  if v_rid is null then raise exception 'not_authorized'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'role', s.role, 'phone', s.phone, 'active', s.active)
      order by case s.role when 'cashier' then 0 when 'manager' then 1 else 2 end, lower(s.name))
    from restaurant_staff s where s.restaurant_id = v_rid), '[]'::jsonb);
end $$;

-- Add (p_id null) or update one staff member. Phone is optional; a bad phone is an error so the
-- owner sees it rather than a silently dropped number.
create or replace function public.owner_staff_save(p_id uuid, p_name text, p_role text, p_phone text, p_active boolean default true)
 returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_rid uuid; v_name text; v_phone text; v_id uuid; v_n int;
begin
  v_rid := owner_primary_restaurant();
  if v_rid is null then raise exception 'not_authorized'; end if;
  v_name := left(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'), 80);
  v_name := btrim(v_name);
  if v_name = '' then raise exception 'name_required'; end if;
  if p_role not in ('waiter', 'cashier', 'manager') then raise exception 'bad_role'; end if;
  if btrim(coalesce(p_phone, '')) <> '' then
    v_phone := klown_gh_msisdn(p_phone);
    if v_phone is null then raise exception 'bad_phone'; end if;
  end if;
  if p_id is null then
    select count(*) into v_n from restaurant_staff where restaurant_id = v_rid;
    if v_n >= 60 then raise exception 'too_many'; end if;
    insert into restaurant_staff (restaurant_id, name, role, phone, active)
      values (v_rid, v_name, p_role, v_phone, coalesce(p_active, true)) returning id into v_id;
  else
    update restaurant_staff set name = v_name, role = p_role, phone = v_phone, active = coalesce(p_active, true), updated_at = now()
      where id = p_id and restaurant_id = v_rid returning id into v_id;
    if v_id is null then raise exception 'not_found'; end if;
  end if;
  return (select jsonb_build_object('id', s.id, 'name', s.name, 'role', s.role, 'phone', s.phone, 'active', s.active)
          from restaurant_staff s where s.id = v_id);
end $$;

create or replace function public.owner_staff_delete(p_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_rid uuid; v_n int;
begin
  v_rid := owner_primary_restaurant();
  if v_rid is null then raise exception 'not_authorized'; end if;
  delete from restaurant_staff where id = p_id and restaurant_id = v_rid;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n > 0);
end $$;

grant execute on function public.owner_staff_list(), public.owner_staff_save(uuid, text, text, text, boolean), public.owner_staff_delete(uuid)
  to anon, authenticated, service_role;
revoke execute on function public.klown_gh_msisdn(text) from public;
grant execute on function public.klown_gh_msisdn(text) to anon, authenticated, service_role;
