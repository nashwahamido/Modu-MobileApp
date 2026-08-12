-- Teaches workshop_drafts and publish_workshop_draft the SECOND kind of catalogue item. 011 built the draft table when the portal knew one kind; 014 added lighting through it; the catalogue also has SURFACE items (categories 'floor' and 'wall' — a wallpaper or a floor covering) which occupy no cells, carry no size at all, ship a set of .ktx2 maps instead of a .glb, and need an item_surfaces row. See docs/modu-portal-catalogue-contract.md, which is the authority here.
--
-- 011 and 014 ARE ALREADY APPLIED to the live project, so this is additive and every statement is `if not exists` / `drop ... if exists` / `create or replace`.
--
-- ONE CAVEAT ON REPLAYING EARLIER FILES, since this file's own idempotence invites the assumption: re-running 011 is safe for its TABLE (`create table if not exists` skips, so the dropped NOT NULLs are not re-imposed) but NOT for its function — 011 ends with a `create or replace publish_workshop_draft` that would silently revert 014's lighting block and this file's surface block. Treat 011 as no-longer-replayable, or re-run this file after it.
--
-- WHAT CHANGES:
--   * SIZE BECOMES NULLABLE. item_buy stores NULL for all three on a surface item; 011 declared them `not null check (> 0)`, which makes a surface draft unsaveable. The all-or-nothing rule moves into a constraint. 011's per-column `check (size_x > 0)` constraints are LEFT IN PLACE and remain correct — a CHECK passes when it evaluates to NULL, so with a null size they read `NULL > 0` -> NULL -> pass, and continue to mean "positive if present".
--   * `surface` JSONB, the item_surfaces payload, shaped exactly like the `light` payload 014 introduced and guarded the same way. (`light` itself already exists from 014; the add below is a deliberate no-op that keeps this file readable on its own.)
--   * footprint_mask / top_surface / granted, which item_buy gained in 015, 016 and 018 and which a draft could not express — so nothing published through the portal could declare that things may stand on it.
--   * publish_workshop_draft learns both kinds. Without this the table half alone would be a trap: a surface draft would be storable and then structurally unpublishable, because the variant precheck demands exactly one default and the kind constraint forbids any.

begin;

alter table public.workshop_drafts
  alter column size_x drop not null,
  alter column size_y drop not null,
  alter column size_z drop not null;

alter table public.workshop_drafts
  add column if not exists footprint_mask text,
  add column if not exists top_surface    boolean not null default false,
  -- Every player owns a granted item without buying it (018). Defaulted false and never set implicitly: granting is a decision about the game's economy, not a property of an uploaded file.
  add column if not exists granted        boolean not null default false,
  add column if not exists light          jsonb,
  add column if not exists surface        jsonb;

-- BACKFILL BEFORE CONSTRAINING — the lesson 014 records having learned the hard way, where adding a constraint before repairing the rows that violated it failed with "check constraint is violated by some row" and took the whole migration down.
--
-- Written against the CATEGORY rather than against known ids, for the reason 014 gives: a migration that only repairs the rows its author happened to know about is a migration that fails on somebody else's database. Both statements should touch zero rows on a healthy database, because the portal could not have written either shape before now — but a hand-inserted row is exactly the case that would otherwise break the constraint, and any pre-019 floor/wall draft necessarily has all three sizes (they were NOT NULL) and very likely a variant (publish demanded one), so it violates the new constraint on two counts, not one.
--
-- The WHERE clause is guarded on the row actually being wrong so a re-run is a genuine no-op: an unguarded UPDATE would fire workshop_drafts_touch and bump updated_at on every surface draft each time this file ran, and would re-null the sizes of rows already published.
update public.workshop_drafts
  set size_x = null, size_y = null, size_z = null,
      variants = '[]'::jsonb,
      surface = coalesce(surface, '{"scale_x": 1, "scale_y": 1}'::jsonb)
  where category_id in ('floor', 'wall')
    and (size_x is not null or jsonb_array_length(variants) <> 0 or surface is null);

