import assert from "node:assert/strict";
import test from "node:test";

import { defaultVariation } from "../catalog/assets";
import { toBuildRewardAmount, toPlaceableRoomRow, workshopDraftsToItemVariants, workshopDraftToPlaceableRoomRow, workshopModelDraftsToPlaceableRoomRows, type BuildRewardRow, type PlaceableRoomRowInput, type WorkshopDraftRow } from "./repos";

// a full, valid row — tests override only what they care about, so a dropped field is a narrow failure rather than a crash
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

// the regression this file exists for: toShopItem silently dropped `granted` for the whole life of 018
// the fixture implemented it correctly, so the suite stayed green while the Supabase path was broken
// mount/onTop/opensWall are the same risk — all optional, so a hand-written literal can drop any of them with no type error
test("toPlaceableRoomRow carries mount, onTop and opensWall through", () => {
  const row = toPlaceableRoomRow({ ...baseRow, id: "window-sash", category_id: "win", mount: "wall", on_top: false, opens_wall: true });
  assert.equal(row.mount, "wall");
  assert.equal(row.onTop, false);
  assert.equal(row.opensWall, true);
});

// this used to assert the OPPOSITE, a null mount surviving as null, because "tops only" was a real item under 021
// 024 withdrew that: a null now means only an uncaught-up database, so it takes the same category fallback an absent column does
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

