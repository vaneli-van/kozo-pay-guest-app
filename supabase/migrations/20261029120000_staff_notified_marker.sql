-- Per-payment marker: set once the waiter/cashier SMS step has run for a captured attempt
-- (sent, or nothing to send). The reconcile sweep re-sends for any captured attempt left
-- without it, e.g. when the request doing the capture was cut off (Baobab table 05, 29 Oct).
alter table public.payment_attempts add column if not exists staff_notified_at timestamptz;
create index if not exists payment_attempts_staff_unnotified_idx
  on public.payment_attempts (updated_at) where status = 'captured' and staff_notified_at is null;
