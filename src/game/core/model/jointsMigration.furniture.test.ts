// The acceptance criterion for moving a furniture's joints from the flat arrays into JOINTS: the parts come out BYTE-IDENTICAL to what the flat authoring produced.
// It is deliberately not "Γ is equivalent". If applyStructure returns the same PartDefs the device ran before, then every consumer downstream — drag, park math, sweep, visibility, evaluation — is provably unaffected, and the migration lands without a device pass. That is the whole reason this change can be trusted without one, so the test states the OLD authoring literally rather than deriving it: a reconstruction that drifted with the code would prove nothing.
// Each entry below is exactly what the migration DELETED from that furniture's STRUCTURE. Migrating another part means adding its old fields here — and if the derived travel disagrees with what was authored, this fails rather than the difference reaching a player.
import { test } from "node:test";
import assert from "node:assert/strict";

import { applyStructure, buildLiaisons, type StructureOverlay } from "./liaisons";
import { mergeOverlays } from "../derive/joints";
import { composeStructure } from "../derive/structure";
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

/** What EKET's STRUCTURE said before the migration, verbatim — every field the JOINTS list took over. Both brackets kept their tool-visual fields (engageDir/insertProud/toolAnchor), and each drawer side kept its own placeDir: an approach describes the MOVER, and a side is the mover only when it seats second. */
const EKET_BEFORE = {
  suspBracket_1: { pressJoins: ["sidePanelR"], placeDir: [0, 0, -1] },
  suspBracket_2: { pressJoins: ["sidePanelL"], placeDir: [0, 0, 1] },
  drawerBottom_1: { slideJoins: ["drawerSideL_1", "drawerSideR_1", "drawerFront_1"], placeDir: [1, 0, 0] },
  drawerBottom_2: { slideJoins: ["drawerSideL_2", "drawerSideR_2", "drawerFront_2"], placeDir: [1, 0, 0] },
  sidePanelL: { pressJoins: ["topPanel", "bottomPanel"], placeDir: [0, 0, -1], lockDir: [-1, 0, 0] },
  sidePanelR: { pressJoins: ["topPanel", "bottomPanel"], placeDir: [0, 0, 1], lockDir: [-1, 0, 0] },
  topPanel: { lockDir: [1, 0, 0] },
  bottomPanel: { lockDir: [1, 0, 0] },
  backPanel: { slideJoins: ["sidePanelL", "sidePanelR"], placeDir: [0, 1, 0] },
  suspKnob_1: { screwJoins: ["suspBracket_2"], placeDir: [1, 0, 0] },
  suspKnob_2: { screwJoins: ["suspBracket_1"], placeDir: [1, 0, 0] },
  suspCover_1: { pressJoins: ["suspBracket_1"], dropOn: true },
  suspCover_2: { pressJoins: ["suspBracket_2"], dropOn: true },
  ...Object.fromEntries(["1", "2"].flatMap((s) => [
    [`drawerFront_${s}`, { pressJoins: [`drawerSideL_${s}`, `drawerSideR_${s}`], placeDir: [-1, 0, 0], lockDir: [0, -1, 0] }],
    [`drawerSideL_${s}`, { pressJoins: [`drawerFront_${s}`], lockDir: [0, 1, 0] }],
    [`drawerSideR_${s}`, { pressJoins: [`drawerFront_${s}`], lockDir: [0, 1, 0] }],
    [`runnerMiddleL_${s}`, { pressJoins: [`runnerFrameL_${s}`] }],
    [`runnerMiddleR_${s}`, { pressJoins: [`runnerFrameR_${s}`] }],
    [`runnerCarriageL_${s}`, { pressJoins: [`runnerMiddleL_${s}`] }],
    [`runnerCarriageR_${s}`, { pressJoins: [`runnerMiddleR_${s}`] }],
    [`runnerClip_${s}`, { slideJoins: [`runnerCarriageL_${s}`], placeDir: [-1, 0, 0], parkBackoff: 0.03 }],
    [`runnerClip_${s === "1" ? "3" : "4"}`, { slideJoins: [`runnerCarriageR_${s}`], placeDir: [-1, 0, 0], parkBackoff: 0.03 }],
  ])),
} as unknown as StructureOverlay;

/** The three places EKET's joints deliberately do NOT reproduce the flat fields. Byte-identity is the bar precisely so an exception has to be written down: each entry says what the flat form had that the joint route drops (`gone`) and what it adds (`added`), and everything outside this map is still compared byte-for-byte, so a fourth divergence fails rather than slipping in behind these. These three are the parts of the migration a device pass still has to confirm. */
const EKET_DIVERGENCE: Record<string, { gone?: Record<string, unknown>; added?: Record<string, unknown> }> = {
  // The redundant half of a pair the flat form stated from BOTH ends. A joint states it once, from the mover; Γ is undirected (buildLiaisons sorts the endpoints) and every array reader scans both directions, which the Γ assertion below pins.
  ...Object.fromEntries(["1", "2"].flatMap((s) => [
    [`drawerSideL_${s}`, { gone: { pressJoins: [`drawerFront_${s}`] } }],
    [`drawerSideR_${s}`, { gone: { pressJoins: [`drawerFront_${s}`] } }],
    // A press joint always lowers a travel, and these bodies had none: the derivation reads the middle↔frame contact normal, which is the vertical face they meet on, not the X the middle rides. Harmless where it lands — a non-lead component body is cascade-placed and never drags — but it is new data, not a reproduction.
    [`runnerMiddleL_${s}`, { added: { placeDir: [0, 1, 0] } }],
    [`runnerMiddleR_${s}`, { added: { placeDir: [0, 1, 0] } }],
  ])),
  // The cover's snap emits its edge and its dropOn exactly as the flat form did — suspCap is RE-TYPED hardware, a bare structural node in parts.gen, so it bridges nothing at the moment lowering asks. What the joint adds is the travel, and it is the motion the manual describes: the cover pushes on along −X.
  suspCover_1: { added: { placeDir: [-1, 0, 0] } },
  suspCover_2: { added: { placeDir: [-1, 0, 0] } },
};

