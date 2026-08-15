import assert from "node:assert/strict";
import test from "node:test";

import { toPlaceableRoomRow, workshopDraftToPlaceableRoomRow, workshopModelDraftsToPlaceableRoomRows, type PlaceableRoomRowInput, type WorkshopDraftRow } from "./repos";

// A full, valid row — every test below overrides only the field(s) it cares about, so a mapper that
// silently drops a field shows up as a specific, narrow assertion failure rather than a crash.
const baseRow: PlaceableRoomRowInput = {
  id: "lack-table",
  source: "built",
  category_id: "fur",
  size_x: 0.55,
  size_y: 0.45,
  size_z: 0.55,
  base_offset_y: 0,
  light_type: null,
  light_lumens: null,
  light_kelvin: null,
  light_reach_m: null,
  light_cone_deg: null,
  light_bulb_x: null,
  light_bulb_y: null,
  light_bulb_z: null,
  light_aim_pitch_deg: null,
  light_aim_yaw_deg: null,
  footprint_mask: null,
  top_surface: null,
  mount: "floor",
  on_top: false,
  opens_wall: false,
};

// The regression this file exists for. toShopItem (shop/items.ts) once silently dropped `granted` for
// the whole life of migration 018 because the column was selected and the type declared the field, yet
// nothing in the mapper carried it through by hand — and the in-memory adapter implemented it correctly,
// so the whole test suite stayed green while the Supabase path was broken. mount/onTop/opensWall are the
// same shape of risk: every one of them is optional on PlaceableRoomRow, so a hand-written object literal
// can drop any of them with no type error. A bug that only exists on one side of an adapter boundary
// needs a test on that side.
test("toPlaceableRoomRow carries mount, onTop and opensWall through", () => {
  const row = toPlaceableRoomRow({ ...baseRow, id: "window-sash", category_id: "win", mount: "wall", on_top: false, opens_wall: true });
  assert.equal(row.mount, "wall");
  assert.equal(row.onTop, false);
  assert.equal(row.opensWall, true);
});

// This test used to assert the OPPOSITE — that a null mount survived as null, because a "tops only" item
// was a real thing under migration 021. Migration 024 withdrew that: mount is NOT NULL, so a null can now
// only mean the row came from a database that has not caught up, exactly like an absent column, and both
// take the same pre-021 category fallback. onTop is unaffected — it still ADDS the furniture surface.
test("toPlaceableRoomRow falls back to floor for a null mount, since null now means 'not migrated'", () => {
  const row = toPlaceableRoomRow({ ...baseRow, mount: null, on_top: true });
  assert.equal(row.mount, "floor");
  assert.equal(row.onTop, true, "on_top rides alongside the mount and is untouched by the fallback");
});

test("toPlaceableRoomRow reads absent on_top/opens_wall as false, not undefined", () => {
  const row = toPlaceableRoomRow({ ...baseRow, on_top: null, opens_wall: null });
  assert.equal(row.onTop, false);
  assert.equal(row.opensWall, false);
});

test("toPlaceableRoomRow maps the plain columns (id, source, category, size, baseOffsetY)", () => {
  const row = toPlaceableRoomRow(baseRow);
  assert.equal(row.id, "lack-table");
  assert.equal(row.source, "built");
  assert.equal(row.category, "fur");
  assert.deepEqual(row.size, { x: 0.55, y: 0.45, z: 0.55 });
  assert.equal(row.baseOffsetY, 0);
});

test("toPlaceableRoomRow leaves light undefined for a non-lamp row, and maps a lamp's light through", () => {
  assert.equal(toPlaceableRoomRow(baseRow).light, undefined);
  const lamp = toPlaceableRoomRow({
    ...baseRow,
    id: "astid-table-lamp",
    category_id: "lit",
    mount: "floor",
    on_top: true,
    light_type: "point",
    light_lumens: 22000,
    light_kelvin: 2700,
    light_reach_m: 3.2,
    light_bulb_y: 0.44,
  });
  assert.deepEqual(lamp.light, {
    type: "point",
    lumens: 22000,
    kelvin: 2700,
    reachMetres: 3.2,
    coneDeg: undefined,
    bulb: { x: 0, y: 0.44, z: 0 },
    aim: undefined,
  });
  // The obvious on_top seed from migration 021: an ASTRID table lamp stands on a desk, not just the floor.
  assert.equal(lamp.onTop, true);
});

test("toPlaceableRoomRow omits footprintMask/topSurface when absent, includes them when set", () => {
  const plain = toPlaceableRoomRow(baseRow);
  assert.equal(plain.footprintMask, undefined);
  assert.equal(plain.topSurface, undefined);
  const withBoth = toPlaceableRoomRow({ ...baseRow, footprint_mask: "XX/X.", top_surface: true });
  assert.equal(withBoth.footprintMask, "XX/X.");
  assert.equal(withBoth.topSurface, true);
});

// listPlaceables selects `*` so that a column the live schema has not gained yet is simply absent instead of failing the whole fetch with a Postgrest 42703 — this query IS the room's catalogue, so a 42703 empties the room entirely. These tests pin the half of that bargain the mapper owes: absent must degrade to the pre-021 behaviour, not to "placeable nowhere", which would be exactly as broken as the error the `*` avoids.
const withoutCapabilityColumns = (over: Partial<PlaceableRoomRowInput> = {}): PlaceableRoomRowInput => {
  const row = { ...baseRow, ...over };
  delete row.mount;
  delete row.on_top;
  delete row.opens_wall;
  return row;
};

