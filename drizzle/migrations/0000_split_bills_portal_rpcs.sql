create or replace function public._split_bills_feed(p_restaurant_id uuid, p_days integer)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'split_id', s.id, 'bill_id', s.bill_id, 'mode', s.mode, 'status', s.status,
      'created_at', s.created_at, 'updated_at', s.updated_at,
      'restaurant_id', br.restaurant_id, 'restaurant_name', r.name,
      'table_label', rt.label, 'bill_total_pesewas', bl.total_pesewas,
      'split_total_pesewas', s.total_pesewas,
      'paid_pesewas', coalesce((select sum(sh.amount_pesewas) from bill_split_shares sh where sh.split_id = s.id and sh.status = 'paid'),0),
      'share_count', (select count(*) from bill_split_shares sh where sh.split_id = s.id),
      'paid_count', (select count(*) from bill_split_shares sh where sh.split_id = s.id and sh.status = 'paid'),
      'shares', coalesce((select jsonb_agg(jsonb_build_object(
          'position', sh.position, 'label', sh.label, 'name', sh.claimed_by_name,
          'amount_pesewas', sh.amount_pesewas, 'status', sh.status,
          'method', pa.method, 'tip_pesewas', pa.tip_pesewas, 'total_paid_pesewas', pa.total_pesewas,
          'provider_ref', pa.provider_ref, 'paid_at', pa.updated_at
        ) order by sh.position)
        from bill_split_shares sh
        left join lateral (select * from payment_attempts p where p.split_share_id = sh.id
          and p.status in ('captured','settled') and not coalesce(p.excluded_from_reports,false)
          order by p.updated_at desc limit 1) pa on true
        where sh.split_id = s.id), '[]'::jsonb)
    ) x
    from bill_splits s
    join bills bl on bl.id = s.bill_id
    join restaurant_tables rt on rt.id = bl.table_id
    join branches br on br.id = rt.branch_id
    join restaurants r on r.id = br.restaurant_id
    where s.status <> 'cancelled'
      and (p_restaurant_id is null or br.restaurant_id = p_restaurant_id)
      and s.created_at >= now() - make_interval(days => greatest(p_days,1))
    order by s.created_at desc limit 200
  ) t;
$$;
revoke all on function public._split_bills_feed(uuid, integer) from public, anon, authenticated;

create or replace function public.owner_split_bills(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_rid uuid;
begin
  v_rid := owner_primary_restaurant();
  if v_rid is null then return '[]'::jsonb; end if;
  return public._split_bills_feed(v_rid, p_days);
end $$;

create or replace function public.admin_split_bills(p_days integer default 30, p_restaurant_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff(auth.uid()) then raise exception 'not_staff'; end if;
  return public._split_bills_feed(p_restaurant_id, p_days);
end $$;

revoke all on function public.owner_split_bills(integer) from public, anon;
revoke all on function public.admin_split_bills(integer, uuid) from public, anon;
grant execute on function public.owner_split_bills(integer) to authenticated;
grant execute on function public.admin_split_bills(integer, uuid) to authenticated;