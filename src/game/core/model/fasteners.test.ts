// The fastener seam's acceptance, on the joints-seam pattern: all four shipped furnitures authored via FASTENERS defs must compose BYTE-IDENTICAL action lists to today's hand-written FastenerRule lists, and the lowered kind overrides must equal the ones STRUCTURE hand-authors (EKET's eight cam→secured). The composed list is what every downstream consumer reads, so equality there is the whole claim — including the plug extra reproducing the hand-authored PIN_TO_CAM pairing and its place_backPanel endpoint gate from derivation alone.
import { test } from "node:test";
import assert from "node:assert/strict";

import { composeFurnitureActions, FastenerRule } from "../composition/composeActions";
import { applyStructure, StructureOverlay } from "./liaisons";
import { fastenerIssues, lowerFasteners, type FastenerEntry, type FastenerMap } from "./fasteners";
import { HARDWARE } from "@/src/game/content/hardware";
import type { ClusterDef, ClusterId, DraftAction, PartDef, PartId } from "@/src/game/core/type";

import * as LACK from "@/src/game/content/furnitures/LACK/authored";
import { PARTS as LACK_PARTS } from "@/src/game/content/furnitures/LACK/parts.gen";
import * as BEKVAM from "@/src/game/content/furnitures/BEKVAM/authored";
import { PARTS as BEKVAM_PARTS } from "@/src/game/content/furnitures/BEKVAM/parts.gen";
import * as DALFRED from "@/src/game/content/furnitures/DALFRED/authored";
import { PARTS as DALFRED_PARTS } from "@/src/game/content/furnitures/DALFRED/parts.gen";
import * as EKET from "@/src/game/content/furnitures/EKET/authored";
import { PARTS as EKET_PARTS } from "@/src/game/content/furnitures/EKET/parts.gen";

const connector = (completesOn: "insert" | "tighten", counterpartMountsBy: "press" | "screw", stage: number): FastenerEntry =>
  ({ home: "liaison", role: "connector", preload: { completesOn, counterpartMountsBy }, stage }) as FastenerEntry;
const securer = (stage: number): FastenerEntry => ({ home: "liaison", role: "securer", stage }) as FastenerEntry;

// Defs in the same order as each furniture's authored FASTENER_RULES — rule order drives action order, so the fixture must speak in the authored sequence.
const FASTENERS: Record<string, Record<string, FastenerEntry>> = {
  LACK: {
    bolt115980: connector("tighten", "screw", 1),
  },
  BEKVAM: {
    dowel101350: connector("insert", "press", 1),
    screw105215: securer(1),
    screw105111: securer(2),
  },
  DALFRED: {
    screw105251: securer(1),
    screw100212: securer(2),
    screw105298: securer(2),
    screw108443: securer(3),
    cap107675: { home: "part", stage: 3 },
  },
  EKET: {
    screw110519: securer(1),
    screw109041: securer(1),
    // re-typed structural→fastener 2026-08-24; ordered before screw100349 as in authored (the voiceover script pins the cap's line position). EKET's authored module lowers through the seam itself now, so its leg of this test pins fixture↔authored-def agreement.
    suspCap: securer(3),
    screw100349: securer(1),
    // the drop step is REQUIRED here: the instances author insertStage, and the drop↔insertStage validator holds def and parts to the same 3-phase story
    dowel145572: { ...connector("insert", "press", 3), lifecycle: ["drop", "insert", "tighten"] } as FastenerEntry,
    cam139434: securer(3),
    dowel139435: { home: { extraOf: "cam139434" }, stage: 3 } as unknown as FastenerEntry,
  },
};

interface AuthoredExports {
  AUTHORED_ACTIONS: readonly DraftAction[];
  FASTENER_RULES: readonly FastenerRule[];
  STRUCTURE: StructureOverlay;
  CLUSTERS?: Record<ClusterId, ClusterDef>;
}

const CORPUS: [string, AuthoredExports, Record<PartId, PartDef>][] = [
  ["LACK", LACK as AuthoredExports, LACK_PARTS],
  ["BEKVAM", BEKVAM as AuthoredExports, BEKVAM_PARTS],
  ["DALFRED", DALFRED as AuthoredExports, DALFRED_PARTS],
  ["EKET", EKET as AuthoredExports, EKET_PARTS],
];

