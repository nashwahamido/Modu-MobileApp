-- DEMO RESET — dev/showcase tooling. Drop this alongside 008_dev_tools.sql before any real launch.
--
-- Puts a showcase account back to its opening position when the demo player leaves, so the next
-- attendee meets an established-but-unplayed room rather than the previous person's half-finished
-- build and empty wallet. Wipes builds, saved assemblies and the coin ledger; sets the balance to a
-- flat 2000; puts each character back into its own Helping Mode; and takes back every bought item
-- EXCEPT the starter grant and whatever is currently standing in the room — a demo whose room lost
-- its furniture would be worse than one that kept a stranger's shopping.
--
-- THE CALLER RESETS ONLY ITSELF, and the rule is fixed here rather than passed in, for exactly the
-- reason 008 spells out: a security-definer function that took a user id from the client would be a
-- mass-wipe primitive for anyone holding the (public) anon key. auth.uid() is the only account this
-- can ever touch.
--
-- The second guard is the allowlist below. Without it a real player could call this on themselves
-- and lose their account to a stray tap, so an account that is not listed as a demo is refused.

begin;

-- WHICH ACCOUNTS ARE DEMOS. The roster the app reads lives in EXPO_PUBLIC_SHOWCASE_ACCOUNTS (see
-- src/dev/showcase.ts), which is a bundle-time env var the database cannot see — so it has to be
-- restated here. Kept as a TABLE rather than hardcoded into the function so adding a demo account is
-- an insert rather than a migration.
-- profile_mode is the account's Helping Mode, which is also what picks its avatar art — the two are
-- one field in this schema (user_profile.avatar_id -> avatars.mode). It has to be stored per account
-- because each demo character is set up in a different mode, and a reset that left the previous
-- attendee's mode on the account would hand the next one the wrong companion. FK'd to avatars so a
-- typo is rejected at insert rather than silently skipping the restore. NULL leaves the mode alone.
create table if not exists public.demo_account (
  email        text primary key,
  profile_mode text references public.avatars (mode),
  added_at     timestamptz not null default now()
);

comment on table public.demo_account is
  'Allowlist of showcase/demo accounts that may reset themselves via dev_reset_demo_account(). Mirror of EXPO_PUBLIC_SHOWCASE_ACCOUNTS. Readable only by SECURITY DEFINER functions.';

-- RLS on with NO policies, deliberately: the table is consulted only from inside the security-definer
-- function below, which bypasses RLS. A client has no reason to read the demo roster, and leaving it
-- selectable would publish the demo emails to anyone holding the anon key.
alter table public.demo_account enable row level security;

-- THE ROSTER, seeded here rather than left to a manual step: an empty table means the function
-- refuses every caller, so a schema reset that forgot this would disable the reset silently and look
-- like the demo simply not resetting any more.
--
-- The emails come from EXPO_PUBLIC_SHOWCASE_ACCOUNTS and the modes from SHOWCASE_PERSONAS, both in
-- src/dev/showcase.ts — personaFor() matches a persona's `placeholder` against the env label, which
-- is what pairs ada->Felix, bella->Sparky, clara->Lumi and daria->Pebble. Nothing checks these two
-- lists against each other, so re-casting a persona or re-pointing the env means editing both.
--
-- No secret is committed by this: EXPO_PUBLIC_* is compiled into the app bundle and readable by
-- anyone holding it (showcase.ts says so itself), and the shared demo password is NOT here.
insert into public.demo_account (email, profile_mode) values
  ('ada@modu.com',   'control'),
  ('bella@modu.com', 'momentum'),
  ('clara@modu.com', 'visual'),
  ('daria@modu.com', 'clearPath')
on conflict (email) do update set profile_mode = excluded.profile_mode;

create or replace function public.dev_reset_demo_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller       uuid := auth.uid();
  v_email        text;
  v_listed       boolean;
  v_mode         text;
  v_saves        integer;
  v_builds       integer;
  v_ledger       integer;
  v_items_taken  integer;