-- A lit draft predating 014's `light` column is missing a payload rather than expressing an intent, so the repair is a plausible lamp. The numbers are the calibrated ones from 012 (25000 lumens, 2700 K) and barlast-floor-lamp's reach; bulb_* are written EXPLICITLY because publish reads them uncoalesced into NOT NULL columns, so a payload omitting them fails with a bare 23502 rather than anything readable.
update public.workshop_drafts
  set light = '{"type": "point", "lumens": 25000, "kelvin": 2700, "reach_m": 4.6, "bulb_x": 0, "bulb_y": 0, "bulb_z": 0}'::jsonb
  where category_id = 'lit' and light is null;

alter table public.workshop_drafts drop constraint if exists workshop_drafts_size_whole;
alter table public.workshop_drafts drop constraint if exists workshop_drafts_kind_shape;
alter table public.workshop_drafts drop constraint if exists workshop_drafts_lit_has_light;
alter table public.workshop_drafts drop constraint if exists workshop_drafts_surface_is_object;

-- All three or none. item_buy_size_whole additionally repeats the positivity test; here that half is already carried by 011's surviving per-column checks, so this constraint states only the part they cannot.
alter table public.workshop_drafts
  add constraint workshop_drafts_size_whole
    check (num_nonnulls(size_x, size_y, size_z) in (0, 3));

-- The same guard 014 put on `light`, for the same reason: `jsonb` accepts a JSON null, an array and a bare scalar, and `surface is not null` is TRUE for all of them — so without this, "must carry its tiling payload" is satisfied by the string "whatever".
alter table public.workshop_drafts
  add constraint workshop_drafts_surface_is_object
    check (surface is null or jsonb_typeof(surface) = 'object');

-- A surface item has no size and must carry its tiling payload; a model item must have a size. Surface items also have no colour axis — one set of maps, not a .glb per variation — so a variant on one would publish item_variants rows nothing can ever use.
-- NOTE: this tests size_x alone, so a floor row with size_x null but size_y set satisfies it; workshop_drafts_size_whole is what refuses that. The pair is airtight and neither half is on its own. Both are NULL-proof only because category_id is NOT NULL — if that ever changes, revisit.
alter table public.workshop_drafts
  add constraint workshop_drafts_kind_shape
    check (
      case when category_id in ('floor', 'wall')
           then size_x is null and surface is not null and jsonb_array_length(variants) = 0
           else size_x is not null
      end
    );

-- 012 notes that "a category 'lit' row must have an item_lights row" spans two tables so no check reaches it, and leaves an audit query instead. In workshop_drafts both halves sit in ONE row, so a check does reach it — and catching it at draft-write beats catching it after publish has already written to the live catalogue.
alter table public.workshop_drafts
  add constraint workshop_drafts_lit_has_light
    check (category_id <> 'lit' or light is not null);

-- Publish, taught both kinds. Based on 014's version — the lighting block is carried forward verbatim, since replacing this function is the only way to extend it and dropping that block would silently un-ship migration 014.
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

  insert into public.item_buy
    (id, name, brand_id, category_id, link, price, min_level, size_x, size_y, size_z, base_offset_y, footprint_mask, top_surface, granted)
  values (draft.id, draft.name, draft.brand_id, draft.category_id, draft.link, draft.price, draft.min_level,
          draft.size_x, draft.size_y, draft.size_z, draft.base_offset_y, draft.footprint_mask, draft.top_surface, draft.granted);

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

revoke all on function public.publish_workshop_draft(text) from public, anon;
grant execute on function public.publish_workshop_draft(text) to authenticated;

commit;

-- Returns rows the dashboard SQL editor cannot hide, unlike a RAISE NOTICE. Expect nullable_sizes = 3, new_columns = 5, constraints = 4, and publish_writes_surfaces = true; anything else means a statement above did not take.
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'workshop_drafts'
       and column_name in ('size_x', 'size_y', 'size_z') and is_nullable = 'YES')            as nullable_sizes,
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'workshop_drafts'
       and column_name in ('footprint_mask', 'top_surface', 'granted', 'light', 'surface'))  as new_columns,
  (select count(*) from pg_constraint
     where conrelid = 'public.workshop_drafts'::regclass
       and conname in ('workshop_drafts_size_whole', 'workshop_drafts_kind_shape',
                       'workshop_drafts_lit_has_light', 'workshop_drafts_surface_is_object')) as constraints,
  (select pg_get_functiondef('public.publish_workshop_draft(text)'::regprocedure) like '%item_surfaces%') as publish_writes_surfaces;
