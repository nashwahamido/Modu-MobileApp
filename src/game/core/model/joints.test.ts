import assert from "node:assert/strict";
import test from "node:test";

import type { PartDef, PartId } from "@/src/game/core/type";
import { applyStructure, buildLiaisons, type StructureOverlay } from "./liaisons";
import { jointIssues, lowerJoints, mergeOverlays, PLAYABLE_JOINT_KINDS, type JointDef } from "./joints";

const part = (partId: string, extra: object = {}): PartDef =>
  ({ partId, group: partId, meshName: partId, type: "structural", cluster: "whole", pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] }, ...extra }) as unknown as PartDef;

const PARTS = Object.fromEntries(
  ["sideL", "top", "back", "shelf", "pole", "seat", "screwy"].map((id) => [id, part(id)]),
) as Record<PartId, PartDef>;
(PARTS as Record<string, PartDef>).screwy = part("screwy", { type: "fastener", attached: ["sideL", "top"] });

// The whole point of the seam: joint ENTITIES and the flat arrays are two ways to say the same thing, and the engine must not be able to tell which was used. Γ is what every downstream pass reads, so equality there is the acceptance criterion.
test("authoring via JOINTS produces exactly the Γ the flat arrays produce", () => {
  const joints: JointDef[] = [
    { kind: "press", a: "sideL" as PartId, b: "top" as PartId },
    { kind: "slide", a: "back" as PartId, b: "sideL" as PartId, mover: "back" as PartId, dir: [0, 1, 0], back: 0.1 },
    { kind: "screw", a: "pole" as PartId, b: "seat" as PartId, mover: "pole" as PartId },
  ];
  const flat: StructureOverlay = {
    sideL: { directJoins: ["top"] },
    back: { slideJoins: ["sideL"], placeDir: [0, 1, 0], parkBackoff: 0.1 },
    pole: { screwJoins: ["seat"] },
  } as StructureOverlay;

  const viaJoints = applyStructure(PARTS, {} as StructureOverlay, joints);
  const viaFlat = applyStructure(PARTS, flat);
  assert.deepEqual(buildLiaisons(viaJoints), buildLiaisons(viaFlat), "Γ diverged between the two authoring routes");
  assert.deepEqual(viaJoints, viaFlat, "lowered parts diverged from the hand-authored flat parts");
});

test("hook-and-slot lowers both legs, and `dirOther` gives the partner its own shove so either build order works", () => {
  const joints: JointDef[] = [
    { kind: "hookAndSlot", a: "sideL" as PartId, b: "top" as PartId, mover: "top" as PartId, approach: { dir: [0, 0, 1], back: 0.03 }, lock: { dir: [1, 0, 0], travel: 0.015, dirOther: [-1, 0, 0] } },
  ];
  const o = lowerJoints(joints) as Record<string, Record<string, unknown>>;
  assert.deepEqual(o.top, { directJoins: ["sideL"], placeDir: [0, 0, 1], parkBackoff: 0.03, lockDir: [1, 0, 0], lockTravel: 0.015 });
  assert.deepEqual(o.sideL, { lockDir: [-1, 0, 0], lockTravel: 0.015 }, "the partner carries the mirrored lock leg, derived from ONE declaration");
});

test("a joint's anchor lowers onto both endpoints, and two joints claiming different anchors for one part is an error", () => {
  const ok = lowerJoints([{ kind: "press", a: "sideL" as PartId, b: "top" as PartId, anchor: { a: [1, 2, 3], b: [4, 5, 6] } }]) as Record<string, Record<string, unknown>>;
  assert.deepEqual(ok.sideL.jointAnchor, [1, 2, 3]);
  assert.deepEqual(ok.top.jointAnchor, [4, 5, 6]);
  assert.throws(
    () => lowerJoints([
      { kind: "press", a: "sideL" as PartId, b: "top" as PartId, anchor: { a: [1, 2, 3] } },
      { kind: "press", a: "sideL" as PartId, b: "back" as PartId, anchor: { a: [9, 9, 9] } },
    ]),
    /two different anchors/,
  );
});

// Rotation is the reason this shape exists tonight: it must be sayable, and it must not silently degrade into something placeable.
test("a hinge is representable but refused by name, with the reason", () => {
  const hinge: JointDef = { kind: "hinge", a: "sideL" as PartId, b: "top" as PartId, mover: "top" as PartId, pivot: [0, 0, 0], axis: [0, 1, 0], sweepDeg: 90 };
  assert.ok(!PLAYABLE_JOINT_KINDS.has("hinge"), "hinge must stay out of the playable set until a rotational motion primitive exists");
  const issues = jointIssues([hinge]);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /"hinge" kind is not playable yet/);
  assert.throws(() => lowerJoints([hinge]), /not playable yet/);
});

test("authoring mistakes are caught by name, not by a downstream deadlock", () => {
  const at = (j: JointDef) => jointIssues([j], PARTS as never)[0] ?? "";
  assert.match(at({ kind: "slide", a: "back" as PartId, b: "sideL" as PartId, mover: "back" as PartId, dir: [0, 0, 0] }), /non-zero dir/);
  assert.match(at({ kind: "screw", a: "pole" as PartId, b: "seat" as PartId, mover: "shelf" as PartId }), /not one of its endpoints/);
  assert.match(at({ kind: "press", a: "sideL" as PartId, b: "ghost" as PartId }), /missing part "ghost"/);
  assert.match(at({ kind: "press", a: "sideL" as PartId, b: "screwy" as PartId }), /is a fastener/);
  assert.match(at({ kind: "press", a: "sideL" as PartId, b: "sideL" as PartId }), /two distinct parts/);
  assert.match(at({ kind: "press", a: "sideL" as PartId, b: "top" as PartId, approach: { dir: [1, 0, 0] } }), /must name one/);
  assert.match(
    jointIssues([
      { kind: "press", a: "sideL" as PartId, b: "top" as PartId },
      { kind: "slide", a: "top" as PartId, b: "sideL" as PartId, mover: "top" as PartId, dir: [1, 0, 0] },
    ])[0],
    /already joined as "press"/,
  );
});

test("the flat overlay wins over a lowered joint scalar, and join arrays union — so a half-migrated file reads the way it behaves", () => {
  const lowered = lowerJoints([{ kind: "slide", a: "back" as PartId, b: "sideL" as PartId, mover: "back" as PartId, dir: [0, 1, 0] }]);
  const merged = mergeOverlays(lowered, { back: { slideJoins: ["shelf"], placeDir: [1, 0, 0] } } as StructureOverlay) as Record<string, Record<string, unknown>>;
  assert.deepEqual(merged.back.slideJoins, ["sideL", "shelf"], "both routes' targets survive");
  assert.deepEqual(merged.back.placeDir, [1, 0, 0], "the explicit flat authoring wins the scalar");
});

test("furniture that authors no joints is untouched by the seam", () => {
  const flat = { sideL: { seed: true } } as StructureOverlay;
  assert.deepEqual(applyStructure(PARTS, flat, []), applyStructure(PARTS, flat));
  assert.deepEqual(applyStructure(PARTS, flat, undefined), applyStructure(PARTS, flat));
});
