-- ============================================================================================
-- 021: PLACEMENT CAPABILITY AS AN EXPLICIT ITEM PROPERTY
-- ============================================================================================
-- Placement capability used to be DERIVED from category, not stored: only category 'win' hung on a
-- wall, and only 'win' cut a hole, and nothing could ever stand on a host's top because no def ever
-- listed "furniture" at all. One category branch decided two unrelated facts at once, which is why a
-- photo frame could not hang on a wall without also cutting a hole behind itself, and why a book could
-- never sit on a desk. This migration makes the facts explicit columns instead.
--
-- Floor and wall are MUTUALLY EXCLUSIVE — a piece stands on one or the other, never both — so they are
-- ONE nullable choice (`mount`), not two booleans. Standing on a host's own top is ORTHOGONAL to both:
-- a book sits on a desk that stands on the floor or a shelf that hangs on the wall, and does not care
-- which, because either way it is placed on the HOST's own top grid, never on `mount` (`on_top`).
-- Cutting a hole is its own fact again, meaningful for a wall mount only (`opens_wall`).
--
-- The client-side derivation this feeds is src/room/core/placeableItems.ts's toModel: allowedSurfaces
-- becomes [...(mount ? [mount] : []), ...(on_top ? ["furniture"] : [])], and the wall-footprint rule
-- (round to the nearest quarter-metre cell, not ceil) now applies to any mount = 'wall' row rather than
-- only to a category 'win' one.

begin;

alter table public.item_build
  add column if not exists mount      text,
  add column if not exists on_top     boolean not null default false,
  add column if not exists opens_wall boolean not null default false;
alter table public.item_buy
  add column if not exists mount      text,
  add column if not exists on_top     boolean not null default false,
  add column if not exists opens_wall boolean not null default false;

-- BACKFILL BEFORE CONSTRAINING — the lesson 014_light_aim.sql records having learned the hard way:
-- adding a constraint before repairing the rows that violated it took the whole migration down with
-- "check constraint is violated by some row" on its first run. Every existing row needs a mount: 'wall'
-- (+ opens_wall) for a window, 'floor' for everything else.
--
-- Written against the CATEGORY rather than against known ids, for the reason 014 gives: a migration
-- that only repairs the rows its author happened to know about is a migration that fails on somebody
-- else's database. Guarded on `mount is null` so a re-run is a genuine no-op and cannot clobber a value
-- someone has since hand-corrected (e.g. a future frame that is category 'deco' but mounts on the wall).
update public.item_build set mount = 'wall', opens_wall = true where category_id = 'win' and mount is null;
update public.item_build set mount = 'floor'                   where category_id <> 'win' and mount is null;
update public.item_buy   set mount = 'wall', opens_wall = true where category_id = 'win' and mount is null;
update public.item_buy   set mount = 'floor'                   where category_id <> 'win' and mount is null;

-- The obvious on_top seed: an ASTRID table lamp stands on a desk or a side table, not just the floor.
-- Anything already top_surface = true (016) keeps it — this migration only adds on_top, it touches
-- nothing that already hosts.
update public.item_buy set on_top = true where id = 'astid-table-lamp' and not on_top;

-- Idempotent, like every migration in this file's lineage: drop before add.
alter table public.item_build drop constraint if exists item_build_mount_check;
alter table public.item_build drop constraint if exists item_build_mount_placeable;
alter table public.item_build drop constraint if exists item_build_opens_wall_needs_wall;
alter table public.item_buy drop constraint if exists item_buy_mount_check;
alter table public.item_buy drop constraint if exists item_buy_mount_placeable;
alter table public.item_buy drop constraint if exists item_buy_opens_wall_needs_wall;

-- `mount in (...)` reads NULL as NULL, not FALSE, so a CHECK over it passes on a null mount — this only
-- rules out a THIRD value ever landing in the column, it does not require the column to be set.
alter table public.item_build
  add constraint item_build_mount_check check (mount in ('floor', 'wall'));
alter table public.item_build
  -- A nullable mount invites "placeable nowhere": every row must be reachable through the floor, the
  -- wall, or (failing both) a host's own top.
  add constraint item_build_mount_placeable check (mount is not null or on_top);
alter table public.item_build
  -- Today a floor item cannot cut a hole only because both properties happen to come from the same
  -- category branch. Make that structural: a hole can only ever be cut in a wall.
  add constraint item_build_opens_wall_needs_wall check (not opens_wall or mount = 'wall');

alter table public.item_buy
  add constraint item_buy_mount_check check (mount in ('floor', 'wall'));
alter table public.item_buy
  add constraint item_buy_mount_placeable check (mount is not null or on_top);
alter table public.item_buy
  add constraint item_buy_opens_wall_needs_wall check (not opens_wall or mount = 'wall');

-- Appended at the END of the view (after top_surface, 016's last column), never reordered — create or
-- replace view requires every existing column to keep its name, type and position.
create or replace view public.placeable_items with (security_invoker = true) as
  with items as (
    select id, name, brand_id, category_id, link, 'built'  as source, size_x, size_y, size_z, base_offset_y, footprint_mask, top_surface, mount, on_top, opens_wall
      from public.item_build
    union all
    select id, name, brand_id, category_id, link, 'bought' as source, size_x, size_y, size_z, base_offset_y, footprint_mask, top_surface, mount, on_top, opens_wall
      from public.item_buy
  )
  select i.id, i.name, i.brand_id, i.category_id, i.link, i.source,
         i.size_x, i.size_y, i.size_z, i.base_offset_y,
         l.type          as light_type,
         l.lumens        as light_lumens,
         l.kelvin        as light_kelvin,
         l.reach_m       as light_reach_m,
         l.cone_deg      as light_cone_deg,
         l.bulb_x        as light_bulb_x,
         l.bulb_y        as light_bulb_y,
         l.bulb_z        as light_bulb_z,
         l.aim_pitch_deg as light_aim_pitch_deg,
         l.aim_yaw_deg   as light_aim_yaw_deg,
         i.footprint_mask,
         i.top_surface,
         i.mount,
         i.on_top,
         i.opens_wall
    from items i
    left join public.item_lights l on l.item_id = i.id;

commit;

-- Returns rows the dashboard SQL editor cannot hide, unlike a RAISE NOTICE (the house pattern — see
-- 019_workshop_kinds.sql). Expect new_columns = 6 (mount/on_top/opens_wall × 2 tables), constraints = 6,
-- and both unplaceable counts at 0 — a nonzero unplaceable count means some row escaped the backfill.
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name in ('item_build', 'item_buy')
       and column_name in ('mount', 'on_top', 'opens_wall'))                                      as new_columns,
  (select count(*) from pg_constraint
     where conrelid in ('public.item_build'::regclass, 'public.item_buy'::regclass)
       and conname in ('item_build_mount_check', 'item_build_mount_placeable', 'item_build_opens_wall_needs_wall',
                       'item_buy_mount_check', 'item_buy_mount_placeable', 'item_buy_opens_wall_needs_wall'))   as constraints,
  (select count(*) from public.item_build where mount is null and not on_top)                      as build_unplaceable,
  (select count(*) from public.item_buy where mount is null and not on_top)                        as buy_unplaceable,
  (select on_top from public.item_buy where id = 'astid-table-lamp')                               as astid_on_top;
