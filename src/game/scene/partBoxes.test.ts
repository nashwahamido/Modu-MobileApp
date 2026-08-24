// The occlusion gate's INPUT contract. The gate itself (dragPlane.sightlineGapM) was correct while
// its obstacle list was not: the list came from a harvest taken once at model load, so it described
// the finished furniture rather than the scene in front of the camera, and a rule invented to hide
// the resulting phantoms switched the whole gate off for any furniture without a seed cluster
// (BEKVAM, LACK — measured: every socket reported gap 0mm from all 72 sweep cameras). These tests
// pin the replacement: the list is what is PLACED, at the pose it is RENDERED at.
import assert from "node:assert/strict";
import { test } from "node:test";

import type { PartBox, PartId } from "@/src/game/core/type";
import { occluderBoxes, worldBoxFromObjectBox } from "./partBoxes";

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
