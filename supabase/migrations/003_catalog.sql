-- Item catalog: placeable/decor ITEMS split by ACQUISITION — item_build (earned by building) and
-- item_buy (purchased). `category` is the KIND; item_variants holds the per-VARIATION room model
-- for items that have one. Surfaces (wallpaper/floor) are item_buy with NO variants.
--
-- ASSET PATHS ARE DERIVED, NOT STORED — so a rename is ONE place (the id/variation). Model + thumb
-- are COLOCATED in one folder per item (distinguished by extension), so renaming an item id renames a
-- SINGLE storage folder. The DB stores only IDENTITY + metadata; the app derives paths (see
-- src/data/catalogAssets.ts):
--   model:          room/<built|bought>/<id>/<variation|'default'>.glb
--   variant thumb:  room/<built|bought>/<id>/<variation|'default'>.jpg   (NO theme variants — one image, any UI mode)
--   item tile:      room/<built|bought>/<id>/tile.jpg   (surfaces; model-items reuse the default variation image)
--   assembly model: assembly/<id>/...      (item_build.assembly_model; null = still local; separate tree)
-- `variation` is a FREE-FORM per-item key (white, oak, red, small, ...) — no fixed shared palette.
-- Thumbs/models do NOT vary by light/dark UI mode — the different LOOKS come from `variation`, not theme.
-- See memory [[furniture-catalog-design]].

-- Brands. Matches BrandId ("IKEA" | "Others"). logo_path is a storage path (null for now).
create table if not exists public.brands (
  id text primary key,
  name text not null,
  logo_path text
);

insert into public.brands (id, name, logo_path) values
  ('IKEA',   'IKEA',   null),
  ('Others', 'Others', null)
on conflict (id) do nothing;

alter table public.brands enable row level security;

drop policy if exists brands_select on public.brands;
create policy brands_select on public.brands for select to authenticated using (true);

-- Item categories — the KIND of item, i.e. the SHOP TAB. Surfaces (wallpaper, floor) render as
-- textures, not models.
create table if not exists public.item_categories (
  id text primary key,
  name text not null
);

insert into public.item_categories (id, name) values
  ('fur',  'Furniture'),
  ('deco', 'Decorations'),
  ('wall',  'Wallpaper'),
  ('floor', 'Floor')
on conflict (id) do nothing;

alter table public.item_categories enable row level security;

drop policy if exists item_categories_select on public.item_categories;
create policy item_categories_select on public.item_categories for select to authenticated using (true);

-- Furniture types — a DIFFERENT axis from item_categories. Every buildable furniture is category
-- 'fur'; furniture_types subdivides within that ("Shelf & Cabinet"), which is what the catalogue card
-- shows. A lookup table and not a text column because the type is display copy shown on the picker
-- card: a FK constrains the set and keeps the display name editable in exactly one row — the same
-- shape as brands and item_categories.
create table if not exists public.furniture_types (
  id   text primary key,
  name text not null
);

insert into public.furniture_types (id, name) values
  ('table_chair',   'Table & Chair'),
  ('shelf_cabinet', 'Shelf & Cabinet'),
  ('bed',           'Bed'),
  ('other',         'Other')
on conflict (id) do update set name = excluded.name;

alter table public.furniture_types enable row level security;

drop policy if exists furniture_types_select on public.furniture_types;
create policy furniture_types_select on public.furniture_types
  for select to authenticated using (true);