/** BEKVAM's rail authored a travel and NO join array — every joint in that furniture is made by hardware. Its snap therefore has to lower to the travel alone. */
const BEKVAM_BEFORE = {
  backBottomRail: { placeDir: [-1, 0, 0] },
  frontBottomRail: { placeDir: [1, 0, 0] },
} as unknown as StructureOverlay;

test("EKET's migrated joints produce byte-identical parts, bar three declared divergences", () => {
  const migrated = applyStructure(EKET_PARTS, composeStructure(EKET_PARTS, EKET.STRUCTURE, { joints: EKET.JOINTS, geometry: EKET_GEOMETRY })) as unknown as Record<string, Record<string, unknown>>;
  const flat = applyStructure(EKET_PARTS, mergeOverlays(EKET.STRUCTURE, EKET_BEFORE)) as unknown as Record<string, Record<string, unknown>>;

  // Each declared divergence has to be REAL: the flat field present and the joint route's missing, and vice versa. A divergence that quietly stopped happening is as much a change as a new one.
  const strip = (p: Record<string, unknown>, keys: Record<string, unknown> | undefined): Record<string, unknown> => {
    const out = { ...p };
    for (const k of Object.keys(keys ?? {})) delete out[k];
    return out;
  };
  for (const [id, d] of Object.entries(EKET_DIVERGENCE)) {
    for (const [k, v] of Object.entries(d.gone ?? {})) {
      assert.deepEqual(flat[id]?.[k], v, `${id}.${k}: the pre-migration value this divergence is declared against is not what the flat route produces`);
      assert.equal(migrated[id]?.[k], undefined, `${id}.${k}: declared as dropped by the joint route, but it is still there`);
    }
    for (const [k, v] of Object.entries(d.added ?? {})) {
      assert.equal(flat[id]?.[k], undefined, `${id}.${k}: declared as added by the joint route, but the flat route has it too`);
      assert.deepEqual(migrated[id]?.[k], v, `${id}.${k}: the joint route no longer adds the value this divergence declares`);
    }
  }

  const normalized = (parts: Record<string, Record<string, unknown>>, pick: "gone" | "added") =>
    Object.fromEntries(Object.entries(parts).map(([id, p]) => [id, strip(p, EKET_DIVERGENCE[id]?.[pick])]));
  assert.deepEqual(
    normalized(migrated, "added"),
    normalized(flat, "gone"),
    "the JOINTS route diverged from the flat authoring it replaced, outside the three declared exceptions — either a derived travel is wrong or lowering emitted something the flat form did not",
  );

  // Γ is the guarantee the dropped reverse arrays rest on: identical edges, kinds and movers, so a pair stated once from its mover joins exactly what it joined when both ends declared it.
  assert.deepEqual(
    buildLiaisons(migrated as never),
    buildLiaisons(flat as never),
    "Γ moved — a join the flat form declared from both ends is no longer the same edge when the joint declares it once",
  );
});

// The rail is the case the bridged-pair rule exists for: screw105215 already makes the Γ edge, so the joint must emit its travel and NOTHING else. A join array here would stamp a kind onto a kindless edge and let the rail press home before its own dowel is in.
test("BEKVAM's bridged snap emits the travel alone — no join array, no dropOn", () => {
  const migrated = applyStructure(BEKVAM_PARTS, composeStructure(BEKVAM_PARTS, BEKVAM.STRUCTURE, { joints: BEKVAM.JOINTS, geometry: BEKVAM_GEOMETRY }));
  const flat = applyStructure(BEKVAM_PARTS, mergeOverlays(BEKVAM.STRUCTURE, BEKVAM_BEFORE));
  assert.deepEqual(migrated, flat, "the bridged snap changed the parts — it must contribute a travel and nothing else");

  const rail = migrated["backBottomRail" as PartId] as { pressJoins?: unknown; dropOn?: unknown; placeDir?: unknown };
  assert.equal(rail.pressJoins, undefined, "a hardware-made edge stays the hardware's; the joint may not stamp a kind onto it");
  assert.equal(rail.dropOn, undefined, "with no join array there is no press edge to suppress, so the flag would be dead data");
  assert.deepEqual(rail.placeDir, [-1, 0, 0], "the travel is derived from the contact slab, and it is the value the corpus verified on device");
});

// The negative control for the opt-in rule: LACK authors no JOINTS at all, and the generator has plenty to say about its parts. None of it may reach them.
// DALFRED declares a joint the flat authoring never had — supportPin's tip in circleDown's bore, the contact structuralSweep has carried as a finding since 2026-08-24. It carries `gates: false`, so it states the contact without becoming a precondition: one downward motion, two joints, and only the groove the pin ENTERS constrains the order. Byte-equality is the proof that the second one gates nothing.
test("DALFRED's non-gating joint states a real contact and changes no part", () => {
  const migrated = applyStructure(DALFRED_PARTS, composeStructure(DALFRED_PARTS, DALFRED.STRUCTURE, { joints: DALFRED.JOINTS, geometry: DALFRED_GEOMETRY }));
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
    applyStructure(LACK_PARTS, composeStructure(LACK_PARTS, LACK.STRUCTURE, {})),
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
