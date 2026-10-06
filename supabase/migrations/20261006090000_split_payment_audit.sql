-- Klown split / payment audit fixes (2026-10-06). Additive and backward compatible:
-- new columns are nullable, new functions are unused by the old app code, and the
-- replaced functions keep their signatures and response shapes.

-- D1. Record what the diner was actually charged (Paystack gross-up) on the attempt itself,
-- so reconciliation does not depend on audit_events.
alter table public.payment_attempts add column if not exists charged_pesewas integer;
alter table public.payment_attempts add column if not exists transaction_charge_pesewas integer;
create index if not exists idx_pay_bill_status_created on public.payment_attempts (bill_id, status, created_at);

-- D2. Item split recompute.
--   * What is still owed is the LIVE bill total minus every captured payment on the bill
--     (was: minus paid shares only). Same result when everyone pays through their share,
--     and now also right when someone paid part of the bill outside the split.
--   * Keeps bill_splits.total_pesewas in step with the live bill total.
CREATE OR REPLACE FUNCTION public.items_split_recompute(p_split_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_split record; v_total int; v_line record; v_a record; v_s record;
  iv_ids uuid[] := '{}'; iv_vals int[] := '{}'; pos int;
  unassigned int := 0; w int[]; sl int[]; i int; used int; free_units int;
  paid_total int; remaining int; unpaid_ids uuid[] := '{}'; unpaid_status text[] := '{}'; unpaid_amount int[] := '{}';
  has_items boolean; v_now timestamptz := now();
begin
  select id, bill_id, mode, status, total_pesewas into v_split from bill_splits where id = p_split_id;
  if not found or v_split.mode <> 'items' or v_split.status <> 'open' then return; end if;
  select trunc(coalesce(total_pesewas, 0))::int into v_total from bills where id = v_split.bill_id;
  if not found then return; end if;
  if v_split.total_pesewas is distinct from v_total then
    update bill_splits set total_pesewas = v_total where id = v_split.id;
  end if;

  for v_line in select id, trunc(coalesce(qty, 0))::int as qty, trunc(coalesce(line_total_pesewas, 0))::int as amt
               from bill_items where bill_id = v_split.bill_id order by id loop
    w := '{}'; used := 0; i := 0;
    for v_a in select share_id, greatest(0, trunc(coalesce(weight, 0)))::int as wt
               from bill_split_item_assignments
               where split_id = v_split.id and bill_item_id = v_line.id and share_id is not null
               order by share_id::text collate "C" loop
      w := w || v_a.wt; used := used + v_a.wt;
    end loop;
    free_units := greatest(0, v_line.qty - used);
    w := w || free_units;
    sl := klown_allocate(v_line.amt, w);
    i := 0;
    for v_a in select share_id from bill_split_item_assignments
               where split_id = v_split.id and bill_item_id = v_line.id and share_id is not null
               order by share_id::text collate "C" loop
      i := i + 1;
      pos := array_position(iv_ids, v_a.share_id);
      if pos is null then iv_ids := iv_ids || v_a.share_id; iv_vals := iv_vals || sl[i];
      else iv_vals[pos] := iv_vals[pos] + sl[i]; end if;
    end loop;
    unassigned := unassigned + sl[array_length(sl, 1)];
  end loop;

  select coalesce(sum(trunc(coalesce(amount_pesewas, 0))::int), 0) into paid_total
    from payment_attempts where bill_id = v_split.bill_id and status = 'captured';
  remaining := greatest(0, v_total - paid_total);

  w := '{}';
  for v_s in select id, status, trunc(coalesce(amount_pesewas, 0))::int as amt
             from bill_split_shares where split_id = v_split.id and status <> 'paid'
             order by id::text collate "C" loop
    unpaid_ids := unpaid_ids || v_s.id; unpaid_status := unpaid_status || v_s.status; unpaid_amount := unpaid_amount || v_s.amt;
    pos := array_position(iv_ids, v_s.id);
    w := w || coalesce(case when pos is null then 0 else iv_vals[pos] end, 0);
  end loop;
  w := w || unassigned;
  sl := klown_allocate(remaining, w);

  for i in 1..coalesce(array_length(unpaid_ids, 1), 0) loop
    select exists(select 1 from bill_split_item_assignments
                  where split_id = v_split.id and share_id = unpaid_ids[i] and trunc(coalesce(weight, 0)) > 0) into has_items;
    if not has_items then
      -- keep a share that someone is in the middle of paying for
      if not exists (select 1 from payment_attempts pa where pa.split_share_id = unpaid_ids[i]
                     and pa.status in ('initiated', 'pending') and pa.created_at > now() - interval '10 minutes') then
        delete from bill_split_shares where id = unpaid_ids[i] and status <> 'paid';
      end if;
      continue;
    end if;
    if sl[i] <> unpaid_amount[i] then
      update bill_split_shares set amount_pesewas = sl[i], updated_at = v_now where id = unpaid_ids[i] and status <> 'paid';
    end if;
  end loop;
end $function$;

-- D3. Item split board: totals from the LIVE bill (was the split's frozen total, which went
-- stale when the POS added a round).
CREATE OR REPLACE FUNCTION public.items_split_payload(p_split_id uuid, p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_split record; v_paid int; v_total int; v_mine record; unpaid_sum int; v_items jsonb; v_shares jsonb;
begin
  select id, bill_id, mode, status, trunc(coalesce(total_pesewas, 0))::int as total into v_split from bill_splits where id = p_split_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_split'); end if;
  select trunc(coalesce(total_pesewas, 0))::int into v_total from bills where id = v_split.bill_id;
  v_total := coalesce(v_total, v_split.total);
  select coalesce(sum(coalesce(amount_pesewas, 0)), 0) into v_paid from payment_attempts where bill_id = v_split.bill_id and status = 'captured';

  select coalesce(jsonb_agg(jsonb_build_object(
      'billItemId', l.id, 'name', l.name, 'qty', l.qty, 'lineTotalPesewas', l.line_total_pesewas,
      'unitsFree', greatest(0, trunc(coalesce(l.qty, 0))::int - coalesce(t.used, 0)),
      'takers', coalesce(t.takers, '[]'::jsonb)
    ) order by l.sort), '[]'::jsonb) into v_items
  from bill_items l
  left join lateral (
    select sum(trunc(coalesce(a.weight, 0))::int) as used,
           jsonb_agg(jsonb_build_object('shareId', a.share_id, 'name', coalesce(s.claimed_by_name, s.label),
                                        'units', trunc(coalesce(a.weight, 0))::int, 'paid', s.status = 'paid')) as takers
    from bill_split_item_assignments a join bill_split_shares s on s.id = a.share_id
    where a.split_id = v_split.id and a.bill_item_id = l.id
  ) t on true
  where l.bill_id = v_split.bill_id;

  select id, trunc(coalesce(amount_pesewas, 0))::int as amt into v_mine
    from bill_split_shares where split_id = v_split.id and claimed_by_session = p_session_id order by position limit 1;
  select coalesce(sum(trunc(coalesce(amount_pesewas, 0))::int), 0) into unpaid_sum
    from bill_split_shares where split_id = v_split.id and status <> 'paid';

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'position', s.position, 'label', s.label, 'amountPesewas', s.amount_pesewas, 'status', s.status,
      'claimedByName', s.claimed_by_name, 'mine', coalesce(s.claimed_by_session = p_session_id, false), 'shareToken', s.share_token
    ) order by s.position), '[]'::jsonb) into v_shares
  from bill_split_shares s where s.split_id = v_split.id;

  return jsonb_build_object(
    'ok', true,
    'split', jsonb_build_object('id', v_split.id, 'mode', v_split.mode, 'totalPesewas', v_total, 'status', v_split.status),
    'paidPesewas', v_paid,
    'remainingPesewas', greatest(0, v_total - v_paid),
    'items', v_items,
    'shares', v_shares,
    'myShareId', v_mine.id,
    'myShareAmountPesewas', v_mine.amt,
    'unassignedPesewas', greatest(0, v_total - v_paid - unpaid_sum)
  );