test("FASTENERS-authored corpus composes byte-identical to the hand-written rules, and lowers exactly the hand-written kind overrides", () => {
  for (const [id, m, raw] of CORPUS) {
    const parts = applyStructure(raw, m.STRUCTURE);
    const { rules, kindOverrides } = lowerFasteners(FASTENERS[id] as unknown as FastenerMap, parts);

    const authoredKinds = Object.fromEntries(
      Object.entries(m.STRUCTURE as Record<string, { fastenerKind?: string }>)
        .filter(([, e]) => e.fastenerKind)
        .map(([pid, e]) => [pid, e.fastenerKind]),
    );
    assert.deepEqual(kindOverrides, authoredKinds, `${id}: lowered kind overrides diverged from STRUCTURE's hand-written ones`);

    const expected = composeFurnitureActions(m.AUTHORED_ACTIONS, m.FASTENER_RULES, parts, HARDWARE, m.CLUSTERS);
    const actual = composeFurnitureActions(m.AUTHORED_ACTIONS, rules, parts, HARDWARE, m.CLUSTERS);
    assert.deepEqual(actual, expected, `${id}: FASTENERS-authored actions diverged from the hand-written rules`);
  }
});

// ---- validator + lowering units on synthetic parts ----

const part = (partId: string, extra: object = {}): PartDef =>
  ({ partId, group: partId.replace(/_\d+$/, ""), meshName: partId, type: "structural", cluster: "whole", pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] }, ...extra }) as unknown as PartDef;
const hw = (partId: string, attached: string[], position: [number, number, number] = [0, 0, 0], extra: object = {}): PartDef =>
  part(partId, { type: "fastener", attached, pose: { position, rotation: [0, 0, 0, 1] }, ...extra });
const P = (...list: PartDef[]): Record<PartId, PartDef> =>
  Object.fromEntries(list.map((p) => [p.partId, p])) as Record<PartId, PartDef>;
const F = (defs: Record<string, FastenerEntry>): FastenerMap => defs as unknown as FastenerMap;

test("validator: every fastener group needs a def, and instances must fit the def's form", () => {
  const parts = P(part("a"), part("b"), hw("gizmo_1", ["a", "b"]), hw("orphan_1", ["a"]));
  const issues = fastenerIssues(F({ gizmo: securer(1) }), parts);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /orphan_1.*no FASTENERS def/);

  const single = fastenerIssues(F({ gizmo: securer(1), orphan: securer(1) }), parts);
  assert.equal(single.length, 1);
  assert.match(single[0], /orphan_1.*names 1 attached/);

  const cap = fastenerIssues(F({ gizmo: { home: "part", stage: 1 }, orphan: { home: "part", stage: 1 } }), parts);
  assert.equal(cap.length, 1);
  assert.match(cap[0], /gizmo_1.*sits on exactly one/);
});

test("validator: one connector group per liaison", () => {
  const parts = P(part("a"), part("b"), hw("gizmo_1", ["a", "b"]), hw("widget_1", ["b", "a"]));
  const issues = fastenerIssues(F({ gizmo: connector("insert", "press", 1), widget: connector("insert", "press", 1) }), parts);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /already has connector group "gizmo"/);
});

test("validator: extraOf must ride an existing liaison-homed primary with a covering instance", () => {
  const parts = P(part("a"), part("b"), hw("gizmo_1", ["a", "b"]), hw("rider_1", ["a"]), hw("cap_1", ["a"]));
  const ok = fastenerIssues(F({ gizmo: securer(1), rider: { home: { extraOf: "gizmo" }, stage: 1 } as unknown as FastenerEntry, cap: { home: "part", stage: 1 } }), parts);
  assert.deepEqual(ok, []);

  const onCap = fastenerIssues(F({ gizmo: securer(1), rider: { home: { extraOf: "cap" }, stage: 1 } as unknown as FastenerEntry, cap: { home: "part", stage: 1 } }), parts);
  assert.equal(onCap.length, 1);
  assert.match(onCap[0], /a cap — extras ride a LIAISON-homed primary/);

  const missing = fastenerIssues(F({ gizmo: securer(1), rider: { home: { extraOf: "nothing" }, stage: 1 } as unknown as FastenerEntry, cap: { home: "part", stage: 1 } }), parts);
  assert.equal(missing.length, 1);
  assert.match(missing[0], /extraOf "nothing", which has no FASTENERS def/);

  const uncovered = fastenerIssues(F({ gizmo: securer(1), rider: { home: { extraOf: "gizmo" }, stage: 1 } as unknown as FastenerEntry, cap: { home: "part", stage: 1 } }), P(part("a"), part("b"), part("c"), hw("gizmo_1", ["a", "b"]), hw("rider_1", ["c"]), hw("cap_1", ["a"])));
  assert.equal(uncovered.length, 1);
  assert.match(uncovered[0], /no "gizmo" instance covering its host/);
});

