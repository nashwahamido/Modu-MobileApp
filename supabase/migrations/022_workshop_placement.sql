-- ============================================================================================
-- 022: TEACH THE WORKSHOP ABOUT PLACEMENT CAPABILITY
-- ============================================================================================
-- 021_placement_capability.sql added mount/on_top/opens_wall to item_build and item_buy, but never
-- touched workshop_drafts or publish_workshop_draft() — so once 021 is applied, workshop_drafts has
-- nowhere to carry these three values, and publish_workshop_draft() inserts into item_buy WITHOUT
-- naming them. An insert that does not name a column gets that column's default: mount lands NULL,
-- on_top and opens_wall land false. item_buy_mount_placeable requires `mount is not null or on_top`
-- — so EVERY publish fails, immediately, the moment 021 goes live, with no workshop-side change of any
-- kind required to trigger it. This migration is what closes that gap. It must be applied AFTER 021,
-- never before: it references item_buy's mount/on_top/opens_wall columns, which do not exist until 021
-- has run.
--
-- Same shape as 021 throughout, because it is the same fact living in the draft table instead of the
-- live one: mount is ONE nullable choice ('floor'/'wall'), not two booleans, because a piece cannot
-- stand on the floor and hang on the wall at once; on_top is orthogonal (a book cares whether its host
-- has a top, never whether that host itself is floor- or wall-mounted); opens_wall only ever means
-- anything alongside mount = 'wall'.
--
-- A surface (floor/wall category) draft carries these three too, even though its own "mount" is not a
-- placement choice at all — it tiles the room shell rather than standing on the placement grid (see
-- src/room/core/placeableItems.ts in the app repo, which never reads mount off a floor/wall category
-- row). It is here purely because item_buy_mount_placeable applies to every row in that table
-- regardless of kind, surface items included — the portal's WorkshopForm derives a surface draft's
-- mount straight from its own category_id rather than exposing it as an operator choice (see
-- MetadataFields.tsx / WorkshopForm.tsx in Modu-Portal), but the COLUMN still has to exist and still
-- has to be populated for publish to succeed.

begin;

alter table public.workshop_drafts
  add column if not exists mount      text,
  add column if not exists on_top     boolean not null default false,
  add column if not exists opens_wall boolean not null default false;

-- BACKFILL BEFORE CONSTRAINING — the lesson 014_light_aim.sql records having taken the whole migration
-- down with on its first run: add a constraint before repairing the rows that violate it and you get
-- "check constraint is violated by some row" and nothing else lands. Same rule as 021: 'wall' (+
-- opens_wall) for category_id = 'win', 'floor' for everything else, written against the CATEGORY rather
-- than any known id, because a migration that only repairs the rows its author happened to know about
-- is a migration that fails on somebody else's database — a draft seeded or hand-edited after this file
-- was written still gets repaired correctly. Guarded on `mount is null` so a re-run is a genuine no-op
-- and can never clobber a value an operator has since hand-corrected (a wall-mounted 'deco' draft, say —
-- exactly the case 021 exists to make possible).
update public.workshop_drafts set mount = 'wall', opens_wall = true where category_id = 'win' and mount is null;
update public.workshop_drafts set mount = 'floor'                   where category_id <> 'win' and mount is null;

-- Idempotent, like every migration in this file's lineage: drop before add.
alter table public.workshop_drafts drop constraint if exists workshop_drafts_mount_check;
alter table public.workshop_drafts drop constraint if exists workshop_drafts_mount_placeable;
alter table public.workshop_drafts drop constraint if exists workshop_drafts_opens_wall_needs_wall;

-- `mount in (...)` reads NULL as NULL, not FALSE, so this passes on a null mount — it only rules out a
-- THIRD value ever landing in the column, exactly as item_build_mount_check/item_buy_mount_check do.
alter table public.workshop_drafts
  add constraint workshop_drafts_mount_check check (mount in ('floor', 'wall'));
alter table public.workshop_drafts
  -- Every draft must be reachable through the floor, the wall, or (failing both) a host's own top —
  -- the same rule item_build_mount_placeable/item_buy_mount_placeable enforce on the live tables,
  -- moved one step earlier so a draft that could never publish is refused at save time instead.
  add constraint workshop_drafts_mount_placeable check (mount is not null or on_top);
alter table public.workshop_drafts
  -- A hole can only ever be cut in a wall — mirrors item_build_opens_wall_needs_wall /
  -- item_buy_opens_wall_needs_wall.
  add constraint workshop_drafts_opens_wall_needs_wall check (not opens_wall or mount = 'wall');