-- Built items — earned by building (NO price). Reward = a formula: the per-step RATES are DB-authored
-- (tunable, server-controlled); step_count / stage_count / cluster_count are SYNCED from the local
-- recipe every time a furniture loads (sync_furniture_counts, 005_economy.sql), so they are never
-- hand-maintained — single source is the local recipe. Only step_count is load-bearing: it feeds the
-- GENERATED xp_reward/coin_reward that reward_build reads; stage/cluster are a mirror for inspection
-- and tuning. duration_min is minutes, hand-authored curation (not derived from the recipe), so it
-- stays DB-authored and the client never pushes it.
--
-- size_* / base_offset_y are room-placement metadata: world-AABB extents in authored meters
-- (x = width, z = depth, at rotSteps 0), measured from the storage/bundled GLBs (accessor min/max
-- through node transforms — scratchpad measure-glb). base_offset_y = -worldMinY: the lift from the
-- model's origin to its base (EKET is authored centred). Null sizes = no room model, not placeable.
-- The app derives everything else (footprint, scale) from these — see src/room/core/placeableItems.ts.
create table if not exists public.item_build (
  id             text primary key,
  name           text not null,
  brand_id       text references public.brands (id),
  category_id    text not null references public.item_categories (id),
  type_id        text references public.furniture_types (id),
  link           text,
  assembly_model text,                                 -- assembly/<id>/... path; null = local build payload
  step_count     integer not null default 0 check (step_count >= 0),        -- SYNCED from the local recipe on load
  stage_count    integer not null default 0 check (stage_count >= 0),       -- SYNCED; mirror only, no read path yet
  cluster_count  integer not null default 0 check (cluster_count >= 0),     -- SYNCED; mirror only, no read path yet
  xp_per_step    integer not null default 0 check (xp_per_step >= 0),       -- DB-authored, tunable
  xp_bonus       integer not null default 0 check (xp_bonus >= 0),          -- = xpBonusOnComplete
  coins_per_step integer not null default 0 check (coins_per_step >= 0),
  xp_reward      integer generated always as (step_count * xp_per_step + xp_bonus) stored,
  coin_reward    integer generated always as (step_count * coins_per_step) stored,
  duration_min   integer not null default 0 check (duration_min >= 0),      -- estimated build time, hand-authored
  size_x         double precision,
  size_y         double precision,
  size_z         double precision,
  base_offset_y  double precision not null default 0,
  -- A size is authored whole or not at all — a partial row would place a piece with a degenerate AABB.
  constraint item_build_size_whole
    check (num_nonnulls(size_x, size_y, size_z) in (0, 3) and coalesce(size_x, 1) > 0 and coalesce(size_y, 1) > 0 and coalesce(size_z, 1) > 0)
);

alter table public.item_build enable row level security;

drop policy if exists item_build_select on public.item_build;
create policy item_build_select on public.item_build for select to authenticated using (true);

-- Bought items — purchased with coins. Model-items (furniture/plant/book/pc/...) AND surfaces
-- (wallpaper/floor: no model → no item_variants rows). min_level gates purchase (1 = no limit).
-- Same placement metadata as item_build; surfaces keep null sizes.
create table if not exists public.item_buy (
  id            text primary key,
  name          text not null,
  brand_id      text references public.brands (id),          -- optional (good-to-have; FK still enforced when set)
  category_id   text not null references public.item_categories (id),
  link          text,                                         -- optional
  price         integer not null check (price >= 0),
  min_level     integer not null default 1 check (min_level >= 1),
  size_x        double precision,
  size_y        double precision,
  size_z        double precision,
  base_offset_y double precision not null default 0,
  constraint item_buy_size_whole
    check (num_nonnulls(size_x, size_y, size_z) in (0, 3) and coalesce(size_x, 1) > 0 and coalesce(size_y, 1) > 0 and coalesce(size_z, 1) > 0)
);

alter table public.item_buy enable row level security;

drop policy if exists item_buy_select on public.item_buy;
create policy item_buy_select on public.item_buy for select to authenticated using (true);

-- Per-variation ROOM model — IDENTITY ONLY (paths derived). item_id is a SOFT ref (no FK), spans both
-- item tables. variation is a free-form per-item key = the path segment; null = single variation
-- ('default'). Surfaces have zero rows.
create table if not exists public.item_variants (
  id         text primary key,
  item_id    text not null,                 -- soft ref -> item_build.id OR item_buy.id
  variation  text,                          -- free-form key = path segment (white, oak, red, ...); null = 'default'
  is_default boolean not null default false,
  unique (item_id, variation)
);

-- Exactly one default variation per item (the one shown first / in the catalogue).
create unique index if not exists item_variants_one_default
  on public.item_variants (item_id) where is_default;

alter table public.item_variants enable row level security;

drop policy if exists item_variants_select on public.item_variants;
create policy item_variants_select on public.item_variants for select to authenticated using (true);

-- Placeable items — the union the room reads to render anything placed, regardless of acquisition.
-- Common columns + a source tag (the tag IS the room/<built|bought>/ path segment).
-- security_invoker so the view respects the querying user's RLS on the base tables.
create or replace view public.placeable_items with (security_invoker = true) as
  select id, name, brand_id, category_id, link, 'built'  as source, size_x, size_y, size_z, base_offset_y from public.item_build
  union all
  select id, name, brand_id, category_id, link, 'bought' as source, size_x, size_y, size_z, base_offset_y from public.item_buy;

