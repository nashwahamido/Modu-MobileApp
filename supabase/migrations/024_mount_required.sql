-- mount becomes REQUIRED. Migration 021 made it nullable so an item could be "tops only" — placeable
-- nowhere but on another item's surface, a book that never sits on the floor — with
-- `mount is not null or on_top` guaranteeing every row was reachable one way or the other.
--
-- That capability is being withdrawn, on the evidence of its only use. Across the whole published
-- catalogue mount has never once been null (19 floor, 6 wall); the first row ever authored with it was a
-- desk-lamp workshop draft, and it immediately exposed that the room had no way to place such a thing:
-- startPlacing chose a surface with a two-way floor/wall branch, so an item allowed on neither fell through
-- to a WALL, snapped to the wall grid on a vertical plane, and could never be confirmed there because
-- canPlace rejects a surface the def does not allow. The fix for that was a third branch that had to search
-- the room for a host and refuse when it found none — a whole placement path, an unplaceable-item failure
-- mode, and a "nothing in your room can hold this" message, all to express something no item needed.
--
-- A tops-only item is not a thing this game has to model. A lamp that stands on a desk can also stand on
-- the floor; so can a book. `on_top` stays exactly as it is — the orthogonal "may ALSO stand on a host's
-- top" flag that astid-table-lamp and laptop already carry alongside mount 'floor'. What goes away is only
-- the option to have no mount at all, which turns the surface choice back into the complete two-way
-- question the room already knows how to answer.
--
-- Nothing in item_build/item_buy changes value: there are no nulls to backfill. workshop_drafts may hold
-- one (the desk-lamp draft this was found through), so that table is backfilled to 'floor' — the same
-- default the portal preselects for every non-window category.

begin;

-- Drafts are the only place a null can exist, and 'floor' is what the portal would have chosen anyway.
-- Applied to EVERY null, surface drafts included: publish_workshop_draft copies mount straight into
-- item_buy, whose column is about to become NOT NULL, so a draft allowed to hold a null would save happily
-- and then fail at publish — the write-only trap this feature has already hit once. mount is vestigial for
-- a surface item (nothing reads it; isSurfaceCategory routes those entirely separately) and every surface
-- row already in item_buy carries 'floor' regardless of whether it is a floor or a wall covering, so this
-- matches the data that is already there rather than inventing a new convention for it.
update public.workshop_drafts set mount = 'floor' where mount is null;

alter table public.item_build alter column mount set not null;
alter table public.item_buy alter column mount set not null;

-- A check rather than NOT NULL on the column, only so the failure names itself: a draft that reaches publish
-- without a mount fails item_buy's own NOT NULL with a bare Postgres message, whereas this refuses it at
-- SAVE time, where the operator is standing. Unconditional, for the reason the backfill above is.
alter table public.workshop_drafts drop constraint if exists workshop_drafts_mount_placeable;
alter table public.workshop_drafts
  add constraint workshop_drafts_mount_required
  check (mount is not null);

-- `mount is not null or on_top` is now redundant on the item tables: the column itself says it.
alter table public.item_build drop constraint if exists item_build_mount_placeable;
alter table public.item_buy drop constraint if exists item_buy_mount_placeable;

commit;

-- Expect nulls_left = 0 everywhere, both not_null flags true, and old_constraints = 0. A nonzero
-- draft_nulls means a draft escaped the backfill above and the new check would have refused it.
select
  (select count(*) from public.item_build where mount is null)                                    as build_nulls,
  (select count(*) from public.item_buy where mount is null)                                      as buy_nulls,
  (select count(*) from public.workshop_drafts where mount is null)                               as draft_nulls,
  (select bool_and(attnotnull) from pg_attribute
    where attrelid in ('public.item_build'::regclass, 'public.item_buy'::regclass)
      and attname = 'mount')                                                                      as mount_not_null,
  (select count(*) from pg_constraint
    where conname in ('item_build_mount_placeable', 'item_buy_mount_placeable',
                      'workshop_drafts_mount_placeable'))                                         as old_constraints,
  (select count(*) from pg_constraint where conname = 'workshop_drafts_mount_required')           as new_constraint;
