-- Verifies publish_workshop_draft end-to-end against a real project's schema: the happy path (single-variant and multi-variant), then every named precondition failure (not in testing, missing default variant, nonexistent draft, id collision with the live catalog, and a non-editor caller), a check that the touch_workshop_draft trigger actually bumped updated_at on publish, that a failure partway through the insert (a variant unique-constraint collision, after item_buy has already been written) leaves no partial item_buy row behind, and — switched to the actual authenticated role rather than the bypassing table owner — that RLS lets any authenticated user read workshop_drafts but blocks a non-editor's write. None of that is checked until this file actually runs a plpgsql function body for the first time, so a clean run here is the only real evidence the RPC works.
-- Everything this script creates is undone: the whole thing runs inside BEGIN/ROLLBACK, so nothing survives even on a fully clean pass, and it is safe to run repeatedly against a live project with real data in it — it never assumes the database is empty. It DOES assume at least one row exists in auth.users (any real signed-up account works): the RPC checks auth.uid(), so this script impersonates that user for the duration of the transaction via set_config('request.jwt.claims', ..., true) — the `true` makes the setting transaction-local, so it reverts automatically at ROLLBACK along with everything else. Every row this script inserts uses an id prefixed wktest- to make an accidental collision with real catalog data unlikely.
-- Run with psql:  psql "<connection string from the dashboard's green Connect button, Session pooler>" -f supabase/tests/publish_workshop_draft.sql
-- Run in the Supabase dashboard SQL editor: paste everything EXCEPT the \set line below, which is a psql client meta-command the editor does not understand. Nothing else needs changing — the pass marker at the bottom is a SELECT returning a row precisely so the dashboard cannot hide it the way it hides NOTICE and WARNING messages.
-- A clean run ends with a row reading ALL ASSERTIONS PASSED immediately before the ROLLBACK. Under psql, \set ON_ERROR_STOP on stops at the first real assertion failure instead of cascading into a wall of "current transaction is aborted" noise; the dashboard reports the first error and abandons the batch on its own. Either way: no ALL ASSERTIONS PASSED row means the first ERROR above it is the real one.
\set ON_ERROR_STOP on
begin;

-- Borrow a real auth user for the duration of this transaction and make it a workshop editor, since publish_workshop_draft is security definer but still gates on auth.uid() via is_workshop_editor(). Both the impersonation and the editor grant are undone by the closing ROLLBACK.
do $$
declare
  v_uid uuid;
begin
  select id into v_uid from auth.users order by created_at limit 1;
  if v_uid is null then
    raise exception 'publish_workshop_draft test: no auth.users row exists in this database — sign up at least one real user in this project before running this test, since the RPC requires a real auth.uid() to impersonate';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  insert into public.workshop_editors (user_id) values (v_uid) on conflict (user_id) do nothing;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Happy path: the row lands in item_buy with the draft's own values, gets exactly one correctly-shaped variant, the draft flips to published, and updated_at moves.
-- ---------------------------------------------------------------------------------------------

-- updated_at is planted old at INSERT time rather than by a later update, because touch_workshop_draft is a BEFORE UPDATE trigger and so does not fire on insert — that makes the plant stick without disabling anything, which matters because ALTER TABLE ... DISABLE TRIGGER needs table ownership and takes an ACCESS EXCLUSIVE lock, neither of which a verification script should be asking of a live project.
insert into public.workshop_drafts (id, name, category_id, price, min_level, size_x, size_y, size_z, base_offset_y, variants, status, updated_at)
values ('wktest-lamp', 'Test Lamp', 'deco', 10, 1, 0.2, 0.4, 0.2, 0, '[{"variation": null, "is_default": true}]', 'testing', timestamptz '2000-01-01');

select public.publish_workshop_draft('wktest-lamp');

do $$
declare
  v_row public.item_buy;
  v_variant public.item_variants;
  v_variant_count integer;
  v_status text;
  v_updated timestamptz;
