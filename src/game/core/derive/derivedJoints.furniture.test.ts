// Derived joint geometry pins (2026-09-01) — the travel vectors core/derive/jointGeometry.ts computes from the contact slabs, scored against the whole shipped corpus.
// Pin 1: the checked-in joints.gen.ts files match a fresh computation from the GLBs — a model re-export or STRUCTURE change without `npx tsx src/game/helper-scripts/derive-structure.mts --write` fails here, named.
// Pin 2, the one that earns the feature: a derived vector NEVER contradicts a placeDir the corpus authors by hand. Those 33 values are device-verified, so a derivation that disagrees with one is wrong about a fact somebody already checked on a phone — it fails here rather than misdirecting a drag. A disagreement that is genuinely correct goes in KNOWN_DIVERGENT with its reason; the map is empty today because nothing disagrees.
// Pin 3: the counts. UNVALIDATED is the uncomfortable one and is meant to be: those parts author no placeDir, so pin 2 cannot see them and nothing has confirmed the direction they were handed. They are inert until a JOINTS entry names their part — the count is here so that stops being invisible.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { HARDWARE } from "@/src/game/content/hardware";
import { boxesByName } from "./boxes";
import { readGlbMeshes } from "./glb";
import { authoredPlaceDir, deriveFurnitureGeometry, type AuthoredModule } from "./pipeline";
import { applyStructure, buildLiaisons, isConnector } from "../model/liaisons";
import { composeStructure } from "./structure";
import type { LiaisonMap, PartBox, PartDef, PartId, SweepMap, Vec3 } from "@/src/game/core/type";

import * as LACK from "@/src/game/content/furnitures/LACK/authored";
import { PARTS as LACK_PARTS } from "@/src/game/content/furnitures/LACK/parts.gen";
import { SWEEP as LACK_SWEEP } from "@/src/game/content/furnitures/LACK/sweep.gen";
import { JOINT_GEOMETRY as LACK_GEN } from "@/src/game/content/furnitures/LACK/joints.gen";
import { STRUCTURE_COMPOSED as LACK_COMPOSED } from "@/src/game/content/furnitures/LACK/structure.gen";
import { LIAISONS as LACK_GAMMA } from "@/src/game/content/furnitures/LACK/liaisons.gen";
import * as BEKVAM from "@/src/game/content/furnitures/BEKVAM/authored";
import { PARTS as BEKVAM_PARTS } from "@/src/game/content/furnitures/BEKVAM/parts.gen";
import { SWEEP as BEKVAM_SWEEP } from "@/src/game/content/furnitures/BEKVAM/sweep.gen";
import { JOINT_GEOMETRY as BEKVAM_GEN } from "@/src/game/content/furnitures/BEKVAM/joints.gen";
import { STRUCTURE_COMPOSED as BEKVAM_COMPOSED } from "@/src/game/content/furnitures/BEKVAM/structure.gen";
import { LIAISONS as BEKVAM_GAMMA } from "@/src/game/content/furnitures/BEKVAM/liaisons.gen";
import * as DALFRED from "@/src/game/content/furnitures/DALFRED/authored";
import { PARTS as DALFRED_PARTS } from "@/src/game/content/furnitures/DALFRED/parts.gen";
import { SWEEP as DALFRED_SWEEP } from "@/src/game/content/furnitures/DALFRED/sweep.gen";
import { JOINT_GEOMETRY as DALFRED_GEN } from "@/src/game/content/furnitures/DALFRED/joints.gen";
import { STRUCTURE_COMPOSED as DALFRED_COMPOSED } from "@/src/game/content/furnitures/DALFRED/structure.gen";
import { LIAISONS as DALFRED_GAMMA } from "@/src/game/content/furnitures/DALFRED/liaisons.gen";
import * as EKET from "@/src/game/content/furnitures/EKET/authored";
import { PARTS as EKET_PARTS } from "@/src/game/content/furnitures/EKET/parts.gen";
import { SWEEP as EKET_SWEEP } from "@/src/game/content/furnitures/EKET/sweep.gen";
import { JOINT_GEOMETRY as EKET_GEN } from "@/src/game/content/furnitures/EKET/joints.gen";
import { STRUCTURE_COMPOSED as EKET_COMPOSED } from "@/src/game/content/furnitures/EKET/structure.gen";
import { LIAISONS as EKET_GAMMA } from "@/src/game/content/furnitures/EKET/liaisons.gen";

