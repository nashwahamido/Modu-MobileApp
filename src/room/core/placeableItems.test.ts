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
import { ROOM_SHELL, TOP_CELL_SIZE } from "./roomShell";

const CELL = ROOM_SHELL.cellSize;

// The registry is module state; every test starts from the same catalog — the bundled built set plus bought rows shaped like the DB seed: a floor item (malm-chest) and a wall item (a window). mount/opensWall (migration 021) are what route placement now, not category — category rides along only for emitsLight.
beforeEach(() => {
  registerPlaceables([
    { id: "malm-chest", source: "bought", category: "fur", size: { x: 0.804, y: 1.004, z: 0.483 }, baseOffsetY: 0, mount: "floor" },
    { id: "window-sash", source: "bought", category: "win", size: { x: 1.061, y: 1.262, z: 0.218 }, baseOffsetY: 0, mount: "wall", opensWall: true },
  ]);
});

test("every item renders at the one world scale — no per-item drift", () => {
  // The whole point of the factor: pieces keep their true proportions relative to EACH OTHER. With ceil-derived footprints the fitScale guard can never bind, bought rows included — and wall items bypass the guard entirely by design, since their footprint is a hole sized to the NEAREST cell and deliberately allowed to be smaller than the model (see fitScale).
  for (const [itemId] of roomItemDefs()) {
    const item = getRoomItem(itemId)!;
    assert.equal(
      fitScale(item),
      FURNITURE_WORLD_SCALE,
      `${itemId} is squeezed below the world scale by its footprint`,
    );
  }
});

