// The drag plane's contract is stated in SCREEN pixels, because that is where the bug lived: a
// finger on a tray card picked a world point the projection then put 70-260 px away from that
// finger. So every test here picks a point and projects it back with the app's own projector
// (scene/projectToScreen), rather than checking world coordinates that look plausible.
import assert from "node:assert/strict";
import { test } from "node:test";

import { quatConjugate, quatMultiply, quatRotateVec3, quatSlerp, screenRay } from "@/src/game/core/geometry/math";
import { FOV_Y_DEG } from "@/src/game/scene/cameraConfig";
import { projectToScreen } from "@/src/game/scene/projectToScreen";
import type { Vec3 } from "@/src/game/core/type";
import { AIM_BAND_MAX_PX, aimBandScale, CARRY_CLEARANCE_ENABLED, CARRY_NEAR_MARGIN_M, clusterCarryAnchor, holdReachFrom, dragPlanePoint, dragRayPoint, DRIFT_CAP_FACTOR, RAY_CARRY_MIN_FRACTION, RAY_CARRY_MIN_M, burialDepthM, ghostSamplePoints, rayBoxEntryT, rayPointNearest, sightlineGapM, VIS_GAP_SLACK_M, segmentHitsBox, segmentInFrame } from "./dragPlane";
import { MIN_ORBIT_DISTANCE_M } from "@/src/game/scene/cameraConfig";

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

/** Distance along the VIEW AXIS, which is the quantity the carry has to hold steady — not distance from the eye, which legitimately grows toward the screen corners on a fixed-depth plane. */
function axialDepth(look: { eye: Vec3; center: Vec3 }, p: readonly number[]): number {
  const f: Vec3 = [look.center[0] - look.eye[0], look.center[1] - look.eye[1], look.center[2] - look.eye[2]];
  const fl = Math.hypot(f[0], f[1], f[2]) || 1;
  return ((p[0] - look.eye[0]) * f[0] + (p[1] - look.eye[1]) * f[1] + (p[2] - look.eye[2]) * f[2]) / fl;
}

