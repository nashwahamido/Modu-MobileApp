// Pins the ANALYZER — the drafter's engine (extract-structure.mts) — to the shipped corpus, so a new GLB is analyzed by the exact code these numbers were measured on. The convention-authored corpus is the ground truth: extraction must reproduce the identity facts the mesh names declare, the geometry counts must hold, and pairing must find exactly the one true two-piece fitting.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { analyzeGlb, type AnalyzeHints } from "./analyze";
import { applyStructure, StructureOverlay } from "../model/liaisons";
import type { PartDef, PartId } from "@/src/game/core/type";

import { STRUCTURE as LACK_STRUCTURE } from "@/src/game/content/furnitures/LACK/authored";
import { PARTS as LACK_PARTS } from "@/src/game/content/furnitures/LACK/parts.gen";
import { STRUCTURE as BEKVAM_STRUCTURE } from "@/src/game/content/furnitures/BEKVAM/authored";
import { PARTS as BEKVAM_PARTS } from "@/src/game/content/furnitures/BEKVAM/parts.gen";
import { STRUCTURE as DALFRED_STRUCTURE } from "@/src/game/content/furnitures/DALFRED/authored";
import { PARTS as DALFRED_PARTS } from "@/src/game/content/furnitures/DALFRED/parts.gen";
import { STRUCTURE as EKET_STRUCTURE } from "@/src/game/content/furnitures/EKET/authored";
import { PARTS as EKET_PARTS } from "@/src/game/content/furnitures/EKET/parts.gen";
import { COMPOSED } from "@/src/game/content/furnitures/composed";

/** Measured corpus state — a moved number means geometry or authoring changed: re-measure, do not weaken. */
const FASTENERS_ANALYZED = 85; // 83 GLB-native + the 2 overlay-retyped suspension caps
const HEAD_CONFIDENT = 71;
const HEAD_ABSTAIN = 14; // the 12 genuinely headless + the 2 re-typed caps (discs — correctly no head call)

const CORPUS: [string, Record<PartId, PartDef>, StructureOverlay][] = [
  ["LACK", LACK_PARTS, LACK_STRUCTURE],
  ["BEKVAM", BEKVAM_PARTS, BEKVAM_STRUCTURE],
  ["DALFRED", DALFRED_PARTS, DALFRED_STRUCTURE],
  ["EKET", EKET_PARTS, EKET_STRUCTURE],
];

/** The analyzer's overlay stage takes a human's re-typings; here the COMPOSED overlay stands in for them. */
function hintsFrom(structure: StructureOverlay): AnalyzeHints {
  const overlay: NonNullable<AnalyzeHints["overlay"]> = {};
  for (const [id, e] of Object.entries(structure as Record<string, { type?: "structural" | "fastener"; attached?: readonly string[] }>)) {
    if (e.type === undefined && e.attached === undefined) continue;
    overlay[id] = {
      ...(e.type !== undefined ? { type: e.type } : {}),
      ...(e.attached !== undefined ? { attached: [...e.attached] } : {}),
    };
  }
  return { overlay };
}

test("the analyzer reproduces the corpus: identity, geometry counts, and the one true pairing", () => {
  let fastenersAnalyzed = 0, headConfident = 0, headAbstain = 0;
  const pairingsSeen: string[] = [];
  for (const [id, raw] of CORPUS) {
    const bytes = fs.readFileSync(path.join(process.cwd(), "src", "assets", "models", "furnitures", id, `${id}.glb`));
    const a = analyzeGlb(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), hintsFrom(COMPOSED[id]));
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
  }

  assert.equal(fastenersAnalyzed, FASTENERS_ANALYZED, "fastener count moved — re-measure the pins");
  assert.equal(headConfident, HEAD_CONFIDENT, "head-confident count moved — re-measure");
  assert.equal(headAbstain, HEAD_ABSTAIN, "head-abstain count moved — re-measure");
  assert.deepEqual(pairingsSeen, ["EKET:dowel139435->cam139434(8)"], "pairing detection must find exactly the one true two-piece fitting");
});
