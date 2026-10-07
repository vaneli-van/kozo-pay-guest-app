-- Klown: named tabs (separate bills for separate groups at one table). 2026-10-07.
-- Backward compatible: existing bills get tab_key '' (the table's main bill), so until the new
-- sync runs there is still exactly one open bill per table and every old code path behaves the same.

alter table public.bills add column if not exists tab_key text not null default '';
alter table public.bills add column if not exists tab_label text;
-- true once the diner has picked their tab themselves (vs. bound automatically because the table
-- had a single bill at the time)
alter table public.dining_sessions add column if not exists active_bill_chosen boolean not null default false;
-- One open bill per (table, tab). The main tab is ''.
create unique index if not exists uq_bills_one_open_per_table_tab on public.bills (table_id, tab_key) where status in ('open', 'ready');
drop index if exists public.uq_bills_one_open_per_table;

-- The bill a diner's session is on.
--   * A bill the diner picked themselves stays theirs while it is open.
--   * If the session's bill has closed, the answer is NULL: we never move the diner onto another
--     group's bill. Scanning the QR again starts over. (Exception, as before tabs: an automatic
--     binding to the main bill follows a new main bill on the table.)
--   * Otherwise, if the table has exactly one open bill, that one (bound automatically).
--   * Otherwise NULL: the table has several tabs and the diner has to pick theirs. A session that
--     was bound automatically while the table had one bill is asked again once a second tab
--     appears (it might belong to the new group).
CREATE OR REPLACE FUNCTION public.klown_session_bill_id(p_session_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_table uuid; v_active uuid; v_chosen boolean; v_n int; v_one uuid; v_closed boolean := false;
begin
  select table_id, active_bill_id, active_bill_chosen into v_table, v_active, v_chosen from dining_sessions where id = p_session_id;
  if v_table is null then return null; end if;
  if v_active is not null then
    if not exists (select 1 from bills where id = v_active and table_id = v_table and status in ('open', 'ready')) then
      -- Their bill has closed (paid, or closed at the POS): never move them onto another group's
      -- bill. A fresh QR scan starts over (qr-resolve clears the binding). The one exception keeps
      -- the single-group behaviour from before tabs: an automatic binding to the table's main bill
      -- follows a new main bill on that table (a fresh ticket after the old one was closed).
      if v_chosen or coalesce((select tab_key from bills where id = v_active), '') <> '' then return null; end if;
      v_closed := true;
    elsif v_chosen then
      return v_active;
    end if;
  end if;
  select count(*) into v_n from bills where table_id = v_table and status in ('open', 'ready');
  if v_n = 1 then
    select id into v_one from bills where table_id = v_table and status in ('open', 'ready');
    if v_closed and exists (select 1 from bills where id = v_one and tab_key <> '') then return null; end if;
    if v_active is distinct from v_one then
      update dining_sessions set active_bill_id = v_one, active_bill_chosen = false, bill_status = 'open' where id = p_session_id;
    end if;
    return v_one;
  end if;
  return null;
end $function$;

-- The open tabs on a table, for the "Which bill is yours?" picker.
CREATE OR REPLACE FUNCTION public.klown_table_tabs(p_table_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
      'billId', b.id,
      'label', b.tab_label,
      'main', b.tab_key = '',
      'serverName', b.server_name,
      'itemCount', coalesce((select sum(qty) from bill_items i where i.bill_id = b.id), 0),
      'preview', coalesce((select jsonb_agg(x.name) from (select name from bill_items i where i.bill_id = b.id order by sort limit 2) x), '[]'::jsonb),
      'totalPesewas', b.total_pesewas,
      'remainingPesewas', greatest(0, b.total_pesewas - coalesce((select sum(amount_pesewas) from payment_attempts p where p.bill_id = b.id and p.status = 'captured'), 0)),
      'openedAt', b.opened_at
    ) order by (b.tab_key <> ''), b.opened_at), '[]'::jsonb)
  from bills b where b.table_id = p_table_id and b.status in ('open', 'ready');
$function$;