/** Camera-to-pivot distance — the carry's reference depth. */
function pivotDist(look: { eye: Vec3; center: Vec3 }): number {
  return Math.hypot(look.center[0] - look.eye[0], look.center[1] - look.eye[1], look.center[2] - look.eye[2]);
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

test("a runaway aim is capped at assembly depth, still exactly under the finger", () => {
  for (const scale of [0.7, 1.0, 1.4]) {
    const look = camera(scale);
    const dist = Math.hypot(
      look.center[0] - look.eye[0],
      look.center[1] - look.eye[1],
      look.center[2] - look.eye[2],
    );
    // Straight at the horizon: the plane's answer diverges, so the cap owns the depth. Both leash
    // branches are on the TRUE ray now, so under-the-finger holds with no horizon exception.
    const p = dragPlanePoint(look, FOV_Y_DEG, W, H, W / 2, 0, 0.16);
    const depth = Math.hypot(p[0] - look.eye[0], p[1] - look.eye[1], p[2] - look.eye[2]);
    assert.ok(
      depth <= DRIFT_CAP_FACTOR * dist + 1e-6,
      `zoom ${scale}: runaway rode ${depth.toFixed(2)} m out, cap is ${(DRIFT_CAP_FACTOR * dist).toFixed(2)} m`,
    );
    assert.ok(depth > 0.2 * dist, `zoom ${scale}: capped point collapsed toward the eye`);
    const sp = projectToScreen([look.eye, look.center, look.up], p, W, H);
    assert.ok(sp, "the capped point must stay in front of the camera");
    assert.ok(
      Math.hypot(sp.x - W / 2, sp.y - 0) < 1,
      `zoom ${scale}: capped point left the finger by ${Math.hypot(sp.x - W / 2, sp.y).toFixed(1)} px`,
    );
  }
});

test("underside camera: aiming below an overhead plane holds the part under the finger at assembly depth", () => {
  // The probe-log regime, reproduced: zoomed to the floor with the eye BELOW the 0.56 m screw
  // plane, finger aimed downward — no forward intersection exists. The horizon-limit convention
  // parked the part at the leash radius at plane height, tracking azimuth but not height
  // (f=(436,291) part=(436,136) in the log). The cap must keep it under the finger instead, at a
  // depth in the assembly's neighbourhood.
  const look = { eye: [0.45, 0.38, 0.45] as Vec3, center: [0, 0.29, 0] as Vec3, up: [0, 1, 0] as Vec3 };
  const planeY = 0.56;
  const dist = Math.hypot(look.eye[0], look.eye[1] - 0.29, look.eye[2]);
  for (let y = 200; y <= 380; y += 30) {
    const { eye, dir } = screenRay(look, FOV_Y_DEG, W, H, 420, y);
    assert.ok((planeY - eye[1]) / dir[1] <= 0, `finger y ${y} unexpectedly still meets the plane`);
    const miss = missPx(look, 420, y, planeY);
    assert.ok(miss < 1, `finger y ${y}: part left the finger by ${miss.toFixed(1)} px`);
    const p = dragPlanePoint(look, FOV_Y_DEG, W, H, 420, y, planeY);
    const depth = Math.hypot(p[0] - look.eye[0], p[1] - look.eye[1], p[2] - look.eye[2]);
    assert.ok(
      depth <= DRIFT_CAP_FACTOR * dist + 1e-6,
      `finger y ${y}: part rode ${depth.toFixed(2)} m out, past the ${(DRIFT_CAP_FACTOR * dist).toFixed(2)} m cap`,
    );
  }
});

test("a vertically-parking cluster gets a camera-plane anchor at its park pose; horizontal parks stay on the glide", () => {
  // DALFRED's seat: centroid up at the stool top, park straight up 0.15 — the case a level orbit sees edge-on.
  assert.deepEqual(
    clusterCarryAnchor([0.1, 0.5, -0.2], [0, 0.15, 0]),
    [0.1, 0.65, -0.2],
  );
  // A dominantly-vertical park with a little lateral drift still counts (matches the part rule's 0.7 axis share).
  assert.ok(clusterCarryAnchor([0, 0.5, 0], [0.05, 0.15, 0]));
  // EKET's drawers park OUT the front, in-plane: the horizontal glide already tracks the finger there.
  assert.equal(clusterCarryAnchor([0, 0.3, 0], [0.16, 0, 0]), null);
  // The seed cluster has no park offset at all: it anchors on its own seat, because its glide plane holds the target and a level orbit grazes it there.
  assert.deepEqual(clusterCarryAnchor([0, 0.3, 0], [0, 0, 0]), [0, 0.3, 0]);
});

test("a leashed point still projects under the finger (the on-ray invariant)", () => {
  // Deep zoom-in over a HIGH work plane: eye 0.05 m above it, so most rays land far beyond the
  // leash. The old radial leash pulled those points sideways toward the bench axis — 100+ px from
  // the finger, the "part sits far away and stops responding" report. On-ray leashing must keep
  // every reachable point exactly under the finger, leashed or not.
  const look = { eye: [0.5, 0.55, 0.5] as Vec3, center: [0, 0.29, 0] as Vec3, up: [0, 1, 0] as Vec3 };
  const planeY = 0.5;
  for (let y = 40; y <= 360; y += 20) {
    for (const x of [140, W / 2, TRAY_X]) {
      const { eye, dir } = screenRay(look, FOV_Y_DEG, W, H, x, y);
      const t = (planeY - eye[1]) / dir[1];
      if (!Number.isFinite(t) || t <= 0) continue; // horizon-limit rows keep their own convention
      const p = dragPlanePoint(look, FOV_Y_DEG, W, H, x, y, planeY);
      const sp = projectToScreen([look.eye, look.center, look.up], p, W, H);
      assert.ok(sp, `(${x},${y}): leashed point fell behind the camera`);
      const miss = Math.hypot(sp.x - x, sp.y - y);
      assert.ok(miss < 1, `(${x},${y}): leashed point missed the finger by ${miss.toFixed(1)} px`);
    }
  }
});

test("socket-depth policy: at grazing incidence, pixel error costs centimetres, not metres", () => {
  const look = { eye: [0.7, 0.62, 0.7] as Vec3, center: [0, 0.29, 0] as Vec3, up: [0, 1, 0] as Vec3 };
  const socket: Vec3 = [0, 0.5, 0];
  const sp = projectToScreen([look.eye, look.center, look.up], socket, W, H)!;
  // A thumb 4 px above the socket's own pixel — inside anyone's tremor.
  const fy = sp.y - 4;
  const pPlane = dragPlanePoint(look, FOV_Y_DEG, W, H, sp.x, fy, socket[1]);
  const planeMiss = Math.hypot(pPlane[0] - socket[0], pPlane[1] - socket[1], pPlane[2] - socket[2]);
  const { eye, dir } = screenRay(look, FOV_Y_DEG, W, H, sp.x, fy);
  const q = rayPointNearest(eye, dir, socket);
  const rayMiss = Math.hypot(q[0] - socket[0], q[1] - socket[1], q[2] - socket[2]);
  // The contract is the AMPLIFICATION, not an absolute: the grazing plane turns aim error into
  // 1/incidence times as much world error (5x+ here), while the ray point keeps it at face value.
  assert.ok(planeMiss > 5 * rayMiss, `plane ${planeMiss.toFixed(3)} m vs ray ${rayMiss.toFixed(3)} m: amplification collapsed`);
  assert.ok(rayMiss < 0.02, `socket-depth point should stay within the aim error, missed by ${rayMiss.toFixed(3)} m`);
});

test("rayPointNearest basics: exact on-ray hit, perpendicular foot, never behind the eye", () => {
  const eye: Vec3 = [0, 1, 0];
  const dir: Vec3 = [0, 0, -2];
  assert.deepEqual(rayPointNearest(eye, dir, [0, 1, -3]), [0, 1, -3]);
  assert.deepEqual(rayPointNearest(eye, dir, [0.4, 1.2, -3]), [0, 1, -3]);
  assert.deepEqual(rayPointNearest(eye, dir, [0, 1, 5]), [0, 1, 0]);
});

test("aim bands are capped in pixels: zoomed in they shrink, at normal range they are untouched", () => {
  const APPROACH = 0.3;
  // Normal build camera: a socket ~1.6 m out, ~0.0035 m/px — the 0.3 m approach spans ~86 px, under the cap.
  assert.equal(aimBandScale(0.0035, APPROACH), 1);
  // Zoomed to the floor: socket ~0.3 m out, ~0.00066 m/px — uncapped the approach would span ~455 px.
  const k = aimBandScale(0.00066, APPROACH);
  assert.ok(k < 1, "close-up bands must shrink");
  const px = (APPROACH * k) / 0.00066;
  assert.ok(Math.abs(px - AIM_BAND_MAX_PX) < 1e-6, `capped approach spans ${px.toFixed(0)} px, expected ${AIM_BAND_MAX_PX}`);
  // Degenerate meters-per-pixel never produces a zero/negative band.
  assert.ok(aimBandScale(0, APPROACH) > 0);
});

test("segmentInFrame: on-screen and margin cases", () => {
  // Fully on-screen segment.
  assert.equal(segmentInFrame(100, 100, 200, 120, W, H, 0), true);
  // The measured invisible-socket case: seat at y=-88, park nearby — off-frame at margin 0, still held at the release margin.
  assert.equal(segmentInFrame(385, -88, 400, -70, W, H, 0), false);
  assert.equal(segmentInFrame(385, -88, 400, -70, W, H, 96), true);
  // One endpoint off, one on: visible.
  assert.equal(segmentInFrame(-40, 200, 60, 210, W, H, 0), true);
  // Long segment crossing the screen with both endpoints off: midpoint saves it.
  assert.equal(segmentInFrame(-200, 195, 1100, 195, W, H, 0), true);
});

test("drag-no-plane: the ray point rides under the finger, just in front of the model", () => {
  const R = 0.35;
  for (const scale of [0.7, 1.0, 1.4]) {
    const look = camera(scale);
    for (const [x, y] of [[TRAY_X, 74], [W / 2, 195], [140, 330], [W / 2, 0]]) {
      const p = dragRayPoint(look, FOV_Y_DEG, W, H, x, y, R);
      const sp = projectToScreen([look.eye, look.center, look.up], p, W, H);
      assert.ok(sp, `(${x},${y}) zoom ${scale}: point fell behind the camera`);
      const miss = Math.hypot(sp.x - x, sp.y - y);
      assert.ok(miss < 1, `(${x},${y}) zoom ${scale}: missed the finger by ${miss.toFixed(1)} px`);
      // AXIAL depth = the pivot's distance minus the model radius, floored. Stated on the view axis rather than as distance-from-eye: on a fixed-depth plane the distance to a corner is legitimately larger, and it was exactly that conflation that let the old formula drift.
      const D = pivotDist(look);
      const want = Math.max(RAY_CARRY_MIN_M, D * RAY_CARRY_MIN_FRACTION, D - R);
      const got = axialDepth(look, p);
      assert.ok(Math.abs(got - want) < 1e-9, `(${x},${y}) zoom ${scale}: depth ${got.toFixed(3)} != ${want.toFixed(3)}`);
    }
  }
});

test("holdReachFrom measures from the HOLD point, so an end-held part reads its full length", () => {
  // A LACK leg: 0.4 m tall, held at its top face by its joint anchor. The reach downward is the whole leg, and it is that asymmetry — not the box's own half-size — that decides how far the carry has to clear the lens.
  const box = { min: [0.224, 0, -0.273] as Vec3, max: [0.273, 0.4, -0.224] as Vec3 };
  const heldAtTop = holdReachFrom(box, [0.248, 0.4, -0.248]);
  assert.ok(Math.abs(heldAtTop - 0.4) < 0.005, `held at the top, reach should be the leg's length, got ${heldAtTop.toFixed(3)}`);
  const heldAtMiddle = holdReachFrom(box, [0.248, 0.2, -0.248]);
  assert.ok(heldAtMiddle < heldAtTop * 0.6, `held mid-shaft the reach should roughly halve, got ${heldAtMiddle.toFixed(3)}`);
  assert.equal(holdReachFrom(undefined, [0, 0, 0]), 0, "no box must leave the clearance floor inert");
});

test("drag-no-plane: the carry holds ONE depth across the whole screen", () => {
  // The reported bug: "when I drag the leg to the left or right side of the screen it becomes too close". screenRay's dir is deliberately NOT normalised (|dir| reaches 1.364 at the horizontal edge of an 844x390 landscape frame), and the old formula subtracted a METRE radius from a ray PARAMETER taken at the ray's closest approach to the pivot — so the carry depth collapsed toward the edges. Measured at bench range: 1.101 m at screen centre, 0.380 m at both edges, the same part nearly 3x closer for no reason the player asked for.
  const R = 0.5;
  for (const scale of [0.7, 1.0, 1.4]) {
    const look = camera(scale);
    const depths = [10, 120, 240, 422, 600, 720, 834].map((x) =>
      axialDepth(look, dragRayPoint(look, FOV_Y_DEG, W, H, x, H / 2, R)),
    );
    const spread = Math.max(...depths) - Math.min(...depths);
    assert.ok(spread < 1e-9, `zoom ${scale}: carry depth varies ${spread.toFixed(3)} m across the screen — ${depths.map((d) => d.toFixed(3)).join(", ")}`);
  }
});

test("drag-no-plane: at the zoom floor a long part is carried entirely in front of the lens", { skip: CARRY_CLEARANCE_ENABLED ? false : "clearance floor is switched off — flip CARRY_CLEARANCE_ENABLED to re-arm this guard" }, () => {
  // The zoomed-in report. MIN_ORBIT_DISTANCE_M is 0.65, and at that distance LACK's and DALFRED's assembly radius (~0.42 m) leaves pivot-minus-radius at 0.23 m while the zoom-scaled floor gives 0.29 m. But a leg now reaches 0.40-0.43 m from its hold point, because the joint anchor holds it at its TOP. Carrying at 0.29 m therefore put the foot end at NEGATIVE depth — measured -0.108 m on LACK and -0.134 m on DALFRED — sweeping the part through the camera's near plane, where projection inverts and the part reads as huge and moving wrongly. The carry has to clear the part it is carrying.
  const R = 0.42;
  const reach = 0.43;
  const look = { eye: [0.4, 0.45, 0.4] as Vec3, center: [0, 0.1, 0] as Vec3, up: [0, 1, 0] as Vec3 };
  assert.ok(Math.abs(pivotDist(look) - MIN_ORBIT_DISTANCE_M) < 0.03, `precondition: this camera should sit at the zoom floor, got ${pivotDist(look).toFixed(3)}`);
  for (const [x, y] of [[10, H / 2], [W / 2, H / 2], [834, H / 2], [W / 2, 20]]) {
    const p = dragRayPoint(look, FOV_Y_DEG, W, H, x, y, R, reach);
    const d = axialDepth(look, p);
    assert.ok(
      d >= reach + CARRY_NEAR_MARGIN_M - 1e-9,
      `(${x},${y}): carried at ${d.toFixed(3)} m with a part reaching ${reach} m — its far end sits at ${(d - reach).toFixed(3)} m, through the lens`,
    );
  }
});

test("drag-no-plane: a compact part is NOT pushed away by the long-part floor", () => {
  // The clearance floor must be the part's own reach, not a blanket minimum: BEKVAM's legs reach 0.089 m and EKET's drawer sides 0.133 m, and shoving those out to a leg's distance would shrink them on screen for nothing.
  const R = 0.42;
  const look = { eye: [0.4, 0.45, 0.4] as Vec3, center: [0, 0.1, 0] as Vec3, up: [0, 1, 0] as Vec3 };
  const D = pivotDist(look);
  const compact = axialDepth(look, dragRayPoint(look, FOV_Y_DEG, W, H, W / 2, H / 2, R, 0.09));
  assert.ok(Math.abs(compact - D * RAY_CARRY_MIN_FRACTION) < 1e-9, `a compact part should still take the zoom floor ${(D * RAY_CARRY_MIN_FRACTION).toFixed(3)}, got ${compact.toFixed(3)}`);
});

test("drag-no-plane: zoomed inside the model's radius, the carry scales with the camera instead of pinning to a fixed floor", () => {
  // DALFRED zoomed in: the pivot is ~0.53 m away while the assembly's bounding radius is 0.45 m, so the camera is INSIDE the bounding sphere and "just in front of the model" is unsatisfiable. The old absolute 12 cm floor then carried a 0.43 m leg 12 cm from the lens at every screen position — the second half of the "too close" report. A fraction of the pivot distance degrades gracefully instead, because it keeps shrinking with the zoom rather than hitting a wall.
  const R = 0.45;
  const look = camera(0.35);
  const D = pivotDist(look);
  assert.ok(D - R < D * RAY_CARRY_MIN_FRACTION, "precondition: this camera sits inside the model's bounding sphere");
  const got = axialDepth(look, dragRayPoint(look, FOV_Y_DEG, W, H, W / 2, H / 2, R));
  assert.ok(
    Math.abs(got - D * RAY_CARRY_MIN_FRACTION) < 1e-9,
    `expected the zoom-scaled floor ${(D * RAY_CARRY_MIN_FRACTION).toFixed(3)} m, got ${got.toFixed(3)} m`,
  );
  assert.ok(got > RAY_CARRY_MIN_M, `the zoom-scaled floor should clear the absolute backstop, got ${got.toFixed(3)} m`);
});

test("hold-point pinning: the slerp-rotated anchor keeps the joint where the drag put it", () => {
  // A leg-like part: anchor 0.43 m from the node origin, socket rotations 90 deg apart in yaw. The raw values are 3-decimal probe output, so normalize before treating them as unit quaternions.
  const unit = (q: [number, number, number, number]): [number, number, number, number] => {
    const l = Math.hypot(...q);
    return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
  };
  const a = unit([0, -0.799, 0.602, 0]);
  const b = unit([0.426, -0.565, 0.426, 0.565]);
  const anchor: Vec3 = [-0.012, 0.393, 0.166];
  // At t=0 the delta is identity: the compensated node position equals the classic subtraction.
  const d0 = quatRotateVec3(quatMultiply(quatSlerp(a, b, 0), quatConjugate(a)), anchor);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(d0[i] - anchor[i]) < 1e-6);
  // At every t the rotated anchor keeps its LENGTH — the joint pivots, never stretches — so node = hold - rotated keeps the hold point exactly.
  for (const t of [0.25, 0.5, 0.88, 1]) {
    const d = quatRotateVec3(quatMultiply(quatSlerp(a, b, t), quatConjugate(a)), anchor);
    assert.ok(
      Math.abs(Math.hypot(...d) - Math.hypot(...anchor)) < 1e-9,
      `t=${t}: anchor length drifted`,
    );
  }
  // And at t=1 the delta equals rotating by b then un-rotating by a applied to the anchor — a genuinely different vector (the visible turn).
  const d1 = quatRotateVec3(quatMultiply(b, quatConjugate(a)), anchor);
  assert.ok(Math.hypot(d1[0] - anchor[0], d1[1] - anchor[1], d1[2] - anchor[2]) > 0.1);
});

