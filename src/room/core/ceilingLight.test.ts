import assert from "node:assert/strict";
import test from "node:test";

import {
  CEILING_LIGHT_AT,
  CEILING_LIGHT_DROP,
  CEILING_LIGHT_RIG,
  FLOOR_CORNER_DISTANCE,
  FLOOR_HALF_WIDTH,
  ceilingCone,
  fillLumens,
  poolRadius,
} from "./ceilingLight";
import { ROOM_SHELL } from "./roomShell";

test("the fitting hangs at the centre of the room, inside it", () => {
  assert.equal(CEILING_LIGHT_AT.x, (ROOM_SHELL.floor.minX + ROOM_SHELL.floor.maxX) / 2);
  assert.equal(CEILING_LIGHT_AT.z, (ROOM_SHELL.floor.minZ + ROOM_SHELL.floor.maxZ) / 2);
  // Below the wall band's top, or the source is buried in the ceiling slab and lights nothing.
  assert.ok(CEILING_LIGHT_AT.y < ROOM_SHELL.walls["x-min"].top);
  assert.ok(CEILING_LIGHT_DROP > 2.5 && CEILING_LIGHT_DROP < 3, `drop of ${CEILING_LIGHT_DROP} m is not a ceiling`);
});

// THE invariant of this module, and the one most likely to be "helpfully" widened away later. With no visible fixture — the camera sits above the ceiling plane, so a fitting can never be drawn — the ONLY cue that a bulb hangs overhead is the shape of the falloff. A cone that reaches the corners has no shape, which is exactly the flat point light this rig replaced.
test("the key cone covers the usable floor but leaves the corners to the fill", () => {
  const outer = poolRadius(CEILING_LIGHT_RIG.outerDeg);
  assert.ok(
    outer > FLOOR_HALF_WIDTH,
    `outer cone reaches ${outer.toFixed(2)} m but the wall is ${FLOOR_HALF_WIDTH.toFixed(2)} m out — the pool must cover the usable floor`,
  );
  assert.ok(
    outer < FLOOR_CORNER_DISTANCE,
    `outer cone reaches ${outer.toFixed(2)} m and the corner is ${FLOOR_CORNER_DISTANCE.toFixed(2)} m out — a cone that reaches the corners is the flat light this rig exists to replace`,
  );
});

test("the cone is soft-edged and expressed the way Filament wants it", () => {
  const [inner, outer] = ceilingCone();
  // Half-angles in RADIANS, ascending. NOT the form item_lights.cone_deg uses for bought lamps, which stores the full outer angle in degrees and is halved by RoomLit on the way in.
  assert.ok(inner < outer, "inner must be inside outer");
  assert.ok(outer < Math.PI / 2, "a half-angle at or past 90 degrees is a hemisphere, i.e. a point light with extra steps");
  assert.equal(inner, outer * CEILING_LIGHT_RIG.innerRatio);
  // A hard edge on the floor reads as a projector, not a lamp — the same 70% rule RoomLit applies to bought lamps.
  assert.equal(CEILING_LIGHT_RIG.innerRatio, 0.7);
});

test("the fill is a fill and not a second key", () => {
  assert.ok(CEILING_LIGHT_RIG.fillRatio > 0, "a fill at zero leaves the corners black in a room players arrange furniture in");
  assert.ok(CEILING_LIGHT_RIG.fillRatio < 1, "a fill at or above the key is not a fill");
  assert.equal(fillLumens(100_000), 100_000 * CEILING_LIGHT_RIG.fillRatio);
  // The fill must never out-reach LESS far than the key: the corners are outside the key's CONE, so the fill is the only light on them, and the key is bounded by its cone rather than by its radius. Equal radii are fine and are what both currently use.
  assert.ok(CEILING_LIGHT_RIG.fillReachMetres >= CEILING_LIGHT_RIG.keyReachMetres);
  assert.ok(
    CEILING_LIGHT_RIG.fillReachMetres > FLOOR_CORNER_DISTANCE,
    "the fill must actually reach the corners it exists to light",
  );
});

// Filament attenuates by (1 - (d/r)^4)^2 on top of inverse-square, which is already down to ~15% at d/r = 0.89 — so a falloff radius chosen as "just past the farthest thing to light" darkens everything near the edge. Setting the key's radius to 4.5 m against a 3.99 m beam did exactly that and blacked out the outer pool on the first device check. Both radii must keep the room's far corner well inside the window, not near its lip.
test("both falloff radii keep the room inside the window, not on its lip", () => {
  const slantToCorner = Math.hypot(FLOOR_CORNER_DISTANCE, CEILING_LIGHT_DROP);
  for (const [name, reach] of [
    ["key", CEILING_LIGHT_RIG.keyReachMetres],
    ["fill", CEILING_LIGHT_RIG.fillReachMetres],
  ] as const) {
    const window = (1 - (slantToCorner / reach) ** 4) ** 2;
    assert.ok(
      window > 0.4,
      `${name}: at reach ${reach} m the window leaves ${(window * 100).toFixed(0)}% of the light at the far corner — set the radius by where the light must still be BRIGHT, not by where it stops`,
    );
  }
});