begin
  select * into v_row from public.item_buy where id = 'wktest-lamp';
  if not found then
    raise exception 'publish_workshop_draft: item_buy row for wktest-lamp is missing after publish';
  end if;
  if v_row.name is distinct from 'Test Lamp' or v_row.category_id is distinct from 'deco' or v_row.price is distinct from 10
     or v_row.min_level is distinct from 1 or v_row.size_x is distinct from 0.2::double precision
     or v_row.size_y is distinct from 0.4::double precision or v_row.size_z is distinct from 0.2::double precision
     or v_row.base_offset_y is distinct from 0::double precision then
    raise exception 'publish_workshop_draft: item_buy row for wktest-lamp does not match the draft it was published from (name=%, category_id=%, price=%, min_level=%, size=%/%/%, base_offset_y=%)',
      v_row.name, v_row.category_id, v_row.price, v_row.min_level, v_row.size_x, v_row.size_y, v_row.size_z, v_row.base_offset_y;
  end if;

  select count(*) into v_variant_count from public.item_variants where item_id = 'wktest-lamp';
  if v_variant_count <> 1 then
    raise exception 'publish_workshop_draft: expected exactly one item_variants row for wktest-lamp, found %', v_variant_count;
  end if;

  select * into v_variant from public.item_variants where item_id = 'wktest-lamp';
  if v_variant.id is distinct from 'wktest-lamp__default' then
    raise exception 'publish_workshop_draft: variant id should follow <item_id>__default for a null-variation draft, got %', v_variant.id;
  end if;
  if v_variant.variation is not null then
    raise exception 'publish_workshop_draft: variant.variation should be null for a null-variation draft, got %', v_variant.variation;
  end if;
  if v_variant.is_default is not true then
    raise exception 'publish_workshop_draft: the sole variant must be is_default = true, got %', v_variant.is_default;
  end if;

  select status, updated_at into v_status, v_updated from public.workshop_drafts where id = 'wktest-lamp';
  if v_status is distinct from 'published' then
    raise exception 'publish_workshop_draft: draft status should be published, got %', v_status;
  end if;
  -- updated_at was planted at 2000-01-01 on insert, so anything after 2001-01-01 can only mean touch_workshop_draft actually fired on the status update inside publish_workshop_draft — comparing against created_at instead (the original assertion) is vacuous, since within one transaction now() is constant and both columns default to the same value.
  if v_updated <= timestamptz '2001-01-01' then
    raise exception 'publish_workshop_draft: touch_workshop_draft trigger did not bump updated_at on publish (updated_at % should be well after the 2000-01-01 value planted before the publish call)', v_updated;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Multi-variant happy path: this is the shape every real furniture item has (see 003_catalog.sql around line 202 for the shipped EKET variants), and the single-variant, null-variation case above leaves the id concatenation's real variation string, the multi-row insert ... select, the unique (item_id, variation) constraint, and the item_variants_one_default partial index completely unexercised. The oak variant omits is_default entirely on purpose, so this case fails without the F2 coalesce fix in 011_workshop.sql.
-- ---------------------------------------------------------------------------------------------

insert into public.workshop_drafts (id, name, category_id, price, min_level, size_x, size_y, size_z, base_offset_y, variants, status)
values ('wktest-multi', 'Test Multi', 'fur', 20, 1, 0.5, 0.5, 0.5, 0, '[{"variation": "white", "is_default": true}, {"variation": "oak"}]', 'testing');

select public.publish_workshop_draft('wktest-multi');

do $$
declare
  v_variant_count integer;
  v_white public.item_variants;
  v_oak public.item_variants;
