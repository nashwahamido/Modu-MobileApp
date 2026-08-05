-- ============================================================================================
-- 016: FURNITURE-TOP SURFACES
-- ============================================================================================
-- Which items expose their top as a placement surface (a lamp standing on a side table). An
-- explicit curated flag, not a heuristic: category 'fur' spans sofa and bed alike, and nothing
-- should stand on a sofa cushion. The client turns this into the def's hostsTop; the top's grid
-- is the item's own footprint (quarter-metre cells, mask included), so no extent is stored here.

alter table public.item_build add column if not exists top_surface boolean not null default false;
alter table public.item_buy  add column if not exists top_surface boolean not null default false;

-- Appended at the END of the view (after footprint_mask), never reordered — create or replace view
-- requires every existing column to keep its name, type and position (the rule 014 states).
create or replace view public.placeable_items with (security_invoker = true) as
  with items as (
    select id, name, brand_id, category_id, link, 'built'  as source, size_x, size_y, size_z, base_offset_y, footprint_mask, top_surface
      from public.item_build
    union all
    select id, name, brand_id, category_id, link, 'bought' as source, size_x, size_y, size_z, base_offset_y, footprint_mask, top_surface
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
         i.top_surface
    from items i
    left join public.item_lights l on l.item_id = i.id;

-- Initial hosts: tables and cabinets (the spec's proposed list). Beds, sofas, stools and lamps stay non-hosts.
update public.item_build set top_surface = true where id in ('lack-table', 'eket-cabinet');
update public.item_buy  set top_surface = true where id in ('rosentorp-table', 'wooden-lack', 'cabinet-standing', 'malm-chest');
