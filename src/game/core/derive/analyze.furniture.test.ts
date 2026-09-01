// Pins the ANALYZER — the portal's derivation pass — to the shipped corpus, so an uploaded GLB is analyzed by the exact code these numbers were measured on. The convention-authored corpus is the ground truth (the staged-demotion doctrine): extraction must reproduce the identity facts the mesh names declare, the sweep must equal the shipped sweep.gen byte-for-byte when the authored overlay is supplied, pairing must find exactly the one true two-piece fitting, and the host proposals' measured hit-rate is pinned so a regression in the envelope test surfaces as a number moving, not as silently worse wizard prefills.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { analyzeGlb, type AnalyzeHints } from "./analyze";
import { applyStructure, StructureOverlay } from "../model/liaisons";
import type { PartDef, PartId, SweepMap } from "@/src/game/core/type";

import { STRUCTURE as LACK_STRUCTURE } from "@/src/game/content/furnitures/LACK/authored";
import { PARTS as LACK_PARTS } from "@/src/game/content/furnitures/LACK/parts.gen";
import { SWEEP as LACK_SWEEP } from "@/src/game/content/furnitures/LACK/sweep.gen";
import { STRUCTURE as BEKVAM_STRUCTURE } from "@/src/game/content/furnitures/BEKVAM/authored";
import { PARTS as BEKVAM_PARTS } from "@/src/game/content/furnitures/BEKVAM/parts.gen";
import { SWEEP as BEKVAM_SWEEP } from "@/src/game/content/furnitures/BEKVAM/sweep.gen";
import { STRUCTURE as DALFRED_STRUCTURE } from "@/src/game/content/furnitures/DALFRED/authored";
import { PARTS as DALFRED_PARTS } from "@/src/game/content/furnitures/DALFRED/parts.gen";
import { SWEEP as DALFRED_SWEEP } from "@/src/game/content/furnitures/DALFRED/sweep.gen";
import { STRUCTURE as EKET_STRUCTURE } from "@/src/game/content/furnitures/EKET/authored";
import { PARTS as EKET_PARTS } from "@/src/game/content/furnitures/EKET/parts.gen";
import { SWEEP as EKET_SWEEP } from "@/src/game/content/furnitures/EKET/sweep.gen";
import { COMPOSED } from "@/src/game/content/furnitures/composed";

/** Measured corpus state — a moved number means geometry or authoring changed: re-measure, do not weaken. */
const FASTENERS_ANALYZED = 85; // 83 GLB-native + the 2 overlay-retyped suspension caps
const HEAD_CONFIDENT = 71;
const HEAD_ABSTAIN = 14; // the 12 genuinely headless + the 2 re-typed caps (discs — correctly no head call)
/** Host-proposal recall: fraction of mesh-name (fastener → host) truth pairs found in the top-3 envelope ranking. */
const HOST_RECALL_MIN = 0.85;

const CORPUS: [string, Record<PartId, PartDef>, StructureOverlay, SweepMap][] = [
  ["LACK", LACK_PARTS, LACK_STRUCTURE, LACK_SWEEP],
  ["BEKVAM", BEKVAM_PARTS, BEKVAM_STRUCTURE, BEKVAM_SWEEP],
  ["DALFRED", DALFRED_PARTS, DALFRED_STRUCTURE, DALFRED_SWEEP],
  ["EKET", EKET_PARTS, EKET_STRUCTURE, EKET_SWEEP],
];

/** The analyzer's second stage takes the wizard's answers; here the authored overlay stands in for them — re-typings, bindings, travel spans. */
function hintsFrom(structure: StructureOverlay): AnalyzeHints {
  const overlay: NonNullable<AnalyzeHints["overlay"]> = {};
  for (const [id, e] of Object.entries(structure as Record<string, { type?: "structural" | "fastener"; attached?: readonly string[]; parkBackoff?: number }>)) {
    if (e.type === undefined && e.attached === undefined && e.parkBackoff === undefined) continue;
    overlay[id] = {
      ...(e.type !== undefined ? { type: e.type } : {}),
      ...(e.attached !== undefined ? { attached: [...e.attached] } : {}),
      ...(e.parkBackoff !== undefined ? { parkBackoff: e.parkBackoff } : {}),
    };
  }
  return { overlay };
}

test("the analyzer reproduces the corpus: identity, geometry counts, the one true pairing, host recall, and byte-equal sweep data", () => {
  let fastenersAnalyzed = 0, headConfident = 0, headAbstain = 0;
  let hostTruth = 0, hostFound = 0;
  const pairingsSeen: string[] = [];
  for (const [id, raw, structure, gen] of CORPUS) {
    const bytes = fs.readFileSync(path.join(process.cwd(), "src", "assets", "models", "furnitures", id, `${id}.glb`));
    const a = analyzeGlb(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), hintsFrom(structure));
    const played = applyStructure(raw, COMPOSED[id]);

    // 1. extraction ≡ the identity facts the runtime plays (post-overlay)
    assert.deepEqual(Object.keys(a.parts).sort(), Object.keys(played).sort(), `${id}: part id set diverged`);
    for (const p of Object.values(played)) {
      const d = a.parts[p.partId];
      assert.equal(d.group, p.group, `${id}/${p.partId}: group`);
      assert.equal(d.cluster, p.cluster, `${id}/${p.partId}: cluster`);
      assert.equal(d.type, p.type, `${id}/${p.partId}: type proposal diverged from played type`);
      assert.deepEqual(d.attached ?? null, p.attached ? [...p.attached] : null, `${id}/${p.partId}: attached binding`);
      for (let i = 0; i < 3; i++) assert.ok(Math.abs(d.position[i] - p.pose.position[i]) < 1e-4, `${id}/${p.partId}: world position diverged`);
    }

    // 2. fastener geometry counts
    for (const g of Object.values(a.fasteners)) {
      fastenersAnalyzed++;
      if (g.engage) headConfident++;
      else headAbstain++;
    }

    // 3. pairings
    for (const pr of a.pairings) pairingsSeen.push(`${id}:${pr.extraGroup}->${pr.primaryGroup}(${Object.keys(pr.byInstance).length})`);

    // 4. host-proposal recall vs the mesh-name truth
    for (const p of Object.values(played)) {
      if (p.type !== "fastener" || !p.attached) continue;
      for (const host of p.attached) {
        hostTruth++;
        if (a.hostProposals[p.partId]?.includes(host)) hostFound++;
      }
    }

    // 5. the ordering half: with the authored overlay supplied, the analyzer's sweep IS the shipped sweep.gen
    assert.deepEqual(a.sweep, gen, `${id}: analyzer sweep diverged from sweep.gen`);
  }

  assert.equal(fastenersAnalyzed, FASTENERS_ANALYZED, "fastener count moved — re-measure the pins");
  assert.equal(headConfident, HEAD_CONFIDENT, "head-confident count moved — re-measure");
  assert.equal(headAbstain, HEAD_ABSTAIN, "head-abstain count moved — re-measure");
  assert.deepEqual(pairingsSeen, ["EKET:dowel139435->cam139434(8)"], "pairing detection must find exactly the one true two-piece fitting");
  const recall = hostFound / hostTruth;
  assert.ok(recall >= HOST_RECALL_MIN, `host-proposal recall ${(recall * 100).toFixed(1)}% fell below the pinned ${HOST_RECALL_MIN * 100}% (${hostFound}/${hostTruth})`);
});