test("sightline gap replaces halo sampling for the under-rim leg socket: blocked from steep above, seen from below", () => {
  const plate = { min: [-0.16, 0.49, -0.16] as Vec3, max: [0.16, 0.55, 0.16] as Vec3, pid: "circleUpp" };
  const anchor: Vec3 = [0.13, 0.49, 0];
  const thr = burialDepthM(anchor, [plate]) + VIS_GAP_SLACK_M;
  // Steep above: the plate stands centimetres in front of the under-rim anchor.
  assert.ok(sightlineGapM([0, 1.6, 0.2], anchor, [plate]).gap > thr);
  // From below/side the anchor is the first thing the eye meets.
  assert.ok(sightlineGapM([0.5, 0.1, 0.3], anchor, [plate]).gap <= thr);
});

test("ghost body second chance: a leg hanging under a tabletop is seen from anywhere its seat is not", () => {
  // LACK, measured: the top is a 55cm slab at y 0.400–0.449 and a leg's seat is its own top face, at y=0.400 — ON the slab's underside plane, 26mm inside the footprint edge. Judged as a point, that seat exists only for an eye BELOW the plane (elevation ≤5° at a 1.2m orbit); one step up the gap is 27mm against a 6mm threshold, so there is no near-miss band to widen — the camera is either under the table or the socket is not there.
  const top = { min: [-0.275, 0.4, -0.275] as Vec3, max: [0.275, 0.449, 0.275] as Vec3, pid: "tableTop" };
  const seat: Vec3 = [0.2485, 0.4, -0.2485];
  const thr = burialDepthM(seat, [top]) + VIS_GAP_SLACK_M;
  assert.equal(burialDepthM(seat, [top]), 0, "the seat sits on the underside face, not inside the slab");
  const eyeAt = (elevDeg: number, r = 1.2): Vec3 => {
    const el = (elevDeg * Math.PI) / 180;
    // Out along the leg's own diagonal, the most favourable azimuth there is.
    return [r * Math.cos(el) * 0.7071, 0.224 + r * Math.sin(el), -r * Math.cos(el) * 0.7071];
  };
  assert.ok(sightlineGapM(eyeAt(3), seat, [top]).gap <= thr, "under the tabletop plane the seat is seen");
  assert.ok(sightlineGapM(eyeAt(20), seat, [top]).gap > thr, "a normal raised view is blocked by the top");
  // The GHOST is 40cm of leg standing at the delivered pose (45mm down the bolt's axis, where the release parks it). The player can see it from every ordinary angle, which is the whole claim: if you can see where the part goes, you can put it there.
  const leg = { min: [0.224, 0, -0.273] as Vec3, max: [0.273, 0.4, -0.224] as Vec3, pid: "leg_1" };
  const samples = ghostSamplePoints(leg, [0, -0.045, 0]);
  assert.equal(samples.length, 9, "centre plus eight corners");
  const seen = (elevDeg: number) =>
    samples.some((p) => sightlineGapM(eyeAt(elevDeg), p, [top]).gap <= VIS_GAP_SLACK_M);
  for (const elev of [20, 35, 60]) assert.ok(seen(elev), `the ghost must be visible at ${elev}°`);
  // Not a blank cheque: from nearly overhead the tabletop covers the leg's whole length and the gate still says turn the camera.
  assert.ok(!seen(85), "near-overhead must still be blocked");
  // Samples are pulled IN from the corners: a corner is the one place a box is guaranteed to be air, and a sample sitting in that air reports a part visible that isn't (the halo bug, in miniature).
  for (const p of samples) {
    assert.ok(p[1] > leg.min[1] - 0.045 + 1e-9 && p[1] < leg.max[1] - 0.045 - 1e-9, "no sample sits on the box face");
  }
});

