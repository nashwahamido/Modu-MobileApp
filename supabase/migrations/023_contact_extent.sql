-- contact_size_x / contact_size_z: the XZ extent of a model's BASE, in authored metres, overriding
-- size_x/size_z when the client derives topFootprint (src/room/core/placeableItems.ts).
--
-- Why it exists: topFootprint is a plain rectangle, ceil(size / 0.125) per axis, measured off the model's
-- full bounding box. An open laptop, a lamp with a shade and a plant with a canopy are all WIDER above the
-- surface than they are on it, so each claims top cells it never actually touches — the laptop takes a 3x3
-- block of a desk's top grid for a base that fits in 2x3. Measured, that is a third of the cells it holds.
--
-- Null means "same as size", which is the common case and the default every existing row keeps. Modu-Portal
-- derives the value at upload time (packages/glb/footprintMask.mjs, deriveContactExtent) from the bottom
-- CONTACT_BAND — 20% — of the model's height, and deliberately stores NOTHING unless the narrower extent
-- actually costs the item fewer top cells: astid-table-lamp's base is 68% x 89% of its widest point and
-- still rounds to the same 2x3 block, so it stays null rather than filling the column with noise.
--
-- Scope: this only ever changes topFootprint, never `footprint` (the floor grid) and never the rendered
-- size. An item still DRAWS at size_x/size_y/size_z; this says what part of it rests on a surface. That is
-- also why there is no contact_size_y — height is not a footprint.
--
-- The cell rule both repos must agree on is pinned by src/room/core/footprintContract.json, which carries
-- topCell (0.125) and contactBand (0.2) alongside the floor pitch, with a test either side of it.

begin;

alter table public.item_build
  add column if not exists contact_size_x numeric,
  add column if not exists contact_size_z numeric;

alter table public.item_buy
  add column if not exists contact_size_x numeric,
  add column if not exists contact_size_z numeric;

alter table public.workshop_drafts
  add column if not exists contact_size_x numeric,
  add column if not exists contact_size_z numeric;

-- Both axes or neither, and each must be positive and no larger than the size it overrides. A contact
-- extent WIDER than the model is not a narrower base, it is a measurement bug, and it would silently
-- enlarge an item's occupancy — the one direction this column must never be able to do.
alter table public.item_build drop constraint if exists item_build_contact_pair;
alter table public.item_build drop constraint if exists item_build_contact_within_size;
alter table public.item_buy drop constraint if exists item_buy_contact_pair;
alter table public.item_buy drop constraint if exists item_buy_contact_within_size;
alter table public.workshop_drafts drop constraint if exists workshop_drafts_contact_pair;
alter table public.workshop_drafts drop constraint if exists workshop_drafts_contact_within_size;

alter table public.item_build
  add constraint item_build_contact_pair
  check ((contact_size_x is null) = (contact_size_z is null));
alter table public.item_build
  add constraint item_build_contact_within_size
  check (contact_size_x is null or (contact_size_x > 0 and contact_size_z > 0 and contact_size_x <= size_x and contact_size_z <= size_z));

alter table public.item_buy
  add constraint item_buy_contact_pair
  check ((contact_size_x is null) = (contact_size_z is null));
alter table public.item_buy
  add constraint item_buy_contact_within_size
  check (contact_size_x is null or (contact_size_x > 0 and contact_size_z > 0 and contact_size_x <= size_x and contact_size_z <= size_z));

alter table public.workshop_drafts
  add constraint workshop_drafts_contact_pair
  check ((contact_size_x is null) = (contact_size_z is null));
alter table public.workshop_drafts
  add constraint workshop_drafts_contact_within_size
  check (contact_size_x is null or (contact_size_x > 0 and contact_size_z > 0 and contact_size_x <= size_x and contact_size_z <= size_z));

-- Re-declared in full rather than patched: a view is replaced wholesale, so every column has to be
-- restated. This is 021's definition plus the two new columns.
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
         i.opens_wall,
         i.contact_size_x,
         i.contact_size_z
    from items i
    left join public.item_lights l on l.item_id = i.id;


-- publish_workshop_draft, re-declared IN FULL — `create or replace function` replaces the whole body, so
-- there is no way to patch one line of it. This is 022's version with contact_size_x/z added to the
-- item_buy insert. Without this the two columns above would be write-only: a draft could hold a contact
-- extent, the operator would see it in the portal, and publishing would drop it on the floor.

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

  -- Now also naming contact_size_x/z (023). This insert uses an EXPLICIT COLUMN LIST, so every column the drafts table gains has to be added here too or a published draft silently loses it — the draft row would carry a contact extent, the live item would not, and the only symptom would be an item quietly reverting to claiming its full top footprint. That is why the whole function is restated rather than patched: `create or replace function` replaces the entire body.
  -- mount/on_top/opens_wall are named explicitly (022), so item_buy_mount_placeable (021) is satisfied by what the draft actually carries rather than by the column defaults an unnamed insert would fall back to. draft.mount/on_top/opens_wall are themselves guaranteed non-degenerate by workshop_drafts_mount_placeable/_opens_wall_needs_wall above, enforced at every save this draft went through on its way to 'testing' — so nothing new can go wrong here that a save did not already refuse.
  insert into public.item_buy
    (id, name, brand_id, category_id, link, price, min_level, size_x, size_y, size_z, base_offset_y, footprint_mask, top_surface, granted, mount, on_top, opens_wall, contact_size_x, contact_size_z)
  values (draft.id, draft.name, draft.brand_id, draft.category_id, draft.link, draft.price, draft.min_level,
          draft.size_x, draft.size_y, draft.size_z, draft.base_offset_y, draft.footprint_mask, draft.top_surface, draft.granted,
          draft.mount, draft.on_top, draft.opens_wall, draft.contact_size_x, draft.contact_size_z);

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

commit;

-- Returns rows the dashboard SQL editor cannot hide, unlike a RAISE NOTICE (the house pattern — see
-- 019_workshop_kinds.sql). Expect new_columns = 6 (contact_size_x/z across the three tables), constraints
-- = 6, view_columns = 2 and publish_carries_contact = 1. Every existing row keeps null, so nothing about
-- current placement changes
-- until the portal writes a value.
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name in ('item_build', 'item_buy', 'workshop_drafts')
      and column_name in ('contact_size_x', 'contact_size_z'))                                    as new_columns,
  (select count(*) from pg_constraint
    where conname in ('item_build_contact_pair', 'item_build_contact_within_size',
                      'item_buy_contact_pair', 'item_buy_contact_within_size',
                      'workshop_drafts_contact_pair', 'workshop_drafts_contact_within_size'))     as constraints,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'placeable_items'
      and column_name in ('contact_size_x', 'contact_size_z'))                                    as view_columns,
  (select count(*) from public.item_buy where contact_size_x is not null)                         as buy_with_contact,
  -- Reads the INSTALLED function's own source rather than trusting that the block above ran: 1 means the
  -- publish path names the new columns, so a published draft keeps its contact extent. 0 means it does not,
  -- and every draft published from the portal would silently drop the value. Counted rather than selected
  -- so an overloaded name cannot turn this into a "more than one row returned" error.
  (select count(*) from pg_proc p
    where p.proname = 'publish_workshop_draft'
      and pg_get_functiondef(p.oid) like '%contact_size_x%')                                      as publish_carries_contact;
