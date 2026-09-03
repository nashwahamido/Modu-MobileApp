import assert from "node:assert/strict";
import test from "node:test";

import { isSurfaceCategory, toShopItem, workshopDraftsToShopItems, type WorkshopDraftShopRow } from "./items";

test("floor and wall are surface categories", () => {
  assert.equal(isSurfaceCategory("floor"), true);
  assert.equal(isSurfaceCategory("wall"), true);
});

test("model categories are not", () => {
  for (const c of ["fur", "deco", "win", "lit"] as const) assert.equal(isSurfaceCategory(c), false);
});

// the regression this file exists for: listOwned reads `granted` off toShopItem, so dropping it un-owns granted items
// nothing failed loudly — the column WAS selected, the type DID declare it, and the fixture got it right
test("toShopItem carries `granted` through, so listOwned can union granted items into ownership", () => {
  const row = { id: "cream-plaster", name: "Cream Plaster", category_id: "wall", price: 0, min_level: 1, granted: true };
  assert.equal(toShopItem(row).granted, true);
});

test("toShopItem reads an absent `granted` as false rather than undefined", () => {
  const row = { id: "plaster-brick", name: "Plaster Brick", category_id: "wall", price: 50, min_level: 1 };
  assert.equal(toShopItem(row).granted, false);
});

test("toShopItem maps the plain columns and leaves surface undefined for a non-surface category", () => {
  const item = toShopItem({ id: "lack-table", name: "Lack Table", category_id: "fur", price: 30, min_level: 2 });
  assert.equal(item.id, "lack-table");
  assert.equal(item.category, "fur");
  assert.equal(item.price, 30);
  assert.equal(item.minLevel, 2);
  assert.equal(item.surface, undefined);
});

// Postgrest returns a to-one embed as an object, or an array when it cannot prove the relation is to-one
// a schema-cache quirk that must degrade to the authored look, not a silently surface-less catalogue
test("toShopItem accepts an item_surfaces embed in either the object or the array shape", () => {
  const spec = { scale_x: 4, scale_y: 2, offset_x: 0, offset_y: 0, has_normal: true, has_rough: false };
  const asObject = toShopItem({ id: "a", name: "A", category_id: "wall", price: 0, min_level: 1, item_surfaces: spec });
  const asArray = toShopItem({ id: "a", name: "A", category_id: "wall", price: 0, min_level: 1, item_surfaces: [spec] });
  assert.deepEqual(asObject.surface, asArray.surface);
  assert.ok(asObject.surface, "a wall item with an embed must resolve a surface spec");
});

// --------------- the dev-only workshop_drafts merge into the shop catalogue

test("workshopDraftsToShopItems maps a testing surface draft to a ShopItem with its surface spec", () => {
  const draft: WorkshopDraftShopRow = {
    id: "prototype-wallpaper",
    name: "Prototype Wallpaper",
    category_id: "wall",
    price: 40,
    min_level: 1,
    size_x: null,
    surface: { scale_x: 2, scale_y: 2, offset_x: 0, offset_y: 0, has_normal: true, has_rough: false },
  };
  const [item] = workshopDraftsToShopItems([draft]);
  assert.equal(item.id, "prototype-wallpaper");
  assert.equal(item.category, "wall");
  assert.ok(item.surface, "a surface draft with a tiling payload must resolve a surface spec");
  assert.deepEqual(item.surface?.tiling, { scale: [2, 2], offset: [0, 0] });
});

// this previously asserted the OPPOSITE, that a model draft "is placed straight from the room's own catalogue"
// but the Inventory is the room's only picker, it lists what listOwned returns, and listOwned works off ShopItems
// so excluding model drafts left every furniture upload registered and unreachable
test("workshopDraftsToShopItems includes a model draft, so it can be reached from the Inventory", () => {
  const modelDraft: WorkshopDraftShopRow = {
    id: "prototype-shelf",
    name: "Prototype Shelf",
    category_id: "fur",
    price: 0,
    min_level: 1,
    size_x: 0.42,
  };
  const [item] = workshopDraftsToShopItems([modelDraft]);
  assert.equal(item.id, "prototype-shelf");
  assert.equal(item.category, "fur");
  assert.equal(item.source, "workshop");
  // no surface spec on a model draft — one would offer a chair as something to repaint the room with
  assert.equal(item.surface, undefined);
});

// the `granted` bug one field over: a consumer builds a storage URL from this, so omitting it 404s every draft's textures
// the data layer looks perfectly correct while the item renders blank
test("toShopItem tags item_buy rows as bought", () => {
  assert.equal(toShopItem({ id: "malm-chest", name: "MALM", category_id: "fur", price: 50, min_level: 1 }).source, "bought");
});

test("a workshop surface draft is tagged workshop, not bought", () => {
  const [item] = workshopDraftsToShopItems([
    { id: "wip-paper", name: "WIP Paper", category_id: "wall", price: 0, min_level: 1, size_x: null,
      surface: { scale_x: 4, scale_y: 2, offset_x: 0, offset_y: 0, has_normal: false, has_rough: false } },
  ]);
  assert.equal(item.source, "workshop", "a draft's assets live under room/workshop/, and this field is the only thing that says so");
  assert.equal(item.category, "wall");
});
