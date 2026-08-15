-- ============================================================================================
-- 015: FOOTPRINT MASKS
-- ============================================================================================
-- Which cells of an item's w×d floor footprint are actually solid. The room's collision grid takes
-- arbitrary cell sets; until now every item claimed its full bounding rectangle, which walls off the
-- notch of any concave piece — the L-shaped sofa-modular strands ~1.25 × 0.75 m of usable floor.
--
-- Format: d rows of w characters joined with '/', 'X' solid and '.' empty, at rotation 0 with row 0
-- the -y (back) edge — the client contract is sanitizedMask in src/room/core/placeableItems.ts, which
-- falls back to the solid rectangle on any mismatch, so a bad row over-claims but never mis-collides.
-- Dimensions must equal the client's derived footprint: ceil(size / 0.25) per axis at quarter-metre
-- cells, the rule pinned by src/room/core/footprintContract.json and asserted on both sides of it.
-- Masks are DERIVED IN Modu-Portal, which owns the only implementation (packages/glb/footprintMask.mjs):
-- the upload flow writes one at publish time, and scripts/backfill_footprint_masks.mjs there fills in
-- rows that predate it. This repo only consumes them. null means solid, which is correct for every
-- convex item and is what all rows start as.

alter table public.item_build add column if not exists footprint_mask text;
alter table public.item_buy  add column if not exists footprint_mask text;

-- Appended at the END of the view, never reordered — create or replace view requires every existing
-- column to keep its name, type and position (same rule 014 states).
create or replace view public.placeable_items with (security_invoker = true) as
  with items as (
    select id, name, brand_id, category_id, link, 'built'  as source, size_x, size_y, size_z, base_offset_y, footprint_mask
      from public.item_build
    union all
    select id, name, brand_id, category_id, link, 'bought' as source, size_x, size_y, size_z, base_offset_y, footprint_mask
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
         i.footprint_mask
    from items i
    left join public.item_lights l on l.item_id = i.id;

-- The measured sofa-modular mask: 8×6 quarter-cells (1.9 × 1.275 m), silhouette coverage thresholded
-- at 20 % (see the 2026-08-04 spec) — three solid back rows, chaise on the +x side, notch free.
update public.item_buy
   set footprint_mask = 'XXXXXXXX/XXXXXXXX/XXXXXXXX/.....XXX/.....XXX/.....XX.'
 where id = 'sofa-modular';
