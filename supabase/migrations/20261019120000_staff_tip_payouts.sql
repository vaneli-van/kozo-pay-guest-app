-- Tips go to the waiter (Baobab first). The diner's tip stays in Klown's Paystack balance
-- instead of settling to the restaurant's subaccount with the bill; once a day each waiter
-- is paid their tips by Paystack Transfer to their mobile money wallet (Paystack's GH₵1
-- transfer fee deducted from the payout). See src/integrations/payments/tips.server.ts.
--
-- Only restaurants with tips_to_staff = true, only live payments, and only when the bill's
-- waiter has an active payout account. Otherwise the tip settles with the bill, as before.

alter table public.restaurants add column if not exists tips_to_staff boolean not null default false;

-- The waiter who opened the bill's order(s) on the POS (Odoo hr.employee id). Set by the POS sync.
alter table public.bills add column if not exists server_employee_id integer;

-- One mobile money wallet per waiter per restaurant.
create table if not exists public.staff_payout_accounts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  odoo_employee_id integer not null,
  staff_name text not null,
  momo_number text not null check (momo_number ~ '^0[0-9]{9}$'),
  momo_provider text not null check (momo_provider in ('MTN', 'VOD', 'ATL')),
  paystack_recipient_code text,
  verified_name text,          -- the wallet's registered name, from Paystack
  approved boolean not null default false,   -- name checked (automatically when it matches staff_name)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, odoo_employee_id)
);
alter table public.staff_payout_accounts enable row level security;

-- One payout per waiter per run: the tips it covers point at it (payment_attempts.tip_payout_id).
create table if not exists public.tip_payouts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  payout_account_id uuid not null references public.staff_payout_accounts(id),
  tips_pesewas integer not null check (tips_pesewas > 0),
  fee_pesewas integer not null check (fee_pesewas >= 0),
  amount_pesewas integer not null check (amount_pesewas > 0 and amount_pesewas = tips_pesewas - fee_pesewas),
  tip_count integer not null,
  period_end timestamptz not null,
  -- claimed -> processing -> paid | failed (retried next run with a new transfer reference)
  status text not null default 'claimed' check (status in ('claimed', 'processing', 'paid', 'failed', 'needs_otp')),
  transfer_attempt integer not null default 0,
  transfer_reference text unique,
  transfer_code text,
  failure_reason text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tip_payouts enable row level security;
create index if not exists idx_tip_payouts_open on public.tip_payouts (status) where status in ('claimed', 'processing', 'failed', 'needs_otp');

-- On each payment: who the tip is for (snapshot at payment time) and which payout paid it.
alter table public.payment_attempts add column if not exists tip_payout_account_id uuid references public.staff_payout_accounts(id);
alter table public.payment_attempts add column if not exists tip_payout_id uuid references public.tip_payouts(id);
create index if not exists idx_pay_tips_unpaid on public.payment_attempts (tip_payout_account_id)
  where tip_payout_account_id is not null and tip_payout_id is null;

-- Atomically gather every captured, unpaid, live tip paid before p_cutoff into one payout per
-- waiter. A waiter whose tips don't cover the fee plus p_min_net waits for the next run.
-- Each tip can only ever be claimed once (tip_payout_id is set in the same statement).
create or replace function public.tip_payouts_claim(p_restaurant uuid, p_cutoff timestamptz, p_fee integer, p_min_net integer)
returns setof public.tip_payouts
language plpgsql security definer set search_path = public as $$
declare r record; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('tip_payouts_claim:' || p_restaurant::text));
  for r in
    select pa.tip_payout_account_id as acct, sum(pa.tip_pesewas)::int as tips, count(*)::int as n
      from payment_attempts pa
      join staff_payout_accounts a on a.id = pa.tip_payout_account_id
     where a.restaurant_id = p_restaurant and a.active
       and pa.status = 'captured' and pa.payment_mode = 'live'
       and pa.tip_payout_id is null and pa.tip_pesewas > 0
       and pa.updated_at < p_cutoff
     group by pa.tip_payout_account_id
    having sum(pa.tip_pesewas) - p_fee >= p_min_net
  loop
    insert into tip_payouts (restaurant_id, payout_account_id, tips_pesewas, fee_pesewas, amount_pesewas, tip_count, period_end)
      values (p_restaurant, r.acct, r.tips, p_fee, r.tips - p_fee, r.n, p_cutoff)
      returning id into v_id;
    update payment_attempts pa set tip_payout_id = v_id
     where pa.tip_payout_account_id = r.acct and pa.status = 'captured' and pa.payment_mode = 'live'
       and pa.tip_payout_id is null and pa.tip_pesewas > 0 and pa.updated_at < p_cutoff;
    return query select * from tip_payouts where id = v_id;
  end loop;
end $$;
revoke all on function public.tip_payouts_claim(uuid, timestamptz, integer, integer) from public, anon, authenticated;
