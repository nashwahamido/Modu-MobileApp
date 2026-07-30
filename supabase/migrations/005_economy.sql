-- Economy: the coin/XP ledger, per-user inventory, and the RPCs that are the ONLY sanctioned writers
-- of coins/xp/inventory (reward_build, purchase_item, sync_furniture_counts).

-- The ledger: an append-only history of every coin/XP change, behind user_profile.coin (a cache).
-- coins_delta is signed (+earn / -spend); xp only ever earns. One row per earn or spend. item_id is
-- the item the row is ABOUT — the built furniture (build_complete) or the bought item (purchase);
-- null for item-less sources (bonus, level_up). It's a soft CatalogId (spans item_build + item_buy),
-- so no FK.
create table if not exists public.transaction (
  transaction_id uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  item_id      text,                                       -- built furniture / bought item; null for bonus/level_up
  source       text not null check (source in
                 ('build_complete', 'bonus', 'level_up',   -- earns (+)
                  'purchase')),                             -- spends (-)
  coins_delta  integer not null default 0,   -- +earn / -spend
  xp_delta     integer not null default 0,   -- earned only (>= 0)
  created_at   timestamptz not null default now()
);

-- One build_complete reward per furniture per user — mirrors user_build's PK, so a retry or
-- double-tap cannot double-reward the same finished build. Partial: applies ONLY to build_complete
-- rows, leaving purchases/bonuses free to repeat.
create unique index if not exists transaction_build_unique
  on public.transaction (user_id, item_id)
  where source = 'build_complete';

-- Fast per-user history + "last change" lookups.
create index if not exists transaction_user_time
  on public.transaction (user_id, created_at desc);

alter table public.transaction enable row level security;

-- Users may read their OWN ledger only. There is deliberately no INSERT/UPDATE/DELETE policy: the
-- ledger is written exclusively by the security-definer RPCs reward_build + purchase_item, so a
-- client can never forge a coin/XP change.
drop policy if exists transaction_select on public.transaction;
create policy transaction_select on public.transaction
  for select to authenticated using (auth.uid() = user_id);

-- Per-user inventory: one row per owned item, private to the owner. The purchasable CATALOG is
-- item_buy — this table just holds OWNERSHIP. Grants happen only through purchase_item, so there is
-- deliberately no client INSERT policy.
create table if not exists public.user_buy (
  owner_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null references public.item_buy (id),
  acquired_at timestamptz not null default now(),
  primary key (owner_id, item_id)
);

alter table public.user_buy enable row level security;

drop policy if exists user_buy_select on public.user_buy;
create policy user_buy_select on public.user_buy
  for select to authenticated using (auth.uid() = owner_id);

