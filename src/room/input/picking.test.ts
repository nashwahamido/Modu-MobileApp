import assert from "node:assert/strict";
import { test } from "node:test";

import { clampToSurface, floorCellToRoom, floorPlacementBox, topCellToRoom, wallCellToRoom } from "../core/grid";
import type { GridPlacement, PlaceableItemDef } from "../core/grid";
import { ORBIT } from "./orbit";
import {
  dragTopTarget,
  dragWallTarget,
  pickBoxAt,
  pointsAtSurface,
  roomPointToScreen,
  screenPointToFloorCell,
  screenPointToFloorScene,
  screenPointToTopCell,
  screenPointToWallCell,
} from "./picking";
import { FLOOR_CELLS, ROOM_SHELL, WALL_CELLS, sceneToRoom, type WallId } from "../core/roomShell";
import { visibleWalls } from "../core/wallCulling";

const VIEWPORT = { width: 1200, height: 800 };
const REST = { radius: ORBIT.homeRadius, phi: ORBIT.phi.rest, theta: ORBIT.restTheta };

// The angles a player actually reaches: corners of the clamp box plus the rest pose.
const ANGLE_SAMPLES = [
  REST,
  { radius: ORBIT.homeRadius / 2, phi: ORBIT.phi.min + 0.05, theta: ORBIT.restTheta - 0.7 },
  { radius: ORBIT.homeRadius / 0.6, phi: ORBIT.phi.max - 0.05, theta: ORBIT.restTheta + 0.7 },
];

test("picking inverts projection: every floor cell round-trips through the screen", () => {
  for (const angles of ANGLE_SAMPLES) {
    for (const cell of [
      { x: 0, y: 0 },
      { x: 10, y: 9 },
      { x: 5, y: 4 },
      { x: 2, y: 7 },
    ]) {
      const centre = floorCellToRoom(cell, { w: 1, d: 1 });
      const screen = roomPointToScreen(centre, VIEWPORT, angles);
      assert.ok(screen, `cell ${cell.x},${cell.y} projects behind the camera`);
      const picked = screenPointToFloorCell(screen.x, screen.y, VIEWPORT, angles);
      assert.deepEqual(picked, cell, `round-trip failed at radius ${angles.radius.toFixed(2)}`);
    }
  }
});

test("a picked hit lies exactly on the floor plane", () => {
  const hit = screenPointToFloorScene(VIEWPORT.width / 2, VIEWPORT.height / 2, VIEWPORT, REST);
  assert.ok(hit);
  const room = sceneToRoom(hit);
  assert.ok(Math.abs(room.y - ROOM_SHELL.floor.y) < 1e-9);
});

test("pointing at the sky picks nothing", () => {
  // The top of the screen at the rest pose looks over the cornice line — no floor intersection in front of the camera.
  const picked = screenPointToFloorCell(VIEWPORT.width / 2, -VIEWPORT.height, VIEWPORT, REST);
  assert.equal(picked, null);
});

// A stool-sized 1 x 1 piece: 0.5 m of floor, 0.79 m tall (dalfred-stool's measured size).
const STOOL: PlaceableItemDef = { itemId: "stool", footprint: { w: 1, d: 1 }, allowedSurfaces: ["floor"] };
const STOOL_HEIGHT = 0.79;
const standing = (cell: { x: number; y: number }): GridPlacement => ({
  instanceId: `at-${cell.x}-${cell.y}`,
  itemId: "stool",
  variation: null,
  surface: { kind: "floor" },
  cell,
  rotSteps: 0,
});
// The screen point over a piece at a given fraction of its height — where a finger actually lands.
const pressAt = (cell: { x: number; y: number }, upFraction: number, angles = REST) => {
  const centre = floorCellToRoom(cell, { w: 1, d: 1 });
  const screen = roomPointToScreen(
    { ...centre, y: ROOM_SHELL.floor.y + STOOL_HEIGHT * upFraction },
    VIEWPORT,
    angles,
  );
  assert.ok(screen, "the press point projects behind the camera");
  return screen;
};

