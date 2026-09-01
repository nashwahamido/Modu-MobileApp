// The acceptance criterion for moving a furniture's joints from the flat arrays into JOINTS: the parts come out BYTE-IDENTICAL to what the flat authoring produced.
// It is deliberately not "Γ is equivalent". If applyStructure returns the same PartDefs the device ran before, then every consumer downstream — drag, park math, sweep, visibility, evaluation — is provably unaffected, and the migration lands without a device pass. That is the whole reason this change can be trusted without one, so the test states the OLD authoring literally rather than deriving it: a reconstruction that drifted with the code would prove nothing.
// Each entry below is exactly what the migration DELETED from that furniture's STRUCTURE. Migrating another part means adding its old fields here — and if the derived travel disagrees with what was authored, this fails rather than the difference reaching a player.
import { test } from "node:test";
import assert from "node:assert/strict";

import { applyStructure, buildLiaisons, type StructureOverlay } from "./liaisons";
import { mergeOverlays } from "./joints";
import type { PartId } from "@/src/game/core/type";
import { COMPOSED } from "@/src/game/content/furnitures/composed";

import * as EKET from "@/src/game/content/furnitures/EKET/authored";
import { PARTS as EKET_PARTS } from "@/src/game/content/furnitures/EKET/parts.gen";
import { JOINT_GEOMETRY as EKET_GEOMETRY } from "@/src/game/content/furnitures/EKET/joints.gen";
import * as BEKVAM from "@/src/game/content/furnitures/BEKVAM/authored";
import { PARTS as BEKVAM_PARTS } from "@/src/game/content/furnitures/BEKVAM/parts.gen";
import { JOINT_GEOMETRY as BEKVAM_GEOMETRY } from "@/src/game/content/furnitures/BEKVAM/joints.gen";
import * as DALFRED from "@/src/game/content/furnitures/DALFRED/authored";
import { PARTS as DALFRED_PARTS } from "@/src/game/content/furnitures/DALFRED/parts.gen";
import { JOINT_GEOMETRY as DALFRED_GEOMETRY } from "@/src/game/content/furnitures/DALFRED/joints.gen";
import * as LACK from "@/src/game/content/furnitures/LACK/authored";
import { PARTS as LACK_PARTS } from "@/src/game/content/furnitures/LACK/parts.gen";

/** What EKET's STRUCTURE said before the migration, verbatim. Both brackets kept their tool-visual fields (engageDir/insertProud/toolAnchor) — only the join and its travel moved. */
const EKET_BEFORE = {
  suspBracket_1: { directJoins: ["sidePanelR"], placeDir: [0, 0, -1] },
  suspBracket_2: { directJoins: ["sidePanelL"], placeDir: [0, 0, 1] },
  drawerBottom_1: { slideJoins: ["drawerSideL_1", "drawerSideR_1", "drawerFront_1"], placeDir: [1, 0, 0] },
  drawerBottom_2: { slideJoins: ["drawerSideL_2", "drawerSideR_2", "drawerFront_2"], placeDir: [1, 0, 0] },
} as unknown as StructureOverlay;

/** BEKVAM's rail authored a travel and NO join array — every joint in that furniture is made by hardware. Its snap therefore has to lower to the travel alone. */
const BEKVAM_BEFORE = {
  backBottomRail: { placeDir: [-1, 0, 0] },
  frontBottomRail: { placeDir: [1, 0, 0] },
} as unknown as StructureOverlay;

test("EKET's migrated joints produce byte-identical parts", () => {
  const migrated = applyStructure(EKET_PARTS, EKET.STRUCTURE, EKET.JOINTS, EKET_GEOMETRY);
  const flat = applyStructure(EKET_PARTS, mergeOverlays(EKET.STRUCTURE, EKET_BEFORE));
  assert.deepEqual(
    migrated,
    flat,
    "the JOINTS route diverged from the flat authoring it replaced — either a derived travel is wrong or lowering emitted something the flat form did not",
  );
});

// The rail is the case the bridged-pair rule exists for: screw105215 already makes the Γ edge, so the joint must emit its travel and NOTHING else. A join array here would stamp a kind onto a kindless edge and let the rail press home before its own dowel is in.
test("BEKVAM's bridged snap emits the travel alone — no join array, no dropOn", () => {
  const migrated = applyStructure(BEKVAM_PARTS, BEKVAM.STRUCTURE, BEKVAM.JOINTS, BEKVAM_GEOMETRY);
  const flat = applyStructure(BEKVAM_PARTS, mergeOverlays(BEKVAM.STRUCTURE, BEKVAM_BEFORE));
  assert.deepEqual(migrated, flat, "the bridged snap changed the parts — it must contribute a travel and nothing else");

  const rail = migrated["backBottomRail" as PartId] as { directJoins?: unknown; dropOn?: unknown; placeDir?: unknown };
  assert.equal(rail.directJoins, undefined, "a hardware-made edge stays the hardware's; the joint may not stamp a kind onto it");
  assert.equal(rail.dropOn, undefined, "with no join array there is no press edge to suppress, so the flag would be dead data");
  assert.deepEqual(rail.placeDir, [-1, 0, 0], "the travel is derived from the contact slab, and it is the value the corpus verified on device");
});

