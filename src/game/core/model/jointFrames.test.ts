import { test } from "node:test";
import assert from "node:assert/strict";
import { boxCenter, boxOverlap, clampIntoBox, deriveJointFrames, CONTACT_EXPANSION_M, partAnchorOffsets } from "./jointFrames";
import type { LiaisonMap, PartBox, PartDef, PartId } from "@/src/game/core/type";

const box = (min: number[], max: number[]): PartBox => ({ min: min as never, max: max as never });

const part = (partId: string, over: Partial<PartDef> = {}): PartDef =>
  ({
    partId: partId as PartId,
    group: "g",
    meshName: `mesh_${partId}`,
    type: "structural",
    cluster: "c",
    pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
    ...over,
  }) as PartDef;

test("boxOverlap returns the intersection of two expanded boxes", () => {
  const a = box([0, 0, 0], [1, 1, 1]);
  const b = box([0.5, 0, 0], [2, 1, 1]);
  const ov = boxOverlap(a, b, 0);
  assert.ok(ov);
  assert.deepEqual(ov.min, [0.5, 0, 0]);
  assert.deepEqual(ov.max, [1, 1, 1]);
});

test("boxOverlap returns null for boxes further apart than the expansion", () => {
  const a = box([0, 0, 0], [1, 1, 1]);
  const b = box([1.5, 0, 0], [2, 1, 1]);
  assert.equal(boxOverlap(a, b, 0.01), null);
});

test("boxOverlap bridges a gap smaller than twice the expansion", () => {
  const a = box([0, 0, 0], [1, 1, 1]);
  const b = box([1.01, 0, 0], [2, 1, 1]);
  assert.ok(boxOverlap(a, b, 0.01));
});

test("clampIntoBox pulls a point onto the nearest face", () => {
  assert.deepEqual(clampIntoBox([5, 0.5, -3] as never, box([0, 0, 0], [1, 1, 1])), [1, 0.5, 0]);
});

test("deriveJointFrames finds the contact between two touching parts", () => {
  // A leg standing under a tabletop: they meet at the leg's top face, NOT at the leg's middle.
  const parts: Record<string, PartDef> = {
    leg: part("leg", { pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] } }),
    top: part("top", { pose: { position: [0, 0.4, 0], rotation: [0, 0, 0, 1] } }),
  };
  const boxes: Record<string, PartBox> = {
    leg: box([-0.025, 0, -0.025], [0.025, 0.4, 0.025]),
    top: box([-0.5, 0.4, -0.5], [0.5, 0.45, 0.5]),
  };
  const liaisons = { "leg__top": { id: "leg__top", a: "leg", b: "top" } } as unknown as LiaisonMap;
  const frames = deriveJointFrames(parts as never, liaisons, boxes as never);
  const f = frames["leg__top" as never];
  assert.ok(f, "expected a frame for leg__top");
  assert.equal(f.via, "direct");
  // The anchor sits at the leg's TOP (y≈0.4), not its visual center (y=0.2).
  assert.ok(Math.abs(f.anchor[1] - 0.4) < 0.011, `anchor y was ${f.anchor[1]}`);
  // offsetA is measured from the leg's own pose origin, which is at its foot.
  assert.ok(Math.abs(f.offsetA[1] - 0.4) < 0.011, `offsetA y was ${f.offsetA[1]}`);
});

test("deriveJointFrames clamps each endpoint's anchor into that part's own bounds", () => {
  // A thin plane and a post with a 6mm air gap between them: the 10mm expansion is what creates the overlap, so its raw centre (y=0.007) sits in the GAP — inside neither part. Without the per-endpoint clamp each part's hold point would float off its own geometry, which is the bug this guards.
  const parts: Record<string, PartDef> = { plane: part("plane"), post: part("post") };
  const boxes: Record<string, PartBox> = {
    plane: box([0, 0, 0], [1, 0.004, 1]),
    post: box([0.4, 0.01, 0.4], [0.6, 0.5, 0.6]),
  };
  const liaisons = { "plane__post": { id: "plane__post", a: "plane", b: "post" } } as unknown as LiaisonMap;
  const f = deriveJointFrames(parts as never, liaisons, boxes as never)["plane__post" as never];
  assert.ok(f, "expected a frame: the 6mm gap is inside the 10mm expansion");
  // The raw overlap centre is 0.007, which is outside BOTH parts — so an unclamped implementation fails both assertions below.
  assert.ok(Math.abs(f.anchor[1] - 0.007) < 1e-9, `precondition: raw anchor should sit in the gap, got ${f.anchor[1]}`);
  const yA = f.offsetA[1] + parts.plane.pose.position[1];
  assert.ok(Math.abs(yA - 0.004) < 1e-9, `endpoint A should clamp to the plane's top face 0.004, got ${yA}`);
  const yB = f.offsetB[1] + parts.post.pose.position[1];
  assert.ok(Math.abs(yB - 0.01) < 1e-9, `endpoint B should clamp to the post's bottom face 0.01, got ${yB}`);
});

