import assert from "node:assert/strict";
import { test } from "node:test";

import {
  anchorForCentre,
  buildOccupancy,
  canPlace,
  canPlaceInLayout,
  cellsFor,
  clampToSurface,
  floorCellToRoom,
  occupiedFootprint,
  roomPointToFloorCell,
  roomPointToWallCell,
  rotatedFootprint,
  surfaceExtent,
  surfaceKey,
  wallCellToRoom,
  windowCellNamesFor,
  type GridPlacement,
  type PlaceableItemDef,
} from "./grid";
import {
  FLOOR_CELLS,
  MAX_ROOM_YAW,
  ROOM_TARGET,
  ROOM_SHELL,
  SCENE_SCALE,
  clampRoomYaw,
  roomToScene,
  sceneToRoom,
} from "./roomShell";

const stool: PlaceableItemDef = {
  itemId: "dalfred-stool",
  footprint: { w: 1, d: 1 },
  allowedSurfaces: ["floor"],
};
const table: PlaceableItemDef = {
  itemId: "lack-table",
  footprint: { w: 2, d: 1 },
  allowedSurfaces: ["floor"],
};
const frame: PlaceableItemDef = {
  itemId: "painting-small",
  footprint: { w: 2, d: 1 },
  allowedSurfaces: ["wall"],
  wallHeightCells: 3,
};

const defs = new Map([
  [stool.itemId, stool],
  [table.itemId, table],
  [frame.itemId, frame],
]);

const place = (over: Partial<GridPlacement> = {}): GridPlacement => ({
  instanceId: "a",
  itemId: "lack-table",
  variation: null,
  surface: { kind: "floor" },
  cell: { x: 0, y: 0 },
  rotSteps: 0,
  ...over,
});

test("floor grid is derived from the measured shell, not hand-authored", () => {
  // 4.5 x 4.4989 authored metres at 0.5 per cell — the shell was authored to make this land clean.
  assert.deepEqual({ w: FLOOR_CELLS.w, d: FLOOR_CELLS.d }, { w: 9, d: 9 });
  assert.deepEqual(surfaceExtent({ kind: "floor" }), { w: 9, h: 9 });
});

test("the grid covers the whole floor, to within a fraction of a cell", () => {
  // The regression this guards: truncating the cell count left a near-full-cell strip of bare floor at maxZ.
  const { cellSize, floor } = ROOM_SHELL;
  const slack = {
    x: floor.maxX - floor.minX - FLOOR_CELLS.w * cellSize,
    z: floor.maxZ - floor.minZ - FLOOR_CELLS.d * cellSize,
  };
  assert.ok(Math.abs(slack.x) < cellSize / 2, `x slack ${slack.x}`);
  assert.ok(Math.abs(slack.z) < cellSize / 2, `z slack ${slack.z}`);
  // Overhang is only acceptable while it stays invisible. The current shell's floor abuts the z-max wall's inner face exactly, so the rounding remainder sinks INTO the wall body rather than hiding in a slab-to-wall gap — allow it a hair past the inner face, but never enough to poke out as a visible ledge.
  assert.ok(floor.minZ + FLOOR_CELLS.d * cellSize <= ROOM_SHELL.walls["z-max"].innerFace + 0.01);
});

test("scene mapping round-trips and matches Filament's unit cube", () => {
  // scaling(2 / maxExtent) * translation(-center): the longest axis spans exactly 2 units.
  const size = {
    x: ROOM_SHELL.bounds.max.x - ROOM_SHELL.bounds.min.x,
    y: ROOM_SHELL.bounds.max.y - ROOM_SHELL.bounds.min.y,
    z: ROOM_SHELL.bounds.max.z - ROOM_SHELL.bounds.min.z,
  };
  const longest = Math.max(size.x, size.y, size.z);
  assert.ok(Math.abs(longest * SCENE_SCALE - 2) < 1e-9);

  const roundTripped = sceneToRoom(roomToScene({ x: 1.5, y: -0.78, z: -2.25 }));
  assert.ok(Math.abs(roundTripped.x - 1.5) < 1e-9);
  assert.ok(Math.abs(roundTripped.y - -0.78) < 1e-9);
  assert.ok(Math.abs(roundTripped.z - -2.25) < 1e-9);
});

