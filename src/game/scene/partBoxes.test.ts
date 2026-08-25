// The occlusion gate's INPUT contract. The gate itself (dragPlane.sightlineGapM) was correct while
// its obstacle list was not: the list came from a harvest taken once at model load, so it described
// the finished furniture rather than the scene in front of the camera, and a rule invented to hide
// the resulting phantoms switched the whole gate off for any furniture without a seed cluster
// (BEKVAM, LACK — measured: every socket reported gap 0mm from all 72 sweep cameras). These tests
// pin the replacement: the list is what is PLACED, at the pose it is RENDERED at.
import assert from "node:assert/strict";
import { test } from "node:test";

import type { PartBox, PartId, Quat } from "@/src/game/core/type";
import { bakedWorldMatrix, occluderBoxes, worldBoxFromObjectBox } from "./partBoxes";

/** Column-major mat4, the layout filament's mat4f::asArray() hands back. */
function translation(x: number, y: number, z: number): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}
/** Rotation about +Y, column-major, so a box's extent has to be re-bounded rather than carried. */
function yawY(rad: number): number[] {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}
const box = (min: [number, number, number], max: [number, number, number]): PartBox => ({ min, max });
const pid = (s: string) => s as PartId;

test("an object box at the origin lands where its node's translation puts it", () => {
  const b = worldBoxFromObjectBox([0, 0, 0], [0.05, 0.2, 0.05], translation(0.3, 0.4, -0.2));
  assert.deepEqual(
    b.min.map((v) => +v.toFixed(6)),
    [0.25, 0.2, -0.25],
  );
  assert.deepEqual(
    b.max.map((v) => +v.toFixed(6)),
    [0.35, 0.6, -0.15],
  );
});

test("a rotated slab is re-bounded, not carried — the extent is what decides overlap", () => {
  // A 40cm x 2cm panel yawed 45 degrees spans 0.4/sqrt(2) + 0.02/sqrt(2) in BOTH horizontal axes.
  const b = worldBoxFromObjectBox([0, 0, 0], [0.2, 0.1, 0.01], yawY(Math.PI / 4));
  const halfSpan = (0.2 + 0.01) / Math.SQRT2;
  assert.ok(Math.abs(b.max[0] - halfSpan) < 1e-9, `x half-extent ${b.max[0]} should be ${halfSpan}`);
  assert.ok(Math.abs(b.max[2] - halfSpan) < 1e-9, `z half-extent ${b.max[2]} should be ${halfSpan}`);
  assert.ok(Math.abs(b.max[1] - 0.1) < 1e-9, "the yaw axis keeps its own extent");
});

test("every placed part is an occluder, whatever its cluster is doing", () => {
  // BEKVAM's regression in miniature: one cosmetic cluster ("whole", a display label with no
  // sub-assembly meaning and no seed flag) used to disqualify the entire furniture from occluding
  // anything, so hidden sockets stayed snappable for the whole build.
  const live = { [pid("legL")]: box([0, 0, 0], [0.1, 0.5, 0.1]) } as Record<PartId, PartBox>;
  const out = occluderBoxes([pid("legL")], live, {});
  assert.equal(out.length, 1, "a placed part must be in the obstacle list");
  assert.equal(out[0].pid, "legL");
});

test("the live pose wins over the baked one — a stashed part occludes where it stands", () => {
  // EKET's phantom: drawerFront is placed but its sub-assembly is still out on the bench, so the
  // baked box sits across the cabinet face it is nowhere near.
  const bakedAcrossTheFace = box([-0.3, 0.2, -0.02], [0.3, 0.5, 0.02]);
  const liveOutOnTheBench = box([-0.3, 0.2, 0.6], [0.3, 0.5, 0.64]);
  const out = occluderBoxes(
    [pid("drawerFront_1")],
    { [pid("drawerFront_1")]: liveOutOnTheBench } as Record<PartId, PartBox>,
    { [pid("drawerFront_1")]: bakedAcrossTheFace } as Record<PartId, PartBox>,
  );
  assert.deepEqual(out[0].min, liveOutOnTheBench.min);
  assert.deepEqual(out[0].max, liveOutOnTheBench.max);
});

test("baked is the fallback only when there is no scene to ask", () => {
  const baked = { [pid("sidePanelL")]: box([0, 0, 0], [0.02, 0.35, 0.3]) } as Record<PartId, PartBox>;
  const out = occluderBoxes([pid("sidePanelL")], null, baked);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].min, baked[pid("sidePanelL")].min);
});

test("a placed part the scene is NOT drawing occludes nothing", () => {
  // The other half of EKET's phantom: a part hidden while another cluster has focus keeps a
  // perfectly good baked transform, so asking the renderer where it is would answer "across the
  // cabinet face". Absence from the reader's reply is the answer, and baked must not fill it in.
  const baked = { [pid("drawerFront_1")]: box([-0.3, 0.2, -0.02], [0.3, 0.5, 0.02]) } as Record<PartId, PartBox>;
  assert.deepEqual(occluderBoxes([pid("drawerFront_1")], {}, baked), []);
});

test("a part with no box at all is dropped rather than defaulted to a point at the origin", () => {
  assert.deepEqual(occluderBoxes([pid("ghostPart")], null, {}), []);
});

test("bakedWorldMatrix composes the pose the harvest assumes — immune to whatever the renderer is currently drawing", () => {
  // A DALFRED leg's real baked pose: splayed by a non-trivial quaternion, offset from the origin. The composed matrix must sweep an object box to exactly where the transform manager WOULD have put it at the baked pose — pinned against worldBoxFromObjectBox's own translation/yaw fixtures.
  assert.deepEqual(bakedWorldMatrix([0.3, 0.4, -0.2], [0, 0, 0, 1]), translation(0.3, 0.4, -0.2));
  const yaw45: Quat = [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)];
  const m = bakedWorldMatrix([0, 0, 0], yaw45);
  const expect = yawY(Math.PI / 4);
  for (let i = 0; i < 16; i++) assert.ok(Math.abs(m[i] - expect[i]) < 1e-9, `m[${i}] ${m[i]} vs ${expect[i]}`);
  // End to end: a slab at DALFRED's leg_2 quaternion sweeps to the same world box whether the matrix comes from this composition or from the corner arithmetic the offline harvest probe validated against the GLB.
  const q: Quat = [0.425547, -0.56472, 0.425548, 0.564721];
  const b = worldBoxFromObjectBox([0.09, 0.27, 0.01], [0.02, 0.27, 0.01], bakedWorldMatrix([-0.244, 0.014, -0.012], q));
  const rot = (v: [number, number, number]): [number, number, number] => {
    const [x, y, z, w] = q;
    const tx = 2 * (y * v[2] - z * v[1]);
    const ty = 2 * (z * v[0] - x * v[2]);
    const tz = 2 * (x * v[1] - y * v[0]);
    return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
  };
  const min: number[] = [Infinity, Infinity, Infinity];
  const max: number[] = [-Infinity, -Infinity, -Infinity];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const w = rot([0.09 + sx * 0.02, 0.27 + sy * 0.27, 0.01 + sz * 0.01]);
    const p = [w[0] - 0.244, w[1] + 0.014, w[2] - 0.012];
    for (let k = 0; k < 3; k++) { if (p[k] < min[k]) min[k] = p[k]; if (p[k] > max[k]) max[k] = p[k]; }
  }
  for (let k = 0; k < 3; k++) {
    assert.ok(Math.abs(b.min[k] - min[k]) < 1e-9, `min[${k}]`);
    assert.ok(Math.abs(b.max[k] - max[k]) < 1e-9, `max[${k}]`);
  }
});
