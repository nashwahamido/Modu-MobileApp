// Structural sweep pins (milestones 1+2, 2026-08-24) — the occupancy-sweep ordering analysis against the shipped corpus, now via the shared core/model/sweep.ts math that also produces the generated sweep.gen.ts data.
// Pin 1: the checked-in sweep.gen.ts files match a fresh computation from the GLBs — a model re-export or STRUCTURE re-typing without `npx tsx src/game/helper-scripts/derive-sweep.mts` fails here, named.
// Pin 2, measured over all 33 authored placeDirs: an authored travel direction NEVER has an earlier THIRD-PARTY blocker — every blocker on the reverse of an authored placeDir is either placed later or one of the part's own joint partners (whose contact is what park math and two-phase handle; partners precede by liaison logic anyway, so they carry no ordering information). The one exception is itself a finding, not a failure: DALFRED's supportPin tip rests inside circleDown's bore, a REAL coaxial contact the flat authoring never names — the class of unmodeled liaison a portal wizard should PROPOSE. If a re-export moves these counts, re-measure; do not weaken the pin.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { readGlbMeshes, type GlbMesh } from "../derive/glb";
import { applyStructure } from "./liaisons";
import { SWEEP_DIRS } from "./sweep";
import { authoredPlaceDir, partsForSweep, placeOrderOf, sweepFurniture, type AuthoredModule } from "../derive/pipeline";
import { HARDWARE } from "@/src/game/content/hardware";
import type { PartDef, PartId, SweepMap, Vec3 } from "@/src/game/core/type";

import * as LACK from "@/src/game/content/furnitures/LACK/authored";
import { PARTS as LACK_PARTS } from "@/src/game/content/furnitures/LACK/parts.gen";
import { SWEEP as LACK_SWEEP } from "@/src/game/content/furnitures/LACK/sweep.gen";
import * as BEKVAM from "@/src/game/content/furnitures/BEKVAM/authored";
import { PARTS as BEKVAM_PARTS } from "@/src/game/content/furnitures/BEKVAM/parts.gen";
import { SWEEP as BEKVAM_SWEEP } from "@/src/game/content/furnitures/BEKVAM/sweep.gen";
import * as DALFRED from "@/src/game/content/furnitures/DALFRED/authored";
import { PARTS as DALFRED_PARTS } from "@/src/game/content/furnitures/DALFRED/parts.gen";
import { SWEEP as DALFRED_SWEEP } from "@/src/game/content/furnitures/DALFRED/sweep.gen";
import * as EKET from "@/src/game/content/furnitures/EKET/authored";
import { PARTS as EKET_PARTS } from "@/src/game/content/furnitures/EKET/parts.gen";
import { SWEEP as EKET_SWEEP } from "@/src/game/content/furnitures/EKET/sweep.gen";
import { COMPOSED } from "@/src/game/content/furnitures/composed";

/** Measured corpus state — a changed count means the geometry or the authoring moved: re-measure. */
const SCORED = 39;
const EXIT_CLEAR = 16;
const MATE_ONLY = 22;
/** The known unmodeled contact (see header). */
const KNOWN_UNMODELED = new Map([["supportPin", ["circleDown"]]]);

const worldTris = (file: string): Map<string, GlbMesh["tris"]> => new Map(readGlbMeshes(fs.readFileSync(file)).map((m) => [m.partId, m.tris]));

const CORPUS: [string, AuthoredModule, Record<PartId, PartDef>, SweepMap][] = [
  ["LACK", LACK as AuthoredModule, LACK_PARTS, LACK_SWEEP],
  ["BEKVAM", BEKVAM as AuthoredModule, BEKVAM_PARTS, BEKVAM_SWEEP],
  ["DALFRED", DALFRED as AuthoredModule, DALFRED_PARTS, DALFRED_SWEEP],
  ["EKET", EKET as AuthoredModule, EKET_PARTS, EKET_SWEEP],
];

test("sweep.gen.ts files are fresh, and authored travel directions have no earlier third-party blockers", () => {
  let scored = 0, exitClear = 0, mateOnly = 0;
  const unmodeled: string[] = [];
  for (const [id, m, raw, gen] of CORPUS) {
    // PIN 1 composes the parts the way derive-sweep.mts does — `partsForSweep`, joints lowered for their backoff and nothing else. Recomposing them any other way (this test used to reach for the fully COMPOSED overlay) makes the pin compare a fresh sweep against a file built from different inputs, which agrees only for as long as the two compositions happen to hand the sweep the same parkBackoff.
    const tris = worldTris(path.join(process.cwd(), "src", "assets", "models", "furnitures", id, `${id}.glb`));
    const sweep = sweepFurniture(partsForSweep(raw, m), tris);
    assert.deepEqual(sweep, gen, `${id}: sweep.gen.ts is STALE — regenerate with \`npx tsx src/game/helper-scripts/derive-sweep.mts\``);

    // PIN 2 is about the SHIPPED travel directions, so it reads the fully composed parts — the derived placeDirs in structure.gen are exactly what it is scoring.
    const parts = applyStructure(raw, COMPOSED[id]);
    const placeOrder = placeOrderOf(parts, m, HARDWARE);
    const clusters = new Map<string, PartDef[]>();
    for (const p of Object.values(parts)) {
      if (p.type !== "structural" || !tris.has(p.partId)) continue;
      (clusters.get(p.cluster as string) ?? clusters.set(p.cluster as string, []).get(p.cluster as string)!).push(p);
    }

    for (const members of clusters.values()) {
      const partnersOf = (p: PartDef): Set<string> => {
        const out = new Set<string>();
        for (const f of ["pressJoins", "slideJoins", "screwJoins"] as const) {
          for (const t of p[f] ?? []) out.add(t as string);
          for (const q of members) if (q[f]?.includes(p.partId)) out.add(q.partId as string);
        }
        return out;
      };
      for (const p of members) {
        const pd = authoredPlaceDir(p) as Vec3 | undefined;
        if (!pd) continue;
        scored++;
        const dom = [0, 1, 2].reduce((a, b) => (Math.abs(pd[a]) >= Math.abs(pd[b]) ? a : b)) as 0 | 1 | 2;
        const exit = SWEEP_DIRS.find((c) => c.axis === dom && c.sign === -Math.sign(pd[dom]))!;
        const blockers = sweep[p.partId]?.[exit.key] ?? [];
        const earlier = blockers.filter((b) => (placeOrder.get(b) ?? Infinity) < (placeOrder.get(p.partId) ?? Infinity));
        const partners = partnersOf(p);
        const thirdParty = earlier.filter((b) => !partners.has(b));
        if (earlier.length === 0) exitClear++;
        else if (thirdParty.length === 0) mateOnly++;
        else {
          const known = KNOWN_UNMODELED.get(p.partId as string);
          assert.ok(known && thirdParty.every((b) => known.includes(b)), `${id}/${p.partId}: authored placeDir ${JSON.stringify(pd)} has UNEXPLAINED earlier third-party blockers: ${thirdParty.join(", ")}`);
          unmodeled.push(p.partId as string);
        }
      }
    }
  }
  assert.equal(scored, SCORED, "authored placeDir count moved — re-measure the pins before touching the constants");
  assert.equal(exitClear, EXIT_CLEAR, "exit-clear count moved — geometry or authoring changed, re-measure");
  assert.equal(mateOnly, MATE_ONLY, "mate-only count moved — geometry or authoring changed, re-measure");
  assert.deepEqual(unmodeled.sort(), [...KNOWN_UNMODELED.keys()].sort(), "the known-unmodeled-contact list changed");
});