test("a press anywhere on a piece's BODY picks that piece, not the floor behind it", () => {
  // The whole bug: the ray through the visible model carries on and meets the floor one to three cells further back, so a floor-plane pick only ever answered for the piece's base sliver.
  const cell = { x: 4, y: 4 };
  const boxes = [floorPlacementBox(standing(cell), STOOL, STOOL_HEIGHT)];
  for (const angles of ANGLE_SAMPLES) {
    for (const up of [0.1, 0.5, 0.9, 1]) {
      const screen = pressAt(cell, up, angles);
      assert.equal(
        pickBoxAt(screen.x, screen.y, VIEWPORT, angles, boxes),
        0,
        `pressing ${up * 100}% up the model missed it`,
      );
    }
  }
  // And the floor-plane pick it replaces is demonstrably wrong at the same points — this is the regression, pinned so nobody "simplifies" the box test back into a plane test.
  const mid = pressAt(cell, 0.5);
  assert.notDeepEqual(screenPointToFloorCell(mid.x, mid.y, VIEWPORT, REST), cell);
});

test("the NEAREST piece under the finger wins", () => {
  // Two stools, one directly behind the other from the rest pose's camera. Pressing the front one's body must never reach through it to the piece behind.
  const front = { x: 5, y: 5 };
  const behind = { x: 4, y: 6 };
  const boxes = [
    floorPlacementBox(standing(behind), STOOL, STOOL_HEIGHT),
    floorPlacementBox(standing(front), STOOL, STOOL_HEIGHT),
  ];
  const screen = pressAt(front, 0.5);
  assert.equal(pickBoxAt(screen.x, screen.y, VIEWPORT, REST, boxes), 1);
});

test("pressing empty floor picks nothing", () => {
  const boxes = [floorPlacementBox(standing({ x: 0, y: 0 }), STOOL, STOOL_HEIGHT)];
  const screen = pressAt({ x: 6, y: 6 }, 0.5);
  assert.equal(pickBoxAt(screen.x, screen.y, VIEWPORT, REST, boxes), null);
});

test("the screen centre picks just off the open corner — and clamps back onto the grid", () => {
  // The camera aims at the room's AIR centre, so the ray through the screen centre overshoots the floor toward the diorama's open side and lands a few centimetres off-grid. That is correct behaviour: the drag pipeline runs every picked cell through clampToSurface, which is what this pins down.
  const picked = screenPointToFloorCell(VIEWPORT.width / 2, VIEWPORT.height / 2, VIEWPORT, REST);
  assert.ok(picked);
  // Off-grid, but only barely — a wildly wrong basis would land tens of cells away.
  assert.ok(picked.x >= -2 && picked.x <= FLOOR_CELLS.w + 1);
  assert.ok(picked.y >= -2 && picked.y <= FLOOR_CELLS.d + 1);
  const clamped = clampToSurface(picked, { kind: "floor" }, { w: 1, d: 1 });
  assert.ok(clamped.x >= 0 && clamped.x < FLOOR_CELLS.w);
  assert.ok(clamped.y >= 0 && clamped.y < FLOOR_CELLS.d);
});

// The four diagonal azimuths, and the pair of walls the camera sees at each. Every wall appears here twice — once as a hop SOURCE and once as a TARGET — which is what makes the eight ordered pairs below cover a hop FROM each of the four walls and ONTO each of the four walls.
const DIAGONALS: { theta: number; visible: [WallId, WallId] }[] = [
  { theta: Math.PI / 4, visible: ["x-min", "z-min"] },
  { theta: (3 * Math.PI) / 4, visible: ["x-min", "z-max"] },
  { theta: (5 * Math.PI) / 4, visible: ["x-max", "z-max"] },
  { theta: (7 * Math.PI) / 4, visible: ["x-max", "z-min"] },
];

// A screen point aimed at the middle of a wall's run, halfway up it — as unambiguously "on that wall" as a finger can be.
function aimAtWall(wall: WallId, theta: number) {
  const cell = { x: Math.floor(WALL_CELLS[wall].w / 2), y: Math.floor(WALL_CELLS[wall].h / 2) };
  const angles = { ...REST, theta };
  const screen = roomPointToScreen(wallCellToRoom(wall, cell, { w: 1, d: 1 }), VIEWPORT, angles);
  assert.ok(screen, `the middle of ${wall} projects behind the camera at theta ${theta}`);
  return { cell, angles, screen };
}