test("a pre-021 row (columns absent) falls back to the category rule rather than to unplaceable", () => {
  const floorish = toPlaceableRoomRow(withoutCapabilityColumns({ category_id: "fur" }));
  assert.equal(floorish.mount, "floor", "an absent mount must not read as null, or the item can be placed nowhere");
  assert.equal(floorish.opensWall, false);
  assert.equal(floorish.onTop, false);

  const window = toPlaceableRoomRow(withoutCapabilityColumns({ category_id: "win" }));
  assert.equal(window.mount, "wall");
  assert.equal(window.opensWall, true, "a window must still cut its hole against a database without 021");
});

// The window half of that same fallback, which migration 024 did NOT change: an unmigrated row still infers
// its mount from the category, and 'win' is the one category that infers 'wall' rather than 'floor'. This is
// what keeps a pre-021 database from putting every window on the floor.
test("an unmigrated window row still infers a wall mount, not floor", () => {
  const win = toPlaceableRoomRow({ ...baseRow, category_id: "win", mount: null });
  assert.equal(win.mount, "wall");
  assert.equal(toPlaceableRoomRow({ ...baseRow, category_id: "deco", mount: null }).mount, "floor");
});

// --- the dev-only workshop_drafts merge into the room's placeable catalogue --------------------

const baseDraft: WorkshopDraftRow = {
  id: "prototype-shelf",
  category_id: "fur",
  size_x: 0.42,
  size_y: 0.6,
  size_z: 0.3,
  base_offset_y: 0.02,
  footprint_mask: null,
  top_surface: null,
  mount: "floor",
  on_top: false,
  opens_wall: false,
  light: null,
};

test("workshopDraftToPlaceableRoomRow maps a model draft to a workshop-source row with its measured size", () => {
  const row = workshopDraftToPlaceableRoomRow(baseDraft);
  assert.equal(row.id, "prototype-shelf");
  assert.equal(row.source, "workshop");
  assert.equal(row.category, "fur");
  assert.deepEqual(row.size, { x: 0.42, y: 0.6, z: 0.3 });
  assert.equal(row.baseOffsetY, 0.02);
  assert.equal(row.mount, "floor");
});

test("workshopDraftToPlaceableRoomRow flattens the draft's single `light` jsonb object into a lamp's light, same as a live lit row", () => {
  const lamp = workshopDraftToPlaceableRoomRow({
    ...baseDraft,
    id: "prototype-lamp",
    category_id: "lit",
    on_top: true,
    light: { type: "point", lumens: 18000, kelvin: 2700, reach_m: 3.5, bulb_y: 0.5 },
  });
  assert.deepEqual(lamp.light, {
    type: "point",
    lumens: 18000,
    kelvin: 2700,
    reachMetres: 3.5,
    coneDeg: undefined,
    bulb: { x: 0, y: 0.5, z: 0 },
    aim: undefined,
  });
});

// The regression this pins: a surface draft (floor/wall) has NO room model at all — it tiles the shell, not the placement grid — and workshop_drafts_kind_shape (019_workshop_kinds.sql) guarantees its size columns are null. Placing it here would try to derive a footprint from a null size.
test("workshopModelDraftsToPlaceableRoomRows excludes a surface draft (null size) from the room's placeable catalogue", () => {
  const surfaceDraft: WorkshopDraftRow = { ...baseDraft, id: "prototype-wallpaper", category_id: "wall", size_x: null, size_y: null, size_z: null, mount: "wall" };
  const rows = workshopModelDraftsToPlaceableRoomRows([baseDraft, surfaceDraft]);
  assert.deepEqual(rows.map((r) => r.id), ["prototype-shelf"]);
});

// --- contact_size_x/z (migration 023) --------------------------------------------------------------------
//
// Same class of risk as `granted` and mount/onTop/opensWall before it: two optional columns a hand-written
// object literal can drop with no type error, on the one side of the adapter boundary the in-memory adapter
// does not exercise. A dropped pair is invisible — every item simply keeps claiming its full top footprint,
// which is exactly what it did before the column existed.

test("toPlaceableRoomRow carries a contact size through as a pair", () => {
  const row = toPlaceableRoomRow({ ...baseRow, id: "laptop", contact_size_x: 0.236, contact_size_z: 0.356 });
  assert.deepEqual(row.contactSize, { x: 0.236, z: 0.356 });
});

test("toPlaceableRoomRow leaves contactSize absent when the columns are null — the common case", () => {
  const row = toPlaceableRoomRow({ ...baseRow, contact_size_x: null, contact_size_z: null });
  assert.equal(row.contactSize, undefined);
});

// Pre-023 the columns do not exist at all, and listPlaceables selects `*` so they arrive absent rather than
// failing the fetch. Absent must read the same as null: fall back to `size`, exactly as the app always did.
test("toPlaceableRoomRow treats absent contact columns as no contact size, not as zero", () => {
  assert.equal(toPlaceableRoomRow({ ...baseRow }).contactSize, undefined);
});

// A half-set pair means a hand-edited row (the DB's contact_pair constraint forbids it). Taking the one
// present axis and defaulting the other would produce a zero-width footprint — an item occupying nothing.
test("toPlaceableRoomRow rejects a half-set contact pair rather than inventing the missing axis", () => {
  assert.equal(toPlaceableRoomRow({ ...baseRow, contact_size_x: 0.236 }).contactSize, undefined);
  assert.equal(toPlaceableRoomRow({ ...baseRow, contact_size_z: 0.356 }).contactSize, undefined);
});
