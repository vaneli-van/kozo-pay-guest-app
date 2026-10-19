-- Orders moved to another table (Baobab waiter app "Move", the register's Transfer):
-- the Klown bill follows its order instead of being voided and recreated. See
-- src/integrations/pos/table-moves.ts.
--
--  * odoo_line_ids: the POS order line ids the bill currently mirrors. When the POS merges
--    one order into another (the moved order is cancelled and its lines join the order on
--    the new table), the line ids are how the next sync knows where the bill went.
--  * merged_into_bill_id: set on a bill that was folded into another bill that way, so the
--    trail from a voided bill to the bill that carried its payments stays readable.
-- Additive and nullable: the running sync works the same with or without them.

alter table public.bills add column if not exists odoo_line_ids integer[];
alter table public.bills add column if not exists merged_into_bill_id uuid references public.bills(id) on delete set null;
create index if not exists idx_bills_merged_into on public.bills (merged_into_bill_id) where merged_into_bill_id is not null;