test("a wall ghost hops onto the wall the finger actually points at, from every one of the four walls", () => {
  // The regression: the hop target used to be hardcoded as `here === "z-max" ? "x-min" : "z-max"`, from when the shell had two walls. With four, an x-max or z-min ghost hopped to z-max no matter where the finger pointed, and a z-max ghost could only ever reach x-min.
  for (const { theta, visible } of DIAGONALS) {
    assert.deepEqual([...visibleWalls(theta)].sort(), [...visible].sort(), `theta ${theta} sees other walls`);
    for (const here of visible) {
      const target = visible.find((wall) => wall !== here)!;
      const { cell, angles, screen } = aimAtWall(target, theta);
      assert.deepEqual(
        dragWallTarget(here, screen.x, screen.y, VIEWPORT, angles),
        { wall: target, cell },
        `a ghost on ${here} failed to hop to ${target}`,
      );
    }
  }
});

test("a ghost never hops onto a wall the camera is standing outside of", () => {
  // Every wall plane is infinite, and the two culled walls are precisely the ones a forward ray crosses from outside — they answer a pick as happily as the visible ones. Hopping onto one would drop the piece behind the player's back.
  for (const { theta, visible } of DIAGONALS) {
    const angles = { ...REST, theta };
    const here = visible[0];
    for (let ix = 0; ix <= 48; ix += 1) {
      for (let iy = 0; iy <= 32; iy += 1) {
        const px = (ix / 48) * VIEWPORT.width;
        const py = (iy / 32) * VIEWPORT.height;
        const target = dragWallTarget(here, px, py, VIEWPORT, angles);
        if (!target || target.wall === here) continue;
        assert.ok(
          visibleWalls(theta).includes(target.wall),
          `hopped onto the culled ${target.wall} at ${px},${py}`,
        );
      }
    }
  }
});

test("the ghost stays loyal to its own wall while the finger is over its run, and crosses the corner once", () => {
  // Drag straight across the corner the camera faces. Loyalty is the whole hysteresis rule: while the finger is anywhere over the ghost's own run the answer must be that wall, even where the other visible wall is the one square-on to the camera. A nearest-plane pick strobes here instead.
  for (const { theta, visible } of DIAGONALS) {
    for (const here of visible) {
      const angles = { ...REST, theta };
      let previous: WallId | null = null;
      let crossings = 0;
      const seen = new Set<WallId>();
      for (let i = 0; i <= 600; i += 1) {
        const px = (i / 600) * VIEWPORT.width;
        const py = VIEWPORT.height * 0.4;
        const target = dragWallTarget(here, px, py, VIEWPORT, angles);
        if (!target) continue;
        const own = screenPointToWallCell(px, py, VIEWPORT, angles, here);
        if (own && own.x >= 0 && own.x < WALL_CELLS[here].w) {
          assert.equal(target.wall, here, `abandoned ${here} at ${px.toFixed(0)},${py} (theta ${theta})`);
        }
        if (previous && target.wall !== previous) crossings += 1;
        previous = target.wall;
        seen.add(target.wall);
      }
      assert.equal(seen.size, 2, `the sweep never left ${here} at theta ${theta}`);
      assert.equal(crossings, 1, `the ghost flickered between walls at theta ${theta}`);
    }
  }
});

// pointsAtSurface is the drag layer's OWNERSHIP question: while a ghost is up, does this finger belong to the piece or to the camera? The rule it encodes is "point where the piece can actually go and you move it; anywhere else you move the view", so the tests below are exactly the four answers that rule has to give — own surface yes, other surface no, backdrop no.
const FLOOR = { kind: "floor" } as const;

test("a floor ghost owns the floor", () => {
  for (const angles of ANGLE_SAMPLES) {
    for (const cell of [{ x: 0, y: 0 }, { x: 8, y: 8 }, { x: 5, y: 4 }]) {
      const screen = roomPointToScreen(floorCellToRoom(cell, { w: 1, d: 1 }), VIEWPORT, angles);
      assert.ok(screen);
      assert.equal(
        pointsAtSurface(screen.x, screen.y, VIEWPORT, angles, FLOOR),
        true,
        `cell ${cell.x},${cell.y} did not read as floor`,
      );
    }
  }
});