test("floor footprints are the ceil of the scaled size — claimed cells always contain the piece", () => {
  for (const [itemId, def] of roomItemDefs()) {
    if (!def.allowedSurfaces.includes("floor")) continue; // wall items hole-size by a different rule below
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

test("topFootprint is derived from the measured SIZE at TOP_CELL_SIZE, never by scaling the floor footprint", () => {
  // 0.26 m: ceil(0.26 / 0.25) = 2 floor cells (footprint). Scaling that by the ×2 pitch ratio would give 4 top cells (0.5 m) — an over-claim. Deriving straight from size instead gives ceil(0.26 / 0.125) = 3 (0.375 m), the tight answer, and 3 is what this test pins down. This is the exact case the task spec calls out as easy to get wrong.
  registerPlaceables([
    { id: "postcard", source: "bought", category: "fur", size: { x: 0.26, y: 0.02, z: 0.26 }, baseOffsetY: 0, mount: "floor" },
  ]);
  const def = roomItemDefs().get("postcard")!;
  assert.deepEqual(def.footprint, { w: 2, d: 2 });
  assert.deepEqual(def.topFootprint, { w: 3, d: 3 });
  // Scaling the floor footprint would have given 4 — pinned so nobody "simplifies" topFootprint back into footprint × (CELL / TOP_CELL_SIZE).
  assert.notDeepEqual(def.topFootprint, { w: def.footprint.w * (CELL / TOP_CELL_SIZE), d: def.footprint.d * (CELL / TOP_CELL_SIZE) });
});

test("every def carries a topFootprint, window rows included, even though a window's is never read", () => {
  for (const [, def] of roomItemDefs()) {
    assert.ok(def.topFootprint, `${def.itemId} is missing topFootprint`);
    assert.ok(def.topFootprint.w > 0 && def.topFootprint.d > 0, `${def.itemId} has a degenerate topFootprint`);
  }
});

test("a window row routes to the wall, hole-sized to the NEAREST fine cell", () => {
  // Nearest, not ceil: a hole smaller than the glazing shows wall through the glass. The sash is
  // 1.061 x 1.262 — nearest quarter-metre is a 4 x 5 hole (1.0 x 1.25), matching its authoring props.
  const def = roomItemDefs().get("window-sash")!;
  assert.deepEqual(def.allowedSurfaces, ["wall"]);
  assert.deepEqual(def.footprint, { w: 4, d: 1 });
  assert.equal(def.wallHeightCells, 5);
});

test("the baked-in built rows survive any catalog the DB sends", () => {
  // A row list that lost an item must never strand an already-placed piece unplaceable for want of its dimensions.
  registerPlaceables([]);
  for (const id of ["dalfred-stool", "lack-table", "eket-cabinet", "bekvam-stool"]) {
    assert.ok(getRoomItem(id), `${id} fell out of the registry`);
  }
  assert.equal(getRoomItem("malm-chest"), null);
});

test("a registered bought item is placeable, with its footprint derived from the measured size", () => {
  const item = getRoomItem("malm-chest")!;
  // At world scale 1: 0.804 / 0.25 = 3.22 → 4 cells; 0.483 / 0.25 = 1.93 → 2 cells.
  assert.deepEqual(item.def.footprint, { w: 4, d: 2 });
  assert.equal(item.source, "bought");
  assert.ok(roomItemDefs().has("malm-chest"));
});

test("unknown items resolve to null, never to a default model", () => {
  assert.equal(getRoomItem("tutorial"), null);
  assert.equal(getRoomItem(null), null);
});

test("asset subtree follows acquisition — the catalog row decides, the built id list answers for the rest", () => {
  for (const id of ["dalfred-stool", "lack-table", "eket-cabinet", "bekvam-stool"]) {
    assert.equal(roomItemSource(id), "built", `${id} is buildable, so its assets are in room/built/`);
  }
  assert.equal(roomItemSource("malm-chest"), "bought");
  // An id the catalog has never seen is not in the built list, so it resolves to the bought subtree.
  assert.equal(roomItemSource("some-future-item"), "bought");
});

test("a built item resolves to storage exactly like a bought one — there is no bundled room model to fall back to", () => {
  // This USED to return null for a colourless built item, on the rule "no colour picked means load the bundle". The bundle table is empty and staying that way, so the null was not a fallback signal any more, it was the piece rendering nothing at all: startPlacing from the Inventory passes no variation, and defaultVariationOf returns null for anything the variants store has not loaded yet. Built and bought now take the same path, and the item's real default colour is resolved upstream in placement.ts, not here.
  assert.equal(getRoomItemStoragePath("eket-cabinet", null), "room/built/eket-cabinet/default.glb");
  assert.equal(getRoomItemStoragePath("eket-cabinet", undefined), "room/built/eket-cabinet/default.glb");
  assert.equal(getRoomItemStoragePath("eket-cabinet", "black"), "room/built/eket-cabinet/black.glb");
  // An id the room cannot place is the ONLY null left: there is no subtree to build a path in, and a guessed one would 404 at load time.
  assert.equal(getRoomItemStoragePath("not-an-item", "black"), null);
});

test("a top_surface row exposes its top; unflagged and window rows do not", () => {
  registerPlaceables([
    { id: "side-table", source: "bought", category: "fur", size: { x: 0.5, y: 0.5, z: 0.5 }, baseOffsetY: 0, mount: "floor", topSurface: true },
    { id: "plain-chest", source: "bought", category: "fur", size: { x: 0.5, y: 0.5, z: 0.5 }, baseOffsetY: 0, mount: "floor" },
    { id: "flagged-window", source: "bought", category: "win", size: { x: 1.0, y: 1.25, z: 0.2 }, baseOffsetY: 0, mount: "wall", opensWall: true, topSurface: true },
  ]);
  assert.equal(roomItemDefs().get("side-table")?.hostsTop, true);
  assert.equal(roomItemDefs().get("plain-chest")?.hostsTop, undefined);
  assert.equal(roomItemDefs().get("flagged-window")?.hostsTop, undefined);
});

test("onTop puts \"furniture\" in allowedSurfaces, independently of mount — a lamp stands on a host's top whether it also stands on the floor or hangs on the wall", () => {
  registerPlaceables([
    { id: "astid-table-lamp", source: "bought", category: "lit", size: { x: 0.2222, y: 0.5405, z: 0.3322 }, baseOffsetY: 0, mount: "floor", onTop: true },
    { id: "sconce", source: "bought", category: "deco", size: { x: 0.2, y: 0.3, z: 0.1 }, baseOffsetY: 0, mount: "wall", onTop: true },
    { id: "unflagged-lamp", source: "bought", category: "lit", size: { x: 0.2, y: 0.5, z: 0.3 }, baseOffsetY: 0, mount: "floor" },
  ]);
  assert.deepEqual(roomItemDefs().get("astid-table-lamp")?.allowedSurfaces, ["floor", "furniture"]);
  assert.deepEqual(roomItemDefs().get("sconce")?.allowedSurfaces, ["wall", "furniture"]);
  assert.deepEqual(roomItemDefs().get("unflagged-lamp")?.allowedSurfaces, ["floor"]);
});

test("a non-opening wall item still derives its footprint by the wall's nearest-cell rule, not the floor's ceil — wallCells now applies to any mount 'wall' row, not only windows", () => {
  registerPlaceables([
    // A frame: hangs on the wall (mount 'wall') but does not cut a hole (opensWall absent). 1.061 x 1.262, same measurements as window-sash, so the expected 4x5 footprint pins the SAME rounding rule applying to a non-window row.
    { id: "wall-frame", source: "bought", category: "deco", size: { x: 1.061, y: 1.262, z: 0.05 }, baseOffsetY: 0, mount: "wall" },
  ]);
  const def = roomItemDefs().get("wall-frame")!;
  assert.deepEqual(def.allowedSurfaces, ["wall"]);
  assert.deepEqual(def.footprint, { w: 4, d: 1 });
  assert.equal(def.wallHeightCells, 5);
  assert.equal(def.opensWall, false);
});

// onTop ADDS a surface to the item's mount, never replaces it — the rule migration 024 restored by making
// mount required. This test previously asserted the opposite: that a mount:null row was "placeable nowhere
// but a host's top". That combination was expressible under 021 and used by exactly one row ever, a
// desk-lamp draft, which is how it came out that the room could not place such a thing at all — startPlacing
// chose a surface with a two-way floor/wall branch, so an item allowed on neither fell through onto a wall
// it could never be confirmed on. Withdrawing the capability was cheaper than a third placement path.
test("onTop adds the furniture surface alongside the item's own mount, rather than replacing it", () => {
  registerPlaceables([
    { id: "book", source: "bought", category: "deco", size: { x: 0.15, y: 0.03, z: 0.2 }, baseOffsetY: 0, mount: "floor", onTop: true },
  ]);
  assert.deepEqual(roomItemDefs().get("book")?.allowedSurfaces, ["floor", "furniture"]);
});

// The plain case, for the contrast: no onTop means no furniture surface, and the mount stands alone.
test("without onTop an item is placeable only on its own mount", () => {
  registerPlaceables([
    { id: "rug", source: "bought", category: "deco", size: { x: 1.2, y: 0.02, z: 0.8 }, baseOffsetY: 0, mount: "floor" },
  ]);
  assert.deepEqual(roomItemDefs().get("rug")?.allowedSurfaces, ["floor"]);
});

test("bought items always resolve to storage — the 'default' segment when no colour is picked", () => {
  // A bought item has no bundled fallback, so even without a colour axis it must load from storage.
  assert.equal(getRoomItemStoragePath("malm-chest", null), "room/bought/malm-chest/default.glb");
  assert.equal(getRoomItemStoragePath("malm-chest", "white"), "room/bought/malm-chest/white.glb");
});

test("a row's footprint mask reaches the def when it matches the derived footprint", () => {
  registerPlaceables([
    { id: "l-couch", source: "bought", category: "fur", size: { x: CELL * 2, y: 0.5, z: CELL * 2 }, baseOffsetY: 0, mount: "floor", footprintMask: "XX/X." },
  ]);
  assert.deepEqual(roomItemDefs().get("l-couch")?.mask, ["XX", "X."]);
});

test("a mask that disagrees with the footprint is dropped for the solid rect, not trusted", () => {
  registerPlaceables([
    // 2x2 footprint but a 3-wide mask: a seeding mistake — collision must fall back to the rect.
    { id: "bad-mask", source: "bought", category: "fur", size: { x: CELL * 2, y: 0.5, z: CELL * 2 }, baseOffsetY: 0, mount: "floor", footprintMask: "XXX/X.." },
    // An empty border column lies about the bbox: also dropped.
    { id: "hollow-border", source: "bought", category: "fur", size: { x: CELL * 2, y: 0.5, z: CELL * 2 }, baseOffsetY: 0, mount: "floor", footprintMask: ".X/.X" },
  ]);
  assert.equal(roomItemDefs().get("bad-mask")?.mask, undefined);
  assert.equal(roomItemDefs().get("hollow-border")?.mask, undefined);
});

test("window rows never carry a mask — their footprint is already the exact hole", () => {
  registerPlaceables([
    { id: "masked-window", source: "bought", category: "win", size: { x: 1.0, y: 1.25, z: 0.2 }, baseOffsetY: 0, mount: "wall", opensWall: true, footprintMask: "XXXX" },
  ]);
  assert.equal(roomItemDefs().get("masked-window")?.mask, undefined);
});
