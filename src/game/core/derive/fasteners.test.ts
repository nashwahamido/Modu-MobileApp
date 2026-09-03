// The fastener seam's acceptance: the corpus defs below are the shipped ones, stated verbatim, so a drift in any authored.ts FASTENERS shows here — and every shipped instance carries a lowered role (the 2026-09-01 invariant: no runtime decision rests on a mesh name). The composed action list is what every downstream consumer reads, so equality there is the whole claim — including the plug extra reproducing the old hand-written PIN_TO_CAM pairing and its place_backPanel endpoint gate from derivation alone.
import { test } from "node:test";
import assert from "node:assert/strict";

import { composeFurnitureActions, expandFasteners } from "../composition/composeActions";
import { applyStructure, StructureOverlay } from "../model/liaisons";
import { fastenerFacts, fastenerIssues } from "./fasteners";
import { COMPOSED } from "@/src/game/content/furnitures/composed";
import { HARDWARE } from "@/src/game/content/hardware";
import type { ClusterDef, ClusterId, DraftAction, FastenerEntry, FastenerMap, PartDef, PartId } from "@/src/game/core/type";

import * as LACK from "@/src/game/content/furnitures/LACK/authored";
import { PARTS as LACK_PARTS } from "@/src/game/content/furnitures/LACK/parts.gen";
import * as BEKVAM from "@/src/game/content/furnitures/BEKVAM/authored";
import { PARTS as BEKVAM_PARTS } from "@/src/game/content/furnitures/BEKVAM/parts.gen";
import * as DALFRED from "@/src/game/content/furnitures/DALFRED/authored";
import { PARTS as DALFRED_PARTS } from "@/src/game/content/furnitures/DALFRED/parts.gen";
import * as EKET from "@/src/game/content/furnitures/EKET/authored";
import { PARTS as EKET_PARTS } from "@/src/game/content/furnitures/EKET/parts.gen";

const connector = (completesOn: "insert" | "tighten", counterpartMountsBy: "press" | "screw"): FastenerEntry =>
  ({ home: "liaison", role: "connector", preload: { completesOn, counterpartMountsBy } }) as FastenerEntry;
const securer = (): FastenerEntry => ({ home: "liaison", role: "securer" }) as FastenerEntry;

// Defs in the same order as each furniture's authored FASTENERS — def order drives action order, so the fixture must speak in the authored sequence.
const FASTENERS: Record<string, Record<string, FastenerEntry>> = {
  LACK: {
    bolt115980: connector("tighten", "screw"),
  },
  BEKVAM: {
    dowel101350: connector("insert", "press"),
    screw105215: securer(),
    screw105111: securer(),
  },
  DALFRED: {
    screw105251: securer(),
    screw100212: securer(),
    screw105298: securer(),
    screw108443: securer(),
    cap107675: { home: "part" },
  },
  EKET: {
    screw110519: securer(),
    screw109041: securer(),
    // re-typed structural→fastener 2026-08-24; ordered before screw100349 as in authored (the voiceover script pins the cap's line position). EKET's authored module lowers through the seam itself now, so its leg of this test pins fixture↔authored-def agreement.
    suspCap: securer(),
    screw100349: securer(),
    // the 3-phase drop and the retracted loose pose are the def's, lowered onto all four instances
    dowel145572: { ...connector("insert", "press"), lifecycle: { drop: { stage: 0.03 }, insert: { retract: 0.04 } } } as FastenerEntry,
    cam139434: securer(),
    dowel139435: { home: { extraOf: "cam139434" } } as unknown as FastenerEntry,
  },
};

interface AuthoredExports {
  AUTHORED_ACTIONS: readonly DraftAction[];
  FASTENERS: FastenerMap;
  STRUCTURE: StructureOverlay;
  CLUSTERS?: Record<ClusterId, ClusterDef>;
}

const CORPUS: [string, AuthoredExports, Record<PartId, PartDef>][] = [
  ["LACK", LACK as AuthoredExports, LACK_PARTS],
  ["BEKVAM", BEKVAM as AuthoredExports, BEKVAM_PARTS],
  ["DALFRED", DALFRED as AuthoredExports, DALFRED_PARTS],
  ["EKET", EKET as AuthoredExports, EKET_PARTS],
];

