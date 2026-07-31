import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FURNITURE_WORLD_SCALE,
  ROOM_ITEM_DEFS,
  fitScale,
  getRoomItem,
  getRoomItemVariantUrl,
  roomItemSource,
} from "./placeableItems";
import { ROOM_SHELL } from "./roomShell";

const CELL = ROOM_SHELL.cellSize;

test("every item renders at the one world scale — no per-item drift", () => {
  // The whole point of the factor: pieces keep their true proportions relative to EACH OTHER.
  // If this fails, someone hand-shrank a footprint below the piece's scaled size.
  for (const [itemId] of ROOM_ITEM_DEFS) {
    const item = getRoomItem(itemId)!;
    assert.equal(
      fitScale(item),
      FURNITURE_WORLD_SCALE,
      `${itemId} is squeezed below the world scale by its footprint`,
    );
  }
});

test("footprints are the ceil of the scaled size — claimed cells always contain the piece", () => {
  for (const [itemId, def] of ROOM_ITEM_DEFS) {
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

test("unknown items resolve to null, never to a default model", () => {
  assert.equal(getRoomItem("tutorial"), null);
  assert.equal(getRoomItem(null), null);
});

test("asset subtree follows acquisition — bundled ids are built, everything else is bought", () => {
  // The bundle IS the built set: every buildable furniture ships a model, store-only items never do.
  for (const [itemId] of ROOM_ITEM_DEFS) {
    assert.equal(roomItemSource(itemId), "built", `${itemId} is buildable, so its assets are in room/built/`);
  }
  assert.equal(roomItemSource("malm-chest"), "bought");
});

test("a variant URL needs BOTH a colour and a known item — otherwise the bundled model is used", () => {
  // Null is the caller's signal to fall back (variantModel.ts). No colour axis, or an id the room cannot
  // place, must never produce a path that would 404 at load time.
  assert.equal(getRoomItemVariantUrl("eket-cabinet", null), null);
  assert.equal(getRoomItemVariantUrl("eket-cabinet", undefined), null);
  assert.equal(getRoomItemVariantUrl("not-an-item", "black"), null);
});
