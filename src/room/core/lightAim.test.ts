import assert from "node:assert/strict";
import test from "node:test";

import { AIM_DOWN, aimToDirection } from "./lightAim";

// THE CROSS-REPO FIXTURE. These pairs are copied verbatim from the convention block in supabase/migrations/014_light_aim.sql, and the workshop portal carries the same table. They are the only thing standing between the two repos and a silent convention mismatch — if either side flips a sign, its own copy of this test fails immediately rather than every lamp shipping aimed backwards.
//
// DO NOT "simplify" these by deriving the expected vectors from the same trig the implementation uses.
// A test that recomputes the thing it is checking passes for any convention, including the wrong one;
// the literal numbers ARE the specification.
const FIXTURE: { pitch: number; yaw: number; expect: [number, number, number]; what: string }[] = [
  { pitch: 0, yaw: 0, expect: [0, -1, 0], what: "straight down" },
  { pitch: 90, yaw: 0, expect: [0, 0, -1], what: "horizontal, the model's own forward" },
  { pitch: 90, yaw: 90, expect: [1, 0, 0], what: "horizontal, a quarter turn toward +X" },
  { pitch: 90, yaw: 180, expect: [0, 0, 1], what: "horizontal, backwards" },
  { pitch: 90, yaw: 270, expect: [-1, 0, 0], what: "horizontal, toward -X" },
  { pitch: 180, yaw: 0, expect: [0, 1, 0], what: "straight up, an uplighter" },
  { pitch: 45, yaw: 0, expect: [0, -0.7071, -0.7071], what: "tilted forward and down" },
];

test("the aim convention matches migration 014 exactly", () => {
  for (const { pitch, yaw, expect, what } of FIXTURE) {
    const d = aimToDirection(pitch, yaw);
    for (const [axis, value] of [["x", d.x], ["y", d.y], ["z", d.z]] as const) {
      const index = axis === "x" ? 0 : axis === "y" ? 1 : 2;
      assert.ok(
        Math.abs(value - expect[index]) < 1e-4,
        `pitch ${pitch} yaw ${yaw} (${what}): ${axis} was ${value.toFixed(4)}, convention says ${expect[index]}`,
      );
    }
  }
});

// Coverage, which is the question the representation had to answer before it was chosen: two angles have to reach every direction on the sphere, or some lamp is unaimable.
test("pitch and yaw together reach every direction, and always as a unit vector", () => {
  for (let pitch = 0; pitch <= 180; pitch += 15) {
    for (let yaw = 0; yaw < 360; yaw += 15) {
      const d = aimToDirection(pitch, yaw);
      const length = Math.hypot(d.x, d.y, d.z);
      assert.ok(Math.abs(length - 1) < 1e-9, `pitch ${pitch} yaw ${yaw} produced a non-unit vector (${length})`);
    }
  }
});

test("the poles are degenerate in yaw, which is why yaw is meaningless there", () => {
  // Not a defect — it is why the portal should grey the yaw control out at pitch 0 and 180.
  for (const yaw of [0, 90, 180, 270]) {
    assert.deepEqual(aimToDirection(0, yaw).y, -1);
    assert.ok(Math.abs(aimToDirection(0, yaw).x) < 1e-9);
    assert.ok(Math.abs(aimToDirection(180, yaw).y - 1) < 1e-9);
  }
});

test("yaw wraps rather than being rejected, because 360 and 0 are the same aim", () => {
  const at0 = aimToDirection(90, 0);
  for (const equivalent of [360, 720, -360]) {
    const d = aimToDirection(90, equivalent);
    assert.ok(Math.abs(d.x - at0.x) < 1e-9 && Math.abs(d.z - at0.z) < 1e-9, `yaw ${equivalent} should equal yaw 0`);
  }
});

// A point light stores NULL for both angles (item_lights constrains it), and the catalog is a network fetch — a stale cache or a hand-edited row must not take the room down. A lamp aimed the wrong way is a bug someone reports; a crash on entering the room is not.
test("missing or nonsense angles fall back to straight down rather than throwing", () => {
  assert.deepEqual(aimToDirection(null, null), AIM_DOWN);
  assert.deepEqual(aimToDirection(45, null), AIM_DOWN);
  assert.deepEqual(aimToDirection(null, 45), AIM_DOWN);
  assert.deepEqual(aimToDirection(Number.NaN, 0), AIM_DOWN);
  // Outside the range migration 014 constrains pitch to.
  assert.deepEqual(aimToDirection(-10, 0), AIM_DOWN);
  assert.deepEqual(aimToDirection(200, 0), AIM_DOWN);
});
