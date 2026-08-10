import assert from "node:assert/strict";
import test from "node:test";

import { isSurfaceCategory, toShopItem } from "./items";

test("floor and wall are surface categories", () => {
  assert.equal(isSurfaceCategory("floor"), true);
  assert.equal(isSurfaceCategory("wall"), true);
});

test("model categories are not", () => {
  for (const c of ["fur", "deco", "win", "lit"] as const) assert.equal(isSurfaceCategory(c), false);
});

// The regression this file exists for. listOwned unions granted items into ownership by reading `granted` off the objects toShopItem produces, so a mapper that drops the field leaves every granted item un-owned, invisible in the inventory and impossible to apply — and nothing fails loudly, because the column is selected and the type declares the field. The in-memory adapter implements granted correctly, which is exactly why the whole suite stayed green while the Supabase path was broken.
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

// Postgrest returns a to-one embed as an object, but as an ARRAY when it cannot prove the relation is to-one — a schema-cache quirk that must degrade to the authored look rather than to a silently surface-less catalogue.
test("toShopItem accepts an item_surfaces embed in either the object or the array shape", () => {
  const spec = { scale_x: 4, scale_y: 2, offset_x: 0, offset_y: 0, has_normal: true, has_rough: false };
  const asObject = toShopItem({ id: "a", name: "A", category_id: "wall", price: 0, min_level: 1, item_surfaces: spec });
  const asArray = toShopItem({ id: "a", name: "A", category_id: "wall", price: 0, min_level: 1, item_surfaces: [spec] });
  assert.deepEqual(asObject.surface, asArray.surface);
  assert.ok(asObject.surface, "a wall item with an embed must resolve a surface spec");
});