/** Measured corpus state — a changed count means the geometry, the authoring or the rule moved: re-measure and understand WHY before touching these. */
// Re-measured 2026-09-02, `hookAndSlot` added to ACROSS: four keyholes (sidePanelL, sidePanelR, drawerFront_1, drawerFront_2) left the slab-long SHEAR branch for the contact normal and each landed EXACTLY on its device-verified authored value, so MATCHED and DERIVED rose by four and UNDETERMINED fell by four. That the normal reproduces four values somebody checked on a phone, which the shear branch could not, is the evidence the classification was wrong.
const DERIVED = 49;
const MATCHED = 12;
const UNDETERMINED = 12;
/** Derived vectors on parts that author none, so pin 2 cannot check them. Two populations: parts nothing has ever confirmed, and parts MIGRATED to JOINTS — those gave up their authored value on purpose and are guarded by jointsMigration.furniture.test.ts instead, which pins the exact pre-migration parts. A migration therefore moves a part from MATCHED to here, and both counts move together. */
const UNVALIDATED = 37;
/** A derived vector that legitimately disagrees with an authored one: partId → why. Empty is the healthy state. */
const KNOWN_DIVERGENT = new Map<string, string>();
/** Derived vectors the JOINING HARDWARE contradicts — open BUGS, not accepted exceptions. Each is a vector the contact slab got wrong and nothing else could catch, since neither part authors a placeDir for the honesty guard to check. Listed so the pin stays green while no NEW one can appear unnoticed; the entry is deleted when the rule stops producing it, and the pin fails if a listed one starts agreeing. */
const KNOWN_WRONG_AXIS = new Map<string, string>();
/** Derived vectors a joint-defining connector can adjudicate — the only independent check that reaches the UNVALIDATED ones. Ten of forty-three: most joints are made by securers, whose drive axis says nothing about how the parts came together. */
const CONNECTOR_SCORED = 11;

const glbBoxes = (file: string): Record<string, PartBox> => boxesByName(readGlbMeshes(fs.readFileSync(file)));

type Mod = AuthoredModule;
const CORPUS = [
  ["LACK", LACK as unknown as Mod, LACK_PARTS, LACK_SWEEP, LACK_GEN, LACK_COMPOSED, LACK_GAMMA],
  ["BEKVAM", BEKVAM as unknown as Mod, BEKVAM_PARTS, BEKVAM_SWEEP, BEKVAM_GEN, BEKVAM_COMPOSED, BEKVAM_GAMMA],
  ["DALFRED", DALFRED as unknown as Mod, DALFRED_PARTS, DALFRED_SWEEP, DALFRED_GEN, DALFRED_COMPOSED, DALFRED_GAMMA],
  ["EKET", EKET as unknown as Mod, EKET_PARTS, EKET_SWEEP, EKET_GEN, EKET_COMPOSED, EKET_GAMMA],
] as const;

/** Recompute one furniture's geometry by calling the SAME function derive-structure.mts calls. This used to be a hand-kept copy of the script's setup, which made the pin worth exactly as much as somebody's memory to update both — the sweep pin and its own script had already drifted on how they compose the parts. Everything specific to a pin stays here; nothing about the derivation does. */
function recompute(id: string, mod: Mod, raw: unknown, sweep: unknown) {
  const named = glbBoxes(path.join(process.cwd(), "src", "assets", "models", "furnitures", id, `${id}.glb`));
  return deriveFurnitureGeometry(raw as Record<PartId, PartDef>, mod, named, sweep as SweepMap, HARDWARE);
}