-- Item split resolution by the session's bill (was: the table's newest bill).
CREATE OR REPLACE FUNCTION public.items_split_resolve_session(p_session_id uuid, OUT o_split_id uuid, OUT o_bill_id uuid, OUT o_error text)
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_table uuid;
begin
  o_bill_id := klown_session_bill_id(p_session_id);
  if o_bill_id is null then
    select table_id into v_table from dining_sessions where id = p_session_id;
    if (select count(*) from bills where table_id = v_table and status in ('open', 'ready')) > 1 then o_error := 'choose_tab';
    else o_error := 'no_bill'; end if;
    return;
  end if;
  select id into o_split_id from bill_splits where bill_id = o_bill_id and status = 'open' and mode = 'items' order by created_at desc limit 1;
  if o_split_id is null then o_error := 'no_split'; return; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.items_split_assign(p_session_token text, p_bill_item_id uuid, p_units integer, p_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_sess dining_sessions; r record; v_line record; sh record; v_weight int;
begin
  v_sess := klown_session_for_token(p_session_token);
  if v_sess.id is null then return jsonb_build_object('ok', false, 'reason', 'invalid_session'); end if;
  r := items_split_resolve_session(v_sess.id);
  if r.o_error is not null then return jsonb_build_object('ok', false, 'reason', r.o_error); end if;
  select id, qty, bill_id into v_line from bill_items where id = p_bill_item_id;
  if not found or v_line.bill_id <> r.o_bill_id then return jsonb_build_object('ok', false, 'reason', 'invalid_item'); end if;
  sh := items_split_ensure_share(r.o_split_id, v_sess.id, p_name);
  if sh.o_id is null then return jsonb_build_object('ok', false, 'reason', 'share_failed'); end if;
  if sh.o_status = 'paid' then return jsonb_build_object('ok', false, 'reason', 'share_paid'); end if;
  if coalesce(p_units, 0) <= 0 then
    delete from bill_split_item_assignments where split_id = r.o_split_id and bill_item_id = v_line.id and share_id = sh.o_id;
  else
    v_weight := least(p_units, greatest(1, trunc(coalesce(v_line.qty, 1))::int));
    insert into bill_split_item_assignments (split_id, bill_item_id, share_id, weight)
      values (r.o_split_id, v_line.id, sh.o_id, v_weight)
      on conflict (split_id, bill_item_id, share_id) do update set weight = excluded.weight;
  end if;
  perform items_split_recompute(r.o_split_id);
  return items_split_payload(r.o_split_id, v_sess.id);
end $function$;

CREATE OR REPLACE FUNCTION public.items_split_assign_remaining(p_session_token text, p_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_sess dining_sessions; r record; sh record; v_line record; v_used int; v_free int; v_existing int;
begin
  v_sess := klown_session_for_token(p_session_token);
  if v_sess.id is null then return jsonb_build_object('ok', false, 'reason', 'invalid_session'); end if;
  r := items_split_resolve_session(v_sess.id);
  if r.o_error is not null then return jsonb_build_object('ok', false, 'reason', r.o_error); end if;
  sh := items_split_ensure_share(r.o_split_id, v_sess.id, p_name);
  if sh.o_id is null then return jsonb_build_object('ok', false, 'reason', 'share_failed'); end if;
  if sh.o_status = 'paid' then return jsonb_build_object('ok', false, 'reason', 'share_paid'); end if;
  for v_line in select id, trunc(coalesce(qty, 0))::int as qty from bill_items where bill_id = r.o_bill_id loop
    select coalesce(sum(greatest(0, trunc(coalesce(weight, 0))::int)), 0) into v_used
      from bill_split_item_assignments where split_id = r.o_split_id and bill_item_id = v_line.id;
    v_free := greatest(0, v_line.qty - v_used);
    if v_free <= 0 then continue; end if;
    select greatest(0, trunc(coalesce(weight, 0))::int) into v_existing
      from bill_split_item_assignments where split_id = r.o_split_id and bill_item_id = v_line.id and share_id = sh.o_id;
    insert into bill_split_item_assignments (split_id, bill_item_id, share_id, weight)
      values (r.o_split_id, v_line.id, sh.o_id, coalesce(v_existing, 0) + v_free)
      on conflict (split_id, bill_item_id, share_id) do update set weight = excluded.weight;
  end loop;
  perform items_split_recompute(r.o_split_id);
  return items_split_payload(r.o_split_id, v_sess.id);
end $function$;

-- Split board for the session's bill (was: any split on the table).
CREATE OR REPLACE FUNCTION public.split_board(p_session_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sess dining_sessions; v_bill uuid; v_split record; v_paid int; v_status text; v_shares jsonb;
begin
  v_sess := klown_session_for_token(p_session_token);
  if v_sess.id is null then return jsonb_build_object('ok', false, 'reason', 'invalid_session'); end if;
  if v_sess.table_id is null then return jsonb_build_object('ok', true, 'split', null); end if;
  v_bill := klown_session_bill_id(v_sess.id);
  if v_bill is null then
    -- the diner's bill just closed (look back 30 minutes on the bill they were on), or they
    -- have not picked a tab yet
    v_bill := v_sess.active_bill_id;
  end if;
  if v_bill is null then return jsonb_build_object('ok', true, 'split', null); end if;

  select sp.id, sp.mode, sp.total_pesewas, sp.status, sp.bill_id into v_split
    from bill_splits sp where sp.bill_id = v_bill and sp.status = 'open'
    order by sp.created_at desc limit 1;
  if not found then
    select sp.id, sp.mode, sp.total_pesewas, sp.status, sp.bill_id into v_split
      from bill_splits sp where sp.bill_id = v_bill and sp.status = 'settled' and sp.updated_at > now() - interval '30 minutes'
      order by sp.updated_at desc limit 1;
    if not found then return jsonb_build_object('ok', true, 'split', null); end if;
  end if;

  if v_split.mode = 'items' then
    perform items_split_recompute(v_split.id);
    return items_split_payload(v_split.id, v_sess.id);
  end if;

  if v_split.status = 'open' then
    update bill_split_shares s set status = 'unclaimed', claimed_by_session = null, claimed_by_name = null
      where s.split_id = v_split.id and s.status = 'claimed' and s.updated_at < now() - interval '10 minutes'
        and not exists (select 1 from payment_attempts pa where pa.split_share_id = s.id
                        and pa.status in ('initiated', 'pending') and pa.created_at > now() - interval '10 minutes');
  end if;
  select coalesce(sum(coalesce(pa.amount_pesewas, 0)), 0) into v_paid
    from payment_attempts pa join bill_split_shares s on s.id = pa.split_share_id
    where s.split_id = v_split.id and pa.status = 'captured';
  v_status := v_split.status;
  if v_status = 'open' and v_split.total_pesewas > 0 and v_paid >= v_split.total_pesewas then
    v_status := 'settled';
    update bill_splits set status = 'settled', updated_at = now() where id = v_split.id and status = 'open';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'position', r.position, 'label', r.label, 'amountPesewas', r.amount_pesewas, 'status', r.status,
      'claimedByName', r.claimed_by_name, 'mine', coalesce(r.claimed_by_session = v_sess.id, false), 'shareToken', r.share_token
    ) order by r.position), '[]'::jsonb) into v_shares
  from bill_split_shares r where r.split_id = v_split.id;
  return jsonb_build_object('ok', true,
    'split', jsonb_build_object('id', v_split.id, 'mode', v_split.mode, 'totalPesewas', v_split.total_pesewas, 'status', v_status),
    'paidPesewas', v_paid, 'remainingPesewas', greatest(0, v_split.total_pesewas - v_paid),
    'shares', v_shares);
