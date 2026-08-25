-- Starter room provisioning. A new account should land in a room that already has a little shape:
-- three owned item_buy pieces — a window and a painting on the walls, a sofa on the floor — while
-- the tutorial can still grant and place the LACK table as the player's first build.

begin;

create or replace function public.initial_room_layout()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'version', 2,
    'placements', jsonb_build_array(
      jsonb_build_object(
        'instanceId', 'window-wood-classic#8',
        'furnitureId', 'window-wood-classic',
        'surface', jsonb_build_object('kind', 'wall', 'wall', 'x-min'),
        'cell', jsonb_build_object('x', 11, 'y', 4),
        'rotSteps', 0
      ),
      jsonb_build_object(
        'instanceId', 'painting-nature#2',
        'furnitureId', 'painting-nature',
        'surface', jsonb_build_object('kind', 'wall', 'wall', 'z-max'),
        'cell', jsonb_build_object('x', 4, 'y', 6),
        'rotSteps', 0
      ),
      jsonb_build_object(
        'instanceId', 'sofa-modular#3',
        'furnitureId', 'sofa-modular',
        'surface', jsonb_build_object('kind', 'floor'),
        'cell', jsonb_build_object('x', 12, 'y', 10),
        'rotSteps', 3
      )
    )
  );
$$;

create or replace function public.provision_initial_room(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.user_room (owner_id, placements, updated_at)
  values (p_user_id, public.initial_room_layout(), now())
  on conflict (owner_id) do nothing;

  -- These are starter entitlements, not purchases: no coins move and no ledger row is written.
  insert into public.user_buy (owner_id, item_id)
  select p_user_id, starter.item_id
  from (values ('window-wood-classic'), ('painting-nature'), ('sofa-modular')) as starter(item_id)
  where exists (select 1 from public.item_buy where id = starter.item_id)
  on conflict (owner_id, item_id) do nothing;
end;
$$;

-- Internal helper only: the auth trigger and this migration call it, but a client must not be able
-- to invoke a security-definer function with someone else's user id.
revoke execute on function public.provision_initial_room(uuid) from public;
revoke execute on function public.provision_initial_room(uuid) from anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profile (user_id, username, onboarding_completed, last_login)
  values (
    new.id,
    public.derive_username(new.id, new.raw_user_meta_data, new.email),
    false,
    now()
  )
  on conflict (user_id) do nothing;

  perform public.provision_initial_room(new.id);

  return new;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select u.id
    from auth.users u
    where not exists (select 1 from public.user_room room where room.owner_id = u.id)
    order by u.created_at
  loop
    perform public.provision_initial_room(r.id);
  end loop;
end $$;

comment on function public.initial_room_layout() is
  'Returns the versioned JSON room envelope inserted for newly provisioned accounts.';

comment on function public.provision_initial_room(uuid) is
  'Creates the starter user_room row and grants the item_buy furniture it contains. Idempotent; never overwrites an existing room.';

commit;

select
  (select count(*) from pg_proc where proname = 'initial_room_layout')       as layout_function_present,
  (select count(*) from pg_proc where proname = 'provision_initial_room')    as provisioning_function_present,
  (select has_function_privilege('authenticated', 'public.provision_initial_room(uuid)', 'execute')) as client_can_provision_room,
  -- Expect 3. Anything less means an id the starter room places is missing from item_buy: the grant
  -- above skips it silently, and the new player lands in a room holding a piece they do not own.
  (select count(*) from public.item_buy where id in ('window-wood-classic', 'painting-nature', 'sofa-modular')) as starter_catalog_items;
