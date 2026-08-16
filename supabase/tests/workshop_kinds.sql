-- Verifies that 019_workshop_kinds.sql's constraints actually BITE, rather than merely existing. Each block below asserts a shape the schema must accept or must refuse; a constraint that is present but too loose passes an existence check and fails here, which is the whole point of running this.
--
-- Safe against a live project with real data: the entire file runs inside BEGIN/ROLLBACK, so the wktest- rows it creates never survive even on a clean pass, and it never assumes the database is empty. It needs nothing from auth.users — unlike the publish test, none of this touches RLS or auth.uid().
--
-- Run in the Supabase dashboard SQL editor: paste from `begin;` to the end, skipping the \set line, which only psql understands.
-- A clean run ends with a row reading ALL ASSERTIONS PASSED. No such row means the first ERROR above it is the real failure.
\set ON_ERROR_STOP on
begin;

-- Each expectation catches ONLY check_violation, so the 'should have been refused' raise below it — which is raise_exception, a different class — propagates instead of being swallowed by its own handler. A blanket `when others` here would make every one of these blocks pass unconditionally.
create or replace function pg_temp.refuses(what text, stmt text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'should have been refused: %', what;
exception
  when check_violation then return;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- A model item: all three sizes, no surface payload. The shape every draft had before 019.
-- ---------------------------------------------------------------------------------------------
insert into public.workshop_drafts (id, name, category_id, price, min_level, size_x, size_y, size_z, variants, status)
values ('wktest-k-chair', 'Chair', 'fur', 10, 1, 0.4, 0.9, 0.4, '[{"variation": null, "is_default": true}]', 'draft');

do $$
declare r public.workshop_drafts;
begin
  select * into r from public.workshop_drafts where id = 'wktest-k-chair';
  if r.top_surface is not false then raise exception 'top_surface should default to false, got %', r.top_surface; end if;
  if r.granted     is not false then raise exception 'granted should default to false, got %', r.granted; end if;
  if r.footprint_mask is not null then raise exception 'footprint_mask should default null'; end if;
end $$;

select pg_temp.refuses('a model item with only two of three sizes', $q$
  insert into public.workshop_drafts (id, name, category_id, size_x, size_y, variants, status)
  values ('wktest-k-half', 'Half', 'fur', 0.4, 0.9, '[]'::jsonb, 'draft')
$q$);

select pg_temp.refuses('a model item with no size at all', $q$
  insert into public.workshop_drafts (id, name, category_id, variants, status)
  values ('wktest-k-nosize', 'No size', 'fur', '[]'::jsonb, 'draft')
$q$);

-- ---------------------------------------------------------------------------------------------
-- A surface item: no size, a tiling payload, no colour axis. Impossible to store before 019.
-- ---------------------------------------------------------------------------------------------
insert into public.workshop_drafts (id, name, category_id, price, min_level, variants, surface, status)
values ('wktest-k-paper', 'Wallpaper', 'wall', 20, 1, '[]'::jsonb,
        '{"scale_x": 4, "scale_y": 2, "has_normal": true, "has_rough": false}'::jsonb, 'draft');

do $$
declare r public.workshop_drafts;
begin
  select * into r from public.workshop_drafts where id = 'wktest-k-paper';
  if r.size_x is not null or r.size_y is not null or r.size_z is not null then
    raise exception 'a surface draft must store no size, got % % %', r.size_x, r.size_y, r.size_z;
  end if;
  if (r.surface->>'scale_x')::numeric <> 4 then raise exception 'surface payload did not round-trip'; end if;
end $$;

select pg_temp.refuses('a surface item carrying a size', $q$
  insert into public.workshop_drafts (id, name, category_id, size_x, size_y, size_z, variants, surface, status)
  values ('wktest-k-sized', 'Sized paper', 'wall', 1, 1, 1, '[]'::jsonb, '{"scale_x": 1, "scale_y": 1}'::jsonb, 'draft')
$q$);

select pg_temp.refuses('a surface item with no tiling payload', $q$
  insert into public.workshop_drafts (id, name, category_id, variants, status)
  values ('wktest-k-nopayload', 'Bare paper', 'wall', '[]'::jsonb, 'draft')
$q$);

-- jsonb accepts a JSON null, an array and a bare scalar, and `surface is not null` is TRUE for every one of them — so without workshop_drafts_surface_is_object, "must carry its tiling payload" would be satisfied by the string "whatever".
select pg_temp.refuses('a surface item whose payload is a JSON null', $q$
  insert into public.workshop_drafts (id, name, category_id, variants, surface, status)
  values ('wktest-k-jsonnull', 'Paper', 'wall', '[]'::jsonb, 'null'::jsonb, 'draft')
$q$);

select pg_temp.refuses('a surface item whose payload is an array', $q$
  insert into public.workshop_drafts (id, name, category_id, variants, surface, status)
  values ('wktest-k-jsonarr', 'Paper', 'wall', '[]'::jsonb, '[]'::jsonb, 'draft')
$q$);

select pg_temp.refuses('a surface item whose payload is a bare scalar', $q$
  insert into public.workshop_drafts (id, name, category_id, variants, surface, status)
  values ('wktest-k-jsonscalar', 'Paper', 'wall', '[]'::jsonb, '"whatever"'::jsonb, 'draft')
$q$);

-- A surface item ships one set of maps, not a .glb per variation, so variants on one would publish item_variants rows nothing can ever use.
select pg_temp.refuses('a surface item with a colour axis', $q$
  insert into public.workshop_drafts (id, name, category_id, variants, surface, status)
  values ('wktest-k-variants', 'Paper', 'floor', '[{"variation": "oak", "is_default": true}]'::jsonb,
          '{"scale_x": 1, "scale_y": 1}'::jsonb, 'draft')
$q$);

-- ---------------------------------------------------------------------------------------------
-- A lit item: the cross-table invariant 012 could not reach, caught here in one row.
-- ---------------------------------------------------------------------------------------------
-- The payload shape is 014's, documented at its line 154 and read key-by-key by publish: FLAT bulb_x/bulb_y/bulb_z, not a nested bulb object, and a spot additionally needs aim_pitch_deg/aim_yaw_deg or item_lights_aim_matches_type refuses it. Nothing constrains the payload's interior, so a wrong shape here would pass this test and fail only at publish — which makes this fixture the portal's reference for what a light payload looks like, and worth getting exactly right.
insert into public.workshop_drafts (id, name, category_id, size_x, size_y, size_z, variants, light, status)
values ('wktest-k-lamp', 'Lamp', 'lit', 0.2, 1.4, 0.2, '[{"variation": null, "is_default": true}]',
        '{"type": "spot", "lumens": 22000, "kelvin": 2700, "reach_m": 3.2, "cone_deg": 70,
          "bulb_x": 0, "bulb_y": 1.1, "bulb_z": 0, "aim_pitch_deg": 30, "aim_yaw_deg": 0}'::jsonb,
        'draft');

select pg_temp.refuses('a lit item with no light payload', $q$
  insert into public.workshop_drafts (id, name, category_id, size_x, size_y, size_z, variants, status)
  values ('wktest-k-dark', 'Dark lamp', 'lit', 0.2, 1.4, 0.2, '[]'::jsonb, 'draft')
$q$);

-- A non-lit item must NOT be forced to carry one, or every chair would need a bulb.
insert into public.workshop_drafts (id, name, category_id, size_x, size_y, size_z, variants, status)
values ('wktest-k-table', 'Table', 'deco', 1.2, 0.7, 0.6, '[]'::jsonb, 'draft');

rollback;

-- After the rollback on purpose: any assertion above raises, which abandons the whole batch, so this line runs only if every one of them held. The leftover counts prove the rollback actually cleaned up and must both be 0.
select 'ALL ASSERTIONS PASSED' as result,
       (select count(*) from public.workshop_drafts where id like 'wktest-%') as leftover_draft_rows,
       (select count(*) from public.item_buy        where id like 'wktest-%') as leftover_catalog_rows;