test("deriveJointFrames bridges a fastener-joined pair that never touches", () => {
  // EKET's shape: two structural parts far enough apart that no expansion could ever overlap them (0.65m gap vs the 10mm expansion), joined only because a dowel's `attached` names both. The anchor must come from the DOWEL's box, sitting in the air between them.
  const parts: Record<string, PartDef> = {
    a: part("a", { pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] } }),
    b: part("b", { pose: { position: [1, 0, 0], rotation: [0, 0, 0, 1] } }),
    dowel: part("dowel", { type: "fastener", attached: ["a", "b"] as never }),
  };
  const boxes: Record<string, PartBox> = {
    a: box([-0.1, 0, -0.1], [0.1, 0.2, 0.1]),
    b: box([0.75, 0, -0.1], [1.25, 0.2, 0.1]),
    dowel: box([0.4, 0, -0.01], [0.6, 0.2, 0.01]),
  };
  const liaisons = { "a__b": { id: "a__b", a: "a", b: "b" } } as unknown as LiaisonMap;
  const f = deriveJointFrames(parts as never, liaisons, boxes as never)["a__b" as never];
  assert.ok(f, "expected a bridged frame for a__b");
  assert.equal(f.via, "bridge");
  assert.deepEqual(f.anchor, [0.5, 0.1, 0]);
  // Each endpoint clamps the dowel's centre onto its own bounds, so neither hold point floats in the gap.
  assert.deepEqual(f.offsetA, [0.1, 0.1, 0]);
  assert.deepEqual(f.offsetB, [-0.25, 0.1, 0]);

  // Without the fastener the same pair must yield NOTHING — otherwise the assertions above could be satisfied by a stray direct overlap and this test would not be exercising the bridge path at all.
  const noBridge: Record<string, PartDef> = { a: parts.a, b: parts.b };
  assert.deepEqual(deriveJointFrames(noBridge as never, liaisons, boxes as never), {});
});

test("deriveJointFrames yields no frame when a part has no box", () => {
  const parts: Record<string, PartDef> = { a: part("a"), b: part("b") };
  const boxes: Record<string, PartBox> = { a: box([0, 0, 0], [1, 1, 1]) };
  const liaisons = { "a__b": { id: "a__b", a: "a", b: "b" } } as unknown as LiaisonMap;
  assert.deepEqual(deriveJointFrames(parts as never, liaisons, boxes as never), {});
});

test("CONTACT_EXPANSION_M is the agreed 10mm", () => {
  assert.equal(CONTACT_EXPANSION_M, 0.01);
});

test("partAnchorOffsets averages a part's joint anchors, per endpoint", () => {
  // A rail meeting two posts: the hold point belongs between them, not at either one. The posts' pose origins sit deliberately far from their geometry (x=10 and x=20) so that offsetA and offsetB differ by metres — swapping the two would be silent with co-located origins, and this is the one bug in this function that nothing else would catch.
  const parts: Record<string, PartDef> = {
    rail: part("rail", { pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] } }),
    postL: part("postL", { pose: { position: [10, 0, 0], rotation: [0, 0, 0, 1] } }),
    postR: part("postR", { pose: { position: [20, 0, 0], rotation: [0, 0, 0, 1] } }),
  };
  const boxes: Record<string, PartBox> = {
    rail: box([0, 0, 0], [1, 0.05, 0.05]),
    postL: box([0, -0.5, 0], [0.05, 0.05, 0.05]),
    postR: box([0.95, -0.5, 0], [1, 0.05, 0.05]),
  };
  const liaisons = {
    "rail__postL": { id: "rail__postL", a: "rail", b: "postL" },
    "rail__postR": { id: "rail__postR", a: "rail", b: "postR" },
  } as unknown as LiaisonMap;
  const frames = deriveJointFrames(parts as never, liaisons, boxes as never);
  const off = partAnchorOffsets(parts as never, liaisons, frames);
  // The rail is the `a` endpoint of both liaisons, so it averages the two offsetA values (0.025 and 0.975) to mid-rail.
  assert.ok(Math.abs(off["rail" as never][0] - 0.5) < 1e-9, `expected mid-rail x=0.5, got ${off["rail" as never][0]}`);
  // Each post is a `b` endpoint, so it must take offsetB — measured from its OWN distant origin. A swap would hand it the rail's small offsetA instead.
  assert.ok(Math.abs(off["postL" as never][0] - -9.975) < 1e-9, `expected postL x=-9.975, got ${off["postL" as never][0]}`);
  assert.ok(Math.abs(off["postR" as never][0] - -19.025) < 1e-9, `expected postR x=-19.025, got ${off["postR" as never][0]}`);
});