begin
  if v_caller is null then
    raise exception 'dev_reset_demo_account: sign in first';
  end if;

  select u.email into v_email from auth.users u where u.id = v_caller;

  -- Both answers in one lookup. A miss leaves BOTH null (plpgsql assigns nulls when a SELECT INTO
  -- finds no row, rather than raising), so v_listed is what distinguishes "not a demo account" from
  -- "a demo account with no mode pinned".
  select true, d.profile_mode
  into v_listed, v_mode
  from public.demo_account d
  where lower(d.email) = lower(v_email);

  if not coalesce(v_listed, false) then
    raise exception 'dev_reset_demo_account: % is not a demo account', coalesce(v_email, '(anonymous)');
  end if;

  -- Saved progress: every part-finished assembly, with its completed steps, tighten and drive state.
  with gone as (delete from public.user_save where builder_id = v_caller returning 1)
  select count(*) into v_saves from gone;

  -- The finished-build records. Deleting these fires user_build_sync, which walks assembly_count back
  -- down one row at a time — so the profile update below lands on an already-correct count and only
  -- pins it, rather than fighting the trigger.
  with gone as (delete from public.user_build where builder_id = v_caller returning 1)
  select count(*) into v_builds from gone;

  -- The coin/xp ledger. Cleared with the balance rather than left behind: a wallet reset to 2000 under
  -- a history of earns and spends that no longer add up to it is the kind of inconsistency that turns
  -- into a bug report from whoever next reads the transaction table.
  with gone as (delete from public.transaction where user_id = v_caller returning 1)
  select count(*) into v_ledger from gone;

  -- Ownership, minus two protected sets:
  --   * the starter grant, read straight out of initial_room_layout() rather than restated, so this
  --     cannot drift from what 028 actually provisions;
  --   * whatever the account currently has PLACED, so a reset never empties the room it is standing in.
  -- The placements column carries two shapes across the v1 → v2 migration (a bare array, or an object
  -- with a 'placements' key), and both are still on disk, so both are unpacked here.
  with keep as (
    select jsonb_array_elements(public.initial_room_layout() -> 'placements') ->> 'furnitureId' as item_id
    union
    select jsonb_array_elements(
             case when jsonb_typeof(r.placements) = 'array'
                  then r.placements
                  else r.placements -> 'placements'
             end
           ) ->> 'furnitureId'
    from public.user_room r
    where r.owner_id = v_caller
  ),
  gone as (
    delete from public.user_buy b
    where b.owner_id = v_caller
      -- item_id is NOT NULL, but a malformed placement could yield a null here, and `not in` over a
      -- set containing one matches nothing at all — which would silently keep every item.
      and b.item_id not in (select item_id from keep where item_id is not null)
    returning 1
  )
  select count(*) into v_items_taken from gone;

  -- 2000 coins, and progression back to zero. Level and xp go with the builds on purpose: leaving a
  -- level 6 profile on an account with no completed builds shows the next attendee someone else's
  -- progress. Drop these two columns from the update if a demo should keep its standing.
  --
  -- avatar_id carries the Helping Mode, so this line is what puts Felix back on control and Lumi back
  -- on visual after an attendee has changed it mid-demo. COALESCE'd against the column's own value so
  -- an account with no mode pinned in the roster keeps whatever it has rather than being nulled — and
  -- that is also what the FK on demo_account.profile_mode buys: an unknown mode cannot get this far,
  -- so the subquery can only miss when profile_mode is genuinely NULL.
  update public.user_profile p
  set coin           = 2000,
      xp             = 0,
      level          = 1,
      assembly_count = 0,
      avatar_id      = coalesce((select a.id from public.avatars a where a.mode = v_mode), p.avatar_id),
      updated_at     = now()
  where p.user_id = v_caller;

  return jsonb_build_object(
    'email',        v_email,
    'profile_mode', v_mode,
    'saves',        v_saves,
    'builds',       v_builds,
    'ledger',       v_ledger,
    'items_taken',  v_items_taken,
    'coin',         2000
  );
end;
$$;

-- Signed-in demo accounts only. anon has no business calling this at all.
revoke execute on function public.dev_reset_demo_account() from public;
revoke execute on function public.dev_reset_demo_account() from anon;
grant execute on function public.dev_reset_demo_account() to authenticated;

commit;

-- Audit, in the style of 011. anon_can_execute MUST read false — a true means the revoke did not take
-- and any holder of the public anon key could call a security-definer reset. roster_readable must also
-- read false: RLS with no policies is what keeps the demo emails off the wire. roster_size is a
-- reminder that the function refuses everything until the allowlist above is seeded.
select
  has_function_privilege('anon', 'public.dev_reset_demo_account()', 'execute')          as anon_can_execute,
  has_function_privilege('authenticated', 'public.dev_reset_demo_account()', 'execute') as authed_can_execute,
  has_table_privilege('anon', 'public.demo_account', 'select')
    and not (select relrowsecurity from pg_class where oid = 'public.demo_account'::regclass)
                                                                                        as roster_readable,
  (select count(*) from public.demo_account)                                            as roster_size;
