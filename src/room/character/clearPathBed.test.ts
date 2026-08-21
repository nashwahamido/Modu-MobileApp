import assert from "node:assert/strict";
import test from "node:test";

import type { GridPlacement, PlaceableItemDef } from "../core/grid";
import {
  CLEAR_PATH_BED_INSTANCE_ID,
  CLEAR_PATH_BED_ITEM_ID,
  clearPathBedPlacement,
} from "./clearPathBed";
import { FLOOR_CELLS } from "../core/roomShell";

const bedDef: PlaceableItemDef = {
  itemId: CLEAR_PATH_BED_ITEM_ID,
  footprint: { w: 6, d: 9 },
  topFootprint: { w: 12, d: 18 },
  allowedSurfaces: ["floor"],
};

const blockerDef: PlaceableItemDef = {
  itemId: "blocker",
  footprint: { w: 6, d: 9 },
  topFootprint: { w: 12, d: 18 },
  allowedSurfaces: ["floor"],
};

const defs = new Map([
  [bedDef.itemId, bedDef],
  [blockerDef.itemId, blockerDef],
]);

test("Clear Path's bed chooses an inset corner and remains non-persisted by identity", () => {
  const bed = clearPathBedPlacement([], bedDef, defs);
  assert.ok(bed);
  assert.equal(bed.instanceId, CLEAR_PATH_BED_INSTANCE_ID);
  assert.deepEqual(bed.cell, { x: 1, y: 1 });
  assert.equal(bed.rotSteps, 2);
  assert.equal(bed.variation, null);
});

test("existing furniture wins and sends the built-in bed to another corner", () => {
  const blocker: GridPlacement = {
    instanceId: "blocker#1",
    itemId: blockerDef.itemId,
    variation: null,
    surface: { kind: "floor" },
    cell: { x: 1, y: 1 },
    rotSteps: 0,
  };
  const bed = clearPathBedPlacement([blocker], bedDef, defs);
  assert.ok(bed);
  assert.notDeepEqual(bed.cell, blocker.cell);
});

test("an unavailable catalogue row produces neither bed nor Pebble anchor", () => {
  assert.equal(clearPathBedPlacement([], undefined, defs), null);
});

test("a room with no legal bed footprint refuses Clear Path instead of overlapping furniture", () => {
  const fullRoomDef: PlaceableItemDef = {
    itemId: "full-room-blocker",
    footprint: { w: FLOOR_CELLS.w, d: FLOOR_CELLS.d },
    topFootprint: { w: 1, d: 1 },
    allowedSurfaces: ["floor"],
  };
  const fullRoom: GridPlacement = {
    instanceId: "full-room-blocker#1",
    itemId: fullRoomDef.itemId,
    variation: null,
    surface: { kind: "floor" },
    cell: { x: 0, y: 0 },
    rotSteps: 0,
  };
  const fullDefs = new Map(defs).set(fullRoomDef.itemId, fullRoomDef);

  assert.equal(clearPathBedPlacement([fullRoom], bedDef, fullDefs), null);
});
