-- Klown: per-restaurant switch for the new diner screens (redesign "B"). 2026-10-15.
-- Backward compatible: every restaurant stays on 'classic' (today's screens) unless switched to
-- 'v2'. The diner reads this from qr-resolve; nothing else changes.

alter table public.restaurants add column if not exists diner_ui text not null default 'classic';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'restaurants_diner_ui_check') then
    alter table public.restaurants add constraint restaurants_diner_ui_check check (diner_ui in ('classic', 'v2'));
  end if;
end $$;

-- First restaurant on the new screens: the test restaurant (test payments only).
update public.restaurants set diner_ui = 'v2' where id = '954ea6bb-de62-40ff-bc9b-5e21bc971d7a';
