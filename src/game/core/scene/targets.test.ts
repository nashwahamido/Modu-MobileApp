import { test } from "node:test";
import assert from "node:assert/strict";
import { groupCandidates, holdOffsetFor } from "./targets";
import type { AssemblyAction, GroupId, PartDef, PartId, Vec3 } from "@/src/game/core/type";

// DALFRED's leg: visual center 0.288m out from the pose origin (the foot). The motivating case.
const LEG_VCO = [-0.0125, 0.272188, 0.092613] as const;

const part = (over: Partial<PartDef>): PartDef =>
  ({
    partId: "p" as PartId,
    group: "g",
    meshName: "m",
    type: "structural",
    cluster: "c",
    pose: { position: [1, 2, 3], rotation: [0, 0, 0, 1] },
    ...over,
  }) as PartDef;

const len3 = (v: readonly number[]) => Math.hypot(v[0], v[1], v[2]);

test("a short part's hold point stays at its visual center", () => {
  const vco = [0, -0.0125, 0] as const;
  assert.deepEqual(holdOffsetFor(part({ visualCenterOffset: [...vco] })), vco);
});

test("a part with no visual center offset is held at its origin", () => {
  assert.deepEqual(holdOffsetFor(part({})), [0, 0, 0]);
});

test("a lengthy part's hold point is clamped near the snap origin, keeping its direction", () => {
  const off = holdOffsetFor(part({ visualCenterOffset: [...LEG_VCO] }));
  assert.ok(Math.abs(len3(off) - 0.08) < 1e-9, `clamped length, got ${len3(off)}`);
  // Same direction as the authored center offset: cross-ratio of components preserved.
  const k = len3(off) / len3(LEG_VCO);
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(off[i] - LEG_VCO[i] * k) < 1e-9, `component ${i} off-axis`);
  }
});

test("a mid-size part between the clamp length and the trigger threshold is untouched", () => {
  const vco = [0, 0.1, 0] as const;
  assert.deepEqual(holdOffsetFor(part({ visualCenterOffset: [...vco] })), vco);
});

test("group candidates carry the clamped hold point, not the raw visual center", () => {
  const leg = part({ visualCenterOffset: [...LEG_VCO] });
  const action = {
    actionId: "a1",
    type: "placePart",
    stage: 1,
    partId: "p" as PartId,
  } as unknown as AssemblyAction;
  const [c] = groupCandidates([action], action, { ["p" as PartId]: leg });
  const off = [
    c.holdPosition[0] - c.position[0],
    c.holdPosition[1] - c.position[1],
    c.holdPosition[2] - c.position[2],
  ];
  assert.ok(Math.abs(len3(off) - 0.08) < 1e-9, `candidate hold offset clamped, got ${len3(off)}`);
});

test("holdOffsetFor prefers a joint anchor over the visual-center clamp", () => {
  // LACK's leg, measured: origin at the FOOT, sole joint with the tabletop 0.4m up. The clamp put the finger 0.08m up — 32cm from the joint, and further from it than the plain visual center.
  const leg = part({ partId: "leg" as PartId, visualCenterOffset: [0, 0.2, 0] as unknown as Vec3 });
  const anchors = { leg: [0, 0.4, 0] } as unknown as Record<PartId, Vec3>;
  assert.deepEqual(holdOffsetFor(leg, anchors), [0, 0.4, 0]);
});

test("holdOffsetFor falls back to the clamp when the part has no anchor", () => {
  const leg = part({ partId: "leg" as PartId, visualCenterOffset: LEG_VCO as unknown as Vec3 });
  const withAnchors = holdOffsetFor(leg, {} as Record<PartId, Vec3>);
  assert.deepEqual(withAnchors, holdOffsetFor(leg));
  assert.ok(len3(withAnchors) < len3(LEG_VCO), "expected the clamped fallback, not the raw visual center");
});

test("groupCandidates aims each candidate at its OWN part's joint anchor", () => {
  // LACK's four legs are one group, so a candidate list is normally multi-entry and every entry is a DIFFERENT part. Threading the representative's anchor to all of them would aim three legs of four wrong while still feeling like a working feature, and a single-candidate test cannot see that — hence two parts here, with different origins and different anchors.
  const legA = part({ partId: "legA" as PartId, group: "leg" as GroupId, pose: { position: [1, 2, 3], rotation: [0, 0, 0, 1] }, visualCenterOffset: [0, 0.2, 0] as unknown as Vec3 });
  const legB = part({ partId: "legB" as PartId, group: "leg" as GroupId, pose: { position: [-4, 5, 6], rotation: [0, 0, 0, 1] }, visualCenterOffset: [0, 0.2, 0] as unknown as Vec3 });
  const parts = { legA, legB } as unknown as Record<PartId, PartDef>;
  const actA = { actionId: "place_legA", type: "placePart", partId: "legA", stage: 1, order: 1, requires: [] } as unknown as AssemblyAction;
  const actB = { actionId: "place_legB", type: "placePart", partId: "legB", stage: 1, order: 2, requires: [] } as unknown as AssemblyAction;
  // Exact binary fractions, so the expectations below can be written as plain literals without float slop.
  const anchors = { legA: [0, 0.5, 0], legB: [0.25, 0, -0.75] } as unknown as Record<PartId, Vec3>;
  const cands = groupCandidates([actA, actB], actA, parts, undefined, anchors);
  assert.equal(cands.length, 2);
  const byId = Object.fromEntries(cands.map((c) => [c.action.partId, c]));
  assert.deepEqual(byId.legA.holdPosition, [1, 2.5, 3]);
  assert.deepEqual(byId.legB.holdPosition, [-3.75, 5, 5.25]);

  // Anchors steer the JOURNEY only — release still lands on the baked pose — so supplying them must leave every candidate's drop position byte-identical to the unanchored run. Nothing else asserts that binding constraint at this boundary.
  const plain = groupCandidates([actA, actB], actA, parts);
  assert.deepEqual(cands.map((c) => c.position), plain.map((c) => c.position));
  assert.deepEqual(byId.legA.position, [1, 2, 3]);
  assert.deepEqual(byId.legB.position, [-4, 5, 6]);
});
