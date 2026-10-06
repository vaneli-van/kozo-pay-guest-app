-- ROLLBACK for 20261006090000_split_payment_audit.sql: restores the pre-audit function bodies.
-- (Columns charged_pesewas / transaction_charge_pesewas and the new functions can stay; nothing old uses them.)
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
  select id, bill_id, mode, status into v_split from bill_splits where id = p_split_id;
  if not found or v_split.mode <> 'items' or v_split.status <> 'open' then return; end if;
  select trunc(coalesce(total_pesewas, 0))::int into v_total from bills where id = v_split.bill_id;
  if not found then return; end if;

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
    from bill_split_shares where split_id = v_split.id and status = 'paid';
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
      if unpaid_status[i] <> 'paying' then
        delete from bill_split_shares where id = unpaid_ids[i] and status <> 'paid';
      end if;
      continue;
    end if;
    if sl[i] <> unpaid_amount[i] then
      update bill_split_shares set amount_pesewas = sl[i], updated_at = v_now where id = unpaid_ids[i] and status <> 'paid';
    end if;
  end loop;
end $function$;
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
  v_total := v_split.total;
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
    update bill_split_shares set status = 'unclaimed', claimed_by_session = null, claimed_by_name = null
      where split_id = v_split.id and status = 'claimed' and updated_at < now() - interval '10 minutes';
  end if;
  select coalesce(sum(coalesce(amount_pesewas, 0)), 0) into v_paid from payment_attempts where bill_id = v_split.bill_id and status = 'captured';
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