begin
  select count(*) into v_variant_count from public.item_variants where item_id = 'wktest-multi';
  if v_variant_count <> 2 then
    raise exception 'publish_workshop_draft: expected exactly two item_variants rows for wktest-multi, found %', v_variant_count;
  end if;

  select * into v_white from public.item_variants where id = 'wktest-multi__white';
  if not found then
    raise exception 'publish_workshop_draft: expected an item_variants row with id wktest-multi__white';
  end if;

  select * into v_oak from public.item_variants where id = 'wktest-multi__oak';
  if not found then
    raise exception 'publish_workshop_draft: expected an item_variants row with id wktest-multi__oak — this is exactly the row a missing is_default key would have crashed the insert on (F2), after item_buy had already been written';
  end if;

  if v_white.is_default is not true or v_oak.is_default is not false then
    raise exception 'publish_workshop_draft: exactly one of the two multi-variant rows should be default, got white=% oak=%', v_white.is_default, v_oak.is_default;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Re-publishing must fail rather than duplicate.
-- ---------------------------------------------------------------------------------------------

do $$
begin
  begin
    perform public.publish_workshop_draft('wktest-lamp');
    raise exception 'republishing an already-published draft should have failed';
  exception when others then
    if sqlerrm not like '%not in testing%' then raise exception 'wrong error for a republish attempt: %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------------------------
-- A draft with no default variant must be rejected, because item_variants has a partial unique index expecting exactly one.
-- ---------------------------------------------------------------------------------------------

insert into public.workshop_drafts (id, name, category_id, price, min_level, size_x, size_y, size_z, variants, status)
values ('wktest-nodefault', 'No Default', 'fur', 5, 1, 1, 1, 1, '[{"variation": "oak", "is_default": false}]', 'testing');

do $$
begin
  begin
    perform public.publish_workshop_draft('wktest-nodefault');
    raise exception 'a draft without a default variant should have failed';
  exception when others then
    if sqlerrm not like '%exactly one default%' then raise exception 'wrong error for a missing-default draft: %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------------------------
-- A failure that happens AFTER the item_buy insert — two variant objects that collide on the same variation, which the default_count precheck cannot see since it only counts is_default flags — must not leave a partial item_buy row behind. The whole publish is one statement-level transaction inside the calling do block's implicit savepoint, so a unique-constraint violation partway through the item_variants insert must roll back everything, including the item_buy insert that already succeeded moments before.
-- ---------------------------------------------------------------------------------------------

insert into public.workshop_drafts (id, name, category_id, price, min_level, size_x, size_y, size_z, base_offset_y, variants, status)
values ('wktest-duplicatevariant', 'Test Duplicate Variant', 'fur', 5, 1, 1, 1, 1, 0, '[{"variation": "oak", "is_default": true}, {"variation": "oak", "is_default": false}]', 'testing');

do $$
begin
  begin
    perform public.publish_workshop_draft('wktest-duplicatevariant');
    raise exception 'a draft with two variants sharing the same variation should have failed on a unique constraint';
  exception when unique_violation then
    null; -- expected: the duplicate variation collides on id and/or the unique (item_id, variation) constraint
  end;
end $$;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.item_buy where id = 'wktest-duplicatevariant';
  if v_count <> 0 then
    raise exception 'publish_workshop_draft: a failed publish left a partial item_buy row behind for wktest-duplicatevariant — the item_variants failure did not roll back the preceding item_buy insert';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- A draft id that does not exist at all must be rejected with a specific message naming that id, not a generic "not found" that would also match a broken plpgsql body raising its own unrelated "... does not exist" error.
-- ---------------------------------------------------------------------------------------------

do $$
begin
  begin
    perform public.publish_workshop_draft('wktest-does-not-exist');
    raise exception 'publishing a nonexistent draft id should have failed';
  exception when others then
    if sqlerrm not like '%wktest-does-not-exist does not exist%' then raise exception 'wrong error for a nonexistent draft id: %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------------------------
-- An id that already exists in the live catalog must block the publish, since placeable_items is a union of item_build and item_buy and a collision would make that view ambiguous.
-- ---------------------------------------------------------------------------------------------

insert into public.item_buy (id, name, category_id, price) values ('wktest-collision', 'Pre-existing Catalog Item', 'deco', 1);

