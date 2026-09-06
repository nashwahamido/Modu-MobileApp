// Pins the fastener-geometry derivations of 2026-08-22→24 (fastener-model-v2 spec, "geometry / wizard split") to the shipped corpus, so the derivers can replace the shaft-on-local-Y frame convention only while they still reproduce the PLAYED values. Three pins, measured on all 83 fasteners across the four furnitures:
//   1. AXIS — vertex PCA parallels the played engageDir on 83/83 (re-confirmed 2026-08-24; includes EKET's stepped cam sleeves).
//   2. HEAD-END CONFIDENCE — the radial-profile head detector abstains on exactly the genuinely headless hardware (BEKVÄM dowels, LACK double-stud bolts, the DALFRED cap, grub-like screw108443) and is confident on the other 71.
//   3. SIGN — on every confident fastener, "engageDir points toward the wide end" matches the played sign with ZERO flips (71/71). Sign via exit-side occupancy was REFUTED (14 confident flips) and must not come back; headless hardware's sign falls to the anchor rule + wizard.
// Truth is applyStructure(parts.gen, STRUCTURE) — what the game actually plays. Since read-parts.mts writes engageDir FROM this deriver, the pin is what keeps that circular-looking arrangement honest: it fails the moment the measured axis or head disagrees with a value a device pass confirmed, so a regression in core/derive/fastenerGeometry.ts surfaces here before it reaches parts.gen.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { applyStructure } from "./liaisons";
import { fastenerGeometry } from "../derive/fastenerGeometry";
import { readGlbMeshes } from "../derive/glb";
import type { PartDef, PartId, Vec3 } from "@/src/game/core/type";

import { STRUCTURE as LACK_STRUCTURE } from "@/src/game/content/furnitures/LACK/authored";
import { PARTS as LACK_PARTS } from "@/src/game/content/furnitures/LACK/parts.gen";
import { STRUCTURE as BEKVAM_STRUCTURE } from "@/src/game/content/furnitures/BEKVAM/authored";
import { PARTS as BEKVAM_PARTS } from "@/src/game/content/furnitures/BEKVAM/parts.gen";
import { STRUCTURE as DALFRED_STRUCTURE } from "@/src/game/content/furnitures/DALFRED/authored";
import { PARTS as DALFRED_PARTS } from "@/src/game/content/furnitures/DALFRED/parts.gen";
import { STRUCTURE as EKET_STRUCTURE } from "@/src/game/content/furnitures/EKET/authored";
import { PARTS as EKET_PARTS } from "@/src/game/content/furnitures/EKET/parts.gen";
import { COMPOSED } from "@/src/game/content/furnitures/composed";

const FURNITURES = [
  { id: "LACK", parts: LACK_PARTS, structure: LACK_STRUCTURE },
  { id: "BEKVAM", parts: BEKVAM_PARTS, structure: BEKVAM_STRUCTURE },
  { id: "DALFRED", parts: DALFRED_PARTS, structure: DALFRED_STRUCTURE },
  { id: "EKET", parts: EKET_PARTS, structure: EKET_STRUCTURE },
] as const;

/** Measured corpus state 2026-08-24 — a re-export that changes these numbers must re-measure, not weaken the pin. */
const CORPUS_FASTENERS = 83;
const HEADLESS_GROUPS = new Set(["dowel101350", "bolt115980", "cap107675", "screw108443"]);
const HEADLESS_INSTANCES = 12;
/** Cosine floor for axis agreement; measured worst case is far above it (BEKVÄM's real 5° splay ≈ 0.996). */
const AXIS_COS_MIN = 0.9;

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};

test("fastener geometry pins: PCA axis 83/83, head-end abstains only on headless hardware, head-side sign has zero flips", () => {
  let total = 0;
  const axisFails: string[] = [], signFlips: string[] = [];
  const abstains: string[] = [], abstainGroups = new Set<string>();
  for (const f of FURNITURES) {
    const glb = path.join(process.cwd(), "src", "assets", "models", "furnitures", f.id, `${f.id}.glb`);
    const meshes = new Map(readGlbMeshes(fs.readFileSync(glb)).map((m) => [m.partId, m]));
    const played = applyStructure(f.parts as Record<PartId, PartDef>, COMPOSED[f.id]);
    for (const p of Object.values(played)) {
      if (p.type !== "fastener" || !p.engageDir) continue;
      // Overlay-RE-TYPED hardware (EKET's suspCap, a disc with authored bindings + engageDir) is excluded: these pins measure derivation against GLB-native fastener geometry, and the frame convention never applied to a re-typed mesh.
      if ((f.parts as Record<string, PartDef>)[p.partId]?.type !== "fastener") continue;
      total++;
      const mesh = meshes.get(p.partId);
      assert.ok(mesh, `${f.id}/${p.partId}: no GLB mesh matches this fastener`);
      const truth = norm(p.engageDir as Vec3);
      const { axis, headRatio, engage } = fastenerGeometry(mesh!);
      if (Math.abs(dot(axis, truth)) < AXIS_COS_MIN) axisFails.push(`${f.id}/${p.partId} cos=${dot(axis, truth).toFixed(3)}`);
      if (!engage) {
        abstains.push(p.partId);
        abstainGroups.add(p.group);
      } else if (dot(engage, truth) <= 0) {
        signFlips.push(`${f.id}/${p.partId} ratio=${headRatio.toFixed(2)}`);
      }
    }
  }
  assert.equal(total, CORPUS_FASTENERS, "corpus size moved — re-measure the pins before touching the constants");
  assert.deepEqual(axisFails, [], "PCA axis no longer parallels the played engageDir");
  assert.deepEqual(signFlips, [], "head-side sign flipped against the played engageDir — the 71/0 pin is broken");
  assert.deepEqual([...abstainGroups].sort(), [...HEADLESS_GROUPS].sort(), "the head detector's abstention set changed — either a mesh changed or the detector regressed");
  assert.equal(abstains.length, HEADLESS_INSTANCES, "headless instance count moved");
});
