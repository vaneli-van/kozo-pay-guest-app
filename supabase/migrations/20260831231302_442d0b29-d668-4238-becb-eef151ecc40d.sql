-- Coordinated bill splitting. RLS ON, no anon policies: access via server routes on the service role.
-- Shares are a coordination layer; settlement stays balance-based in payment_attempts.

create table if not exists public.bill_splits (
  id                 uuid primary key default gen_random_uuid(),
  bill_id            uuid not null references public.bills(id) on delete cascade,
  mode               text not null check (mode in ('even','amounts','items')),
  total_pesewas      integer not null check (total_pesewas >= 0),
  status             text not null default 'open' check (status in ('open','settled','cancelled')),
  created_by_session uuid references public.dining_sessions(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists uq_bill_splits_open
  on public.bill_splits (bill_id) where (status = 'open');

create table if not exists public.bill_split_shares (
  id                 uuid primary key default gen_random_uuid(),
  split_id           uuid not null references public.bill_splits(id) on delete cascade,
  position           integer not null,
  label              text,
  amount_pesewas     integer not null check (amount_pesewas > 0),
  status             text not null default 'unclaimed' check (status in ('unclaimed','claimed','paid')),
  claimed_by_session uuid references public.dining_sessions(id) on delete set null,
  claimed_by_name    text,
  share_token        text not null unique,
  payment_attempt_id uuid references public.payment_attempts(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (split_id, position)
);

create table if not exists public.bill_split_item_assignments (
  id           uuid primary key default gen_random_uuid(),
  split_id     uuid not null references public.bill_splits(id) on delete cascade,
  bill_item_id uuid not null references public.bill_items(id) on delete cascade,
  share_id     uuid references public.bill_split_shares(id) on delete cascade,
  weight       integer not null default 1 check (weight > 0),
  created_at   timestamptz not null default now()
);

alter table public.payment_attempts
  add column if not exists split_share_id uuid references public.bill_split_shares(id) on delete set null;

grant all on public.bill_splits to service_role;
grant all on public.bill_split_shares to service_role;
grant all on public.bill_split_item_assignments to service_role;

create index if not exists idx_shares_split on public.bill_split_shares (split_id, position);
create index if not exists idx_shares_token on public.bill_split_shares (share_token);
create index if not exists idx_assign_split on public.bill_split_item_assignments (split_id);
create index if not exists idx_pa_share on public.payment_attempts (split_share_id);

alter table public.bill_splits enable row level security;
alter table public.bill_split_shares enable row level security;
alter table public.bill_split_item_assignments enable row level security;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_splits_updated on public.bill_splits;
create trigger trg_splits_updated before update on public.bill_splits
  for each row execute function public.set_updated_at();
drop trigger if exists trg_shares_updated on public.bill_split_shares;
create trigger trg_shares_updated before update on public.bill_split_shares
  for each row execute function public.set_updated_at();

-- Atomic, race-safe split creation. p_shares: jsonb array of {label, amount_pesewas, token} in order.
create or replace function public.create_bill_split(
  p_bill uuid, p_session uuid, p_mode text, p_total integer, p_shares jsonb
) returns public.bill_splits
language plpgsql security definer set search_path = public as $$
declare v_split public.bill_splits; v_sum int; v_open int; i int := 0; el jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_bill::text, 0));
  select count(*) into v_open from public.bill_splits where bill_id = p_bill and status = 'open';
  if v_open > 0 then raise exception 'split_exists'; end if;
  select coalesce(sum((e->>'amount_pesewas')::int),0) into v_sum from jsonb_array_elements(p_shares) e;
  if v_sum <> p_total then raise exception 'shares_do_not_sum'; end if;
  insert into public.bill_splits(bill_id, mode, total_pesewas, created_by_session, status)
  values (p_bill, p_mode, p_total, p_session, 'open') returning * into v_split;
  for el in select * from jsonb_array_elements(p_shares) loop
    i := i + 1;
    insert into public.bill_split_shares(split_id, position, label, amount_pesewas, share_token)
    values (v_split.id, i, el->>'label', (el->>'amount_pesewas')::int, el->>'token');
  end loop;
  return v_split;
end $$;