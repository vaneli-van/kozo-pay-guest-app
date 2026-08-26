-- Repo tracking migration for the existing Klown Pay schema. Idempotent: nothing is dropped or recreated.

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  google_place_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.qr_tokens (
  token text primary key,
  table_id uuid not null references public.restaurant_tables(id) on delete cascade,
  status text not null default 'active',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.restaurant_tables(id) on delete cascade,
  status text not null default 'open',
  subtotal_pesewas integer not null default 0,
  service_charge_pesewas integer not null default 0,
  total_pesewas integer not null default 0,
  opened_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.dining_sessions (
  id uuid primary key default gen_random_uuid(),
  session_token text not null,
  table_id uuid not null references public.restaurant_tables(id) on delete cascade,
  active_bill_id uuid references public.bills(id) on delete set null,
  status text not null default 'active',
  bill_status text not null default 'none',
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '4 hours'),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.dining_sessions(id) on delete set null,
  type text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Service role only: no anon/authenticated grants or policies by design.
grant all on public.restaurants to service_role;
grant all on public.branches to service_role;
grant all on public.restaurant_tables to service_role;
grant all on public.qr_tokens to service_role;
grant all on public.bills to service_role;
grant all on public.dining_sessions to service_role;
grant all on public.audit_events to service_role;

alter table public.restaurants enable row level security;
alter table public.branches enable row level security;
alter table public.restaurant_tables enable row level security;
alter table public.qr_tokens enable row level security;
alter table public.bills enable row level security;
alter table public.dining_sessions enable row level security;
alter table public.audit_events enable row level security;