end $function$;

-- D4. Even / amounts split board.
--   * Paid and remaining count only payments made against THIS split's shares (a split can now
--     be opened over what is left after an earlier payment).
--   * An idle claim is not released while its holder has a payment in flight.
CREATE OR REPLACE FUNCTION public.split_board(p_session_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sess dining_sessions; v_split record; v_paid int; v_status text; v_shares jsonb;
begin
  v_sess := klown_session_for_token(p_session_token);
  if v_sess.id is null then return jsonb_build_object('ok', false, 'reason', 'invalid_session'); end if;
  if v_sess.table_id is null then return jsonb_build_object('ok', true, 'split', null); end if;

  select sp.id, sp.mode, sp.total_pesewas, sp.status, sp.bill_id into v_split
    from bill_splits sp join bills b on b.id = sp.bill_id
    where b.table_id = v_sess.table_id and sp.status = 'open'
    order by sp.created_at desc limit 1;
  if not found then
    select sp.id, sp.mode, sp.total_pesewas, sp.status, sp.bill_id into v_split
      from bill_splits sp join bills b on b.id = sp.bill_id
      where b.table_id = v_sess.table_id and sp.status = 'settled' and sp.updated_at > now() - interval '30 minutes'
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

-- D5. Everything payment-init and quote need, in ONE round trip (was ~15 sequential queries):
-- session, idempotent replay, the table's bill, its restaurant, payment mode, Paystack split
-- config, amount captured, amount other diners are paying right now, and the share (item
-- shares are recomputed first so the figure is current).
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
  v_paid int; v_pending int; v_mode text; v_sub text;
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
    select id, trunc(coalesce(total_pesewas, 0))::int, status, table_id, restaurant_id
      into b_id, b_total, b_status, b_table, b_rest
      from bills where table_id = v_sess.table_id and status in ('open', 'ready') order by opened_at desc limit 1;
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

-- D6. Atomic reservation + insert of a payment attempt. Under a per-bill lock it re-checks that
-- the amount still fits what is owed, counting payments other diners at the table have in
-- flight (last 10 minutes), and that nobody else is paying the same share. Prevents two people
-- paying the same balance or the same share at the same time. Idempotent per (session, key).
CREATE OR REPLACE FUNCTION public.payment_reserve(
  p_session_id uuid, p_bill_id uuid, p_idem text, p_share_id uuid, p_share_mode text,
  p_amount integer, p_tip integer, p_total integer, p_provider text, p_method text, p_pay_mode text,
  p_charged integer DEFAULT NULL, p_transaction_charge integer DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_att record; b_total int; b_status text; v_paid int; v_pending int; v_remaining int;
  s_id uuid; s_split uuid; s_status text; sp_bill uuid; sp_status text; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_bill_id::text, 0));

  select id, status, amount_pesewas, tip_pesewas, total_pesewas, provider_ref into v_att
    from payment_attempts where session_id = p_session_id and idempotency_key = p_idem;
  if found then
    return jsonb_build_object('ok', true, 'idempotent', true, 'paymentRef', v_att.id, 'status', v_att.status,
      'providerRef', v_att.provider_ref, 'amountPesewas', v_att.amount_pesewas, 'tipPesewas', v_att.tip_pesewas,
      'totalPesewas', v_att.total_pesewas);
  end if;

  if coalesce(p_amount, 0) <= 0 or coalesce(p_total, 0) <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'zero_value');
  end if;

  select trunc(coalesce(total_pesewas, 0))::int, status into b_total, b_status from bills where id = p_bill_id;
  if b_status is null or b_status not in ('open', 'ready') then return jsonb_build_object('ok', false, 'reason', 'no_bill'); end if;

  select coalesce(sum(amount_pesewas), 0) into v_paid from payment_attempts where bill_id = p_bill_id and status = 'captured';
  v_remaining := b_total - v_paid;
  if v_remaining <= 0 then return jsonb_build_object('ok', false, 'reason', 'nothing_due'); end if;
  if p_amount > v_remaining then return jsonb_build_object('ok', false, 'reason', 'overpay', 'remainingPesewas', v_remaining); end if;

  if p_share_id is not null then
    select id, split_id, status into s_id, s_split, s_status from bill_split_shares where id = p_share_id for update;
    if s_id is null then return jsonb_build_object('ok', false, 'reason', 'invalid_share'); end if;
    if s_status = 'paid' then return jsonb_build_object('ok', false, 'reason', 'share_paid'); end if;
    select bill_id, status into sp_bill, sp_status from bill_splits where id = s_split;
    if sp_bill is null or sp_status <> 'open' or sp_bill <> p_bill_id then
      return jsonb_build_object('ok', false, 'reason', 'invalid_share');
    end if;
    if exists (select 1 from payment_attempts where split_share_id = p_share_id and session_id <> p_session_id
               and status in ('initiated', 'pending') and created_at > now() - interval '10 minutes') then
      return jsonb_build_object('ok', false, 'reason', 'share_being_paid');
    end if;
  end if;

  select coalesce(sum(amount_pesewas), 0) into v_pending from payment_attempts
    where bill_id = p_bill_id and status in ('initiated', 'pending') and session_id <> p_session_id
      and created_at > now() - interval '10 minutes';
  if p_amount > v_remaining - v_pending then
    return jsonb_build_object('ok', false, 'reason', 'payment_in_progress',
                              'pendingPesewas', v_pending, 'remainingPesewas', v_remaining);
  end if;

  insert into payment_attempts (session_id, bill_id, idempotency_key, provider, method, split_share_id,
      payment_mode, excluded_from_reports, share_mode, amount_pesewas, tip_pesewas, total_pesewas,
      charged_pesewas, transaction_charge_pesewas, status)
    values (p_session_id, p_bill_id, p_idem, p_provider, p_method, p_share_id,
      p_pay_mode, p_pay_mode = 'test', p_share_mode, p_amount, coalesce(p_tip, 0), p_total,
      p_charged, p_transaction_charge, 'initiated')
    returning id into v_id;
  return jsonb_build_object('ok', true, 'paymentRef', v_id, 'status', 'initiated');