-- Publish, taught the same three facts. CARRIES THE WHOLE FUNCTION FORWARD FROM 019_workshop_kinds.sql
-- — variants, item_lights (014) and item_surfaces (019) are ALL still written below, unchanged. This is
-- re-declared in full, not patched, because `create or replace function` replaces the entire body: a
-- version of this function missing the light or surface block would silently un-ship migrations 014 and
-- 019 the moment it ran, exactly as 019's own header comment warns about replaying 011 unmodified. The
-- ONLY functional change from 019's version is the item_buy insert, which now names mount/on_top/
-- opens_wall instead of leaving them to default to NULL/false/false — the bug this migration exists to
-- fix.
create or replace function public.publish_workshop_draft(draft_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  draft public.workshop_drafts;
  default_count integer;
  is_surface boolean;
begin
  if not public.is_workshop_editor() then
    raise exception 'not a workshop editor';
  end if;

  select * into draft from public.workshop_drafts where id = draft_id for update;
  if not found then
    raise exception 'draft % does not exist', draft_id;
  end if;
  if draft.status <> 'testing' then
    raise exception 'draft % is not in testing (status %)', draft_id, draft.status;
  end if;

  -- The id has to be free in BOTH item tables: placeable_items is their union, and a collision would make the view ambiguous rather than merely wrong.
  if exists (select 1 from public.item_buy where id = draft_id) or exists (select 1 from public.item_build where id = draft_id) then
    raise exception 'id % already exists in the live catalog', draft_id;
  end if;

  is_surface := draft.category_id in ('floor', 'wall');

  -- A surface item has no colour axis at all, so the one-default rule is a MODEL-item rule. Applying it to both kinds is what would make every surface draft unpublishable, since the kind constraint forbids it the very variant this check would demand.
  if not is_surface then
    select count(*) into default_count from jsonb_array_elements(draft.variants) v where (v->>'is_default')::boolean is true;
    if default_count <> 1 then
      raise exception 'draft % must have exactly one default variant (found %)', draft_id, default_count;
    end if;
  end if;

  -- Checked in both directions, as 014 has it: a lighting item with no light is the quiet failure (it places and emits nothing), and a light on a non-lighting item is a sign the category was changed after the light was authored.
  if draft.category_id = 'lit' and draft.light is null then
    raise exception 'draft % is category lit but carries no light', draft_id;
  end if;
  if draft.category_id <> 'lit' and draft.light is not null then
    raise exception 'draft % carries a light but its category is %, not lit', draft_id, draft.category_id;
  end if;

  -- Same shape, for surfaces.
  if is_surface and draft.surface is null then
    raise exception 'draft % is a surface item but carries no surface payload', draft_id;
  end if;
  if not is_surface and draft.surface is not null then
    raise exception 'draft % carries a surface payload but its category is %, which is not a surface kind', draft_id, draft.category_id;
  end if;

  -- The one line this migration actually exists to change: mount/on_top/opens_wall are now named explicitly, so item_buy_mount_placeable (021) is satisfied by what the draft actually carries rather than by the column defaults an unnamed insert would fall back to. draft.mount/on_top/opens_wall are themselves guaranteed non-degenerate by workshop_drafts_mount_placeable/_opens_wall_needs_wall above, enforced at every save this draft went through on its way to 'testing' — so nothing new can go wrong here that a save did not already refuse.
  insert into public.item_buy
    (id, name, brand_id, category_id, link, price, min_level, size_x, size_y, size_z, base_offset_y, footprint_mask, top_surface, granted, mount, on_top, opens_wall)
  values (draft.id, draft.name, draft.brand_id, draft.category_id, draft.link, draft.price, draft.min_level,
          draft.size_x, draft.size_y, draft.size_z, draft.base_offset_y, draft.footprint_mask, draft.top_surface, draft.granted,
          draft.mount, draft.on_top, draft.opens_wall);

  -- coalesce to false: a variant object missing the is_default key would otherwise carry SQL NULL into a not-null column and abort the insert AFTER the item_buy row above has already been written in this same transaction — the precheck's `is true` already treats a missing key as not-default, so this just makes the insert agree with what the precheck already decided. Empty for a surface item, so the select yields no rows rather than needing a branch.
  insert into public.item_variants (id, item_id, variation, is_default)
  select draft.id || '__' || coalesce(v->>'variation', 'default'), draft.id, v->>'variation', coalesce((v->>'is_default')::boolean, false)
  from jsonb_array_elements(draft.variants) v;

  -- No coalescing of the light's own fields: every one is NOT NULL or constrained in item_lights, so a draft missing one fails HERE, in the same transaction as the inserts above, rather than producing a half-described lamp. bulb_* default to 0 in the table but are written explicitly so a draft that omits them is a visible failure rather than a silent bulb at the origin.
  if draft.light is not null then
    insert into public.item_lights
      (item_id, type, lumens, kelvin, reach_m, cone_deg, bulb_x, bulb_y, bulb_z, aim_pitch_deg, aim_yaw_deg)
    values (
      draft.id,
      draft.light->>'type',
      (draft.light->>'lumens')::numeric,
      (draft.light->>'kelvin')::integer,
      (draft.light->>'reach_m')::numeric,
      (draft.light->>'cone_deg')::numeric,
      (draft.light->>'bulb_x')::numeric,
      (draft.light->>'bulb_y')::numeric,
      (draft.light->>'bulb_z')::numeric,
      (draft.light->>'aim_pitch_deg')::numeric,
      (draft.light->>'aim_yaw_deg')::numeric
    );
  end if;

  -- Same treatment: scale_x/y are NOT NULL in item_surfaces, so a payload missing them fails here rather than publishing a surface the app cannot tile. The has_* flags DO coalesce to false, because "absent" and "no such map was uploaded" are the same statement — and the contract is explicit that a flag set with no file is a guaranteed 404, so false is the safe direction.
  if draft.surface is not null then
    insert into public.item_surfaces
      (item_id, scale_x, scale_y, offset_x, offset_y, has_normal, has_rough,
       edge_r, edge_g, edge_b, has_trim, has_trim_normal, has_trim_rough,
       trim_scale_x, trim_scale_y, trim_offset_x, trim_offset_y)
    values (
      draft.id,
      (draft.surface->>'scale_x')::numeric,
      (draft.surface->>'scale_y')::numeric,
      coalesce((draft.surface->>'offset_x')::numeric, 0),
      coalesce((draft.surface->>'offset_y')::numeric, 0),
      coalesce((draft.surface->>'has_normal')::boolean, false),
      coalesce((draft.surface->>'has_rough')::boolean, false),
      (draft.surface->>'edge_r')::numeric,
      (draft.surface->>'edge_g')::numeric,
      (draft.surface->>'edge_b')::numeric,
      coalesce((draft.surface->>'has_trim')::boolean, false),
      coalesce((draft.surface->>'has_trim_normal')::boolean, false),
      coalesce((draft.surface->>'has_trim_rough')::boolean, false),
      (draft.surface->>'trim_scale_x')::numeric,
      (draft.surface->>'trim_scale_y')::numeric,
      coalesce((draft.surface->>'trim_offset_x')::numeric, 0),
      coalesce((draft.surface->>'trim_offset_y')::numeric, 0)
    );
  end if;

  -- Published rows are KEPT, never deleted: they are the audit trail of what was promoted and when.
  update public.workshop_drafts set status = 'published' where id = draft_id;
end;
$$;

revoke all on function public.publish_workshop_draft(text) from public, anon;
grant execute on function public.publish_workshop_draft(text) to authenticated;

commit;

-- Returns rows the dashboard SQL editor cannot hide, unlike a RAISE NOTICE (the house pattern — see
-- 019_workshop_kinds.sql). Expect new_columns = 3, constraints = 3, unplaceable_drafts = 0, and
-- publish_writes_mount = true; anything else means a statement above did not take. A nonzero
-- unplaceable_drafts means some draft escaped the backfill — the same failure mode 021's own audit
-- row (build_unplaceable/buy_unplaceable) exists to catch on the live tables.
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'workshop_drafts'
       and column_name in ('mount', 'on_top', 'opens_wall'))                                        as new_columns,
  (select count(*) from pg_constraint
     where conrelid = 'public.workshop_drafts'::regclass
       and conname in ('workshop_drafts_mount_check', 'workshop_drafts_mount_placeable', 'workshop_drafts_opens_wall_needs_wall')) as constraints,
  (select count(*) from public.workshop_drafts where mount is null and not on_top)                   as unplaceable_drafts,
  (select pg_get_functiondef('public.publish_workshop_draft(text)'::regprocedure) like '%draft.mount, draft.on_top, draft.opens_wall%') as publish_writes_mount;
