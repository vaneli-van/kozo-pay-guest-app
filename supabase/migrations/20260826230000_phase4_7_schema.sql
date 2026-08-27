-- Klown/Kozo Pay — Phases 4–7 schema (idempotent; records tables applied to the DB).
-- Bills line items + disputes, payments, receipts, rewards, feedback. RLS ON, no anon policies:
-- diners never touch the Data API; all access is via server routes using the service role.

create table if not exists public.bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills(id) on delete cascade,
  name text not null, qty integer not null default 1 check (qty > 0),
  line_total_pesewas integer not null check (line_total_pesewas >= 0),
  sort int not null default 0, created_at timestamptz not null default now());

create table if not exists public.bill_disputes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.dining_sessions(id) on delete cascade,
  bill_id uuid references public.bills(id) on delete set null,
  note text, status text not null default 'open' check (status in ('open','ack','resolved')),
  created_at timestamptz not null default now());

create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.dining_sessions(id) on delete cascade,
  bill_id uuid references public.bills(id) on delete set null,
  idempotency_key text not null, provider text not null, method text, share_mode text,
  amount_pesewas integer not null check (amount_pesewas > 0),
  tip_pesewas integer not null default 0 check (tip_pesewas >= 0),
  total_pesewas integer not null check (total_pesewas > 0),
  status text not null default 'initiated' check (status in ('initiated','pending','captured','failed','cancelled')),
  provider_ref text, failure_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (session_id, idempotency_key));

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.dining_sessions(id) on delete cascade,
  bill_id uuid references public.bills(id) on delete set null,
  receipt_number text not null unique, total_paid_pesewas integer not null default 0 check (total_paid_pesewas >= 0),
  issued_at timestamptz not null default now(), created_at timestamptz not null default now());

create table if not exists public.rewards_consent (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.dining_sessions(id) on delete cascade,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  phone text not null, first_name text,
  receipt_consent boolean not null default false, rewards_consent boolean not null default false,
  marketing_consent boolean not null default false, consent_version text not null default 'v1',
  created_at timestamptz not null default now());

create table if not exists public.rewards_activity (
  id uuid primary key default gen_random_uuid(),
  consent_id uuid references public.rewards_consent(id) on delete cascade,
  phone text not null, points integer not null default 0, reason text,
  created_at timestamptz not null default now());

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.dining_sessions(id) on delete cascade,
  rating integer check (rating between 1 and 5), comment text, sentiment text,
  created_at timestamptz not null default now());

alter table public.bill_items enable row level security;
alter table public.bill_disputes enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.receipts enable row level security;
alter table public.rewards_consent enable row level security;
alter table public.rewards_activity enable row level security;
alter table public.feedback enable row level security;

create index if not exists idx_bill_items_bill on public.bill_items(bill_id, sort);
create index if not exists idx_pay_session on public.payment_attempts(session_id, created_at desc);
create index if not exists idx_pay_ref on public.payment_attempts(provider_ref);
create index if not exists idx_pay_bill_status on public.payment_attempts(bill_id, status);
create index if not exists idx_receipts_session on public.receipts(session_id);
create index if not exists idx_consent_phone on public.rewards_consent(phone);
