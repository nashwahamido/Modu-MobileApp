// The drag plane's contract is stated in SCREEN pixels, because that is where the bug lived: a
// finger on a tray card picked a world point the projection then put 70-260 px away from that
// finger. So every test here picks a point and projects it back with the app's own projector
// (scene/projectToScreen), rather than checking world coordinates that look plausible.
import assert from "node:assert/strict";
import { test } from "node:test";

import { screenRay } from "@/src/game/core/geometry/math";
import { FOV_Y_DEG } from "@/src/game/scene/cameraConfig";
import { projectToScreen } from "@/src/game/scene/projectToScreen";
import type { Vec3 } from "@/src/game/core/type";
import { dragPlanePoint, LEASH_FACTOR } from "./dragPlane";

// Landscape, the only orientation the game runs in (app.json).
const W = 844;
const H = 390;
// The parts tray is a column on the RIGHT edge: right 14, width 86 (ui/hud/PartsTray), so cards sit
// around x = 787, from y = 74 at the top of the column to y = 320 at the bottom.
const TRAY_X = 787;
const CARD_YS = [74, 120, 180, 240, 320];

/** The build camera: orbit home eye, aimed at an assembly centred near the bench origin. */
function camera(scale = 1, eyeY = 0.85 * scale) {
  const eye: Vec3 = [1.0 * scale, eyeY, 1.0 * scale];
  const center: Vec3 = [0, 0.1, 0];
  return { eye, center, up: [0, 1, 0] as Vec3 };
}

function missPx(look: ReturnType<typeof camera>, x: number, y: number, planeY: number) {
  const p = dragPlanePoint(look, FOV_Y_DEG, W, H, x, y, planeY);
  const sp = projectToScreen([look.eye, look.center, look.up], p, W, H);
  assert.ok(sp, "the picked point must be in front of the camera");
  return Math.hypot(sp.x - x, sp.y - y);
}

test("a part picked up anywhere in the tray column lands under the finger, at every zoom", () => {
  for (const scale of [0.7, 1.0, 1.4]) {
    for (const y of CARD_YS) {
      const miss = missPx(camera(scale), TRAY_X, y, 0.16);
      // The old fixed 0.9 m clamp missed by 69-262 px here, which is the reported "the part starts
      // far away from my finger".
      assert.ok(miss < 1, `zoom ${scale}, card y ${y}: missed by ${miss.toFixed(1)} px`);
    }
  }
});

test("dragging inward from the tray never jumps: the part keeps pace with the finger", () => {
  const look = camera();
  const at = (x: number) => {
    const p = dragPlanePoint(look, FOV_Y_DEG, W, H, x, 200, 0.16);
    return projectToScreen([look.eye, look.center, look.up], p, W, H)!;
  };
  // Screen-space gain: px the part travels per px of finger. The old clamp pinned the part on its
  // circle (gain 0) while the finger crossed 100+ px, then released it to 1:1 in a single frame.
  let prev: number | null = null;
  for (let x = 830; x >= 400; x -= 2) {
    const a = at(x);
    const b = at(x - 2);
    const gain = Math.hypot(a.x - b.x, a.y - b.y) / 2;
    assert.ok(gain > 0.9 && gain < 1.1, `gain ${gain.toFixed(2)} at x ${x}`);
    if (prev !== null) {
      assert.ok(Math.abs(gain - prev) < 0.1, `gain stepped ${prev.toFixed(2)} -> ${gain.toFixed(2)} at x ${x}`);
    }
    prev = gain;
  }
});

test("crossing the horizon moves the part by nothing", () => {
  // Camera orbited down to eye level, with the work plane just ABOVE the eye: rays below the horizon
  // never meet it, which is the case that used to spawn the part at its socket.
  const look = { eye: [1.05, 0.22, 1.05] as Vec3, center: [0, 0.3, 0] as Vec3, up: [0, 1, 0] as Vec3 };
  const planeY = 0.3;
  const meetsPlane = (y: number) => {
    const { eye, dir } = screenRay(look, FOV_Y_DEG, W, H, TRAY_X, y);
    const t = (planeY - eye[1]) / dir[1];
    return Number.isFinite(t) && t > 0;
  };
  // Walk down the tray column to the exact pixel where the aim stops meeting the plane. Only the
  // crossing is worth measuring in METRES: everywhere the ray still lands, the mapping is exact in
  // screen space, and a few px of finger legitimately covering many metres of plane IS that
  // exactness near the horizon.
  const STEP = 0.05;
  let y = 200;
  assert.ok(meetsPlane(y), "the sweep must start on the side that still meets the plane");
  while (y < 300 && meetsPlane(y + STEP)) y += STEP;
  assert.ok(y < 299, "the sweep never reached the horizon");
  const before = dragPlanePoint(look, FOV_Y_DEG, W, H, TRAY_X, y, planeY);
  const after = dragPlanePoint(look, FOV_Y_DEG, W, H, TRAY_X, y + STEP, planeY);
  const step = Math.hypot(after[0] - before[0], after[2] - before[2]);
  // The old miss teleported it ~3.7 m, to the socket.
  assert.ok(step < 0.02, `crossing the horizon moved the part ${step.toFixed(3)} m`);
});

test("the leash still catches a runaway aim, at a radius that scales with the camera", () => {
  for (const scale of [0.7, 1.0, 1.4]) {
    const look = camera(scale);
    const dist = Math.hypot(
      look.center[0] - look.eye[0],
      look.center[1] - look.eye[1],
      look.center[2] - look.eye[2],
    );
    // Straight at the horizon: no finite intersection worth having.
    const p = dragPlanePoint(look, FOV_Y_DEG, W, H, W / 2, 0, 0.16);
    const r = Math.hypot(p[0], p[2]);
    assert.ok(
      Math.abs(r - LEASH_FACTOR * dist) < 1e-6,
      `zoom ${scale}: leashed to ${r.toFixed(2)} m, expected ${(LEASH_FACTOR * dist).toFixed(2)} m`,
    );
    assert.equal(p[1], 0.16, "a leashed point still belongs to the work plane");
  }
});