test("the shipped FASTENERS defs are the pinned ones, every instance carries a role, and the expansion is stable", () => {
  for (const [id, m, raw] of CORPUS) {
    assert.deepEqual(m.FASTENERS, FASTENERS[id], `${id}: authored FASTENERS drifted from the pinned defs`);

    // The composed structure.gen carries what fastenerFacts lands on each instance — no shipped fastener may be without a role, and preload is present exactly on connectors.
    const parts = applyStructure(raw, COMPOSED[id]);
    const facts = fastenerFacts(m.FASTENERS, parts);
    const unrolled = Object.values(parts).filter((p) => p.type === "fastener" && !facts[p.partId]);
    assert.deepEqual(unrolled.map((p) => p.partId), [], `${id}: fastener instances with no lowered role`);
    for (const p of Object.values(parts)) {
      if (p.type !== "fastener") continue;
      const carried = Object.fromEntries((["fastenerRole", "preload", "insertStage", "insertRetract", "insertProud"] as const).filter((k) => p[k] !== undefined).map((k) => [k, p[k]]));
      assert.deepEqual(carried, facts[p.partId], `${id}: ${p.partId} — structure.gen carries different facts than the def lowers`);
      assert.equal(p.fastenerRole === "connector", !!p.preload, `${id}: ${p.partId} — preload is present exactly on connectors`);
    }

    // Expansion from the pinned defs equals expansion from the authored ones — trivially, given the first assertion — and every fastener gets its actions.
    const actions = composeFurnitureActions(m.AUTHORED_ACTIONS, FASTENERS[id] as unknown as FastenerMap, parts, HARDWARE, m.CLUSTERS);
    for (const p of Object.values(parts)) {
      if (p.type !== "fastener") continue;
      assert.ok(actions.some((a) => a.actionId === `tighten_${p.partId}`), `${id}: ${p.partId} has no tighten action`);
    }
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
  const issues = fastenerIssues(F({ gizmo: securer() }), parts);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /orphan_1.*no FASTENERS def/);

  const single = fastenerIssues(F({ gizmo: securer(), orphan: securer() }), parts);
  assert.equal(single.length, 1);
  assert.match(single[0], /orphan_1.*names 1 attached/);

  const cap = fastenerIssues(F({ gizmo: { home: "part" }, orphan: { home: "part" } }), parts);
  assert.equal(cap.length, 1);
  assert.match(cap[0], /gizmo_1.*sits on exactly one/);
});

test("validator: one connector group per liaison", () => {
  const parts = P(part("a"), part("b"), hw("gizmo_1", ["a", "b"]), hw("widget_1", ["b", "a"]));
  const issues = fastenerIssues(F({ gizmo: connector("insert", "press"), widget: connector("insert", "press") }), parts);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /already has connector group "gizmo"/);
});

test("validator: extraOf must ride an existing liaison-homed primary with a covering instance", () => {
  const parts = P(part("a"), part("b"), hw("gizmo_1", ["a", "b"]), hw("rider_1", ["a"]), hw("cap_1", ["a"]));
  const ok = fastenerIssues(F({ gizmo: securer(), rider: { home: { extraOf: "gizmo" } } as unknown as FastenerEntry, cap: { home: "part" } }), parts);
  assert.deepEqual(ok, []);

  const onCap = fastenerIssues(F({ gizmo: securer(), rider: { home: { extraOf: "cap" } } as unknown as FastenerEntry, cap: { home: "part" } }), parts);
  assert.equal(onCap.length, 1);
  assert.match(onCap[0], /a cap — extras ride a LIAISON-homed primary/);

  const missing = fastenerIssues(F({ gizmo: securer(), rider: { home: { extraOf: "nothing" } } as unknown as FastenerEntry, cap: { home: "part" } }), parts);
  assert.equal(missing.length, 1);
  assert.match(missing[0], /extraOf "nothing", which has no FASTENERS def/);

  const uncovered = fastenerIssues(F({ gizmo: securer(), rider: { home: { extraOf: "gizmo" } } as unknown as FastenerEntry, cap: { home: "part" } }), P(part("a"), part("b"), part("c"), hw("gizmo_1", ["a", "b"]), hw("rider_1", ["c"]), hw("cap_1", ["a"])));
  assert.equal(uncovered.length, 1);
  assert.match(uncovered[0], /no "gizmo" instance covering its host/);
});