test("a floor ghost does NOT own the walls or the backdrop — that is where the camera takes over", () => {
  // The whole point of the split: a drag that starts off the floor has to orbit instead of teleporting the piece to whatever the floor plane says is behind the wall.
  for (const { theta, visible } of DIAGONALS) {
    for (const wall of visible) {
      const { angles, screen } = aimAtWall(wall, theta);
      assert.equal(
        pointsAtSurface(screen.x, screen.y, VIEWPORT, angles, FLOOR),
        false,
        `the middle of ${wall} read as floor at theta ${theta}`,
      );
    }
  }
  assert.equal(pointsAtSurface(VIEWPORT.width / 2, -VIEWPORT.height, VIEWPORT, REST, FLOOR), false);
});

test("a wall ghost owns every wall the camera can see, including the one it may hop to", () => {
  // Ownership is asked at touch-down, before any hop has happened, so a drag aimed at the OTHER visible wall must belong to the piece too — that is how a window gets carried round a corner.
  for (const { theta, visible } of DIAGONALS) {
    for (const here of visible) {
      for (const aimed of visible) {
        const { angles, screen } = aimAtWall(aimed, theta);
        assert.equal(
          pointsAtSurface(screen.x, screen.y, VIEWPORT, angles, { kind: "wall", wall: here }),
          true,
          `a ghost on ${here} disowned a finger on ${aimed}`,
        );
      }
    }
  }
});

test("a wall ghost owns neither the floor nor the sky above the cornice", () => {
  for (const { theta, visible } of DIAGONALS) {
    const angles = { ...REST, theta };
    const surface = { kind: "wall", wall: visible[0] } as const;
    const screen = roomPointToScreen(floorCellToRoom({ x: 4, y: 4 }, { w: 1, d: 1 }), VIEWPORT, angles);
    assert.ok(screen);
    assert.equal(
      pointsAtSurface(screen.x, screen.y, VIEWPORT, angles, surface),
      false,
      `the middle of the floor read as ${surface.wall} at theta ${theta}`,
    );
    assert.equal(pointsAtSurface(VIEWPORT.width / 2, -VIEWPORT.height, VIEWPORT, angles, surface), false);
  }
});

const stackDesk: PlaceableItemDef = { itemId: "desk", footprint: { w: 4, d: 2 }, allowedSurfaces: ["floor"], hostsTop: true };

test("a top-plane pick round-trips through the screen at each host rotation", () => {
  for (const rotSteps of [0, 1, 2, 3] as const) {
    const host = {
      placement: { instanceId: "d1", itemId: "desk", variation: null, surface: { kind: "floor" as const }, cell: { x: 6, y: 6 }, rotSteps },
      def: stackDesk,
    };
    const target = { host, topHeight: 0.7 };
    const centre = topCellToRoom(host, { x: 1, y: 1 }, { w: 1, d: 1 }, 0.7);
    const screen = roomPointToScreen(centre, VIEWPORT, REST)!;
    assert.deepEqual(screenPointToTopCell(screen.x, screen.y, VIEWPORT, REST, target), { x: 1, y: 1 }, `rot ${rotSteps}`);
  }
});

test("dragTopTarget prefers the current host, else the first hit, else null", () => {
  const mk = (id: string, cell: { x: number; y: number }) => ({
    host: { placement: { instanceId: id, itemId: "desk", variation: null, surface: { kind: "floor" as const }, cell, rotSteps: 0 as const }, def: stackDesk },
    topHeight: 0.7,
  });
  const a = mk("a", { x: 2, y: 2 });
  const b = mk("b", { x: 12, y: 12 });
  const overA = roomPointToScreen(topCellToRoom(a.host, { x: 1, y: 0 }, { w: 1, d: 1 }, 0.7), VIEWPORT, REST)!;
  const hit = dragTopTarget(null, overA.x, overA.y, VIEWPORT, REST, [a, b]);
  assert.equal(hit?.hostInstanceId, "a");
  // Pointing at open floor clear of both desks: no target.
  const openFloor = roomPointToScreen({ x: ROOM_SHELL.floor.minX + 0.125, y: ROOM_SHELL.floor.y, z: ROOM_SHELL.floor.maxZ - 0.125 }, VIEWPORT, REST)!;
  assert.equal(dragTopTarget("a", openFloor.x, openFloor.y, VIEWPORT, REST, [a, b]), null);
});