test("sightline gap: one visibility rule for cam, countersunk screw, dowel bridge, and buried rod", () => {
  const panel = { min: [-0.3, 0.0, 0.35] as Vec3, max: [0.3, 0.6, 0.365] as Vec3, pid: "backPanel" };
  // Cam bored 4mm in from the panel's REAR face: visible from behind (gap == its burial), not through the panel from the front.
  const camAnchor: Vec3 = [0.2, 0.3, 0.361];
  const camThr = burialDepthM(camAnchor, [panel]) + VIS_GAP_SLACK_M;
  assert.ok(Math.abs(burialDepthM(camAnchor, [panel]) - 0.004) < 1e-9);
  assert.ok(sightlineGapM([0.2, 0.3, 1.0], camAnchor, [panel]).gap <= camThr, "rear view must pass");
  const front = sightlineGapM([0.2, 0.3, -0.6], camAnchor, [panel]);
  assert.ok(front.gap > camThr, "front view must fail");
  assert.equal(front.by, "backPanel");
  // Countersunk screw head flush ON a leg face: burial 0 — face-on passes with gap 0, the far side fails by the leg's thickness.
  const leg = { min: [0.0, 0.0, 0.0] as Vec3, max: [0.03, 0.4, 0.05] as Vec3, pid: "leg_1" };
  const screwAnchor: Vec3 = [0.03, 0.2, 0.025];
  assert.equal(burialDepthM(screwAnchor, [leg]), 0);
  assert.ok(sightlineGapM([0.5, 0.2, 0.025], screwAnchor, [leg]).gap <= VIS_GAP_SLACK_M);
  assert.ok(sightlineGapM([-0.5, 0.2, 0.025], screwAnchor, [leg]).gap > VIS_GAP_SLACK_M);
  // Bridge anchor at a dowel's centre: visible from the side (gap == radius == burial), blocked along the axis (gap == half length).
  const dowel = { min: [-0.008, 0.29, -0.025] as Vec3, max: [0.008, 0.306, 0.025] as Vec3, pid: "dowel_1" };
  const rodAnchor: Vec3 = [0, 0.298, 0];
  const rodThr = burialDepthM(rodAnchor, [dowel]) + VIS_GAP_SLACK_M;
  assert.ok(sightlineGapM([0.8, 0.298, 0], rodAnchor, [dowel]).gap <= rodThr, "side view must pass");
  assert.ok(sightlineGapM([0, 0.298, 0.9], rodAnchor, [dowel]).gap > rodThr, "axial view must fail");
  // A socket with a slab between camera and anchor fails by the full standoff (the stabilizer rod under EKET's top panel).
  const top = { min: [-0.3, 0.6, -0.2] as Vec3, max: [0.3, 0.62, 0.2] as Vec3, pid: "topPanel" };
  const g = sightlineGapM([0, 1.2, 0.1], [0, 0.5, 0.05], [top]);
  assert.ok(g.gap > 0.05 && g.by === "topPanel");
  // Nothing in front: gap is exactly 0.
  assert.equal(sightlineGapM([1, 1, 1], [0, 0.3, 0], []).gap, 0);
});