insert into public.workshop_drafts (id, name, category_id, price, min_level, size_x, size_y, size_z, base_offset_y, variants, status)
values ('wktest-collision', 'Test Collision', 'deco', 5, 1, 1, 1, 1, 0, '[{"variation": null, "is_default": true}]', 'testing');

do $$
begin
  begin
    perform public.publish_workshop_draft('wktest-collision');
    raise exception 'publishing a draft whose id already exists in item_buy should have failed';
  exception when others then
    if sqlerrm not like '%already exists in the live catalog%' then raise exception 'wrong error for an id collision with the live catalog: %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------------------------
-- RLS: a direct psql connection runs as the table owner and bypasses row level security entirely, so nothing above this point has actually exercised the RLS boundary — set_config alone makes auth.uid() resolve, but it does not change which Postgres role is evaluating the policies. Switching to the authenticated role is what puts workshop_drafts_read and workshop_drafts_write under test: any authenticated user may SELECT, but only a workshop editor may INSERT.
-- ---------------------------------------------------------------------------------------------

set local role authenticated;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.workshop_drafts where id = 'wktest-lamp';
  if v_count <> 1 then
    raise exception 'workshop_drafts RLS: an authenticated user should be able to SELECT workshop_drafts, found % row(s) for wktest-lamp', v_count;
  end if;
end $$;

do $$
begin
  -- impersonate a throwaway uid that was never added to workshop_editors, so is_workshop_editor() evaluates false and workshop_drafts_write's with-check should block the write — this is the first statement in the file that can actually hit that policy, since every prior statement in this script ran as the bypassing table owner.
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  begin
    insert into public.workshop_drafts (id, name, category_id, price, min_level, size_x, size_y, size_z, base_offset_y, variants, status)
    values ('wktest-rls-deny', 'RLS Deny', 'deco', 5, 1, 1, 1, 1, 0, '[{"variation": null, "is_default": true}]', 'draft');
    raise exception 'a non-editor should not be able to INSERT into workshop_drafts under RLS';
  exception when insufficient_privilege then
    null; -- expected: workshop_drafts_write's with-check blocked the insert
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------------------------------
-- A caller who is not a workshop editor must be rejected before any other check runs, even for an otherwise-valid testing draft. This exercises the RPC's own is_workshop_editor() gate, distinct from the table-level RLS policy above.
-- ---------------------------------------------------------------------------------------------

insert into public.workshop_drafts (id, name, category_id, price, min_level, size_x, size_y, size_z, base_offset_y, variants, status)
values ('wktest-noeditor', 'Test No Editor', 'deco', 5, 1, 1, 1, 1, 0, '[{"variation": null, "is_default": true}]', 'testing');

-- impersonate a throwaway uuid rather than deleting the borrowed real user's editor row: is_workshop_editor() returns false for an unknown uid just as well, and this keeps the script from touching any genuine row at all, even one that gets rolled back.
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);

do $$
begin
  begin
    perform public.publish_workshop_draft('wktest-noeditor');
    raise exception 'publishing as a non-editor should have failed';
  exception when others then
    if sqlerrm not like '%not a workshop editor%' then raise exception 'wrong error for a non-editor caller: %', sqlerrm; end if;
  end;
end $$;

rollback;

-- The pass marker sits AFTER the rollback, which looks odd until you see what it buys. It cannot be a RAISE NOTICE, because the dashboard SQL editor does not surface notices. It cannot sit BEFORE the rollback either, because the editor displays only the LAST statement's result and rollback returns none — which is exactly how the first version of this marker managed to be invisible. And it does not need to be inside the transaction to mean anything: any assertion above raises, which abandons the whole batch, so this line executes only if every one of them held. leftover_test_rows independently confirms the rollback actually cleaned up, and must be 0.
select 'ALL ASSERTIONS PASSED' as result,
       (select count(*) from public.workshop_drafts where id like 'wktest-%') as leftover_test_rows,
       (select count(*) from public.item_buy where id like 'wktest-%') as leftover_catalog_rows;
