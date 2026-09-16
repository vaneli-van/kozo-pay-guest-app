-- Paystack Transaction Split: per-restaurant direct settlement.
-- Each restaurant is paid directly to its own bank subaccount; Klown takes a
-- flat commission (klown_fee_bps, default 0.50%) via transaction_charge, and the
-- diner covers the folded-in fee (surfaced only at the MoMo/card point of payment).
-- All columns nullable / defaulted: a restaurant with no subaccount_code keeps the
-- current behaviour (single-account collection), so this migration is behaviour-safe.

alter table public.restaurants
  add column if not exists paystack_subaccount_code text,     -- ACCT_xxx from Paystack; null = split OFF for this restaurant
  add column if not exists klown_fee_bps integer not null default 50, -- Klown commission in basis points (50 = 0.50%)
  add column if not exists settlement_bank_code text,         -- Paystack bank code (from /bank?currency=GHS)
  add column if not exists settlement_account_number text,    -- restaurant's bank account number
  add column if not exists settlement_account_name text;      -- resolved account name (Paystack /bank/resolve)

comment on column public.restaurants.paystack_subaccount_code is 'Paystack subaccount (ACCT_...). When set, diner payments split: bill goes to this bank subaccount, Klown keeps klown_fee_bps via transaction_charge. Null = no split (single-account collection).';
comment on column public.restaurants.klown_fee_bps is 'Klown commission in basis points on top of Paystack fee. Default 50 = 0.50%.';