test("toPlaceableRoomRow leaves lights undefined for a non-lamp row, and maps a lamp's flat light_* columns into a one-element lights array", () => {
  assert.equal(toPlaceableRoomRow(baseRow).lights, undefined);
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
  assert.deepEqual(lamp.lights, [{
    type: "point",
    lumens: 22000,
    kelvin: 2700,
    reachMetres: 3.2,
    coneDeg: undefined,
    bulb: { x: 0, y: 0.44, z: 0 },
    aim: undefined,
  }]);
  // the obvious on_top seed from 021: an ASTRID table lamp stands on a desk, not just the floor
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

// listPlaceables selects `*`, so a missing column is absent rather than a 42703 that would empty the room entirely
// these pin the mapper's half of that bargain: absent must degrade to pre-021 behaviour, not to "placeable nowhere"
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

// the window half of that fallback, unchanged by 024 — 'win' infers 'wall', so a pre-021 database does not floor every window
test("an unmigrated window row still infers a wall mount, not floor", () => {
  const win = toPlaceableRoomRow({ ...baseRow, category_id: "win", mount: null });
  assert.equal(win.mount, "wall");
  assert.equal(toPlaceableRoomRow({ ...baseRow, category_id: "deco", mount: null }).mount, "floor");
});

// --------------- the dev-only workshop_drafts merge into the room's placeable catalogue

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

test("workshopDraftToPlaceableRoomRow folds a pre-026 draft's single `light` jsonb object into a one-element lights array, same as a live lit row", () => {
  const lamp = workshopDraftToPlaceableRoomRow({
    ...baseDraft,
    id: "prototype-lamp",
    category_id: "lit",
    on_top: true,
    light: { type: "point", lumens: 18000, kelvin: 2700, reach_m: 3.5, bulb_y: 0.5 },
  });
  assert.deepEqual(lamp.lights, [{
    type: "point",
    lumens: 18000,
    kelvin: 2700,
    reachMetres: 3.5,
    coneDeg: undefined,
    bulb: { x: 0, y: 0.5, z: 0 },
    aim: undefined,
  }]);
});

// a surface draft has NO room model — it tiles the shell — and its null size columns would derive a footprint from nothing
test("workshopModelDraftsToPlaceableRoomRows excludes a surface draft (null size) from the room's placeable catalogue", () => {
  const surfaceDraft: WorkshopDraftRow = { ...baseDraft, id: "prototype-wallpaper", category_id: "wall", size_x: null, size_y: null, size_z: null, mount: "wall" };
  const rows = workshopModelDraftsToPlaceableRoomRows([baseDraft, surfaceDraft]);
  assert.deepEqual(rows.map((r) => r.id), ["prototype-shelf"]);
});

// --------------- contact_size_x/z (migration 023)
// the same risk as `granted`: two optional columns a literal can drop with no type error, on the side the fixture does not exercise
// a dropped pair is invisible — every item just keeps claiming its full top footprint, as it did before the column existed

test("toPlaceableRoomRow carries a contact size through as a pair", () => {
  const row = toPlaceableRoomRow({ ...baseRow, id: "laptop", contact_size_x: 0.236, contact_size_z: 0.356 });
  assert.deepEqual(row.contactSize, { x: 0.236, z: 0.356 });
});

test("toPlaceableRoomRow leaves contactSize absent when the columns are null — the common case", () => {
  const row = toPlaceableRoomRow({ ...baseRow, contact_size_x: null, contact_size_z: null });
  assert.equal(row.contactSize, undefined);
});

// pre-023 the columns arrive absent rather than failing the fetch, and absent must read as null does, falling back to `size`
test("toPlaceableRoomRow treats absent contact columns as no contact size, not as zero", () => {
  assert.equal(toPlaceableRoomRow({ ...baseRow }).contactSize, undefined);
});

// a half-set pair means a hand-edited row — taking the one axis present gives a zero-width footprint, an item occupying nothing
test("toPlaceableRoomRow rejects a half-set contact pair rather than inventing the missing axis", () => {
  assert.equal(toPlaceableRoomRow({ ...baseRow, contact_size_x: 0.236 }).contactSize, undefined);
  assert.equal(toPlaceableRoomRow({ ...baseRow, contact_size_z: 0.356 }).contactSize, undefined);
});

// --------------- workshop draft variants
// item_variants is written only by the publish RPC, so a draft has no rows there and the app saw an empty variant list
// an empty list resolves to the 'default' segment, so a draft with NAMED variations 404s on default.glb and default.png, silently

test("workshopDraftsToItemVariants turns a draft's variants array into ItemVariant rows", () => {
  const rows = workshopDraftsToItemVariants([
    {
      ...baseDraft,
      id: "yyyy",
      variants: [
        { variation: "white", is_default: true },
        { variation: "grey", is_default: false },
        { variation: "wooden", is_default: false },
      ],
    },
  ]);
  assert.deepEqual(rows, [
    { itemId: "yyyy", variation: "white", isDefault: true },
    { itemId: "yyyy", variation: "grey", isDefault: false },
    { itemId: "yyyy", variation: "wooden", isDefault: false },
  ]);
});

// the whole point: defaultVariation must resolve to the NAMED default, so paths become white.glb, not the absent default.*
test("the mapped rows resolve to the named default variation, not the 'default' segment", () => {
  const rows = workshopDraftsToItemVariants([
    { ...baseDraft, id: "yyyy", variants: [{ variation: "grey", is_default: false }, { variation: "white", is_default: true }] },
  ]);
  assert.equal(defaultVariation(rows.map((r) => ({ variation: r.variation, isDefault: r.isDefault }))), "white");
});

// a surface draft carries zero variants by constraint, and a pre-column model draft arrives absent under `*` — neither may throw
test("workshopDraftsToItemVariants yields nothing for an empty, absent or null variants field", () => {
  assert.deepEqual(workshopDraftsToItemVariants([{ ...baseDraft, id: "a", variants: [] }]), []);
  assert.deepEqual(workshopDraftsToItemVariants([{ ...baseDraft, id: "b" }]), []);
  assert.deepEqual(workshopDraftsToItemVariants([{ ...baseDraft, id: "c", variants: null }]), []);
});

// an unnamed single variant already worked by accident, null landing on 'default' — it must keep working, not become the string
test("workshopDraftsToItemVariants preserves a null variation rather than stringifying it", () => {
  const rows = workshopDraftsToItemVariants([{ ...baseDraft, id: "d", variants: [{ variation: null, is_default: true }] }]);
  assert.deepEqual(rows, [{ itemId: "d", variation: null, isDefault: true }]);
});

// is_default is absent on an older row and must read as false, or the picker's default-first sort compares a non-boolean
test("workshopDraftsToItemVariants defaults a missing is_default to false", () => {
  const rows = workshopDraftsToItemVariants([{ ...baseDraft, id: "e", variants: [{ variation: "oak" }] }]);
  assert.deepEqual(rows, [{ itemId: "e", variation: "oak", isDefault: false }]);
});

// the reward mapper gets the same treatment for the same reason: `item` is OPTIONAL, so a literal can drop it with no type error
test("toBuildRewardAmount leaves item undefined when the furniture has no reward item — the state every row ships in", () => {
  const reward = toBuildRewardAmount({ coin_reward: 42, xp_reward: 84 });
  assert.deepEqual(reward, { coins: 42, xp: 84 });
  assert.equal(reward.item, undefined);
});

test("toBuildRewardAmount treats an explicitly null embed as no item, not as a half-built one", () => {
  assert.equal(toBuildRewardAmount({ coin_reward: 42, xp_reward: 84, item_buy: null }).item, undefined);
});

// Postgrest returns an embed as an OBJECT or a ONE-ELEMENT ARRAY, and has returned both here before
test("toBuildRewardAmount reads the embedded item in both of Postgrest's shapes", () => {
  const asObject = toBuildRewardAmount({ coin_reward: 42, xp_reward: 84, item_buy: { id: "succulent", name: "Succulent Plant", category_id: "deco" } });
  const asArray = toBuildRewardAmount({ coin_reward: 42, xp_reward: 84, item_buy: [{ id: "succulent", name: "Succulent Plant", category_id: "deco" }] });
  assert.deepEqual(asObject.item, { id: "succulent", name: "Succulent Plant", category: "deco" });
  assert.deepEqual(asArray.item, asObject.item);
});

test("toBuildRewardAmount reads an empty embed array as no item", () => {
  assert.equal(toBuildRewardAmount({ coin_reward: 42, xp_reward: 84, item_buy: [] }).item, undefined);
});

// no catalog row reads as zero, matching reward_build's coalesce — the screen shows "+ 0 coins", not "+ NaN coins"
test("toBuildRewardAmount reads null currency as zero, mirroring reward_build's coalesce", () => {
  assert.deepEqual(toBuildRewardAmount({ coin_reward: null, xp_reward: null }), { coins: 0, xp: 0 });
});
