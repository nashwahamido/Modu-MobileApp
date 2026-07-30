import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  FURNITURE_WORLD_SCALE,
  fitScale,
  getRoomItem,
  getRoomItemStoragePath,
  registerPlaceables,
  roomItemDefs,
  roomItemSource,
} from "./placeableItems";
import { ROOM_SHELL } from "./roomShell";

const CELL = ROOM_SHELL.cellSize;

// The registry is module state; every test starts from the same catalog — the bundled built set
// plus one bought row shaped like the DB seed (malm-chest, measured from its storage GLB).
beforeEach(() => {
  registerPlaceables([
    { id: "malm-chest", source: "bought", size: { x: 0.804, y: 1.004, z: 0.483 }, baseOffsetY: 0 },
  ]);
});

test("every item renders at the one world scale — no per-item drift", () => {
  // The whole point of the factor: pieces keep their true proportions relative to EACH OTHER.
  // With ceil-derived footprints the fitScale guard can never bind, bought rows included.
  for (const [itemId] of roomItemDefs()) {
    const item = getRoomItem(itemId)!;
    assert.equal(
      fitScale(item),
      FURNITURE_WORLD_SCALE,
      `${itemId} is squeezed below the world scale by its footprint`,
    );
  }
});

test("footprints are the ceil of the scaled size — claimed cells always contain the piece", () => {
  for (const [itemId, def] of roomItemDefs()) {
    const item = getRoomItem(itemId)!;
    const scaledX = item.size.x * FURNITURE_WORLD_SCALE;
    const scaledZ = item.size.z * FURNITURE_WORLD_SCALE;
    assert.equal(def.footprint.w, Math.ceil(scaledX / CELL - 1e-9), `${itemId} width cells`);
    assert.equal(def.footprint.d, Math.ceil(scaledZ / CELL - 1e-9), `${itemId} depth cells`);
    // And the rendered piece fits inside them.
    assert.ok(scaledX <= def.footprint.w * CELL + 1e-9);
    assert.ok(scaledZ <= def.footprint.d * CELL + 1e-9);
  }
});

test("the bundled built set survives any catalog the DB sends", () => {
  // A row list that lost an item must never strand an already-placed bundled piece invisible.
  registerPlaceables([]);
  for (const id of ["dalfred-stool", "lack-table", "eket-cabinet", "bekvam-stool"]) {
    assert.ok(getRoomItem(id), `${id} fell out of the registry`);
  }
  assert.equal(getRoomItem("malm-chest"), null);
});

test("a registered bought item is placeable, with its footprint derived from the measured size", () => {
  const item = getRoomItem("malm-chest")!;
  // 0.804 × 1.6 / 0.5 = 2.57 → 3 cells; 0.483 × 1.6 / 0.5 = 1.55 → 2 cells.
  assert.deepEqual(item.def.footprint, { w: 3, d: 2 });
  assert.equal(item.source, "bought");
  assert.ok(roomItemDefs().has("malm-chest"));
});

test("unknown items resolve to null, never to a default model", () => {
  assert.equal(getRoomItem("tutorial"), null);
  assert.equal(getRoomItem(null), null);
});

test("asset subtree follows acquisition — the catalog row decides, the bundle is the fallback rule", () => {
  // Every buildable furniture ships a model, store-only items never do.
  for (const id of ["dalfred-stool", "lack-table", "eket-cabinet", "bekvam-stool"]) {
    assert.equal(roomItemSource(id), "built", `${id} is buildable, so its assets are in room/built/`);
  }
  assert.equal(roomItemSource("malm-chest"), "bought");
  // An id the catalog has never seen still resolves by the bundle rule.
  assert.equal(roomItemSource("some-future-item"), "bought");
});

test("built items need a colour for a storage path — no colour means the bundled model", () => {
  // Null is the caller's signal to fall back (variantModel.ts). An id the room cannot place must
  // never produce a path that would 404 at load time.
  assert.equal(getRoomItemStoragePath("eket-cabinet", null), null);
  assert.equal(getRoomItemStoragePath("eket-cabinet", undefined), null);
  assert.equal(getRoomItemStoragePath("not-an-item", "black"), null);
  assert.equal(getRoomItemStoragePath("eket-cabinet", "black"), "room/built/eket-cabinet/black.glb");
});

test("bought items always resolve to storage — the 'default' segment when no colour is picked", () => {
  // A bought item has no bundled fallback, so even without a colour axis it must load from storage.
  assert.equal(getRoomItemStoragePath("malm-chest", null), "room/bought/malm-chest/default.glb");
  assert.equal(getRoomItemStoragePath("malm-chest", "white"), "room/bought/malm-chest/white.glb");
});