test("validator: a connector's liaison must not also carry an authored structural join", () => {
  const authored = P(part("a", { directJoins: ["b"] }), part("b"), hw("gizmo_1", ["a", "b"]));
  const conflict = fastenerIssues(F({ gizmo: connector("insert", "press", 1) }), authored);
  assert.equal(conflict.length, 1);
  assert.match(conflict[0], /also carries an authored directJoins join/);
  // a securer on the same authored joint is the normal wood-screw shape — no issue
  assert.deepEqual(fastenerIssues(F({ gizmo: securer(1) }), authored), []);
});

test("validator: the drop step and insertStage must agree", () => {
  const dropDef = { ...connector("insert", "press", 1), lifecycle: ["drop", "insert", "tighten"] } as FastenerEntry;
  const bare = P(part("a"), part("b"), hw("gizmo_1", ["a", "b"]));
  const staged = P(part("a"), part("b"), hw("gizmo_1", ["a", "b"], [0, 0, 0], { insertStage: 0.03 }));
  const inert = fastenerIssues(F({ gizmo: dropDef }), bare);
  assert.equal(inert.length, 1);
  assert.match(inert[0], /declares a drop step but instance "gizmo_1" has no insertStage/);
  const undeclared = fastenerIssues(F({ gizmo: connector("insert", "press", 1) }), staged);
  assert.equal(undeclared.length, 1);
  assert.match(undeclared[0], /authors insertStage but the lifecycle has no drop step/);
  assert.deepEqual(fastenerIssues(F({ gizmo: dropDef }), staged), []);
});

test("validator: lifecycle grammar, and completesOn must name a lifecycle step", () => {
  const parts = P(part("a"), part("b"), hw("gizmo_1", ["a", "b"]));
  const bad = (entry: FastenerEntry): string[] => fastenerIssues(F({ gizmo: entry }), parts);
  assert.match(bad({ ...securer(1), lifecycle: [] })[0], /cannot be empty/);
  assert.match(bad({ ...securer(1), lifecycle: ["tighten", "insert"] })[0], /ordered subset/);
  assert.match(bad({ ...securer(1), lifecycle: ["insert", "insert"] } as unknown as FastenerEntry)[0], /ordered subset/);
  assert.match(bad({ ...connector("tighten", "press", 1), lifecycle: ["insert"] })[0], /completes on "tighten" but the lifecycle/);
  assert.deepEqual(bad({ ...connector("insert", "press", 1), lifecycle: ["insert"] }), []);
});

test("lowering: role-implied kinds override only where the name prefix disagrees", () => {
  const parts = P(part("a"), part("b"), hw("camgizmo_1", ["a", "b"]), hw("screwgizmo_1", ["a", "b"]), hw("dowelgizmo_1", ["a", "b"]));
  const { kindOverrides } = lowerFasteners(
    F({ camgizmo: securer(1), screwgizmo: securer(1), dowelgizmo: connector("tighten", "press", 1) }),
    parts,
  );
  // cam prefix vs securer → secured; screw prefix already secured → silent; dowel prefix (pin) vs connector{tighten, press} → the enum's fourth cell, cam
  assert.deepEqual(kindOverrides, { camgizmo_1: "secured", dowelgizmo_1: "cam" });
});

test("lowering: an extra pairs to the nearest covering primary and requires hosts, remaining endpoints, then the primary's tighten", () => {
  const parts = P(
    part("back"), part("bottom"),
    hw("gizmo_1", ["back", "bottom"], [0, 0, 0]),
    hw("gizmo_2", ["back", "bottom"], [1, 0, 0]),
    hw("rider_1", ["bottom"], [0.1, 0, 0]),
  );
  const { rules } = lowerFasteners(F({ gizmo: securer(1), rider: { home: { extraOf: "gizmo" }, stage: 1 } as unknown as FastenerEntry }), parts);
  const riderRule = rules.find((r) => (r.group as string) === "rider")!;
  assert.deepEqual(riderRule.requires!(parts["rider_1" as PartId]), ["place_bottom", "place_back", "tighten_gizmo_1"]);
});