test("the floor is far wider in scene space than the old 0.9 constant assumed", () => {
  // Regression guard for the alignment bug: the previous code mapped this 5.5-unit floor onto a
  // 0.9-wide plane, which is what the mirror and sign hacks in RoomExperience were compensating for.
  const left = roomToScene({ x: ROOM_SHELL.floor.minX, y: ROOM_SHELL.floor.y, z: 0 });
  const right = roomToScene({ x: ROOM_SHELL.floor.maxX, y: ROOM_SHELL.floor.y, z: 0 });
  assert.ok(right.x - left.x > 1.7);
});

test("rotation swaps the footprint on odd quarter turns only", () => {
  assert.deepEqual(rotatedFootprint({ w: 2, d: 1 }, 0), { w: 2, d: 1 });
  assert.deepEqual(rotatedFootprint({ w: 2, d: 1 }, 1), { w: 1, d: 2 });
  assert.deepEqual(rotatedFootprint({ w: 2, d: 1 }, 2), { w: 2, d: 1 });
  assert.deepEqual(rotatedFootprint({ w: 2, d: 1 }, 3), { w: 1, d: 2 });
});

test("a wall placement measures its second axis vertically, not in depth", () => {
  const wallPlacement = place({
    itemId: "painting-small",
    surface: { kind: "wall", wall: "z-max" },
    rotSteps: 1,
  });
  // wallHeightCells wins over the rotated depth: a frame does not lie down when the room rotates.
  assert.deepEqual(occupiedFootprint(wallPlacement, frame), { w: 2, d: 3 });
});

test("cells cover the whole footprint from the anchor corner", () => {
  const cells = cellsFor(place({ cell: { x: 3, y: 4 } }), table);
  assert.deepEqual(cells, [
    { x: 3, y: 4 },
    { x: 4, y: 4 },
  ]);
});

test("a clear cell accepts, an overlapping one is rejected", () => {
  const existing = place({ instanceId: "existing", cell: { x: 3, y: 4 } });
  const occupancy = buildOccupancy([existing], defs);

  assert.deepEqual(canPlace(place({ instanceId: "b", cell: { x: 0, y: 0 } }), table, occupancy), {
    ok: true,
  });
  assert.deepEqual(canPlace(place({ instanceId: "b", cell: { x: 4, y: 4 } }), table, occupancy), {
    ok: false,
    reason: "occupied",
  });
});

test("moving a piece does not collide with where it already is", () => {
  const existing = place({ instanceId: "same", cell: { x: 3, y: 4 } });
  // Same instance, nudged one cell — the old cells must not block the new ones.
  const moved = place({ instanceId: "same", cell: { x: 4, y: 4 } });
  assert.deepEqual(canPlaceInLayout(moved, [existing], defs), { ok: true });
});

test("placements are rejected past every edge of the surface", () => {
  const beyondRight = place({ cell: { x: FLOOR_CELLS.w - 1, y: 0 } });
  assert.deepEqual(canPlaceInLayout(beyondRight, [], defs), {
    ok: false,
    reason: "out-of-bounds",
  });
  assert.deepEqual(canPlaceInLayout(place({ cell: { x: -1, y: 0 } }), [], defs), {
    ok: false,
    reason: "out-of-bounds",
  });
  assert.deepEqual(
    canPlaceInLayout(place({ cell: { x: 0, y: FLOOR_CELLS.d } }), [], defs),
    { ok: false, reason: "out-of-bounds" },
  );
});

test("an item may not stand on a surface its definition excludes", () => {
  const tableOnWall = place({ surface: { kind: "wall", wall: "x-min" } });
  assert.deepEqual(canPlaceInLayout(tableOnWall, [], defs), {
    ok: false,
    reason: "surface-not-allowed",
  });
});