-- ============================================================================================
-- SEED TEMPLATE — identity + metadata only (paths derived). Replace / extend.
-- Built (room/built/):  bekvam-stool, dalfred-stool, eket-cabinet, lack-table, tutorial.
-- Bought (room/bought/): malm-chest, neiden-bedframe, rosentorp-table. Add surfaces/decor (wallpaper,
--   floor, plants, ...) directly as item_buy — surfaces get no item_variants. Prices are PLACEHOLDERS.
-- ============================================================================================

-- Author the per-step RATES here (xp_per_step, xp_bonus, coins_per_step); the counts are left 0 and
-- get SYNCED from the local recipe on furniture load (sync_furniture_counts), driving the generated
-- xp_reward/coin_reward. Reward is 0 until a furniture is first loaded (then synced).
-- Sizes match the numbers long pinned in placeableItems.ts (the bundled fallback); tutorial stays
-- null — no room model, never placeable.
insert into public.item_build (id, name, brand_id, category_id, type_id, link, assembly_model, xp_per_step, xp_bonus, coins_per_step, duration_min, size_x, size_y, size_z, base_offset_y) values
  ('eket-cabinet',  'EKET Cabinet',  'IKEA', 'fur', 'shelf_cabinet', null, null, 6, 0, 3, 35, 0.37, 0.35, 0.75, 0.175),
  ('bekvam-stool',  'BEKVAM Stool',  'IKEA', 'fur', 'other',         null, null, 6, 0, 3, 15, 0.39, 0.50, 0.43, 0),
  ('dalfred-stool', 'DALFRED Stool', 'IKEA', 'fur', 'table_chair',   null, null, 6, 0, 3, 10, 0.50, 0.79, 0.50, 0.007),
  ('lack-table',    'LACK Table',    'IKEA', 'fur', 'table_chair',   null, null, 6, 0, 3,  8, 0.55, 0.45, 0.55, 0),
  ('tutorial',      'Tutorial',      null,   'fur', 'shelf_cabinet', null, null, 0, 0, 0,  5, null, null, null, 0)   -- placeable catalog row; no reward, no room model
on conflict (id) do nothing;

insert into public.item_buy (id, name, brand_id, category_id, link, price, min_level, size_x, size_y, size_z, base_offset_y) values
  ('malm-chest',      'MALM Chest',      'IKEA', 'fur', null, 150, 1, 0.804, 1.004, 0.483, 0),
  ('neiden-bedframe', 'NEIDEN Bedframe', 'IKEA', 'fur', null, 120, 1, 0.960, 0.647, 1.950, 0),
  ('rosentorp-table', 'ROSENTORP Table', 'IKEA', 'fur', null, 100, 1, 1.101, 0.751, 1.101, 0)
on conflict (id) do nothing;

insert into public.item_variants (id, item_id, variation, is_default) values
  -- tutorial (built): single model, no color axis → room/built/tutorial/default.glb
  ('tutorial__default', 'tutorial', null, true),
  -- built: models at room/built/<id>/<variation>.glb
  ('eket-cabinet__black',  'eket-cabinet', 'black',  true),
  ('eket-cabinet__white',  'eket-cabinet', 'white',  false),
  ('eket-cabinet__wooden', 'eket-cabinet', 'wooden', false),
  ('bekvam-stool__white',  'bekvam-stool', 'white',  true),
  ('bekvam-stool__black',  'bekvam-stool', 'black',  false),
  ('bekvam-stool__wooden',  'bekvam-stool', 'wooden',  false),
  ('dalfred-stool__birch',  'dalfred-stool', 'birch',  true),
  ('dalfred-stool__black',  'dalfred-stool', 'black',  false),
  ('lack-table__wooden',  'lack-table', 'wooden',  true),
  ('lack-table__black',  'lack-table', 'black',  false),
  ('lack-table__white',  'lack-table', 'white',  false),
  -- bought: models at room/bought/<id>/<variation>.glb
  ('malm-chest__white',  'malm-chest', 'white',  true),
  ('malm-chest__wooden', 'malm-chest', 'wooden', false),
  ('neiden-bedframe__wooden', 'neiden-bedframe', 'wooden', true),
  ('rosentorp-table__black', 'rosentorp-table', 'black', true),
  ('rosentorp-table__white', 'rosentorp-table', 'white', false)
on conflict (id) do nothing;