test("the checked-in joints.gen.ts files match a fresh computation from the GLBs", () => {
  for (const [id, mod, raw, sweep, gen] of CORPUS) {
    const { geometry } = recompute(id, mod, raw, sweep);
    assert.deepEqual(
      geometry,
      gen,
      `${id}: joints.gen.ts is STALE — regenerate with \`npx tsx src/game/helper-scripts/derive-structure.mts --write\``,
    );
  }
});

// The device-verified vectors are the ground truth this rule is answerable to. A derivation that contradicts one is not a difference of opinion: somebody held the phone and confirmed the part goes in that way.
test("no derived vector contradicts a placeDir the corpus authors by hand", () => {
  let matched = 0;
  let undetermined = 0;
  let unvalidated = 0;
  for (const [id, mod, raw, sweep] of CORPUS) {
    const { parts, geometry } = recompute(id, mod, raw, sweep);
    for (const p of Object.values(parts)) {
      const authored = authoredPlaceDir(p);
      const derived = geometry[p.partId]?.placeDir;
      if (!authored) {
        if (derived) unvalidated++;
        continue;
      }
      if (!derived) {
        undetermined++;
        continue;
      }
      const l = Math.hypot(authored[0], authored[1], authored[2]) || 1;
      const unit: Vec3 = [authored[0] / l, authored[1] / l, authored[2] / l];
      if (derived.every((n, i) => Math.abs(n - unit[i]) < 1e-6)) {
        matched++;
        continue;
      }
      const known = KNOWN_DIVERGENT.get(p.partId as string);
      assert.ok(
        known,
        `${id}/${p.partId}: derived ${JSON.stringify(derived)} CONTRADICTS the authored placeDir ${JSON.stringify(authored)} — the authored value was verified on device, so either the rule is wrong or this belongs in KNOWN_DIVERGENT with a reason`,
      );
    }
  }
  assert.equal(matched, MATCHED, "matched-authored count moved — re-measure before touching the constant");
  assert.equal(undetermined, UNDETERMINED, "undetermined count moved — re-measure before touching the constant");
  assert.equal(unvalidated, UNVALIDATED, "unvalidated count moved — these vectors have no authored value to check them against, so a change here is unreviewed by construction");
});

// Independent evidence, and the only check that can reach the UNVALIDATED vectors: where a fastener bridges the pair, its engageDir says which way the hardware drives, derived from the mesh by a wholly different route than the contact slab. If the two disagree, the slab is lying about the joining axis — which is exactly what happens on BEKVAM, where a ~5° splayed leg makes the axis-aligned overlap box thinnest along an axis the dowel never drives along.
test("a derived axis agrees with the hardware that joins the pair", () => {
  let checked = 0;
  const wrong: string[] = [];
  const healed: string[] = [];
  for (const [id, mod, raw, sweep] of CORPUS) {
    const { parts, notes } = recompute(id, mod, raw, sweep);
    // CONNECTORS only (pin/threaded/cam), never a securer: a dowel IS the joint, so the way it drives is the way the parts come together, while a screw is driven into an already-seated pair along whatever axis its hole runs — BEKVAM's back rail presses back along -X and is then screwed sideways along Z, and both are correct.
    const fasteners = Object.values(parts).filter((p) => isConnector(p) && p.engageDir);
    for (const n of notes) {
      if (n.status !== "derived" || !n.value) continue;
      const f = fasteners.find((p) => p.attached!.includes(n.partId as never) && p.attached!.includes(n.partner as never));
      if (!f) continue;
      const e = f.engageDir!;
      const el = Math.hypot(e[0], e[1], e[2]) || 1;
      const dot = Math.abs((e[0] * n.value[0] + e[1] * n.value[1] + e[2] * n.value[2]) / el);
      checked++;
      const key = `${id}/${n.partId}`;
      if (dot > 0.9) {
        if (KNOWN_WRONG_AXIS.has(key)) healed.push(key);
      } else if (!KNOWN_WRONG_AXIS.has(key)) {
        wrong.push(`${key}: derived ${JSON.stringify(n.value)} but ${f.partId} drives along ${JSON.stringify(e)} (|dot| ${dot.toFixed(3)})`);
      }
    }
  }
  assert.deepEqual(wrong, [], "the contact slab disagrees with the hardware that MAKES these joints, so the derived axes are wrong");
  assert.deepEqual(healed, [], "listed in KNOWN_WRONG_AXIS but the axes now agree — the rule was fixed, so delete the entries");
  assert.equal(checked, CONNECTOR_SCORED, "connector-scored count moved — re-measure");
});