// The occlusion cap: how far the hand may reach down the finger's ray before it hits something. The
// tests below are stated in AXIAL depth for the same reason the carry is — screenRay's `dir` is
// deliberately unnormalised so the ray parameter IS axial depth, and a cap measured in euclidean
// distance would quietly tighten toward the edges of the frame.
test("rayBoxEntryT reports the first surface in front of the finger, in axial depth", () => {
  const look = camera();
  // A panel standing between the camera and the pivot, spanning the middle of the view.
  const panel = { min: [-0.3, -0.2, -0.3] as Vec3, max: [0.3, 0.5, -0.28] as Vec3, pid: "sidePanelL" };
  const { eye, dir } = screenRay(look, FOV_Y_DEG, W, H, W / 2, H / 2);
  const hit = rayBoxEntryT(eye, dir, [panel]);
  assert.ok(Number.isFinite(hit.t), "centre of frame must hit the panel");
  assert.equal(hit.by, "sidePanelL");
  // The reported t IS the axial depth of the entry point — the quantity dragRayPoint carries at.
  const entry: Vec3 = [eye[0] + hit.t * dir[0], eye[1] + hit.t * dir[1], eye[2] + hit.t * dir[2]];
  assert.ok(Math.abs(axialDepth(look, entry) - hit.t) < 1e-9);

  // Off in open space: nothing caps the carry.
  const clear = screenRay(look, FOV_Y_DEG, W, H, 20, H - 20);
  assert.equal(rayBoxEntryT(clear.eye, clear.dir, [panel]).t, Infinity);
  // No boxes at all is the same answer, not a crash.
  assert.equal(rayBoxEntryT(eye, dir, []).t, Infinity);
});