test("partAnchorOffsets prefers an authored jointAnchor over the derived centroid", () => {
  const parts: Record<string, PartDef> = {
    leg: part("leg", { jointAnchor: [9, 9, 9] as never, pose: { position: [1, 1, 1], rotation: [0, 0, 0, 1] } }),
    top: part("top"),
  };
  const boxes: Record<string, PartBox> = { leg: box([0, 0, 0], [2, 2, 2]), top: box([0, 0, 0], [2, 2, 2]) };
  const liaisons = { "leg__top": { id: "leg__top", a: "leg", b: "top" } } as unknown as LiaisonMap;
  const frames = deriveJointFrames(parts as never, liaisons, boxes as never);
  const off = partAnchorOffsets(parts as never, liaisons, frames);
  // Authored anchor is world-space, so the stored offset is it minus the part's own origin.
  assert.deepEqual(off["leg" as never], [8, 8, 8]);
});

test("partAnchorOffsets holds a part by the joint that meets ALREADY-PLACED geometry", () => {
  // The device report: a DALFRED leg has three joints (ringRail y=0.181, circleDown y=0.480, circleUpp y=0.560) and averaging them held it at y=0.407 — 7.3 cm from the nearest real socket, a point mid-shaft that connects to nothing. The finger has to hold the joint the part is actually going INTO, which is the one whose partner is already on the bench.
  const parts: Record<string, PartDef> = { leg: part("leg"), low: part("low"), high: part("high") };
  const boxes: Record<string, PartBox> = {
    leg: box([0, 0, 0], [0.05, 0.6, 0.05]),
    low: box([0, 0.15, 0], [0.4, 0.2, 0.05]),
    high: box([0, 0.55, 0], [0.4, 0.6, 0.05]),
  };
  const liaisons = {
    "leg__low": { id: "leg__low", a: "leg", b: "low" },
    "leg__high": { id: "leg__high", a: "leg", b: "high" },
  } as unknown as LiaisonMap;
  const frames = deriveJointFrames(parts as never, liaisons, boxes as never);
  // Only the HIGH partner is on the bench, so the leg must be held up at that joint, not midway between the two.
  const placed = partAnchorOffsets(parts as never, liaisons, frames, (id) => id === ("high" as never));
  const y = placed["leg" as never][1];
  assert.ok(Math.abs(y - 0.575) < 0.02, `expected the high joint near y=0.575, got ${y.toFixed(3)}`);
  // With nothing placed there is no better answer than the average, and it must still resolve rather than vanish — LACK can be built leg-first, where no partner exists yet.
  const none = partAnchorOffsets(parts as never, liaisons, frames, () => false);
  assert.ok(none["leg" as never], "a part with no placed partner must still resolve an anchor");
  const avg = partAnchorOffsets(parts as never, liaisons, frames);
  assert.deepEqual(none["leg" as never], avg["leg" as never], "the no-partner fallback should equal the all-joints average");
  assert.ok(Math.abs(none["leg" as never][1] - y) > 0.1, "the fallback must be meaningfully different from the placed-aware answer, or this test proves nothing");
});

test("partAnchorOffsets omits parts with no frames at all", () => {
  const parts: Record<string, PartDef> = { lonely: part("lonely") };
  const off = partAnchorOffsets(parts as never, {} as LiaisonMap, {});
  assert.equal(off["lonely" as never], undefined);
});

test("facingA: thin axis of the contact slab, signed from A toward B; bridge falls back to the center line", () => {
  const parts = {
    plate: part("plate"),
    leg: part("leg"),
  } as never;
  const liaisons = {
    L1: { id: "L1", a: "plate", b: "leg" },
  } as never;
  // Leg meets the plate's UNDERSIDE: overlap slab is thin in y, leg centre below → plate's socket faces DOWN.
  const boxes = {
    plate: box([-0.2, 0.5, -0.2], [0.2, 0.56, 0.2]),
    leg: box([0.05, 0.1, 0.05], [0.15, 0.505, 0.15]),
  } as never;
  const frames = deriveJointFrames(parts, liaisons, boxes, 0.01);
  assert.deepEqual(frames["L1" as never].facingA, [0, -1, 0]);
});