end $function$;

-- Lock down: these SECURITY DEFINER helpers are only for the server (service role).
-- They were callable with the public anon key; internal ones take raw split/session ids.
revoke execute on function public.payment_reserve(uuid,uuid,text,uuid,text,integer,integer,integer,text,text,text,integer,integer) from public, anon, authenticated;
revoke execute on function public.payment_context(text,uuid,text,uuid) from public, anon, authenticated;
revoke execute on function public.items_split_assign(text,uuid,integer,text), public.items_split_assign_remaining(text,text), public.items_split_ensure_share(uuid,uuid,text), public.items_split_payload(uuid,uuid), public.items_split_recompute(uuid), public.items_split_resolve(uuid), public.split_board(text) from public, anon, authenticated;
grant execute on function public.items_split_assign(text,uuid,integer,text), public.items_split_assign_remaining(text,text), public.items_split_ensure_share(uuid,uuid,text), public.items_split_payload(uuid,uuid), public.items_split_recompute(uuid), public.items_split_resolve(uuid), public.split_board(text), public.payment_context(text,uuid,text,uuid), public.payment_reserve(uuid,uuid,text,uuid,text,integer,integer,integer,text,text,text,integer,integer), public.create_bill_split(uuid,uuid,text,integer,jsonb) to service_role;