test("rayBoxEntryT takes the NEAREST box and ignores boxes the eye is already inside", () => {
  const look = camera();
  const far = { min: [-0.3, -0.2, -0.3] as Vec3, max: [0.3, 0.5, -0.28] as Vec3, pid: "far" };
  const near = { min: [-0.3, -0.2, 0.2] as Vec3, max: [0.3, 0.5, 0.22] as Vec3, pid: "near" };
  const { eye, dir } = screenRay(look, FOV_Y_DEG, W, H, W / 2, H / 2);
  // Order must not matter: both orderings pick the nearer surface.
  assert.equal(rayBoxEntryT(eye, dir, [far, near]).by, "near");
  assert.equal(rayBoxEntryT(eye, dir, [near, far]).by, "near");
  assert.ok(rayBoxEntryT(eye, dir, [far, near]).t < rayBoxEntryT(eye, dir, [far]).t);

  // A box CONTAINING the eye has its front face behind the camera, so it stands between the finger
  // and nothing. Clamping its entry to zero instead would pin the carry at the lens for as long as
  // the camera sat inside a part.
  const around = { min: [eye[0] - 1, eye[1] - 1, eye[2] - 1] as Vec3, max: [eye[0] + 1, eye[1] + 1, eye[2] + 1] as Vec3, pid: "around" };
  assert.equal(rayBoxEntryT(eye, dir, [around]).t, Infinity);
  // ...and it must not mask a real surface further along the same ray.
  assert.equal(rayBoxEntryT(eye, dir, [around, far]).by, "far");
});