test("the derived total is pinned, and derivation never emits a join array", () => {
  let derived = 0;
  for (const [, , , , gen] of CORPUS) {
    for (const entry of Object.values(gen as Record<string, Record<string, unknown>>)) {
      derived++;
      for (const key of Object.keys(entry)) {
        assert.ok(
          key === "placeDir" || key === "lockDir",
          `joints.gen.ts carries "${key}" — derivation emits VECTORS only; a join array here would let a derived guess fabricate a Γ edge and move the build order`,
        );
      }
    }
  }
  assert.equal(derived, DERIVED, "derived count moved — geometry, authoring or the rule changed: re-measure");
});

// structure.gen.ts is the one artifact a reviewer can read to see what a joint actually DID — the join array it emitted or withheld, the dropOn it added or did not, the travel it took from joints.gen. That is only worth anything if the file matches what applyStructure will compute at load time, which is why both go through composeStructure rather than each having its own opinion.
test("the checked-in structure.gen.ts files match a fresh composition", () => {
  for (const [id, mod, raw, , gen, composed] of CORPUS) {
    // RAW parts, because that is what applyStructure hands composeStructure at load time. The difference is not academic: the bridged-pair rule looks for a fastener that already names both endpoints, and a RE-TYPED one (EKET's suspCap) only becomes a fastener once the overlay is applied — composing against the re-typed parts would suppress a join array the device emits.
    assert.deepEqual(
      JSON.parse(JSON.stringify(composeStructure(raw as never, mod.STRUCTURE, { joints: mod.JOINTS, geometry: gen, fasteners: mod.FASTENERS }))),
      JSON.parse(JSON.stringify(composed)),
      `${id}: structure.gen.ts is STALE — regenerate with \`npx tsx src/game/helper-scripts/derive-structure.mts --write\``,
    );
  }
});

// Γ used to be derived on the device at import time, so it could not go stale and could not be reviewed either. Frozen into liaisons.gen.ts it can be read — and can now drift, which is what this pin is for: parts.gen or structure.gen regenerating without it would hand the game an edge set that no longer matches the corpus.
// COMPOSED parts, exactly as each index.ts builds them: the snap heuristic guards on placeDir, which only exists after applyStructure, so raw parts would name edges the device leaves unnamed.
test("the checked-in liaisons.gen.ts files match a fresh derivation from the composed parts", () => {
  for (const [id, , raw, , , composed, gamma] of CORPUS) {
    const fresh = buildLiaisons(applyStructure(raw as Record<PartId, PartDef>, composed));
    assert.deepEqual(
      JSON.parse(JSON.stringify(fresh)),
      JSON.parse(JSON.stringify(gamma as LiaisonMap)),
      `${id}: liaisons.gen.ts is STALE — regenerate with \`npx tsx src/game/helper-scripts/derive-structure.mts --write\``,
    );
    // ORDER, separately: deepEqual does not see it, and consumers iterate Object.values(liaisons). Freezing Γ took its iteration order out of buildLiaisons' traversal and put it in a file, so the file has to keep the order the traversal produced or the graph is the same and the walk is not.
    assert.deepEqual(
      Object.keys(gamma as LiaisonMap),
      Object.keys(fresh),
      `${id}: liaisons.gen.ts holds the right edges in the WRONG ORDER — emit them in buildLiaisons' own insertion order`,
    );
  }
});
