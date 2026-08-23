-- A lamp may carry a POINT and a SPOT at the same time.
--
-- 012 shipped item_lights keyed `item_id text primary key` — one light per item, full stop — and that
-- was the right shape for what it modelled: a bulb in a shade. It does not reach the thing operators
-- have been asking the portal for, which is a lamp that does two jobs at once: a soft omnidirectional
-- glow that says "this room has a lamp in it", PLUS a directed beam that actually lands somewhere. A
-- desk lamp is the obvious case — the shade leaks light in every direction while the cone points at
-- the desk — and with one row per item it can only be authored as one or the other, so the operator
-- picks the beam and the lamp reads as a torch, or picks the glow and the beam is lost.
--
-- WHY TWO ROWS AND NOT A 'both' TYPE. The alternative considered was widening the type check to
-- ('point','spot','both'), which is a one-line migration and needs no key change. It was rejected
-- because every OTHER column would then have to be shared: one lumens, one kelvin, one reach, one
-- bulb position for both emitters. That is precisely wrong for the case this exists to serve — the
-- glow is dim, warm and wide, the beam is bright, tighter and aimed, and they frequently do not even
-- come from the same point inside the model (the shade's mouth versus the filament). A 'both' row
-- would model two lights that are forced to agree about everything that makes them different lights.
--
-- So the key becomes (item_id, type): at most one point and at most one spot per item, each with its
-- own full set of numbers, and the pairing constraints 012 and 014 already wrote (cone with spot, aim
-- with spot) keep applying per row exactly as they did. Two is the ceiling rather than N because the
-- key IS the constraint — there are only two types, so "at most one of each" and "at most two" are the
-- same statement, and it needs no trigger to enforce.
--
-- THE ROW-DUPLICATION HAZARD, which is the real work in this file. placeable_items LEFT JOINs
-- item_lights, so the moment any item has two light rows that view returns that item TWICE — and it is
-- the app's only read path for placeable items, so a two-light lamp would appear twice in the shop,
-- twice in the catalogue, and twice in any layout validation that walks it. Renaming a column is a
-- compile error somewhere; this would have been silent. The join therefore becomes a LATERAL aggregate
-- that folds an item's lights into ONE jsonb array on ONE row, and the ten flat light_* columns 012 and
-- 014 built become a derived compatibility projection over that array (see below).
--
-- WHAT SHIPPED CLIENTS SEE. The flat light_* columns are KEPT, deliberately, even though nothing new
-- should read them: this schema is read by a mobile app whose old builds stay installed on real phones
-- for months, and those builds select `*` and read light_type. Dropping the columns would leave every
-- already-shipped build reading `light_type: undefined` — which degrades gracefully (the lamp places as
-- ordinary furniture and emits nothing, exactly the failure 012's audit query describes) but degrades
-- it for every lamp in the catalogue at once, not just two-light ones. So they stay, defined as the
-- item's SPOT if it has one and its point otherwise — see the ordering comment at that projection for
-- why the spot wins rather than the point. That is not a second source of truth to drift from the first
-- — it is a projection of the same aggregate, computed in the view, that no statement anywhere can write
-- to independently. New code reads `lights`; old code keeps working on one of them.
--
-- SAFE TO RE-RUN, and two statements needed real work to make that true rather than merely claiming it.
-- The `light` -> `lights` backfill names a column this file itself drops, so on a second pass it is
-- guarded and issued dynamically; and workshop_drafts_lit_has_lights drops its own name as well as the
-- one it replaces. Everything else is already drop-then-add, `if not exists`, `or replace`, or
-- `on conflict do nothing`. Re-running is therefore the right move after any edit to this file — the
-- verification query at the bottom reports the end state either way.

begin;

-- ============================================================================================
-- 1. item_lights: one row per (item, type)
-- ============================================================================================
-- The constraint name is Postgres's own generated one for 012's inline `primary key` (item_lights_pkey),
-- so this drops what 012 actually created rather than a name this file wishes it had used. No foreign
-- key anywhere references item_lights — 012 documents item_id as a SOFT ref spanning item_build and
-- item_buy, and 017 contrasts its own real FK against exactly that — so widening the key breaks no
-- referencing constraint. Verified against the whole migrations tree before writing this.
alter table public.item_lights drop constraint if exists item_lights_pkey;
alter table public.item_lights add constraint item_lights_pkey primary key (item_id, type);

-- Unchanged in meaning and restated only because it is now doing more work than it was: with two rows
-- per item possible, "a spot has a cone and a point does not" is what stops the pair being authored as
-- two points or two spots that differ only in brightness. Dropped-and-added rather than left alone so a
-- database that somehow lost it (a hand-edited restore, a partial 012) is put right by running this.
alter table public.item_lights drop constraint if exists item_lights_cone_matches_type;
alter table public.item_lights
  add constraint item_lights_cone_matches_type
    check ((type = 'spot') = (cone_deg is not null));

-- ============================================================================================
-- 2. placeable_items: aggregate, never duplicate
-- ============================================================================================
-- Re-declared in full — a view is replaced wholesale — and this is 023's definition with its light
-- LEFT JOIN replaced by the lateral below. Every non-light column is 023's, verbatim.
--
-- The element shape of `lights` is item_lights column-for-column, which is the SAME shape the portal
-- already writes into workshop_drafts (see section 3). That is worth the small redundancy of naming
-- every key: it means a draft's light payload and a published item's light payload are the same object,
-- so the app needs ONE mapper for both instead of the flattening dance repos.ts currently performs to
-- turn a draft's nested light into ten columns before reading it back out again.
--
-- `order by l.type` is not cosmetic. 'point' sorts before 'spot', so the array's order is stable across
-- reads and the compatibility projection below ("point if present, else spot") is simply element 1 —
-- no CASE, and no chance of two reads of the same row disagreeing about which light is the legacy one.
create or replace view public.placeable_items with (security_invoker = true) as
  with items as (
    select id, name, brand_id, category_id, link, 'built'  as source, size_x, size_y, size_z, base_offset_y, footprint_mask, top_surface, mount, on_top, opens_wall, contact_size_x, contact_size_z
      from public.item_build
    union all
    select id, name, brand_id, category_id, link, 'bought' as source, size_x, size_y, size_z, base_offset_y, footprint_mask, top_surface, mount, on_top, opens_wall, contact_size_x, contact_size_z
      from public.item_buy
  )
  select i.id, i.name, i.brand_id, i.category_id, i.link, i.source,
         i.size_x, i.size_y, i.size_z, i.base_offset_y,
         -- The legacy single-light projection. Derived, never written; see this file's header. These
         -- ten stay exactly where 023 put them, and `lights` is appended at the very END of the select
         -- list rather than placed beside them where it belongs logically: `create or replace view` may
         -- only APPEND columns — renaming or reordering an existing one is an error — and preserving
         -- the view's grants by replacing it rather than dropping and recreating it is worth more than
         -- a tidy column order.
         l.light_type,
         l.light_lumens,
         l.light_kelvin,
         l.light_reach_m,
         l.light_cone_deg,
         l.light_bulb_x,
         l.light_bulb_y,
         l.light_bulb_z,
         l.light_aim_pitch_deg,
         l.light_aim_yaw_deg,
         i.footprint_mask,
         i.top_surface,
         i.mount,
         i.on_top,
         i.opens_wall,
         i.contact_size_x,
         i.contact_size_z,
         -- NULL rather than '[]' when the item has no lights at all: jsonb_agg over zero rows yields
         -- NULL, and "this is not a lamp" is the same statement `light_type is null` has always made.
         l.lights
    from items i
    -- LEFT JOIN LATERAL ... ON TRUE, not a plain LEFT JOIN: the aggregate has to be computed per item
    -- and collapsed to a single row BEFORE it reaches the join, which is the whole point. An ordinary
    -- join against item_lights is what would multiply the item row by its light count.
    left join lateral (
      select
        jsonb_agg(
          jsonb_build_object(
            'type',          li.type,
            'lumens',        li.lumens,
            'kelvin',        li.kelvin,
            'reach_m',       li.reach_m,
            'cone_deg',      li.cone_deg,
            'bulb_x',        li.bulb_x,
            'bulb_y',        li.bulb_y,
            'bulb_z',        li.bulb_z,
            'aim_pitch_deg', li.aim_pitch_deg,
            'aim_yaw_deg',   li.aim_yaw_deg
          )
          order by li.type
        )                                                   as lights,
        -- THE SPOT WINS THE LEGACY PROJECTION, and the ordering is `type <> 'spot'` rather than `type`
        -- for exactly that reason: false sorts before true, so a spot comes first and a lamp with only a
        -- point still projects its point.
        --
        -- This is not a coin toss. The one two-light lamp this migration creates is barlast-floor-lamp,
        -- which has been a 30000 lm spot since 012 and is about to gain an ambient point beside it
        -- (section 5). Ordering by `type` alphabetically would put 'point' first, so every app build
        -- already installed on a phone would stop rendering that lamp's beam and start rendering the new
        -- dim fill instead — a visible downgrade to a shipped item, caused entirely by adding something.
        -- Preferring the spot means an old build sees exactly what it saw yesterday, which is the whole
        -- and only job of this projection. Note it deliberately DISAGREES with `lights` above, which
        -- stays point-then-spot to match the order the portal authors and saves in.
        (array_agg(li.type          order by (li.type <> 'spot')))[1]   as light_type,
        (array_agg(li.lumens        order by (li.type <> 'spot')))[1]   as light_lumens,
        (array_agg(li.kelvin        order by (li.type <> 'spot')))[1]   as light_kelvin,
        (array_agg(li.reach_m       order by (li.type <> 'spot')))[1]   as light_reach_m,
        (array_agg(li.cone_deg      order by (li.type <> 'spot')))[1]   as light_cone_deg,
        (array_agg(li.bulb_x        order by (li.type <> 'spot')))[1]   as light_bulb_x,
        (array_agg(li.bulb_y        order by (li.type <> 'spot')))[1]   as light_bulb_y,
        (array_agg(li.bulb_z        order by (li.type <> 'spot')))[1]   as light_bulb_z,
        (array_agg(li.aim_pitch_deg order by (li.type <> 'spot')))[1]   as light_aim_pitch_deg,
        (array_agg(li.aim_yaw_deg   order by (li.type <> 'spot')))[1]   as light_aim_yaw_deg
      from public.item_lights li
      where li.item_id = i.id
    ) l on true;

-- ============================================================================================
-- 3. workshop_drafts: light (object) -> lights (array)
-- ============================================================================================
-- BACKFILL BEFORE CONSTRAINING, the same order 014 used for the aim columns and for the same reason: the
-- new constraint forbids a state every existing lit draft is currently in (no `lights` at all), so the
-- column has to be filled before the check can be added.
alter table public.workshop_drafts add column if not exists lights jsonb;

-- Every existing draft carried at most one light, so its array is that one element. Guarded on
-- `lights is null` so a re-run cannot clobber a draft an operator has since given a second light.
--
-- WRAPPED AND DYNAMIC because this file has to survive being run TWICE. The `light` column is dropped at
-- the end of this very section, so on a second application it no longer exists and a plain UPDATE naming
-- it fails to parse — taking the whole transaction, and every later section, down with it. The failure
-- would be clean (nothing lands) and completely opaque: "column light does not exist" in a migration
-- whose entire job is to remove that column. `execute` keeps the reference out of the parser until the
-- guard has already decided there is something to reference.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workshop_drafts' and column_name = 'light'
  ) then
    execute 'update public.workshop_drafts set lights = jsonb_build_array(light) where light is not null and lights is null';
  end if;
end $$;

-- Interior shape, which no check constraint can express directly: `jsonb_array_elements` is a
-- set-returning function and a CHECK may not contain one, nor a subquery. An IMMUTABLE function is the
-- supported way through — it is a pure function of its argument, so it is safe in a check and the
-- planner may cache it. This is the one rule the portal cannot be trusted to keep on its own: the
-- portal's validateDraft states the same thing in TypeScript, and the two agreeing is what makes a
-- hand-edited row or a future second writer fail loudly here instead of at publish.
create or replace function public.workshop_lights_shape_ok(lights jsonb)
returns boolean
language sql
immutable
as $$
  select
    lights is null
    or (
      jsonb_typeof(lights) = 'array'
      -- 1..2, not 0..2: "no lights" is NULL. An empty array would be a third way to say the same thing,
      -- and a column with two spellings of absent is one the next reader has to test twice.
      and jsonb_array_length(lights) between 1 and 2
      and not exists (
        select 1 from jsonb_array_elements(lights) e
        where jsonb_typeof(e) <> 'object'
           or coalesce(e ->> 'type', '') not in ('point', 'spot')
      )
      -- The (item_id, type) key restated at draft level, so a draft carrying two points is refused at
      -- SAVE time rather than at publish, where the operator is no longer standing in the form.
      and (select count(distinct e ->> 'type') from jsonb_array_elements(lights) e)
          = jsonb_array_length(lights)
    )
$$;

alter table public.workshop_drafts drop constraint if exists workshop_drafts_lights_shape;
alter table public.workshop_drafts
  add constraint workshop_drafts_lights_shape
    check (public.workshop_lights_shape_ok(lights));

-- 019's rule, moved onto the new column: a lighting item must carry at least one light. BOTH names are
-- dropped first — the old one because this migration replaces it, and the NEW one because a second run
-- of this file would otherwise fail on "constraint workshop_drafts_lit_has_lights already exists".
alter table public.workshop_drafts drop constraint if exists workshop_drafts_lit_has_light;
alter table public.workshop_drafts drop constraint if exists workshop_drafts_lit_has_lights;
alter table public.workshop_drafts
  add constraint workshop_drafts_lit_has_lights
    check (category_id <> 'lit' or lights is not null);

-- 014's object guard goes with the column it guarded. Dropped BEFORE the column, since dropping a
-- column takes its constraints with it and leaving the drop implicit would hide what happened here.
alter table public.workshop_drafts drop constraint if exists workshop_drafts_light_is_object;
alter table public.workshop_drafts drop column if exists light;

-- ============================================================================================
-- 4. PUBLISH
-- ============================================================================================
-- Re-declared IN FULL — `create or replace function` replaces the whole body, so there is no way to
-- patch one line of it. This is 023's version with exactly two changes: the light guard reads `lights`,
-- and the single-row insert becomes a set-returning insert over the array. Everything else is 023's
-- function verbatim, including the explicit item_buy column list 023's own comment insists on.
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
  if draft.category_id = 'lit' and draft.lights is null then
    raise exception 'draft % is category lit but carries no lights', draft_id;
  end if;
  if draft.category_id <> 'lit' and draft.lights is not null then
    raise exception 'draft % carries lights but its category is %, not lit', draft_id, draft.category_id;
  end if;

  -- Same shape, for surfaces.
  if is_surface and draft.surface is null then
    raise exception 'draft % is a surface item but carries no surface payload', draft_id;
  end if;
  if not is_surface and draft.surface is not null then
    raise exception 'draft % carries a surface payload but its category is %, which is not a surface kind', draft_id, draft.category_id;
  end if;

  -- 023's insert, unchanged. This uses an EXPLICIT COLUMN LIST, so every column the drafts table gains has to be added here too or a published draft silently loses it.
  insert into public.item_buy
    (id, name, brand_id, category_id, link, price, min_level, size_x, size_y, size_z, base_offset_y, footprint_mask, top_surface, granted, mount, on_top, opens_wall, contact_size_x, contact_size_z)
  values (draft.id, draft.name, draft.brand_id, draft.category_id, draft.link, draft.price, draft.min_level,
          draft.size_x, draft.size_y, draft.size_z, draft.base_offset_y, draft.footprint_mask, draft.top_surface, draft.granted,
          draft.mount, draft.on_top, draft.opens_wall, draft.contact_size_x, draft.contact_size_z);

  -- coalesce to false: a variant object missing the is_default key would otherwise carry SQL NULL into a not-null column and abort the insert AFTER the item_buy row above has already been written in this same transaction — the precheck's `is true` already treats a missing key as not-default, so this just makes the insert agree with what the precheck already decided. Empty for a surface item, so the select yields no rows rather than needing a branch.
  insert into public.item_variants (id, item_id, variation, is_default)
  select draft.id || '__' || coalesce(v->>'variation', 'default'), draft.id, v->>'variation', coalesce((v->>'is_default')::boolean, false)
  from jsonb_array_elements(draft.variants) v;

  -- One insert, N rows, where N is 1 or 2 — the array's own length, which workshop_drafts_lights_shape
  -- has already bounded. Still no coalescing of the light's own fields, for 014's reason: every one is
  -- NOT NULL or constrained in item_lights, so a draft missing one fails HERE, in the same transaction
  -- as the inserts above, rather than producing a half-described lamp. A draft carrying two lights of
  -- the same type cannot reach this point (the shape check refuses it at save), and if one somehow did,
  -- item_lights_pkey refuses it here rather than silently keeping whichever row landed second.
  if draft.lights is not null then
    insert into public.item_lights
      (item_id, type, lumens, kelvin, reach_m, cone_deg, bulb_x, bulb_y, bulb_z, aim_pitch_deg, aim_yaw_deg)
    select
      draft.id,
      e->>'type',
      (e->>'lumens')::numeric,
      (e->>'kelvin')::integer,
      (e->>'reach_m')::numeric,
      (e->>'cone_deg')::numeric,
      (e->>'bulb_x')::numeric,
      (e->>'bulb_y')::numeric,
      (e->>'bulb_z')::numeric,
      (e->>'aim_pitch_deg')::numeric,
      (e->>'aim_yaw_deg')::numeric
    from jsonb_array_elements(draft.lights) e;
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

-- ============================================================================================
-- 5. SEED: the floor lamp gains its ambient glow
-- ============================================================================================
-- EVERY EXISTING LIGHT IS UNCHANGED BY THIS MIGRATION. Widening the key preserves each row as it stands,
-- the view keeps returning it, and a draft's single light becomes a one-element array — no lamp in the
-- catalogue changes what it emits. This section is the one deliberate exception, and it is additive.
--
-- barlast-floor-lamp has been a lone SPOT since 012 — aimed straight down (014 backfilled pitch 0) from a
-- bulb 1.38 m up. 012's own seed comment describes the intent as "the floor lamp a softer, wider point",
-- which the data never matched; the capability to be both simply did not exist. It does now, so the lamp
-- gets the glow it was described as having, beside the beam it actually has.
--
-- Position and colour are COPIED FROM THE SPOT rather than retyped, which is what makes this safe on a
-- database whose seed has since been edited: the two emitters are one physical bulb, so they share a
-- point in the model and a colour temperature by construction, and there is no second copy of either to
-- drift. The select finds nothing at all if that spot is absent, so this is a no-op on a database where
-- the lamp was removed or re-authored rather than an insert of a light with nothing to belong to.
--
-- LUMENS AND REACH ARE A JUDGEMENT, and have to be flagged as one. 012 states at length that lumens is
-- NOT physical here — Filament scales by a camera exposure react-native-filament does not bridge, so the
-- catalogue's numbers are calibrated BY EYE against the room's night preset and mean nothing except
-- relative to each other. 9000 is 30% of the spot's 30000: enough to read as a lit shade, well short of
-- doubling what the lamp puts into a room that players have already decorated around it. 3.0 m against
-- the beam's 4.6 m makes it a local glow rather than a second room light. Both need looking at in the
-- app before this ships; neither can be derived, and nothing in this file can check them.
insert into public.item_lights
  (item_id, type, lumens, kelvin, reach_m, cone_deg, bulb_x, bulb_y, bulb_z, aim_pitch_deg, aim_yaw_deg)
select
  spot.item_id,
  'point'       as type,
  9000          as lumens,
  spot.kelvin,                  -- one bulb, one colour temperature
  3.0           as reach_m,
  null          as cone_deg,    -- a point has no cone: item_lights_cone_matches_type requires this NULL
  spot.bulb_x,                  -- THE REQUESTED PART: the glow sits exactly where the beam comes from
  spot.bulb_y,
  spot.bulb_z,
  null          as aim_pitch_deg, -- and no direction: item_lights_aim_matches_type requires both NULL
  null          as aim_yaw_deg
from public.item_lights spot
where spot.item_id = 'barlast-floor-lamp' and spot.type = 'spot'
-- Idempotent, and specifically so a re-run can never overwrite a point somebody has since tuned by eye —
-- which is exactly what the note above asks them to do.
on conflict (item_id, type) do nothing;

commit;

-- Expect: pkey_columns = 2 (item_id, type), light_column_gone = 0, lights_column = 1, both new
-- constraints = 1 each, and — the one that matters most — view_rows = item_rows. That last pair is the
-- duplication check this migration's lateral join exists to make true: if placeable_items ever returns
-- more rows than the two item tables hold between them, an item is being multiplied by its light count
-- and every catalogue read in the app is wrong.
select
  (select count(*) from pg_index i join pg_class c on c.oid = i.indexrelid
    where c.relname = 'item_lights_pkey' and i.indisprimary)                                    as pkey_present,
  (select array_length(conkey, 1) from pg_constraint where conname = 'item_lights_pkey')        as pkey_columns,
  (select count(*) from information_schema.columns
    where table_name = 'workshop_drafts' and column_name = 'light')                             as light_column_gone,
  (select count(*) from information_schema.columns
    where table_name = 'workshop_drafts' and column_name = 'lights')                            as lights_column,
  (select count(*) from pg_constraint where conname = 'workshop_drafts_lights_shape')           as shape_constraint,
  (select count(*) from pg_constraint where conname = 'workshop_drafts_lit_has_lights')         as lit_constraint,
  (select count(*) from pg_constraint where conname = 'workshop_drafts_lit_has_light')          as old_lit_constraint,
  (select count(*) from public.placeable_items)                                                 as view_rows,
  (select (select count(*) from public.item_build) + (select count(*) from public.item_buy))    as item_rows,
  (select count(*) from public.placeable_items where category_id = 'lit' and lights is null)    as lamps_with_no_light,
  -- The seed in section 5: two lights on the floor lamp, at ONE bulb position (both_at_one_bulb = 1
  -- counts the distinct positions, so 2 would mean the copy did not take and the glow is somewhere the
  -- shade is not). floor_lamp_legacy must still read 'spot' — that is the assertion that an app build
  -- already on a phone renders this lamp exactly as it did before the point was added.
  (select count(*) from public.item_lights where item_id = 'barlast-floor-lamp')                as floor_lamp_lights,
  (select count(distinct (bulb_x, bulb_y, bulb_z)) from public.item_lights
    where item_id = 'barlast-floor-lamp')                                                       as both_at_one_bulb,
  (select light_type from public.placeable_items where id = 'barlast-floor-lamp')               as floor_lamp_legacy;