test("the cap pulls the carry in front of an occluder, and the lens floor still outranks it", () => {
  const look = camera();
  const socketDepth = pivotDist(look) + 0.2; // a socket BEHIND the pivot, as an inner panel's would be
  const uncapped = dragRayPoint(look, FOV_Y_DEG, W, H, W / 2, H / 2, 0.5, 0, socketDepth);
  assert.ok(Math.abs(axialDepth(look, uncapped) - socketDepth) < 1e-6, "uncapped rides at socket depth");

  // A surface between camera and socket caps the carry at that surface, not at the socket.
  const cap = socketDepth - 0.35;
  const capped = dragRayPoint(look, FOV_Y_DEG, W, H, W / 2, H / 2, 0.5, 0, socketDepth, cap);
  assert.ok(Math.abs(axialDepth(look, capped) - cap) < 1e-6);

  // The cap only ever pulls the part NEARER. A cap beyond the socket is inert.
  const loose = dragRayPoint(look, FOV_Y_DEG, W, H, W / 2, H / 2, 0.5, 0, socketDepth, socketDepth + 1);
  assert.ok(Math.abs(axialDepth(look, loose) - socketDepth) < 1e-6);

  // A cap tighter than the lens floor is overruled: a part drawn behind the furniture is recoverable
  // by turning the camera, a part inside the near plane fills the screen and is not.
  const crushed = dragRayPoint(look, FOV_Y_DEG, W, H, W / 2, H / 2, 0.5, 0, socketDepth, 0.001);
  assert.ok(axialDepth(look, crushed) >= RAY_CARRY_MIN_M - 1e-9);

  // Default argument: every existing call site that passes no cap is byte-for-byte unchanged.
  const noArg = dragRayPoint(look, FOV_Y_DEG, W, H, 600, 120, 0.5, 0, socketDepth);
  const infinite = dragRayPoint(look, FOV_Y_DEG, W, H, 600, 120, 0.5, 0, socketDepth, Infinity);
  assert.deepEqual(noArg, infinite);
});