// The negative control for the opt-in rule: LACK authors no JOINTS at all, and the generator has plenty to say about its parts. None of it may reach them.
// DALFRED declares a joint the flat authoring never had — supportPin's tip in circleDown's bore, the contact structuralSweep has carried as a finding since 2026-08-24. It carries `gates: false`, so it states the contact without becoming a precondition: one downward motion, two joints, and only the groove the pin ENTERS constrains the order. Byte-equality is the proof that the second one gates nothing.
test("DALFRED's non-gating joint states a real contact and changes no part", () => {
  const migrated = applyStructure(DALFRED_PARTS, DALFRED.STRUCTURE, DALFRED.JOINTS, DALFRED_GEOMETRY);
  const flat = applyStructure(
    DALFRED_PARTS,
    mergeOverlays(DALFRED.STRUCTURE, { supportPin: { slideJoins: ["circleUpp"] } } as unknown as StructureOverlay),
  );
  assert.deepEqual(migrated, flat, "the circleDown joint leaked into the parts — `gates: false` must emit no join array");
  const pin = migrated["supportPin" as PartId] as { slideJoins?: string[] };
  assert.deepEqual(pin.slideJoins, ["circleUpp"], "only the groove the pin enters may gate; the bore it lands in must not");
});

test("a furniture that authors no JOINTS is untouched by any of this", () => {
  assert.equal((LACK as { JOINTS?: unknown }).JOINTS, undefined, "LACK is the control precisely because it has not migrated");
  assert.deepEqual(
    applyStructure(LACK_PARTS, LACK.STRUCTURE, undefined, undefined),
    applyStructure(LACK_PARTS, LACK.STRUCTURE),
    "derived geometry reached a furniture that never opted in",
  );
});

// Γ's leftover category, named. 48 of the corpus's 85 liaisons carried no kind at all — the MAJORITY of its joins, in a field every reader had to treat as optional. An edge that exists only because a fastener names both endpoints, between parts that state no travel, is a SNAP: they meet in the placement motion itself and the hardware does the joining.
// The counts are pinned per furniture because the GUARD is the interesting part: where either endpoint states a travel the edge is left alone, since a part can travel through a hardware-made joint (BEKVAM's rails are screwed to their legs and still come in along X). EKET names none for exactly that reason — every one of its kindless edges has an endpoint that travels.
const NAMED_SNAP: Record<string, number> = { LACK: 4, BEKVAM: 2, DALFRED: 13, EKET: 0 };
const STILL_UNNAMED: Record<string, number> = { LACK: 0, BEKVAM: 11, DALFRED: 0, EKET: 18 };

test("hardware-made joints with no travel stated are named snap, and the rest are left alone", () => {
  for (const [id, raw] of [["LACK", LACK_PARTS], ["BEKVAM", BEKVAM_PARTS], ["DALFRED", DALFRED_PARTS], ["EKET", EKET_PARTS]] as const) {
    const parts = applyStructure(raw as never, COMPOSED[id]);
    const edges = Object.values(buildLiaisons(parts));
    assert.equal(edges.filter((l) => l.kind === "snap").length, NAMED_SNAP[id], `${id}: named-snap count moved — re-measure`);
    assert.equal(edges.filter((l) => !l.kind).length, STILL_UNNAMED[id], `${id}: unnamed count moved — re-measure`);
    for (const l of edges) {
      if (l.kind !== "snap") continue;
      const a = parts[l.a] as { placeDir?: unknown };
      const b = parts[l.b] as { placeDir?: unknown };
      assert.ok(!a.placeDir && !b.placeDir, `${id}/${l.id}: named a snap although an endpoint states a travel — that denies a motion the manual describes`);
    }
  }
});

// The whole claim of this step: it is VOCABULARY. Every consumer of Liaison.kind tests for slide, screw or press, so a snap edge is skipped exactly where `undefined` was skipped — and `snap` is deliberately outside PRESS_LIKE so validateFurniture sees the same edges it always did.
test("naming the leftover changes no part and no engagement-bearing edge", () => {
  for (const [id, raw] of [["LACK", LACK_PARTS], ["BEKVAM", BEKVAM_PARTS], ["DALFRED", DALFRED_PARTS], ["EKET", EKET_PARTS]] as const) {
    const edges = Object.values(buildLiaisons(applyStructure(raw as never, COMPOSED[id])));
    for (const l of edges) {
      if (l.kind !== "snap") continue;
      assert.equal(l.mover, undefined, `${id}/${l.id}: a classified snap must carry no mover — mover is what andFrontierTargets gates on`);
    }
  }
});
