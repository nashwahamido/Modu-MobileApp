-- Lamps: purchasable floor items that EMIT LIGHT into the room.
--
-- A lamp is an ordinary item_buy row — price, min_level, ownership via purchase_item, model at
-- room/bought/<id>/<variation|'default'>.glb — distinguished ONLY by category 'lit' (Lighting), exactly the
-- way 'win' distinguishes a window. The app routes on that category: allowedSurfaces stays ["floor"]
-- (a lamp stands on the floor like any other piece) and emitsLight becomes true, which is what makes
-- the renderer attach a light to the placement.
--
-- WHY A SIDE TABLE rather than five columns on item_buy and item_build.
--   * Those columns would be NULL for every row that is not a lamp, on BOTH item tables, and this is
--     the FIRST per-category attribute set — plants, speakers and anything else would each add their
--     own, without bound.
--   * Integrity gets STRONGER, not weaker. Inline, the columns must be nullable, so the best available
--     guarantee is a check constraint per table saying "if category = lamp then these are not null".
--     In their own table every column is NOT NULL outright, and a half-described lamp cannot be
--     written at all.
--   * item_variants already establishes the pattern for per-item satellite data, including how to
--     reference an id that lives in EITHER item table.
--
-- WHAT IS DELIBERATELY NOT STORED:
--   * bulb position and aim. Those come from a node named 'Bulb' in the lamp's own GLB, the same way
--     a window's mounting plane comes from its anchor empty. A shade already points somewhere, so the
--     transform describing it belongs in the model, not in columns a human keeps in sync.
--   * footprint. Derived from size in src/room/core/placeableItems.ts, like every other floor item.

insert into public.item_categories (id, name) values
  ('lit', 'Lighting')
on conflict (id) do nothing;

-- Per-item light characteristics. item_id is a SOFT ref (no FK) spanning both item tables — the same
-- rule item_variants uses, and for the same reason: placeable_items is their union, so no single FK
-- target exists.
--
-- `lumens` IS NOT PHYSICAL and must not be "corrected" to real bulb ratings. Filament scales a light
-- by the CAMERA's exposure, and react-native-filament does not bridge Camera::setExposure — so the
-- term that would turn lumens into on-screen brightness is unknowable from here. A physically derived
-- value was tried and under-predicted the result by roughly an order of magnitude. These are
-- calibrated by eye against the 'night' preset in src/room/core/timeOfDay.ts and are only meaningful
-- relative to one another.
--
-- `type`: 'point' throws light evenly (a bare bulb, a paper shade); 'spot' aims it down the Bulb
-- node's axis with a cone (a desk or reading lamp). NOT 'directional' — Filament's directional light
-- is an infinitely distant sun with no position at all, which is never what a lamp is.
create table if not exists public.item_lights (
  item_id  text primary key,                                     -- soft ref -> item_build.id OR item_buy.id
  type     text    not null check (type in ('point', 'spot')),
  lumens   numeric not null check (lumens >= 0),
  kelvin   integer not null check (kelvin between 1000 and 12000),
  reach_m  numeric not null check (reach_m > 0),                  -- falloff distance in METRES; the renderer scales it into scene units
  cone_deg numeric          check (cone_deg > 0 and cone_deg < 180),
  -- The one column that is legitimately conditional: a spot needs a cone and a point must not carry
  -- one, so the pair is constrained together rather than left to convention.
  constraint item_lights_cone_matches_type check ((type = 'spot') = (cone_deg is not null))
);

alter table public.item_lights enable row level security;

drop policy if exists item_lights_select on public.item_lights;
create policy item_lights_select on public.item_lights for select to authenticated using (true);

-- The view is the app's only read path for placeable items, so the light travels through it as a LEFT
-- JOIN — null for the overwhelming majority of rows, which is exactly what "not a lamp" means.
-- Recreated wholesale rather than altered: a view's column list cannot be extended in place.
create or replace view public.placeable_items with (security_invoker = true) as
  with items as (
    select id, name, brand_id, category_id, link, 'built'  as source, size_x, size_y, size_z, base_offset_y
      from public.item_build
    union all
    select id, name, brand_id, category_id, link, 'bought' as source, size_x, size_y, size_z, base_offset_y
      from public.item_buy
  )
  select i.id, i.name, i.brand_id, i.category_id, i.link, i.source,
         i.size_x, i.size_y, i.size_z, i.base_offset_y,
         l.type     as light_type,
         l.lumens   as light_lumens,
         l.kelvin   as light_kelvin,
         l.reach_m  as light_reach_m,
         l.cone_deg as light_cone_deg
    from items i
    left join public.item_lights l on l.item_id = i.id;

-- THE ONE INVARIANT THIS SCHEMA CANNOT ENFORCE: a category 'lit' row must have an item_lights row.
-- It spans tables, so no check constraint reaches it. The app degrades safely (a lamp with no light
-- row simply places as ordinary furniture and emits nothing), which is quiet rather than broken — so
-- audit it after seeding new lamps:
--
--   select id from public.placeable_items where category_id = 'lit' and light_type is null;
--
-- Anything returned is a lamp that will place but never light.

-- Seed. Prices/min_level are PLACEHOLDERS like the rest of the catalog; brand_id null (not IKEA).
-- Sizes are placeholders too and MUST be re-measured from the authored GLB before these ship — the
-- footprint is derived from them, so a wrong size claims the wrong cells.
-- lumens sit near the 25000 the hard-coded test lamp was calibrated to: the desk lamp is a tighter,
-- brighter spot, the floor lamp a softer, wider point.
insert into public.item_buy
  (id, name, brand_id, category_id, link, price, min_level, size_x, size_y, size_z, base_offset_y) values
  ('astid-table-lamp',  'ASTRID Table Lamp',  null, 'lit', null,  70, 1,	0.2222, 0.5405, 0.3322, 0),
  ('barlast-floor-lamp', 'BARLAST Floor Lamp', null, 'lit', null, 110, 1, 0.3400, 1.5036, 0.3400, 0)
on conflict (id) do nothing;

insert into public.item_lights (item_id, type, lumens, kelvin, reach_m, cone_deg) values
  ('astid-table-lamp',  'point',  22000, 2700, 3.2, null),
  ('barlast-floor-lamp', 'spot', 30000, 2600, 4.6, 70)
on conflict (item_id) do nothing;

-- One model each, no colour axis yet: null variation = the 'default' path segment, so the models live
-- at room/bought/<id>/default.glb.
insert into public.item_variants (id, item_id, variation, is_default) values
  ('astid-table-lamp__default',  'astid-table-lamp',  null, true),
  ('barlast-floor-lamp__default', 'barlast-floor-lamp', null, true)
on conflict (id) do nothing;
