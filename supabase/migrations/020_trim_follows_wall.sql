-- The cornice moves from being a FLOOR item's property to a WALL item's property. Product decision:
-- the cornice sits at the wall/ceiling junction, so it should follow the wallpaper, not the rug — a
-- room that swaps its floor should not also lose or gain its moulding, and a room that swaps its
-- wallpaper now should. The PLINTH (FloorEdge, the raised lip around the floor slab) is UNCHANGED and
-- stays a floor property: it takes a baseColorFactor tint rather than a map, and it is genuinely the
-- floor's own joinery in the way the cornice was previously, incorrectly, assumed to be too.
--
-- 017_surface_items.sql's column comments called the trim block "FLOOR ITEMS ONLY" and reasoned
-- "plinth and cornice are the same joinery, so one purchase dresses both". That rationale is
-- deliberately abandoned here, not merely moved: the cornice and the plinth are different pieces of
-- the room (one meets the ceiling, one meets the slab) that happened to share a purchase only because
-- both were floor-adjacent, not because they are the same kind of thing.
--
-- WHAT THIS FILE DOES: copies has_trim / has_trim_normal / has_trim_rough / trim_scale_x/y /
-- trim_offset_x/y from the herringbone-parquet row to the cream-plaster row, then clears them on
-- herringbone-parquet. Idempotent: every statement is guarded so a re-run, at any point including
-- half-applied, is either a no-op or resumes correctly.
--
-- ORDER OF OPERATIONS MATTERS. The destination is populated FIRST, by reading the source row's trim
-- columns in a subquery, and the source is cleared SECOND. Clearing the source before populating the
-- destination would make the destination's trim_scale_x/y read as NULL off an already-emptied row —
-- and item_surfaces_trim_scale_matches requires has_trim = (trim_scale_x is not null and trim_scale_y
-- is not null), so writing has_trim = true with a null scale on cream-plaster would fail that
-- constraint outright, not just produce a wrong value.
--
-- ============================================================================================
-- MANUAL STEP REQUIRED — STORAGE OBJECTS. THIS MIGRATION CANNOT DO THIS, AND NEITHER CAN ANY CLIENT
-- WITHOUT A SERVICE-ROLE KEY. Applying only the SQL below and skipping this leaves cream-plaster's row
-- claiming has_trim = true while the files it names do not exist — three guaranteed 404s the next time
-- any room resolves the wall item, silently falling back to the shell's authored cornice (not a crash,
-- but not what this migration is for either).
--
-- In the `models` storage bucket, COPY (do not move, until the copy is verified — herringbone-parquet's
-- row no longer references them after this file runs, but the objects themselves are untouched by SQL):
--   room/bought/herringbone-parquet/trim_texture.ktx2  ->  room/bought/cream-plaster/trim_texture.ktx2
--   room/bought/herringbone-parquet/trim_normal.ktx2   ->  room/bought/cream-plaster/trim_normal.ktx2
--   room/bought/herringbone-parquet/trim_rough.ktx2    ->  room/bought/cream-plaster/trim_rough.ktx2
-- Via the Supabase dashboard's Storage UI (drag-copy or the "..." > Copy action on each object), or
-- with a service-role key: `supabase.storage.from('models').copy(src, dest)` per file. Once verified,
-- the three objects under herringbone-parquet/ may be deleted — they are unreferenced by any row after
-- this migration, and scripts/extract-shell-defaults.mjs no longer regenerates them there.
-- ============================================================================================

begin;

-- 1. Populate cream-plaster's trim columns from herringbone-parquet's CURRENT (still intact) row.
-- Guarded on cream-plaster not already carrying a cornice, so re-running after a successful first
-- pass — when herringbone-parquet's columns are already cleared — cannot overwrite it with nulls.
update public.item_surfaces as dest
  set has_trim        = src.has_trim,
      has_trim_normal = src.has_trim_normal,
      has_trim_rough  = src.has_trim_rough,
      trim_scale_x    = src.trim_scale_x,
      trim_scale_y    = src.trim_scale_y,
      trim_offset_x   = src.trim_offset_x,
      trim_offset_y   = src.trim_offset_y
  from (select has_trim, has_trim_normal, has_trim_rough, trim_scale_x, trim_scale_y, trim_offset_x, trim_offset_y
          from public.item_surfaces where item_id = 'herringbone-parquet') as src
  where dest.item_id = 'cream-plaster'
    and dest.has_trim is distinct from true;

-- 2. Clear herringbone-parquet's trim columns now that cream-plaster carries them. Guarded on the row
-- still having a cornice, so a re-run after success (has_trim already false) touches zero rows.
update public.item_surfaces
  set has_trim = false, has_trim_normal = false, has_trim_rough = false,
      trim_scale_x = null, trim_scale_y = null, trim_offset_x = null, trim_offset_y = null
  where item_id = 'herringbone-parquet'
    and has_trim is true;

commit;

-- Returns a row the dashboard SQL editor cannot hide, unlike a RAISE NOTICE. Expect parquet_has_trim =
-- false, plaster_has_trim = true, plaster_trim_scale_x = 1, plaster_trim_scale_y = 1 — anything else
-- means a statement above did not take (most likely: the copy ran before the source was populated on
-- a database that had already been migrated by hand, or the storage objects have not been copied yet,
-- which this query cannot see — check the bucket separately).
select
  (select has_trim from public.item_surfaces where item_id = 'herringbone-parquet') as parquet_has_trim,
  (select has_trim from public.item_surfaces where item_id = 'cream-plaster')       as plaster_has_trim,
  (select trim_scale_x from public.item_surfaces where item_id = 'cream-plaster')   as plaster_trim_scale_x,
  (select trim_scale_y from public.item_surfaces where item_id = 'cream-plaster')   as plaster_trim_scale_y;
