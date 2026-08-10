-- Surface items: purchasable WALLPAPERS and FLOORS that cover the room rather than stand in it.
--
-- A surface item is an ordinary item_buy row — price, min_level, ownership via purchase_item —
-- distinguished ONLY by category 'wall' or 'floor', exactly the way 'lit' distinguishes a lamp. Both
-- categories have existed since 003 and the shop has always shown them as tabs; what was missing is
-- the per-item data that makes one applyable. It ships a TEXTURE SET instead of a model, at
-- room/bought/<id>/{texture,normal,rough}.ktx2, so it has no GLB, no footprint and no grid cell.
--
-- WHY A SIDE TABLE, following item_lights rather than a jsonb column on item_buy.
--   * Those columns would be NULL for every row that is not a surface, and item_lights already
--     established that per-category attribute sets get their own table rather than widening the
--     item tables without bound.
--   * Integrity gets STRONGER. Inline they must all be nullable; here tiling is NOT NULL outright,
--     so a surface item with no scale cannot be written at all — and the conditional groups (the
--     plinth tint, the cornice) are constrained together rather than left to convention.
--   * It is queryable. A jsonb blob cannot be checked, indexed or corrected in the dashboard the way
--     typed columns can, and this is data a human authors by eye and then re-tunes.
--
-- A REAL FOREIGN KEY, unlike item_lights' soft ref. item_lights spans both item tables because a lamp
-- may be built or bought, so no single FK target exists. A surface item is only ever BOUGHT — you do
-- not assemble a wallpaper — so item_buy is an unambiguous target and the constraint is free.
--
-- WHAT IS DELIBERATELY NOT STORED:
--   * the texture files themselves, or their paths. Derived from the item id in
--     src/data/catalog/assets.ts, the same way a model's GLB path is, so a rename is one folder.
--   * the base colour map's presence. Every surface item has one; an item without a base colour is
--     not an item, and the client rejects it.
--   * roughness or metalness as scalars. They ride in the maps, because glTF MULTIPLIES a material's
--     roughnessFactor into its bound texture — a scalar could not override the placeholder the shell
--     ships, only scale it.

create table if not exists public.item_surfaces (
  item_id text primary key references public.item_buy(id) on delete cascade,

  -- How many times the map repeats across the surface, and where it starts. The map's PHYSICAL scale,
  -- which cannot be derived from the pixels: a photo of paving does not say whether it covers one
  -- metre or three, and the room is 4.5 m across. Applied as baseColorUvMatrix.
  scale_x  numeric not null check (scale_x > 0),
  scale_y  numeric not null check (scale_y > 0),
  offset_x numeric not null default 0,
  offset_y numeric not null default 0,

  -- Which optional maps the asset pipeline actually PUBLISHED. It omits a normal map with no relief,
  -- so the client must be told rather than guess: a map that was dropped must never be requested (a
  -- guaranteed 404) and one that exists must never be missed. Base colour is not listed because it is
  -- always present.
  has_normal boolean not null default false,
  has_rough  boolean not null default false,

  -- The plinth tint — the raised lip around the floor slab. FLOOR ITEMS ONLY, and a colour rather
  -- than a map because the shell's FloorEdge material carries no texture slot at all. Unset leaves
  -- the authored brown, which was chosen against the authored wooden floor and will clash with
  -- anything else.
  edge_r numeric check (edge_r between 0 and 1),
  edge_g numeric check (edge_g between 0 and 1),
  edge_b numeric check (edge_b between 0 and 1),

  -- The cornice. WALL ITEMS ONLY (moved here from floor by 020_trim_follows_wall.sql): it sits at the
  -- wall/ceiling junction, so it follows the wallpaper rather than the floor. Its own scale because it
  -- is separate geometry with its own UV mapping — reusing the wall's makes the moulding read as an
  -- extruded strip of wallpaper.
  has_trim        boolean not null default false,
  has_trim_normal boolean not null default false,
  has_trim_rough  boolean not null default false,
  trim_scale_x    numeric check (trim_scale_x > 0),
  trim_scale_y    numeric check (trim_scale_y > 0),
  trim_offset_x   numeric,
  trim_offset_y   numeric,

  -- The three conditional groups, each constrained as a UNIT so a half-described item cannot be
  -- written — the same reason item_lights ties cone_deg to type rather than trusting convention.
  constraint item_surfaces_edge_all_or_none check (num_nulls(edge_r, edge_g, edge_b) in (0, 3)),
  constraint item_surfaces_trim_scale_matches check (has_trim = (trim_scale_x is not null and trim_scale_y is not null)),
  constraint item_surfaces_trim_maps_need_trim check (not (has_trim_normal or has_trim_rough) or has_trim)
);

alter table public.item_surfaces enable row level security;

drop policy if exists item_surfaces_select on public.item_surfaces;
create policy item_surfaces_select on public.item_surfaces for select to authenticated using (true);

-- NOT added to placeable_items. That view feeds room PLACEMENT — grids, footprints, extents — and a
-- surface item has none of those; it is read straight off item_buy by the shop.
