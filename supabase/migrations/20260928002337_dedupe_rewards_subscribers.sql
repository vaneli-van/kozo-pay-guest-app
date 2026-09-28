-- Dedupe rewards subscribers + signup bonuses (admin P0-2 / P0-3).
--
-- Klown Pay checkout previously inserted a fresh rewards_consent row on every
-- checkout and re-awarded the 120-point welcome bonus each time, so a returning
-- diner appeared as multiple subscribers with inflated points. The endpoint is
-- now deduped in code; this one-time migration collapses the rows already there
-- and adds a DB-level guard so it cannot recur through any path.
--
-- Grain decisions (match the diner endpoint):
--   * one subscriber (rewards_consent) per (phone, restaurant_id)
--   * one 'signup' bonus per phone, Klown-wide

begin;

-- Canonical (earliest) consent row per (phone, restaurant_id). DISTINCT ON
-- treats NULL restaurant_id values as a single group, which is what we want.
create temporary table _canon on commit drop as
select distinct on (phone, restaurant_id)
       id as canon_id, phone, restaurant_id
from public.rewards_consent
order by phone, restaurant_id, created_at asc;

-- 1. Re-point activities from duplicate consent rows onto the canonical row
--    BEFORE deleting duplicates (rewards_activity.consent_id cascades on delete).
update public.rewards_activity ra
set consent_id = c.canon_id
from public.rewards_consent rc
join _canon c
  on c.phone = rc.phone
 and c.restaurant_id is not distinct from rc.restaurant_id
where ra.consent_id = rc.id
  and rc.id <> c.canon_id;

-- 2. OR-merge the consent flags into the canonical row (once opted in, stays in).
update public.rewards_consent canon
set receipt_consent   = agg.receipt_consent,
    rewards_consent   = agg.rewards_consent,
    marketing_consent = agg.marketing_consent,
    first_name        = coalesce(canon.first_name, agg.first_name)
from (
  select c.canon_id,
         bool_or(rc.receipt_consent)   as receipt_consent,
         bool_or(rc.rewards_consent)   as rewards_consent,
         bool_or(rc.marketing_consent) as marketing_consent,
         max(rc.first_name)            as first_name
  from public.rewards_consent rc
  join _canon c
    on c.phone = rc.phone
   and c.restaurant_id is not distinct from rc.restaurant_id
  group by c.canon_id
) agg
where canon.id = agg.canon_id;

-- 3. Delete the duplicate consent rows (their activities are already re-pointed).
delete from public.rewards_consent rc
using _canon c
where c.phone = rc.phone
  and c.restaurant_id is not distinct from rc.restaurant_id
  and rc.id <> c.canon_id;

-- 4. Collapse signup bonuses to one per phone (keep the earliest).
delete from public.rewards_activity ra
using (
  select id,
         row_number() over (partition by phone order by created_at asc) as rn
  from public.rewards_activity
  where reason = 'signup'
) d
where ra.id = d.id and d.rn > 1;

-- 5. Enforce one subscriber per (phone, restaurant) going forward. Expression
--    index (portable across PG versions) buckets NULL restaurant_id together.
create unique index if not exists uq_rewards_consent_phone_restaurant
  on public.rewards_consent (phone, coalesce(restaurant_id, '00000000-0000-0000-0000-000000000000'::uuid));

commit;
