-- Who bears Paystack's 1.95% processing fee, per restaurant (see split.server.ts):
--   'customer'   (default, unchanged behaviour): the diner's surcharge covers Paystack's fee and
--                Klown's fee; the restaurant receives exactly the bill.
--   'restaurant': the diner's surcharge is Klown's fee only; Paystack deducts its fee from the
--                restaurant's share (bearer = subaccount).
-- Switching a restaurant to 'restaurant' normally goes with klown_fee_bps = 100 (1%).
alter table public.restaurants add column if not exists paystack_fee_bearer text not null default 'customer'
  check (paystack_fee_bearer in ('customer', 'restaurant'));