test("an unmapped item is refused rather than placed invisibly", () => {
  const ghost = place({ itemId: "not-in-catalog" });
  assert.deepEqual(canPlaceInLayout(ghost, [], defs), {
    ok: false,
    reason: "unknown-item",
  });
});

test("each surface is an independent grid", () => {
  const onFloor = place({ instanceId: "f", cell: { x: 2, y: 2 } });
  const onWall = place({
    instanceId: "w",
    itemId: "painting-small",
    surface: { kind: "wall", wall: "x-min" },
    cell: { x: 2, y: 2 },
  });
  // Identical cell coordinates, different surfaces — no collision.
  assert.deepEqual(canPlaceInLayout(onWall, [onFloor], defs), { ok: true });
  assert.notEqual(surfaceKey(onFloor.surface), surfaceKey(onWall.surface));
});

test("clamping keeps a piece fully on the floor", () => {
  assert.deepEqual(clampToSurface({ x: -3, y: -3 }, { kind: "floor" }, { w: 2, d: 1 }), {
    x: 0,
    y: 0,
  });
  assert.deepEqual(clampToSurface({ x: 99, y: 99 }, { kind: "floor" }, { w: 2, d: 1 }), {
    x: FLOOR_CELLS.w - 2,
    y: FLOOR_CELLS.d - 1,
  });
});

test("a floor cell maps to its centre, sitting on the floor surface", () => {
  const point = floorCellToRoom({ x: 0, y: 0 }, { w: 1, d: 1 });
  assert.equal(point.y, ROOM_SHELL.floor.y);
  assert.ok(Math.abs(point.x - (ROOM_SHELL.floor.minX + 0.25)) < 1e-9);
  assert.ok(Math.abs(point.z - (ROOM_SHELL.floor.minZ + 0.25)) < 1e-9);
});

test("a wall cell sits on the wall's inner face", () => {
  const onXMin = wallCellToRoom("x-min", { x: 0, y: 0 }, { w: 2, d: 3 });
  assert.equal(onXMin.x, ROOM_SHELL.walls["x-min"].innerFace);
  const onZMax = wallCellToRoom("z-max", { x: 0, y: 0 }, { w: 2, d: 3 });
  assert.equal(onZMax.z, ROOM_SHELL.walls["z-max"].innerFace);
});

const sashWindow: PlaceableItemDef = {
  itemId: "window-sash",
  footprint: { w: 4, d: 1 },
  allowedSurfaces: ["wall"],
  wallHeightCells: 5,
  opensWall: true,
};

test("a window must sit wholly inside the band — the structural wall rejects it, a frame is free", () => {
  const defs = new Map([[sashWindow.itemId, sashWindow], [frame.itemId, frame]]);
  const occupancy = buildOccupancy([], defs);
  const at = (cell: { x: number; y: number }): GridPlacement =>
    place({ itemId: "window-sash", surface: { kind: "wall", wall: "z-max" }, cell });
  // Band cols 2..16, rows 4..10; the 4x5 sash fits at the min corner and at the far corner.
  assert.equal(canPlace(at({ x: 2, y: 4 }), sashWindow, occupancy).ok, true);
  assert.equal(canPlace(at({ x: 12, y: 5 }), sashWindow, occupancy).ok, true);
  // One cell into the margin column or above the band head: rejected as out-of-bounds.
  assert.deepEqual(canPlace(at({ x: 1, y: 4 }), sashWindow, occupancy), { ok: false, reason: "out-of-bounds" });
  assert.deepEqual(canPlace(at({ x: 2, y: 6 }), sashWindow, occupancy), { ok: false, reason: "out-of-bounds" });
  // The same margin cell is fine for a FRAME — it hangs on the wall without cutting it.
  const framed = place({ itemId: "painting-small", surface: { kind: "wall", wall: "z-max" }, cell: { x: 0, y: 4 } });
  assert.equal(canPlace(framed, frame, occupancy).ok, true);
});