test("the cap holds its meaning across the frame, where a euclidean measure would not", () => {
  // A camera looking straight down -Z, so the world-Z slab below is genuinely CAMERA-FACING. The
  // shared camera() helper looks along a diagonal, where the same slab sits at honestly different
  // axial depths across the frame and would prove nothing either way.
  const look = { eye: [0, 0.3, 1.2] as Vec3, center: [0, 0.3, 0] as Vec3, up: [0, 1, 0] as Vec3 };
  const slab = { min: [-3, -3, -0.2] as Vec3, max: [3, 3, -0.18] as Vec3, pid: "wall" };
  const mid = screenRay(look, FOV_Y_DEG, W, H, W / 2, H / 2);
  const edge = screenRay(look, FOV_Y_DEG, W, H, W - 8, H / 2);
  const tMid = rayBoxEntryT(mid.eye, mid.dir, [slab]).t;
  const tEdge = rayBoxEntryT(edge.eye, edge.dir, [slab]).t;
  assert.ok(Number.isFinite(tMid) && Number.isFinite(tEdge));
  // Same plane, same axial depth — within a millimetre across 844 px of frame.
  assert.ok(Math.abs(tMid - tEdge) < 0.001, `centre ${tMid} vs edge ${tEdge}`);

  // The contrast that makes it worth asserting: the EUCLIDEAN distance to that same plane grows by
  // over a third from centre to edge. Normalising screenRay's `dir` would return this number
  // instead, and the cap would tighten toward the edges of the frame for no input the player gave.
  const euclid = (r: { eye: Vec3; dir: Vec3 }, t: number) =>
    t * Math.hypot(r.dir[0], r.dir[1], r.dir[2]);
  assert.ok(euclid(edge, tEdge) / euclid(mid, tMid) > 1.3);
});