-- reward_build: the grant amount is SERVER-AUTHORITATIVE — read from item_build
-- (xp_reward/coin_reward), not trusted from the client. An item not yet seeded grants 0 (graceful).
-- Level-aware: level is recomputed from the new xp total and returned so the client can celebrate a
-- level-up without a second round trip.
create or replace function public.reward_build(p_furniture_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_coins integer;
  v_xp integer;
  v_ledger_id uuid;
  v_new_coins integer;
  v_new_xp integer;
  v_old_level integer;
  v_new_level integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_furniture_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_furniture_id');
  end if;

  -- Server-authoritative: the reward comes from the catalog, not the client. 0 if not seeded yet.
  select coin_reward, xp_reward into v_coins, v_xp from public.item_build where id = p_furniture_id;
  v_coins := coalesce(v_coins, 0);
  v_xp    := coalesce(v_xp, 0);

  -- Idempotent: a second reward for the same (user, furniture) hits the partial unique index and is skipped.
  insert into public.transaction (user_id, item_id, source, coins_delta, xp_delta)
    values (v_uid, p_furniture_id, 'build_complete', v_coins, v_xp)
  on conflict (user_id, item_id) where source = 'build_complete'
    do nothing
  returning transaction_id into v_ledger_id;

  if v_ledger_id is null then
    select coin, xp, level into v_new_coins, v_new_xp, v_new_level from public.user_profile where user_id = v_uid;
    return jsonb_build_object('ok', true, 'already_rewarded', true, 'coins', v_new_coins, 'xp', v_new_xp, 'level', v_new_level, 'leveled_up', false);
  end if;

  select level into v_old_level from public.user_profile where user_id = v_uid;

  -- level is DERIVED from the new xp total, not incremented: replaying the ledger always lands on the same level.
  update public.user_profile
     set coin  = coin + v_coins,
         xp    = xp + v_xp,
         level = public.level_for_xp(xp + v_xp)
   where user_id = v_uid
  returning coin, xp, level into v_new_coins, v_new_xp, v_new_level;

  return jsonb_build_object(
    'ok', true,
    'already_rewarded', false,
    'coins', v_new_coins,
    'xp', v_new_xp,
    'level', v_new_level,
    'leveled_up', v_new_level > coalesce(v_old_level, 1)
  );
end;
$$;

-- Atomic purchase from item_buy: ownership + level gate + funds, deduct coins, grant the item, and
-- write the spend to the ledger — all in one transaction. Security definer; the only writer of user_buy.
create or replace function public.purchase_item(p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_price integer;
  v_min_level integer;
  v_coins integer;
  v_level integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select price, min_level into v_price, v_min_level from public.item_buy where id = p_item_id;
  if v_price is null then
    return jsonb_build_object('ok', false, 'reason', 'no_such_item');
  end if;

  if exists (select 1 from public.user_buy where owner_id = v_uid and item_id = p_item_id) then
    return jsonb_build_object('ok', false, 'reason', 'already_owned');
  end if;

  -- Lock the profile row so a concurrent purchase can't spend the same coins twice.
  select coin, level into v_coins, v_level from public.user_profile where user_id = v_uid for update;
  if v_coins is null then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_coins');
  end if;
  if v_level < v_min_level then
    return jsonb_build_object('ok', false, 'reason', 'level_locked', 'min_level', v_min_level);
  end if;
  if v_coins < v_price then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_coins');
  end if;

  update public.user_profile set coin = coin - v_price where user_id = v_uid;
  insert into public.user_buy (owner_id, item_id) values (v_uid, p_item_id);
  insert into public.transaction (user_id, item_id, source, coins_delta, xp_delta)
    values (v_uid, p_item_id, 'purchase', -v_price, 0);

  return jsonb_build_object('ok', true, 'coins', v_coins - v_price);
end;
$$;

-- Sync-on-load: the local recipe is the single source for a built furniture's counts. The app calls
-- this every time a furniture loads (hooks/useCatalogSync), so item_build.step_count (and thus the
-- GENERATED xp_reward/coin_reward) tracks the recipe without being hand-maintained.
--
-- The client supplies only the COUNTS; the per-step RATES stay DB-authored and this function never
-- touches them. It is SECURITY DEFINER writing a GLOBAL row, so it is bounded: no anonymous callers,
-- and implausible counts are ignored — a modded client could otherwise multiply EVERY player's reward
-- for a furniture (reward = count x rate), not just its own. The caps do NOT make the counts
-- trustworthy — a signed-in client can still report a wrong-but-plausible number; they cap the blast
-- radius. The real fix is to stop pushing recipe counts from the client at all (they are build-time
-- constants); see the note at the bottom.
create or replace function public.sync_furniture_counts(
  p_furniture_id  text,
  p_step_count    integer,
  p_stage_count   integer,
  p_cluster_count integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No anonymous callers. The client already gates this on a signed-in user (useCatalogSync).
  if auth.uid() is null then
    return;
  end if;
  if p_furniture_id is null
     or p_step_count is null or p_step_count < 0
     or p_stage_count is null or p_stage_count < 0
     or p_cluster_count is null or p_cluster_count < 0 then
    return;
  end if;
  -- Ceilings an order of magnitude above the largest real recipe (EKET, ~147 steps). A recipe that
  -- legitimately exceeds these wants a migration, not a silent client push.
  if p_step_count > 2000 or p_stage_count > 200 or p_cluster_count > 200 then
    raise warning 'sync_furniture_counts: implausible counts for % (%/%/%), ignored',
      p_furniture_id, p_step_count, p_stage_count, p_cluster_count;
    return;
  end if;
  update public.item_build
     set step_count    = p_step_count,
         stage_count   = p_stage_count,
         cluster_count = p_cluster_count
   where id = p_furniture_id
     and (step_count, stage_count, cluster_count)
         is distinct from (p_step_count, p_stage_count, p_cluster_count);
end;
$$;

-- STILL OPEN, both needing a client change to go with them:
--
--   a) user_build has a `for all` policy, so a client can INSERT completion rows directly (self-granting
--      furniture and inflating assembly_count), and reward_build never checks that a user_build row
--      exists — so a fresh account can call it and be paid for a build it never started. Fixing it means
--      a complete_build() RPC plus reordering the client's reward/complete pair, which currently rewards
--      first on purpose (complete() deletes the in-progress save).
--
--   b) user_room.placements is unvalidated jsonb, never checked against user_buy / user_build — so items
--      can be placed without owning them, which makes the coin gate cosmetic even once (a) is closed.
--
--   c) sync_furniture_counts should not exist. The counts are build-time constants derived from the local
--      recipe; write them in a migration (or a service-role CI step) and drop the client push entirely.