test("validator: a connector's liaison must not also carry an authored structural join", () => {
  const authored = P(part("a", { pressJoins: ["b"] }), part("b"), hw("gizmo_1", ["a", "b"]));
  const conflict = fastenerIssues(F({ gizmo: connector("insert", "press") }), authored);
  assert.equal(conflict.length, 1);
  assert.match(conflict[0], /also carries an authored pressJoins join/);
  // a securer on the same authored joint is the normal wood-screw shape — no issue
  assert.deepEqual(fastenerIssues(F({ gizmo: securer() }), authored), []);
});

test("validator: lifecycle distances are positive, and the loose pose is retracted OR proud, never both", () => {
  const parts = P(part("a"), part("b"), hw("gizmo_1", ["a", "b"]));
  const bad = (entry: FastenerEntry): string[] => fastenerIssues(F({ gizmo: entry }), parts);
  assert.match(bad({ ...securer(), lifecycle: { drop: { stage: 0 } } })[0], /drop.stage must be a positive/);
  assert.match(bad({ ...securer(), lifecycle: { insert: { retract: 0.04, proud: 0 } } })[0], /both retract and proud/);
  assert.match(bad({ ...securer(), lifecycle: { insert: { retract: -1 } } })[0], /retract must be a positive/);
  assert.deepEqual(bad({ ...securer(), lifecycle: { insert: { proud: 0 } } }), []);
  assert.deepEqual(bad({ ...connector("insert", "press"), lifecycle: { drop: { stage: 0.03 }, insert: { retract: 0.04 } } }), []);
});

test("lowering: the lifecycle's distances land on every instance as the flat drive fields", () => {
  const parts = P(part("a"), part("b"), hw("gizmo_1", ["a", "b"]), hw("gizmo_2", ["a", "b"]), hw("cam_1", ["a", "b"]));
  const facts = fastenerFacts(
    F({ gizmo: { ...connector("insert", "press"), lifecycle: { drop: { stage: 0.03 }, insert: { retract: 0.04 } } }, cam: { ...securer(), lifecycle: { insert: { proud: 0 } } } }),
    parts,
  );
  assert.deepEqual(facts["gizmo_1" as PartId], { fastenerRole: "connector", preload: { completesOn: "insert", counterpartMountsBy: "press" }, insertStage: 0.03, insertRetract: 0.04 });
  assert.deepEqual(facts["gizmo_2" as PartId], facts["gizmo_1" as PartId]);
  assert.deepEqual(facts["cam_1" as PartId], { fastenerRole: "securer", insertProud: 0 });
});

test("lowering: every instance carries its def's role, whatever its name says", () => {
  const parts = P(part("a"), part("b"), hw("camgizmo_1", ["a", "b"]), hw("screwgizmo_1", ["a", "b"]), hw("dowelgizmo_1", ["a", "b"]));
  const partFacts = fastenerFacts(
    F({ camgizmo: securer(), screwgizmo: securer(), dowelgizmo: connector("tighten", "press") }),
    parts,
  );
  // The point of writing all three, not just the two that disagree with their prefixes: after lowering, no runtime decision rests on the words "cam", "screw" or "dowel". The dowel def is the {tighten, press} cell that had no sayable kind before the enum retired.
  assert.deepEqual(partFacts, {
    camgizmo_1: { fastenerRole: "securer" },
    screwgizmo_1: { fastenerRole: "securer" },
    dowelgizmo_1: { fastenerRole: "connector", preload: { completesOn: "tighten", counterpartMountsBy: "press" } },
  });
});

test("expansion: an extra pairs to the nearest covering primary and requires hosts, remaining endpoints, then the primary's tighten", () => {
  const parts = P(
    part("back"), part("bottom"),
    hw("gizmo_1", ["back", "bottom"], [0, 0, 0]),
    hw("gizmo_2", ["back", "bottom"], [1, 0, 0]),
    hw("rider_1", ["bottom"], [0.1, 0, 0]),
  );
  const actions = expandFasteners(F({ gizmo: securer(), rider: { home: { extraOf: "gizmo" } } as unknown as FastenerEntry }), parts);
  const insert = actions.find((a) => a.actionId === "insert_rider_1")!;
  assert.deepEqual(insert.requires, ["place_bottom", "place_back", "tighten_gizmo_1"]);
});