end $function$;

-- payment_context: the table path now uses the session's bill (tab-aware).
CREATE OR REPLACE FUNCTION public.payment_context(p_session_token text, p_share_id uuid DEFAULT NULL, p_idem text DEFAULT NULL, p_bill_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sess dining_sessions; v_att record;
  b_id uuid; b_total int; b_status text; b_table uuid; b_rest uuid;
  v_rid uuid; r_mode text; r_live text; r_test text; r_bps int;
  v_paid int; v_pending int; v_mode text; v_sub text; v_sb uuid;
  s_id uuid; s_split uuid; s_status text; s_amount int; sp_bill uuid; sp_status text; sp_mode text;
  v_share jsonb := null;
begin
  v_sess := klown_session_for_token(p_session_token);
  if v_sess.id is null then return jsonb_build_object('ok', false, 'reason', 'invalid_session'); end if;

  if p_idem is not null then
    select id, status, amount_pesewas, tip_pesewas, total_pesewas, provider_ref into v_att
      from payment_attempts where session_id = v_sess.id and idempotency_key = p_idem;
    if found then
      return jsonb_build_object('ok', true, 'sessionId', v_sess.id, 'existing', jsonb_build_object(
        'paymentRef', v_att.id, 'status', v_att.status, 'providerRef', v_att.provider_ref,
        'amountPesewas', v_att.amount_pesewas, 'tipPesewas', v_att.tip_pesewas, 'totalPesewas', v_att.total_pesewas));
    end if;
  end if;

  if p_bill_id is not null then
    select id, trunc(coalesce(total_pesewas, 0))::int, status, table_id, restaurant_id
      into b_id, b_total, b_status, b_table, b_rest from bills where id = p_bill_id;
  elsif v_sess.table_id is not null then
    v_sb := klown_session_bill_id(v_sess.id);
    if v_sb is null and (select count(*) from bills where table_id = v_sess.table_id and status in ('open', 'ready')) > 1 then
      return jsonb_build_object('ok', false, 'reason', 'choose_tab', 'sessionId', v_sess.id, 'tableId', v_sess.table_id);
    end if;
    if v_sb is not null then
      select id, trunc(coalesce(total_pesewas, 0))::int, status, table_id, restaurant_id
        into b_id, b_total, b_status, b_table, b_rest from bills where id = v_sb;
    end if;
  end if;
  if b_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_bill', 'sessionId', v_sess.id,
                              'tableId', v_sess.table_id, 'registerId', v_sess.register_id);
  end if;

  v_rid := b_rest;
  if v_rid is null and b_table is not null then
    select br.restaurant_id into v_rid from restaurant_tables t join branches br on br.id = t.branch_id where t.id = b_table;
  end if;
  if v_rid is not null then
    select payment_mode, paystack_subaccount_code, paystack_test_subaccount_code, klown_fee_bps
      into r_mode, r_live, r_test, r_bps from restaurants where id = v_rid;
  end if;
  v_mode := case when r_mode = 'test' then 'test' else 'live' end;
  v_sub := nullif(case when v_mode = 'test' then r_test else r_live end, '');

  select coalesce(sum(amount_pesewas), 0) into v_paid from payment_attempts where bill_id = b_id and status = 'captured';
  select coalesce(sum(amount_pesewas), 0) into v_pending from payment_attempts
    where bill_id = b_id and status in ('initiated', 'pending') and session_id <> v_sess.id
      and created_at > now() - interval '10 minutes';

  if p_share_id is not null then
    select id, split_id, status into s_id, s_split, s_status from bill_split_shares where id = p_share_id;
    if s_id is null then return jsonb_build_object('ok', false, 'reason', 'invalid_share'); end if;
    if s_status = 'paid' then return jsonb_build_object('ok', false, 'reason', 'share_paid'); end if;
    select bill_id, status, mode into sp_bill, sp_status, sp_mode from bill_splits where id = s_split;
    if sp_bill is null or sp_status <> 'open' or sp_bill <> b_id then
      return jsonb_build_object('ok', false, 'reason', 'invalid_share');
    end if;
    if sp_mode = 'items' then perform items_split_recompute(s_split); end if;
    s_id := null;
    select id, status, amount_pesewas into s_id, s_status, s_amount from bill_split_shares where id = p_share_id;
    if s_id is null then return jsonb_build_object('ok', false, 'reason', 'invalid_share'); end if;
    v_share := jsonb_build_object('id', s_id, 'amountPesewas', s_amount, 'status', s_status, 'splitMode', sp_mode);
  end if;

  return jsonb_build_object(
    'ok', true,
    'sessionId', v_sess.id, 'tableId', v_sess.table_id, 'registerId', v_sess.register_id,
    'bill', jsonb_build_object('id', b_id, 'totalPesewas', b_total, 'status', b_status),
    'restaurantId', v_rid,
    'payMode', v_mode,
    'splitConfig', case when v_sub is not null then jsonb_build_object('subaccountCode', v_sub, 'klownFeeBps', coalesce(r_bps, 50)) else null end,
    'paidPesewas', v_paid,
    'pendingOthersPesewas', v_pending,
    'share', v_share
  );
end $function$;

revoke execute on function public.klown_session_bill_id(uuid), public.klown_table_tabs(uuid), public.items_split_resolve_session(uuid) from public, anon, authenticated;
grant execute on function public.klown_session_bill_id(uuid), public.klown_table_tabs(uuid), public.items_split_resolve_session(uuid) to service_role;
