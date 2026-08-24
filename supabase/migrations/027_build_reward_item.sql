-- item rewards. A finished build has always shown the player a "succulent plant" beside its coins and XP; that text was a literal in BuildComplete.tsx with nothing behind it — no row, no grant, no model.
--
-- Nullable on purpose, and expected to stay null for a while: no plant item exists in item_buy yet (there are no 'deco' rows at all), and it cannot be seeded here because the model, its measured sizes and its placement metadata are authored in Modu-Portal at upload time — inventing a footprint here would put a wrongly-sized item into the room's placement grid, and the id would collide with whatever the portal later creates. Until such a row exists and is named by the update at the foot of this file, this column changes nothing a player sees, which is the correct behaviour rather than a gap: the completion screen drops the item entirely when it is null instead of promising something undeliverable.

begin;

alter table public.item_build
  add column if not exists reward_item_id text references public.item_buy (id);

comment on column public.item_build.reward_item_id is
  'The item_buy item granted on completing this build, beside the coins and XP. Null = currency only. Hand-authored curation like duration_min, never generated.';

-- reward_build: the grant amount is SERVER-AUTHORITATIVE — read from item_build (xp_reward/coin_reward), not trusted from the client. An item not yet seeded grants 0 (graceful).
-- Level-aware: level is recomputed from the new xp total and returned so the client can celebrate a level-up without a second round trip.
--
-- Since 027 it also grants item_build.reward_item_id, in this same transaction, so a build cannot pay its coins and lose its item. It is therefore the SECOND writer of user_buy — purchase_item is the other.
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
  v_reward_item text;
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
  select coin_reward, xp_reward, reward_item_id
    into v_coins, v_xp, v_reward_item
    from public.item_build where id = p_furniture_id;
  v_coins := coalesce(v_coins, 0);
  v_xp    := coalesce(v_xp, 0);

  -- Idempotent: a second reward for the same (user, furniture) hits the partial unique index and is skipped.
  insert into public.transaction (user_id, item_id, source, coins_delta, xp_delta)
    values (v_uid, p_furniture_id, 'build_complete', v_coins, v_xp)
  on conflict (user_id, item_id) where source = 'build_complete'
    do nothing
  returning transaction_id into v_ledger_id;

  -- ABOVE the already-rewarded return, so this runs on BOTH branches and `reward_item` in the returned jsonb always names an item that is genuinely in the caller's user_buy. Putting it below instead would report an item to a player who never received one: everyone completes their builds while reward_item_id is null (the state this migration ships in), so the day a furniture is finally wired, every past builder who replays a completion — the Redo button on the completion screen makes that one tap — would be told they own something no insert ever gave them, and the client would mark it owned on that word alone.
  -- Currency cannot be granted twice because the ledger's partial unique index is what gates it, and that gate is untouched. Ownership is a SET, not a payment: `on conflict do nothing` makes a repeat a no-op, absorbs the player who already bought this item, and lets a pre-wiring completion self-heal on the next call.
  if v_reward_item is not null then
    insert into public.user_buy (owner_id, item_id) values (v_uid, v_reward_item)
    on conflict (owner_id, item_id) do nothing;
  end if;

  if v_ledger_id is null then
    select coin, xp, level into v_new_coins, v_new_xp, v_new_level from public.user_profile where user_id = v_uid;
    return jsonb_build_object('ok', true, 'already_rewarded', true, 'coins', v_new_coins, 'xp', v_new_xp, 'level', v_new_level, 'leveled_up', false, 'reward_item', v_reward_item);
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
    'leveled_up', v_new_level > coalesce(v_old_level, 1),
    'reward_item', v_reward_item
  );
end;
$$;

comment on function public.purchase_item(text) is
  'Atomic purchase from item_buy. One of TWO writers of user_buy since migration 027 — reward_build writes the other, granting a finished build its reward_item_id.';

commit;

-- Wiring, once a reward item exists in item_buy (published through Modu-Portal — it needs a model, measured sizes and placement metadata, none of which can be invented here). The FK refuses an id that does not exist, so this cannot silently point at nothing:
--
--   update public.item_build set reward_item_id = '<item-buy-id>' where id = '<furniture-id>';

-- Expect column_present = 1, fk_present = 1, and rewards_wired = 0 until the update above is run.
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'item_build' and column_name = 'reward_item_id') as column_present,
  (select count(*) from pg_constraint
    where conrelid = 'public.item_build'::regclass and contype = 'f'
      and pg_get_constraintdef(oid) like '%reward_item_id%')                                        as fk_present,
  (select count(*) from public.item_build where reward_item_id is not null)                         as rewards_wired;
