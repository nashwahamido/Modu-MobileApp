// The pick confirmer's contract, pinned where the box gate's history says the bodies are buried. Every identity-only visibility rule tried before was falsified in play (receiver exemptions: legs snapped through plates; face heuristics: EKET's cam lock, twice), so these tests are organized around the cases that killed them: the same receiver entity answers a pick from the bore side AND through the panel's far side, and only depth separates the two.
import assert from "node:assert/strict";
import { test } from "node:test";

import type { ActionId, Vec3 } from "@/src/game/core/type";
import {
  axialDepthFromBuffer,
  judgePick,
  PickConfirmCache,
  PICK_HYSTERESIS,
  PICK_INTERVAL_MS,
  PICK_STALE_MS,
} from "./pickConfirm";

const NEAR = 0.1;
const id = (s: string) => s as ActionId;
const EYE: Vec3 = [1, 0.8, 1];

/** Buffer value that puts the frontmost surface at `axialM` — the inverse of the reversed-Z mapping, so tests speak metres. */
const bufAt = (axialM: number) => NEAR / axialM;

test("reversed-Z mapping: 1.0 is the near plane, smaller values are further", () => {
  assert.equal(axialDepthFromBuffer(1, NEAR), NEAR);
  assert.equal(axialDepthFromBuffer(0.1, NEAR), 1.0);
  assert.equal(axialDepthFromBuffer(0, NEAR), Infinity, "0 = infinity must not divide through");
});

const base = { heldSet: new Set<string>(), anchorAxialDepthM: 1.0, anchorEuclidDistM: 1.0, nearM: NEAR };

test("hitting the receiver AT the socket confirms visible — the hole is a feature of the panel's near face", () => {
  // Frontmost surface 2mm in front of the anchor: the bore face a countersunk screw seats on.
  const v = judgePick({ ...base, hit: { partId: "backPanel" as never, ghost: false, depth: bufAt(0.998) } });
  assert.equal(v, "visible");
});

test("the SAME receiver through its far side stays blocked — the case every identity rule died on", () => {
  // Rear cam lock viewed from the front: frontmost surface is the back panel's FRONT face, 15mm before the anchor, against a 4mm burial allowance. pickEntity without depth returns the same entity in both tests.
  const v = judgePick({ ...base, hit: { partId: "backPanel" as never, ghost: false, depth: bufAt(0.985) } });
  assert.equal(v, "blocked");
});

test("open background is a clear sightline", () => {
  assert.equal(judgePick({ ...base, hit: null }), "visible");
});

test("a hit at or past the anchor is the socket's own surface, not an occluder", () => {
  const v = judgePick({ ...base, hit: { partId: "leg_1" as never, ghost: false, depth: bufAt(1.01) } });
  assert.equal(v, "visible");
});

test("the held part covering the pixel teaches nothing", () => {
  const v = judgePick({ ...base, heldSet: new Set(["screw105251_1"]), hit: { partId: "screw105251_1" as never, ghost: false, depth: bufAt(0.5) } });
  assert.equal(v, "ignore");
});

test("a ghost is never an occluder, whoever it belongs to", () => {
  const v = judgePick({ ...base, hit: { partId: "circleUpp" as never, ghost: true, depth: bufAt(0.5) } });
  assert.equal(v, "ignore");
});

test("the along-ray obliquity correction scales the axial gap", () => {
  // Anchor 1m axial but 2m euclid (a steep corner-of-screen ray): a 10mm axial gap is 20mm on the sightline — over a 6mm-slack threshold with zero burial, blocked; the same hit judged without the correction would pass.
  const v = judgePick({ ...base, anchorEuclidDistM: 2.0, hit: { partId: "seat" as never, ghost: false, depth: bufAt(0.99) } });
  assert.equal(v, "blocked");
});

test("a hit outside the furniture (room shell) still occludes by its depth", () => {
  const v = judgePick({ ...base, hit: { partId: null, ghost: false, depth: bufAt(0.5) } });
  assert.equal(v, "blocked");
});

test("cache: one visible sample is not enough; hysteresis-many are", () => {
  const c = new PickConfirmCache();
  const t0 = 1000;
  c.record(id("a"), "visible", EYE, t0);
  assert.equal(c.isConfirmedVisible(id("a"), EYE, t0 + 10), false, "one sample must not flip the gate");
  for (let i = 1; i < PICK_HYSTERESIS; i++) c.record(id("a"), "visible", EYE, t0 + i * 10);
  assert.equal(c.isConfirmedVisible(id("a"), EYE, t0 + 100), true);
});

test("cache: a contradicting sample resets the streak", () => {
  const c = new PickConfirmCache();
  c.record(id("a"), "visible", EYE, 0);
  c.record(id("a"), "blocked", EYE, 10);
  c.record(id("a"), "visible", EYE, 20);
  assert.equal(c.isConfirmedVisible(id("a"), EYE, 30), false);
});

test("cache: ignore neither confirms nor resets — the sticky verdict carries through covered frames", () => {
  const c = new PickConfirmCache();
  for (let i = 0; i < PICK_HYSTERESIS; i++) c.record(id("a"), "visible", EYE, i * 10);
  c.record(id("a"), "ignore", EYE, 100);
  assert.equal(c.isConfirmedVisible(id("a"), EYE, 110), true);
});

test("cache: a confirmed verdict dies when the eye moves — visibility belongs to a viewpoint", () => {
  const c = new PickConfirmCache();
  for (let i = 0; i < PICK_HYSTERESIS; i++) c.record(id("a"), "visible", EYE, i * 10);
  assert.equal(c.isConfirmedVisible(id("a"), EYE, 50), true);
  const moved: Vec3 = [EYE[0] + 0.05, EYE[1], EYE[2]];
  assert.equal(c.isConfirmedVisible(id("a"), moved, 50), false);
});

test("cache: a confirmed verdict dies of age", () => {
  const c = new PickConfirmCache();
  for (let i = 0; i < PICK_HYSTERESIS; i++) c.record(id("a"), "visible", EYE, i * 10);
  assert.equal(c.isConfirmedVisible(id("a"), EYE, PICK_HYSTERESIS * 10 + PICK_STALE_MS + 1), false);
});

test("cache: one pick in flight, and the throttle holds between picks", () => {
  const c = new PickConfirmCache();
  assert.equal(c.shouldFire(1000), true);
  c.markFired(1000);
  assert.equal(c.shouldFire(1000 + PICK_INTERVAL_MS + 1), false, "in flight blocks regardless of time");
  c.record(id("a"), "blocked", EYE, 1100);
  assert.equal(c.shouldFire(1150), false, "interval not yet elapsed");
  assert.equal(c.shouldFire(1000 + PICK_INTERVAL_MS + 1), true);
});
