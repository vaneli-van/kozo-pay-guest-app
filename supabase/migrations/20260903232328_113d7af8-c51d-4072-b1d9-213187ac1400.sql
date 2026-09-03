alter table public.bill_split_shares drop constraint if exists bill_split_shares_amount_pesewas_check;
alter table public.bill_split_shares add constraint bill_split_shares_amount_pesewas_check check (amount_pesewas >= 0);
create unique index if not exists uq_assign_line_share on public.bill_split_item_assignments (split_id, bill_item_id, share_id);