test("a room point on the wall maps to its wall cell", () => {
  // The centre of wall cell (2, 4) on z-max, fed back through the point-to-cell inverse.
  const point = wallCellToRoom("z-max", { x: 2, y: 4 }, { w: 1, d: 1 });
  assert.deepEqual(roomPointToWallCell("z-max", point), { x: 2, y: 4 });
  const onXMin = wallCellToRoom("x-min", { x: 7, y: 6 }, { w: 1, d: 1 });
  assert.deepEqual(roomPointToWallCell("x-min", onXMin), { x: 7, y: 6 });
});

test("a window's covered cells map to the shell's removable node names", () => {
  // Anchored at the band's min corner (WINDOW_BANDS cols/rows start at 2/4), so the names are the
  // band-local origin block: c00..c03 × r0..r4.
  const names = windowCellNamesFor(
    place({ itemId: "window-sash", surface: { kind: "wall", wall: "z-max" }, cell: { x: 2, y: 4 } }),
    sashWindow,
  );
  assert.equal(names.length, 4 * 5);
  assert.ok(names.includes("WCell_zmax_c00_r0"));
  assert.ok(names.includes("WCell_zmax_c03_r4"));
  assert.ok(!names.includes("WCell_zmax_c04_r0"));
});

test("cells outside the band resolve to no node — skipped, not thrown", () => {
  // Anchored two columns into the solid margin: only the columns inside the band map to names.
  const names = windowCellNamesFor(
    place({ itemId: "window-sash", surface: { kind: "wall", wall: "x-min" }, cell: { x: 0, y: 4 } }),
    sashWindow,
  );
  assert.equal(names.length, 2 * 5);
  assert.ok(names.every((n) => n.startsWith("WCell_xmin_")));
});

test("only hole-opening wall items knock out cells", () => {
  // A frame occupies wall cells but leaves the wall intact; floor items never map at all.
  const framed = windowCellNamesFor(
    place({ itemId: "painting-small", surface: { kind: "wall", wall: "z-max" }, cell: { x: 4, y: 5 } }),
    frame,
  );
  assert.deepEqual(framed, []);
  assert.deepEqual(windowCellNamesFor(place({ cell: { x: 2, y: 4 } }), table), []);
});

test("a picked point resolves to the cell it falls in", () => {
  const cell = roomPointToFloorCell({
    x: ROOM_SHELL.floor.minX + 1.2,
    z: ROOM_SHELL.floor.minZ + 0.6,
  });
  assert.deepEqual(cell, { x: 2, y: 1 });
});

test("a centred drag anchors so the piece sits under the finger", () => {
  // A 2x1 piece pointed at cell 5 starts at 5, not straddling it asymmetrically.
  assert.deepEqual(anchorForCentre({ x: 5, y: 5 }, { w: 2, d: 1 }), { x: 5, y: 5 });
  // A 3x3 piece centres properly around the pointed cell.
  assert.deepEqual(anchorForCentre({ x: 5, y: 5 }, { w: 3, d: 3 }), { x: 4, y: 4 });
});

test("room yaw is clamped to the diorama's open corner", () => {
  // The shell has two walls and is open on the other two sides; past 45 degrees a drag would show
  // straight through the missing back, which reads on device as the scene being cut away.
  assert.equal(clampRoomYaw(0), 0);
  assert.equal(clampRoomYaw(Math.PI), MAX_ROOM_YAW);
  assert.equal(clampRoomYaw(-Math.PI), -MAX_ROOM_YAW);
  assert.ok(Math.abs(clampRoomYaw(0.5) - 0.5) < 1e-9);
});

test("the orbit target is the room's centre", () => {
  // The shell is unit-cube centred on the origin; framing (radius, lens) is owned by ./orbit and
  // guarded by its own tests.
  assert.deepEqual(ROOM_TARGET, { x: 0, y: 0, z: 0 });
});
