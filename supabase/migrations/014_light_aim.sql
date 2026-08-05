-- Where a lighting item's bulb sits, and which way it points — through the workshop, not straight into the catalog.
--
-- 012 shipped item_lights with type/lumens/kelvin/reach/cone and NO position, on the stated plan that a
-- 'Bulb' node in the GLB would supply it the way a window's anchor empty supplies its mounting plane.
-- That plan did not survive contact with real models: every lamp uploaded so far is a single unnamed
-- IKEA mesh, so the app fell back to one global constant (LIT.bulbAboveTopMetres in RoomScene.tsx) for
-- every lighting item at once. That constant can be right for a table lamp OR a floor lamp, never both
-- — at 0.28 m above the piece it puts the BARLAST floor lamp's bulb at 1.78 m, floating above the
-- fixture entirely. The model is still where these numbers COME from where a Bulb node exists (see
-- src/glb/light.ts in the Modu-Portal repo); this is where they are written down and can be corrected.
--
-- ============================================================================================
-- THE AIM CONVENTION. THIS BLOCK IS THE CONTRACT BETWEEN TWO REPOS — READ IT BEFORE CHANGING ANYTHING.
-- ============================================================================================
-- The portal WRITES these angles and the app READS them, and nothing at compile time connects the two.
-- The failure that matters is not a wrong number, it is a disagreement about what the numbers MEAN:
-- if the portal takes pitch 0 as "up" and the app takes it as "down", every lamp aims backwards, both
-- sides individually look correct, and the uploader approves a preview that is not what ships.
--
-- So the convention is defined here, in the one file both repos share, as WORKED EXAMPLES rather than
-- prose. Both sides carry these same pairs as a test fixture — src/room/core/lightAim.test.ts in
-- Modu-MobileApp, and the portal's equivalent. If either side flips a sign, its own test fails.
--
--   pitch  0 deg  = straight DOWN          (the resting case for nearly every lamp)
--   pitch 90 deg  = horizontal
--   pitch 180 deg = straight UP            (an uplighter)
--   yaw    0 deg  = toward -Z              (the model's own "forward", the glTF/DCC convention)
--   yaw increases toward +X
--
--   direction.y =  -cos(pitch)
--   direction.x =   sin(pitch) * sin(yaw)
--   direction.z =  -sin(pitch) * cos(yaw)
--
--   (pitch,   yaw) -> (x,  y,  z)
--   (  0,     any) -> ( 0, -1,  0)      straight down; yaw is degenerate at the poles and has no effect
--   ( 90,       0) -> ( 0,  0, -1)
--   ( 90,      90) -> ( 1,  0,  0)
--   ( 90,     180) -> ( 0,  0,  1)
--   ( 90,     270) -> (-1,  0,  0)
--   (180,     any) -> ( 0,  1,  0)      straight up
--   ( 45,       0) -> ( 0, -0.7071, -0.7071)
--
-- Angles are stored rather than a unit vector, deliberately: a direction has two degrees of freedom and
-- a vector spends three on it, so the third can only ever be wrong. A vector is also unreadable in a
-- table, and no UI control produces one — the portal edits these as two sliders, which is both easier
-- to aim precisely than dragging a handle on a 2-D screen and impossible to put in a non-unit state.
-- ROLL is deliberately absent: a spot cone is rotationally symmetric, so a third angle would be a value
-- nobody could ever verify.
--
-- Angles are in the PIECE'S OWN SPACE at rotSteps 0, so they turn with the furniture. A lamp aimed at
-- the desk it stands beside stays aimed at it after the player rotates the pair.

-- ============================================================================================
-- 1. THE LIVE TABLE
-- ============================================================================================
-- bulb_* is measured in METRES from the piece's BASE, not from the GLB's own origin. The app places
-- furniture by its base (that is what base_offset_y computes), so bulb_y reads as plain "height up the
-- lamp" whatever the model's authored origin was. A lamp modelled around its own centre would otherwise
-- light from under the floor.
alter table public.item_lights
  add column if not exists bulb_x        numeric not null default 0,
  add column if not exists bulb_y        numeric not null default 0,
  add column if not exists bulb_z        numeric not null default 0,
  -- NULL for a point light, which has no direction at all — the same shape cone_deg already has, and
  -- for the same reason: a value that cannot mean anything should not be storable.
  add column if not exists aim_pitch_deg numeric,
  add column if not exists aim_yaw_deg   numeric;

-- BACKFILL BEFORE CONSTRAINING. Every row already in item_lights predates these columns, so each spot
-- is currently a spot with no aim — exactly what item_lights_aim_matches_type forbids. Adding the
-- constraint first fails with "check constraint is violated by some row" and takes the whole migration
-- with it, which is what happened on the first run of this file.
--
-- The aim backfill is written against the TYPE rather than against the two known ids on purpose: any
-- row seeded by hand since 012 needs it too, and a migration that only repairs the rows its author
-- happened to know about is a migration that fails on somebody else's database.
update public.item_lights
  set aim_pitch_deg = 0, aim_yaw_deg = 0
  where type = 'spot' and (aim_pitch_deg is null or aim_yaw_deg is null);

-- The other direction, for the same reason: a point light carrying an aim also violates the pairing.
-- Nothing can have written one yet, but the constraint is symmetric and so is the repair.
update public.item_lights
  set aim_pitch_deg = null, aim_yaw_deg = null
  where type = 'point' and (aim_pitch_deg is not null or aim_yaw_deg is not null);

-- Bulb heights for the two seeded lamps. Both are single unnamed meshes with no Bulb node, so these are
-- EYEBALLED at roughly 80% of each fixture's height — where a filament actually sits, rather than the
-- top of the shade the portal's fallback would choose.
-- Guarded on bulb_y = 0 so a re-run cannot overwrite a value someone has since corrected: the column
-- defaults to 0, so only an untouched row is still at zero.
update public.item_lights set bulb_x = 0, bulb_y = 0.44, bulb_z = 0
  where item_id = 'astid-table-lamp' and bulb_y = 0;
update public.item_lights set bulb_x = 0, bulb_y = 1.38, bulb_z = 0
  where item_id = 'barlast-floor-lamp' and bulb_y = 0;

-- Idempotent: re-running the file must not fail on a constraint that already exists.
alter table public.item_lights drop constraint if exists item_lights_aim_matches_type;
alter table public.item_lights drop constraint if exists item_lights_aim_range;

alter table public.item_lights
  add constraint item_lights_aim_matches_type
    check ((type = 'spot') = (aim_pitch_deg is not null and aim_yaw_deg is not null));

-- Pitch is a half turn (the full sphere is covered by pitch 0..180 crossed with yaw 0..360; allowing
-- pitch past 180 would make two different pairs mean the same direction). Yaw is end-exclusive at 360
-- for the same reason: 0 and 360 are the same aim, and permitting both invites two rows that look
-- different and are not.
alter table public.item_lights
  add constraint item_lights_aim_range
    check (
      (aim_pitch_deg is null or (aim_pitch_deg >= 0 and aim_pitch_deg <= 180))
      and (aim_yaw_deg is null or (aim_yaw_deg >= 0 and aim_yaw_deg < 360))
    );

-- ============================================================================================
-- 2. THE READ PATH
-- ============================================================================================
-- Appended, never reordered: create or replace view requires every existing column to keep its name,
-- type and position, so new ones can only go on the end.
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
         l.type          as light_type,
         l.lumens        as light_lumens,
         l.kelvin        as light_kelvin,
         l.reach_m       as light_reach_m,
         l.cone_deg      as light_cone_deg,
         l.bulb_x        as light_bulb_x,
         l.bulb_y        as light_bulb_y,
         l.bulb_z        as light_bulb_z,
         l.aim_pitch_deg as light_aim_pitch_deg,
         l.aim_yaw_deg   as light_aim_yaw_deg
    from items i
    left join public.item_lights l on l.item_id = i.id;

-- ============================================================================================
-- 3. THE WORKSHOP DRAFT
-- ============================================================================================
-- ONE jsonb column, not eleven nullable ones, following the same reasoning 011 gives for `variants`: a
-- draft is a working document read and written whole by one editor, and relational shape is what it
-- BECOMES at publish, not what it is while being edited. Null means "not a lighting item", which is
-- almost every draft.
--
-- Shape, matching item_lights one-for-one:
--   { "type": "point"|"spot", "lumens": number, "kelvin": number, "reach_m": number,
--     "cone_deg": number|null, "bulb_x": number, "bulb_y": number, "bulb_z": number,
--     "aim_pitch_deg": number|null, "aim_yaw_deg": number|null }
alter table public.workshop_drafts
  add column if not exists light jsonb;

alter table public.workshop_drafts drop constraint if exists workshop_drafts_light_is_object;
alter table public.workshop_drafts
  add constraint workshop_drafts_light_is_object
    check (light is null or jsonb_typeof(light) = 'object');

-- ============================================================================================
-- 4. PUBLISH
-- ============================================================================================
-- Re-declared in full because create or replace function cannot patch a body. The only changes from
-- 011 are the lighting block and its guard; everything above it is 011's function verbatim.
--
-- THIS CLOSES THE HOLE 012 DOCUMENTED AS UNCLOSEABLE. 012 says "a category 'lit' row must have an
-- item_lights row — it spans tables, so no check constraint reaches it" and asks for a manual audit
-- query after seeding. That is true of a constraint and false of a publish: here both rows are written
-- in one transaction, so a lamp that would place but never light is refused instead of shipped.
create or replace function public.publish_workshop_draft(draft_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  draft public.workshop_drafts;
  default_count integer;
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

  select count(*) into default_count from jsonb_array_elements(draft.variants) v where (v->>'is_default')::boolean is true;
  if default_count <> 1 then
    raise exception 'draft % must have exactly one default variant (found %)', draft_id, default_count;
  end if;

  -- The cross-table invariant, enforced at the one moment it CAN be. Checked in both directions: a
  -- lighting item with no light is the quiet failure (it places and emits nothing), and a light on a
  -- non-lighting item is a sign the category was changed after the light was authored.
  if draft.category_id = 'lit' and draft.light is null then
    raise exception 'draft % is category lit but carries no light', draft_id;
  end if;
  if draft.category_id <> 'lit' and draft.light is not null then
    raise exception 'draft % carries a light but its category is %, not lit', draft_id, draft.category_id;
  end if;

  insert into public.item_buy (id, name, brand_id, category_id, link, price, min_level, size_x, size_y, size_z, base_offset_y)
  values (draft.id, draft.name, draft.brand_id, draft.category_id, draft.link, draft.price, draft.min_level, draft.size_x, draft.size_y, draft.size_z, draft.base_offset_y);

  -- coalesce to false: a variant object missing the is_default key would otherwise carry SQL NULL into a not-null column and abort the insert AFTER the item_buy row above has already been written in this same transaction — the precheck's `is true` already treats a missing key as not-default, so this just makes the insert agree with what the precheck already decided.
  insert into public.item_variants (id, item_id, variation, is_default)
  select draft.id || '__' || coalesce(v->>'variation', 'default'), draft.id, v->>'variation', coalesce((v->>'is_default')::boolean, false)
  from jsonb_array_elements(draft.variants) v;

  -- No coalescing of the light's own fields: every one of them is NOT NULL or constrained in
  -- item_lights, so a draft missing one fails HERE, in the same transaction as the inserts above,
  -- rather than producing a half-described lamp. bulb_* default to 0 in the table but are written
  -- explicitly so a draft that omits them is a visible failure rather than a silent bulb at the origin.
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

  -- Published rows are KEPT, never deleted: they are the audit trail of what was promoted and when.
  update public.workshop_drafts set status = 'published' where id = draft_id;
end;
$$;

revoke all on function public.publish_workshop_draft(text) from public;
grant execute on function public.publish_workshop_draft(text) to authenticated;

-- Audit, same spirit as 012's: anything returned is a lamp that will place but never light. Should now
-- only ever be a row seeded by hand, since publish refuses to create one.
--   select id from public.placeable_items where category_id = 'lit' and light_type is null;
