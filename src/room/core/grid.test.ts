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
  hostTopExtent,
  occupiedFootprint,
  roomPointToFloorCell,
  roomPointToWallCell,
  rotatedFootprint,
  rotatedMask,
  surfaceExtent,
  surfaceKey,
  topCellToRoom,
  topPlacementBox,
  roomPointToTopCell,
  wallCellToRoom,
  wallPlacementBox,
  windowCellNamesFor,
  type Footprint,
  type GridPlacement,
  type PlaceableItemDef,
} from "./grid";
import {
  FLOOR_CELLS,
  ROOM_TARGET,
  ROOM_SHELL,
  SCENE_SCALE,
  SHELL_WALL_IDS,
  TOP_CELL_SIZE,
  WALL_CELLS,
  WALL_CELL_SIZE,
  WALL_THICKNESS,
  WINDOW_BANDS,
  isXWall,
  roomToScene,
  sceneToRoom,
  wallDepthOffset,
  wallMountYaw,
  wallOutward,
  windowCellEntityName,
} from "./roomShell";

// "furniture" is explicit here (the on_top column, migration 021) because this def doubles as the CHILD in every furniture-top test below (onTop() places "dalfred-stool") — a plain floor item can no longer stack just because it lives on the floor; canPlace checks the surface kind against allowedSurfaces directly now, with no "furniture" -> "floor" remapping.
const stool: PlaceableItemDef = {
  itemId: "dalfred-stool",
  footprint: { w: 1, d: 1 },
  topFootprint: { w: 1, d: 1 },
  allowedSurfaces: ["floor", "furniture"],
};
const table: PlaceableItemDef = {
  itemId: "lack-table",
  footprint: { w: 2, d: 1 },
  topFootprint: { w: 4, d: 2 },
  allowedSurfaces: ["floor"],
};
const frame: PlaceableItemDef = {
  itemId: "painting-small",
  footprint: { w: 2, d: 1 },
  topFootprint: { w: 4, d: 2 },
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

test("TOP_CELL_SIZE is a clean integer subdivision of the floor pitch", () => {
  // Half the floor pitch, and specifically a whole-number divisor of it — a host's floor footprint must scale to a whole number of top cells with no remainder (see hostTopExtent).
  assert.equal(TOP_CELL_SIZE, 0.125);
  assert.equal(ROOM_SHELL.cellSize / TOP_CELL_SIZE, Math.round(ROOM_SHELL.cellSize / TOP_CELL_SIZE));
});

test("floor grid is derived from the measured shell, not hand-authored", () => {
  // 4.5 x 4.4989 authored metres at 0.25 per cell — quarter cells, matching the walls' grid.
  assert.deepEqual({ w: FLOOR_CELLS.w, d: FLOOR_CELLS.d }, { w: 18, d: 18 });
  assert.deepEqual(surfaceExtent({ kind: "floor" }), { w: 18, h: 18 });
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
  // 1.69 at the current shell. The bound tracks SCENE_SCALE, which is set by the LARGEST axis of the whole model — so widening the plinth (as the four-wall shell did) shrinks the floor's share of the unit cube without the floor itself moving. Only the distance from the 0.9 bug matters here.
  assert.ok(right.x - left.x > 1.6);
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

// A 0.26 m item: ceil(0.26 / 0.25) = 2 floor cells, but ceil(0.26 / 0.125) = 3 top cells — 3 is TIGHT (0.375 m), while scaling the floor footprint by the ×2 pitch ratio would wrongly give 4 (0.5 m). This is the exact worked example from the task description.
const bookish: PlaceableItemDef = {
  itemId: "bookish",
  footprint: { w: 2, d: 2 },
  topFootprint: { w: 3, d: 3 },
  allowedSurfaces: ["floor"],
};

test("occupiedFootprint on a furniture surface uses topFootprint verbatim, never footprint scaled by the floor/top pitch ratio", () => {
  const childOnTop = place({
    itemId: "bookish",
    surface: { kind: "furniture", hostInstanceId: "host#1", slot: "top" },
  });
  assert.deepEqual(occupiedFootprint(childOnTop, bookish), { w: 3, d: 3 });
  // The wrong answer a naive `footprint × TOP_SUBDIVISION` would give — pinned so nobody "simplifies" topFootprint away and re-derives it from footprint.
  assert.notDeepEqual(occupiedFootprint(childOnTop, bookish), { w: 4, d: 4 });
  // On the FLOOR, the same def still claims its floor footprint, untouched by topFootprint.
  assert.deepEqual(occupiedFootprint(place({ itemId: "bookish" }), bookish), { w: 2, d: 2 });
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
  assert.ok(Math.abs(point.x - (ROOM_SHELL.floor.minX + 0.125)) < 1e-9);
  assert.ok(Math.abs(point.z - (ROOM_SHELL.floor.minZ + 0.125)) < 1e-9);
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
  topFootprint: { w: 8, d: 2 },
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
  // Anchored at the band's min corner (WINDOW_BANDS cols/rows start at 2/4), so the names are the band-local origin block: c00..c03 × r0..r4.
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
  assert.deepEqual(cell, { x: 4, y: 2 });
});

test("a centred drag anchors so the piece sits under the finger", () => {
  // A 2x1 piece pointed at cell 5 starts at 5, not straddling it asymmetrically.
  assert.deepEqual(anchorForCentre({ x: 5, y: 5 }, { w: 2, d: 1 }), { x: 5, y: 5 });
  // A 3x3 piece centres properly around the pointed cell.
  assert.deepEqual(anchorForCentre({ x: 5, y: 5 }, { w: 3, d: 3 }), { x: 4, y: 4 });
});

test("every shell wall is a placement surface, with a band and a grid", () => {
  // All four walls now carry a diced window band and a wall grid — x-max and z-min used to be geometry and light blockers only. This is the guard that a wall never gets shell geometry without the placement data to match, which would let a window be placed into nothing.
  assert.deepEqual([...SHELL_WALL_IDS].sort(), ["x-max", "x-min", "z-max", "z-min"]);
  for (const wall of SHELL_WALL_IDS) {
    assert.ok(ROOM_SHELL.walls[wall], `${wall} must have a placement spec`);
    assert.ok(WINDOW_BANDS[wall], `${wall} must have a window band`);
    assert.ok(WALL_CELLS[wall].w > 0 && WALL_CELLS[wall].h > 0, `${wall} must have a wall grid`);
    // Every band cell must name a real node, or a window there opens no hole.
    assert.ok(windowCellEntityName(wall, WINDOW_BANDS[wall].cols.from, WINDOW_BANDS[wall].rows.from));
  }
});

test("wall mount yaw and outward normal agree on which way each wall faces", () => {
  // A model is authored facing the room with its wall behind it, so rotating by the mount yaw must send its back along the wall's OUTWARD normal. Getting these out of step seats windows backwards.
  for (const wall of SHELL_WALL_IDS) {
    // Authored BACK is +z (the wall sits behind the model), so a yaw about Y sends it to (sin, cos).
    const yaw = wallMountYaw(wall);
    const back = { x: Math.round(Math.sin(yaw)), z: Math.round(Math.cos(yaw)) };
    const axis = isXWall(wall) ? back.x : back.z;
    assert.equal(axis, wallOutward(wall), `${wall} faces the wrong way`);
  }
});

test("the orbit target is the room's centre", () => {
  // The shell is unit-cube centred on the origin; framing (radius, lens) is owned by ./orbit and guarded by its own tests.
  assert.deepEqual(ROOM_TARGET, { x: 0, y: 0, z: 0 });
});

// An 8x6 L-sofa at rotSteps 0: back rows solid, notch (x 0..4, y 3..5) empty. Matches the seeded sofa-modular mask.
const SOFA_MASK = ["XXXXXXXX", "XXXXXXXX", "XXXXXXXX", ".....XXX", ".....XXX", ".....XX."] as const;
const sofa: PlaceableItemDef = {
  itemId: "sofa-modular",
  footprint: { w: 8, d: 6 },
  topFootprint: { w: 16, d: 12 },
  allowedSurfaces: ["floor"],
  mask: SOFA_MASK,
};

test("mask rotation matches the renderer's yaw: (dx, dy) -> (dy, w-1-dx) per quarter turn", () => {
  const m = ["XX.", "X.."] as const; // 3 wide, 2 deep; solid at (0,0), (1,0), (0,1)
  assert.deepEqual(rotatedMask(m, 0), ["XX.", "X.."]);
  // One +90° yaw about Y: solid cells land at (0,2), (0,1), (1,2) on the swapped 2-wide 3-deep grid.
  assert.deepEqual(rotatedMask(m, 1), ["..", "X.", "XX"]);
  // Two turns are the 180° flip: rows reversed, each row reversed.
  assert.deepEqual(rotatedMask(m, 2), ["..X", ".XX"]);
  assert.deepEqual(rotatedMask(m, 3), ["XX", ".X", ".."]);
  // Four turns are identity.
  assert.deepEqual(rotatedMask(rotatedMask(m, 3), 1), ["XX.", "X.."]);
});

test("cellsFor omits a masked item's empty cells", () => {
  const cells = cellsFor(place({ itemId: "sofa-modular", cell: { x: 0, y: 0 } }), sofa);
  assert.equal(cells.length, 32); // 48 bbox cells minus 16 '.' cells
  assert.ok(!cells.some((c) => c.x === 0 && c.y === 3), "notch cell must be free");
  assert.ok(!cells.some((c) => c.x === 7 && c.y === 5), "17%-coverage corner must be free");
  assert.ok(cells.some((c) => c.x === 7 && c.y === 4), "chaise arm must be claimed");
});

const crate: PlaceableItemDef = {
  itemId: "crate",
  footprint: { w: 2, d: 2 },
  topFootprint: { w: 4, d: 4 },
  allowedSurfaces: ["floor"],
};

test("a small piece fits inside the L's notch but not its arm", () => {
  const sofaDefs = new Map([[sofa.itemId, sofa], [stool.itemId, stool], [table.itemId, table], [crate.itemId, crate]]);
  const placedSofa = place({ instanceId: "sofa", itemId: "sofa-modular", cell: { x: 0, y: 0 } });
  const inNotch = place({ instanceId: "s", itemId: "dalfred-stool", cell: { x: 1, y: 4 } });
  assert.deepEqual(canPlaceInLayout(inNotch, [placedSofa], sofaDefs), { ok: true });
  const onArm = place({ instanceId: "s", itemId: "dalfred-stool", cell: { x: 6, y: 4 } });
  assert.deepEqual(canPlaceInLayout(onArm, [placedSofa], sofaDefs), { ok: false, reason: "occupied" });
  // A 2x2 piece at the notch's min corner (x 0..1, y 3..4) sits entirely inside the empty region.
  const crateInNotch = place({ instanceId: "c", itemId: "crate", cell: { x: 0, y: 3 } });
  assert.deepEqual(canPlaceInLayout(crateInNotch, [placedSofa], sofaDefs), { ok: true });
  // The same crate at x:4 straddles the notch's edge: its x:4 column is still empty notch, but its x:5 column lands in the solid chaise arm (row3/row4 are 'X' from x=5), so it must be rejected.
  const crateOnEdge = place({ instanceId: "c", itemId: "crate", cell: { x: 4, y: 3 } });
  assert.deepEqual(canPlaceInLayout(crateOnEdge, [placedSofa], sofaDefs), { ok: false, reason: "occupied" });
});

test("a maskless def still claims its full rectangle", () => {
  assert.equal(cellsFor(place({ cell: { x: 0, y: 0 } }), table).length, 2);
});

const desk: PlaceableItemDef = {
  itemId: "desk",
  footprint: { w: 4, d: 2 },
  topFootprint: { w: 8, d: 4 },
  allowedSurfaces: ["floor"],
  hostsTop: true,
};
const roundTable: PlaceableItemDef = {
  itemId: "round-table",
  footprint: { w: 3, d: 3 },
  topFootprint: { w: 6, d: 6 },
  allowedSurfaces: ["floor"],
  hostsTop: true,
  mask: [".X.", "XXX", ".X."],
};
const stackDefs = new Map([
  [desk.itemId, desk],
  [roundTable.itemId, roundTable],
  [stool.itemId, stool],
  [table.itemId, table],
  [frame.itemId, frame],
]);
const onTop = (hostInstanceId: string, over: Partial<GridPlacement> = {}): GridPlacement =>
  place({ instanceId: "child", itemId: "dalfred-stool", surface: { kind: "furniture", hostInstanceId, slot: "top" }, ...over });
const hostAt = (over: Partial<GridPlacement> = {}): GridPlacement =>
  place({ instanceId: "desk#1", itemId: "desk", cell: { x: 2, y: 2 }, ...over });

test("a floor item stands on a flagged host; wall items and unknown hosts are refused", () => {
  assert.deepEqual(canPlaceInLayout(onTop("desk#1"), [hostAt()], stackDefs), { ok: true });
  assert.deepEqual(canPlaceInLayout(onTop("nobody"), [hostAt()], stackDefs), { ok: false, reason: "no-host" });
  // A frame is a wall item — it may not stand on furniture whatever the host.
  assert.deepEqual(
    canPlaceInLayout(onTop("desk#1", { itemId: "painting-small" }), [hostAt()], stackDefs),
    { ok: false, reason: "surface-not-allowed" },
  );
  // An unflagged host (the plain table) refuses stacking.
  assert.deepEqual(
    canPlaceInLayout(onTop("table#1"), [place({ instanceId: "table#1", cell: { x: 2, y: 2 } })], stackDefs),
    { ok: false, reason: "no-host" },
  );
});

test("the top grid is the host's UNROTATED footprint, scaled to TOP_CELL_SIZE — bounds ignore host rotation, cells are host-local", () => {
  // desk is 4x2 floor cells at rotSteps 0, so its top extent (hostTopExtent) is 8x4 TOP_CELL_SIZE cells; a stool at host-local (7,3) is the far corner — in bounds even when the HOST is rotated.
  assert.deepEqual(hostTopExtent(desk), { w: 8, d: 4 });
  assert.deepEqual(canPlaceInLayout(onTop("desk#1", { cell: { x: 7, y: 3 } }), [hostAt({ rotSteps: 1 })], stackDefs), { ok: true });
  assert.deepEqual(
    canPlaceInLayout(onTop("desk#1", { cell: { x: 8, y: 0 } }), [hostAt()], stackDefs),
    { ok: false, reason: "out-of-bounds" },
  );
});

test("a host's top extent is its floor footprint scaled by the floor/top pitch ratio, for more than one footprint", () => {
  assert.deepEqual(hostTopExtent(desk), { w: 8, d: 4 }); // 4x2 floor cells
  assert.deepEqual(hostTopExtent(roundTable), { w: 6, d: 6 }); // 3x3 floor cells
});

test("a host's mask gates its top surface: nothing stands where the host is not", () => {
  // round-table's plus-shaped mask leaves its four corners '.', so those corners are not table at all — a child there would float in mid-air over the notch, which is the whole reason the top consults the mask.
  const host = place({ instanceId: "round#1", itemId: "round-table", cell: { x: 0, y: 0 } });
  // Fine cells nest 2-to-1 inside floor cells, so top cell (0,0) reads mask[0][0] = '.' and top cell (4,4) reads mask[2][2] = '.'. Both are corners of the plus.
  assert.deepEqual(
    canPlaceInLayout(onTop("round#1", { cell: { x: 0, y: 0 } }), [host], stackDefs),
    { ok: false, reason: "out-of-bounds" },
  );
  assert.deepEqual(
    canPlaceInLayout(onTop("round#1", { cell: { x: 5, y: 5 } }), [host], stackDefs),
    { ok: false, reason: "out-of-bounds" },
  );
  // The arms and the centre ARE table: top (2,0) -> mask[0][1] = 'X', top (0,2) -> mask[1][0] = 'X', top (2,2) -> the centre.
  assert.deepEqual(canPlaceInLayout(onTop("round#1", { cell: { x: 2, y: 0 } }), [host], stackDefs), { ok: true });
  assert.deepEqual(canPlaceInLayout(onTop("round#1", { cell: { x: 0, y: 2 } }), [host], stackDefs), { ok: true });
  assert.deepEqual(canPlaceInLayout(onTop("round#1", { cell: { x: 2, y: 2 } }), [host], stackDefs), { ok: true });
  // Still bounded by the top extent, 6x6, independently of the mask.
  assert.deepEqual(
    canPlaceInLayout(onTop("round#1", { cell: { x: 6, y: 0 } }), [host], stackDefs),
    { ok: false, reason: "out-of-bounds" },
  );
});

// The mask is authored at rotSteps 0 and child cells on a top are already in the host's own frame, so the top check must read it UNROTATED — rotating it here as the floor check does would turn it twice and move the notch. Turning the host a quarter step must therefore change nothing about which top cells are free.
test("a rotated host's top mask does not turn with it", () => {
  for (const rotSteps of [0, 1, 2, 3] as const) {
    const host = place({ instanceId: "round#1", itemId: "round-table", cell: { x: 4, y: 4 }, rotSteps });
    assert.deepEqual(
      canPlaceInLayout(onTop("round#1", { cell: { x: 0, y: 0 } }), [host], stackDefs),
      { ok: false, reason: "out-of-bounds" },
      `corner must stay off the table at rotSteps ${rotSteps}`,
    );
    assert.deepEqual(
      canPlaceInLayout(onTop("round#1", { cell: { x: 2, y: 2 } }), [host], stackDefs),
      { ok: true },
      `centre must stay on the table at rotSteps ${rotSteps}`,
    );
  }
});

test("depth 1: a host standing on furniture cannot itself host", () => {
  const deskOnDesk = place({ instanceId: "desk#2", itemId: "desk", surface: { kind: "furniture", hostInstanceId: "desk#1", slot: "top" }, cell: { x: 0, y: 0 } });
  assert.deepEqual(
    canPlaceInLayout(onTop("desk#2"), [hostAt(), deskOnDesk], stackDefs),
    { ok: false, reason: "no-host" },
  );
});

test("two hosts are two independent grids; the same host's top collides", () => {
  const a = hostAt();
  const b = place({ instanceId: "desk#2", itemId: "desk", cell: { x: 10, y: 10 } });
  const first = onTop("desk#1", { instanceId: "c1" });
  assert.deepEqual(canPlaceInLayout(onTop("desk#2", { instanceId: "c2" }), [a, b, first], stackDefs), { ok: true });
  assert.deepEqual(
    canPlaceInLayout(onTop("desk#1", { instanceId: "c2" }), [a, b, first], stackDefs),
    { ok: false, reason: "occupied" },
  );
});

test("a stacked child's centre composes host centre + host-local offset + top height", () => {
  // desk 4x2 floor cells at cell (2,2) rotSteps 0, top extent 8x4 TOP_CELL_SIZE cells. Child cell (0,0) 1x1: host-local offset (0 + 0.5 - 4, 0 + 0.5 - 2) = (-3.5, -1.5) top cells = (-0.4375, -0.1875) m at TOP_CELL_SIZE 0.125.
  const host = { placement: hostAt(), def: desk };
  const at = topCellToRoom(host, { x: 0, y: 0 }, { w: 1, d: 1 }, 0.7);
  const hostCentre = floorCellToRoom({ x: 2, y: 2 }, { w: 4, d: 2 });
  assert.ok(Math.abs(at.x - (hostCentre.x - 3.5 * TOP_CELL_SIZE)) < 1e-9);
  assert.ok(Math.abs(at.z - (hostCentre.z - 1.5 * TOP_CELL_SIZE)) < 1e-9);
  assert.ok(Math.abs(at.y - (ROOM_SHELL.floor.y + 0.7)) < 1e-9);
});

test("host rotation turns the child's offset with the renderer's yaw convention", () => {
  // Same child cell, host at rotSteps 1: +90° maps local (x, z) to (z, -x), and the ROTATED host footprint (2x4) centres the host box. hostTopExtent is unrotated (host.def.footprint, not the rotated box), so it is still 8x4 regardless of rotSteps.
  const host = { placement: hostAt({ rotSteps: 1 }), def: desk };
  const hostCentre = floorCellToRoom({ x: 2, y: 2 }, { w: 2, d: 4 });
  const at = topCellToRoom(host, { x: 0, y: 0 }, { w: 1, d: 1 }, 0.7);
  // local (-3.5, -1.5) top cells --(+90°)--> (-1.5, +3.5) top cells.
  assert.ok(Math.abs(at.x - (hostCentre.x - 1.5 * TOP_CELL_SIZE)) < 1e-9);
  assert.ok(Math.abs(at.z - (hostCentre.z + 3.5 * TOP_CELL_SIZE)) < 1e-9);
});

test("roomPointToTopCell inverts topCellToRoom at every host rotation", () => {
  for (const rotSteps of [0, 1, 2, 3] as const) {
    const host = { placement: hostAt({ rotSteps }), def: desk };
    for (const cell of [{ x: 0, y: 0 }, { x: 3, y: 1 }, { x: 2, y: 0 }, { x: 7, y: 3 }]) {
      const centre = topCellToRoom(host, cell, { w: 1, d: 1 }, 0.7);
      assert.deepEqual(roomPointToTopCell(host, centre), cell, `rot ${rotSteps} cell ${cell.x},${cell.y}`);
    }
  }
});

// The round-trip property the header rationale calls out by name: topCellToRoom and roomPointToTopCell must stay exact inverses at the finer pitch, across host rotations and host footprints (so different hostTopExtent values) — this is the failure mode that would put a book visibly off the edge of a desk. Probed at childFootprint {w:1,d:1}, the same convention every real caller uses (ghostQuads, screenPointToTopCell): a MULTI-cell footprint's own bounding-box CENTRE is not a well-defined inverse target — for an even-width footprint it sits exactly ON the boundary between two cells, so which cell floor() resolves it to is a coin flip no caller ever relies on. The next test covers "child footprints" honestly, by round-tripping each unit cell a multi-cell child actually occupies.
test("topCellToRoom/roomPointToTopCell round-trip for every combination of host footprint and host rotation", () => {
  const hostDefs = [desk, roundTable, { ...desk, footprint: { w: 6, d: 5 }, topFootprint: { w: 12, d: 10 } }];
  for (const hostDef of hostDefs) {
    const top = hostTopExtent(hostDef);
    for (const rotSteps of [0, 1, 2, 3] as const) {
      const host = { placement: hostAt({ rotSteps }), def: hostDef };
      // Corners and centre of the host's top — the extremes most likely to expose an off-by-one in the extent or the centring term.
      const cells = [
        { x: 0, y: 0 },
        { x: top.w - 1, y: 0 },
        { x: 0, y: top.d - 1 },
        { x: top.w - 1, y: top.d - 1 },
        { x: Math.floor(top.w / 2), y: Math.floor(top.d / 2) },
      ];
      for (const cell of cells) {
        const centre = topCellToRoom(host, cell, { w: 1, d: 1 }, 0.7);
        assert.deepEqual(
          roomPointToTopCell(host, centre),
          cell,
          `host ${hostDef.footprint.w}x${hostDef.footprint.d} rot ${rotSteps} cell ${cell.x},${cell.y}`,
        );
      }
    }
  }
});

test("every unit cell a multi-cell child occupies round-trips through topCellToRoom/roomPointToTopCell, at each host rotation", () => {
  const childFootprints: Footprint[] = [{ w: 2, d: 1 }, { w: 1, d: 2 }, { w: 2, d: 2 }, { w: 3, d: 1 }];
  for (const rotSteps of [0, 1, 2, 3] as const) {
    const host = { placement: hostAt({ rotSteps }), def: desk };
    for (const childFootprint of childFootprints) {
      const anchor = { x: 1, y: 0 };
      // Every cell the anchored footprint covers is itself a valid 1x1 probe — this is exactly what cellsFor hands the renderer's ghost quads.
      for (let dx = 0; dx < childFootprint.w; dx += 1) {
        for (let dy = 0; dy < childFootprint.d; dy += 1) {
          const cell = { x: anchor.x + dx, y: anchor.y + dy };
          const centre = topCellToRoom(host, cell, { w: 1, d: 1 }, 0.7);
          assert.deepEqual(
            roomPointToTopCell(host, centre),
            cell,
            `child ${childFootprint.w}x${childFootprint.d} rot ${rotSteps} cell ${cell.x},${cell.y}`,
          );
        }
      }
    }
  }
});

test("a stacked pick box stands on the host top and contains the child's centre", () => {
  const host = { placement: hostAt({ rotSteps: 1 }), def: desk };
  const child = onTop("desk#1", { cell: { x: 3, y: 1 } });
  const box = topPlacementBox(host, child, stool, 0.7, 0.45);
  assert.ok(Math.abs(box.min.y - (ROOM_SHELL.floor.y + 0.7)) < 1e-9);
  assert.ok(Math.abs(box.max.y - (ROOM_SHELL.floor.y + 0.7 + 0.45)) < 1e-9);
  const centre = topCellToRoom(host, { x: 3, y: 1 }, { w: 1, d: 1 }, 0.7);
  assert.ok(box.min.x <= centre.x && centre.x <= box.max.x);
  assert.ok(box.min.z <= centre.z && centre.z <= box.max.z);
});

// The bug this pins, found 2026-08-10: every wall item was seated with the WINDOW policy, which is the opposite sign from what a mounted piece needs. A painting hung on a wall was pushed OUTWARD until it sat flush against the outer skin — entirely inside the wall, invisible from the room. Nothing caught it because the arithmetic lived inside a React effect where no test could reach it.
test("a mounted wall item's back rests on the wall face; a hole-cutter's front does", () => {
  // Positive is OUTWARD (into and through the wall). A 3.6 cm painting moves INWARD by half its depth, so its back lands exactly on the anchor and the whole canvas hangs in the room.
  assert.equal(wallDepthOffset(0.036, false), -0.018);
  // The same canvas under the old window rule: protrusion = 0.036 - 0.12 = -0.084, offset = 0.018 + 0.084 = +0.102 outward, which buries it. Pinned as the WRONG answer so the two policies can never be collapsed back into one.
  assert.equal(+wallDepthOffset(0.036, true).toFixed(4), 0.102);

  // A window deeper than the wall keeps the window policy: front flush with the interior face, body extending back through the hole.
  assert.equal(wallDepthOffset(0.218, true), 0.109);
  // And a deep MOUNTED piece — a wall cabinet — still hangs off the face rather than sinking: back on the wall, 0.35 m of body in the room.
  assert.equal(wallDepthOffset(0.35, false), -0.175);
});

test("wallDepthOffset is sign-opposite for the two policies at every depth", () => {
  // Not a coincidence of one value: a mounted piece always moves inward and a hole-cutter always outward, so no depth exists where the two rules agree and the distinction could be dropped.
  for (const depth of [0.01, 0.036, 0.12, 0.218, 0.5, 1]) {
    assert.ok(wallDepthOffset(depth, false) < 0, `mounted at ${depth} must move inward`);
    assert.ok(wallDepthOffset(depth, true) > 0, `hole-cutter at ${depth} must move outward`);
  }
});

// wallPlacementBox is the wall twin of floorPlacementBox: a real pickable VOLUME instead of a
// single plane cell. It must agree with the renderer's own seating (wallDepthOffset) exactly —
// worked by hand for all three of wallDepthOffset's cases below, on both an isXWall (x-min,
// outward -1) and a z-wall (z-max, outward +1) so the min/max sort is proven for both signs.
const eket: PlaceableItemDef = {
  itemId: "eket-cabinet",
  footprint: { w: 2, d: 2 },
  topFootprint: { w: 4, d: 4 },
  allowedSurfaces: ["wall"],
  wallHeightCells: 3,
};
const onZMax = place({ itemId: "eket-cabinet", surface: { kind: "wall", wall: "z-max" }, cell: { x: 6, y: 2 } });
const onXMin = place({ itemId: "eket-cabinet", surface: { kind: "wall", wall: "x-min" }, cell: { x: 6, y: 2 } });

test("case 1 — a MOUNTED item (!opensWall): back on the inner face, body into the room", () => {
  const sizeZ = 0.35; // eket-cabinet's measured depth
  const box = wallPlacementBox("z-max", onZMax, eket, sizeZ);
  const spec = ROOM_SHELL.walls["z-max"];
  // Tangent (x) and vertical (y) come straight from occupiedFootprint's cells, at WALL_CELL_SIZE.
  assert.ok(Math.abs(box.min.x - (spec.from + 6 * WALL_CELL_SIZE)) < 1e-9);
  assert.ok(Math.abs(box.max.x - (spec.from + 8 * WALL_CELL_SIZE)) < 1e-9);
  assert.ok(Math.abs(box.min.y - (spec.bottom + 2 * WALL_CELL_SIZE)) < 1e-9);
  assert.ok(Math.abs(box.max.y - (spec.bottom + 5 * WALL_CELL_SIZE)) < 1e-9);
  // z-max's outward normal is +1: BACK (innerFace, where the anchor sits) is the box's smaller z; the FRONT is sizeZ closer to the room, i.e. smaller still — 0.35 m of body between the wall and the visible face.
  assert.ok(Math.abs(box.max.z - spec.innerFace) < 1e-9, "back must sit exactly on the inner face");
  assert.ok(Math.abs(box.min.z - (spec.innerFace - sizeZ)) < 1e-9, "front must be sizeZ into the room");

  // Mirrored on an isXWall (x-min, outward -1): the sort flips, but back is still exactly on the face and the box still spans sizeZ into the room (increasing x, toward the room's interior).
  const onX = wallPlacementBox("x-min", onXMin, eket, sizeZ);
  const specX = ROOM_SHELL.walls["x-min"];
  assert.ok(Math.abs(onX.min.x - specX.innerFace) < 1e-9, "back must sit exactly on x-min's inner face");
  assert.ok(Math.abs(onX.max.x - (specX.innerFace + sizeZ)) < 1e-9, "front must be sizeZ into the room");
});

test("case 2 — a HOLE-CUTTER (opensWall) deeper than the wall: front flush with the inner face, body through the hole", () => {
  const sizeZ = 0.218; // >= WALL_THICKNESS (0.12)
  const box = wallPlacementBox("z-max", onZMax, { ...eket, opensWall: true }, sizeZ);
  const spec = ROOM_SHELL.walls["z-max"];
  assert.ok(Math.abs(box.min.z - spec.innerFace) < 1e-9, "front must be flush with the inner face");
  assert.ok(Math.abs(box.max.z - (spec.innerFace + sizeZ)) < 1e-9, "back must extend the full depth through the wall");
});

test("case 3 — a HOLE-CUTTER shallower than the wall: recessed, back on the outer skin", () => {
  const sizeZ = 0.036; // < WALL_THICKNESS
  const box = wallPlacementBox("z-max", onZMax, { ...eket, opensWall: true }, sizeZ);
  const spec = ROOM_SHELL.walls["z-max"];
  assert.ok(Math.abs(box.max.z - (spec.innerFace + WALL_THICKNESS)) < 1e-9, "back must sit on the outer skin");
  assert.ok(Math.abs(box.min.z - (spec.innerFace + WALL_THICKNESS - sizeZ)) < 1e-9, "front must be recessed by sizeZ from the outer skin");
});

test("wallPlacementBox's normal-axis centre always matches innerFace + outward * wallDepthOffset — the exact point the renderer seats the model at", () => {
  for (const [wall, placement] of [["z-max", onZMax], ["x-min", onXMin]] as const) {
    for (const [sizeZ, opensWall] of [[0.35, false], [0.218, true], [0.036, true]] as const) {
      const box = wallPlacementBox(wall, placement, { ...eket, opensWall }, sizeZ);
      const spec = ROOM_SHELL.walls[wall];
      const expectedCentre = spec.innerFace + wallOutward(wall) * wallDepthOffset(sizeZ, opensWall);
      const actualCentre = isXWall(wall) ? (box.min.x + box.max.x) / 2 : (box.min.z + box.max.z) / 2;
      assert.ok(Math.abs(actualCentre - expectedCentre) < 1e-9, `${wall} sizeZ=${sizeZ} opensWall=${opensWall}`);
      // And the box's full extent on that axis is exactly sizeZ.
      const extent = isXWall(wall) ? box.max.x - box.min.x : box.max.z - box.min.z;
      assert.ok(Math.abs(extent - sizeZ) < 1e-9);
    }
  }
});
