// Regenerates each furniture's joints.gen.ts — the travel vectors derived from the contact slabs at baked pose (core/model/jointGeometry.ts). Run AFTER derive-sweep.mts, whose blocker data the sign rule consumes, and after any model re-export or JOINTS/STRUCTURE change:
//   npx tsx src/game/helper-scripts/derive-joints.mts            # report only, writes nothing
//   npx tsx src/game/helper-scripts/derive-joints.mts --write     # emit the joints.gen.ts files
// The report is the point during bring-up: it scores every derived vector against the placeDir the corpus authors by hand today, so the rule is measured against 33 device-verified values before anything consumes it. The derivedJoints.furniture.test.ts pin asserts the checked-in files match a fresh computation — a stale file fails there, named.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyStructure, buildLiaisons, composeStructure } from "@/src/game/core/model/liaisons";
import { composeFurnitureActions } from "@/src/game/core/composition/composeActions";
import { HARDWARE } from "@/src/game/content/hardware";
import { buildComponents } from "@/src/game/core/model/components";
import { deriveJointGeometry, statementsFor, type DerivationNote } from "@/src/game/core/model/jointGeometry";
import type { PartBox, PartDef, PartId, SweepMap, Vec3 } from "@/src/game/core/type";
import type { JointDef } from "@/src/game/core/model/joints";

import * as LACK from "@/src/game/content/furnitures/LACK/authored";
import * as BEKVAM from "@/src/game/content/furnitures/BEKVAM/authored";
import * as DALFRED from "@/src/game/content/furnitures/DALFRED/authored";
import * as EKET from "@/src/game/content/furnitures/EKET/authored";
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

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MODELS = path.join(ROOT, "..", "..", "assets", "models", "furnitures");
const OUT = path.join(ROOT, "..", "content", "furnitures");
const WRITE = process.argv.includes("--write");
// `--why partA,partB` dumps EVERY candidate contact for those parts, not just the winning one — the generator's value is that it can explain an abstention, and an abstention is only readable next to the contacts that produced it.
const WHY = new Set((process.argv.find((a) => a.startsWith("--why="))?.slice(6) ?? "").split(",").filter(Boolean));

// World-box parser — the same flat-hierarchy convention as visibilitySweep.furniture.test.ts's copy, duplicated for the same reason (importing a test file would run its tests).
const rotQ = ([x, y, z, w]: number[], [vx, vy, vz]: Vec3): Vec3 => {
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
};
function parseGlb(file: string) {
  const b = fs.readFileSync(file);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString("utf8"));
  const off = 20 + jsonLen;
  return { json, bin: b.subarray(off + 8, off + 8 + b.readUInt32LE(off)) };
}
function readPositions(json: any, bin: Buffer, ai: number): Vec3[] {
  const acc = json.accessors[ai];
  const bv = json.bufferViews[acc.bufferView];
  const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const stride = bv.byteStride ?? 12;
  const out: Vec3[] = new Array(acc.count);
  for (let i = 0; i < acc.count; i++) {
    const o = base + i * stride;
    out[i] = [bin.readFloatLE(o), bin.readFloatLE(o + 4), bin.readFloatLE(o + 8)];
  }
  return out;
}
function glbBoxes(file: string): Record<string, PartBox> {
  const { json, bin } = parseGlb(file);
  const out: Record<string, PartBox> = {};
  for (const n of json.nodes ?? []) {
    if (!n.name || n.mesh == null) continue;
    const t = n.translation ?? [0, 0, 0];
    const q = n.rotation ?? [0, 0, 0, 1];
    const s = n.scale ?? [1, 1, 1];
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    const lmin = [Infinity, Infinity, Infinity];
    const lmax = [-Infinity, -Infinity, -Infinity];
    let any = false;
    for (const prim of json.meshes[n.mesh].primitives) {
      if (prim.attributes.POSITION == null) continue;
      for (const v of readPositions(json, bin, prim.attributes.POSITION)) {
        const r = rotQ(q, [v[0] * s[0], v[1] * s[1], v[2] * s[2]]);
        const w: Vec3 = [r[0] + t[0], r[1] + t[1], r[2] + t[2]];
        any = true;
        for (let k = 0; k < 3; k++) {
          if (w[k] < min[k]) min[k] = w[k];
          if (w[k] > max[k]) max[k] = w[k];
          if (v[k] < lmin[k]) lmin[k] = v[k];
          if (v[k] > lmax[k]) lmax[k] = v[k];
        }
      }
    }
    if (!any) continue;
    const lc: Vec3 = [((lmin[0] + lmax[0]) / 2) * s[0], ((lmin[1] + lmax[1]) / 2) * s[1], ((lmin[2] + lmax[2]) / 2) * s[2]];
    const rc = rotQ(q, lc);
    out[n.name] = {
      min: [min[0], min[1], min[2]],
      max: [max[0], max[1], max[2]],
      obb: {
        center: [rc[0] + t[0], rc[1] + t[1], rc[2] + t[2]],
        axes: [rotQ(q, [1, 0, 0]), rotQ(q, [0, 1, 0]), rotQ(q, [0, 0, 1])],
        half: [((lmax[0] - lmin[0]) / 2) * s[0], ((lmax[1] - lmin[1]) / 2) * s[1], ((lmax[2] - lmin[2]) / 2) * s[2]],
      },
    };
  }
  return out;
}

const CORPUS = [
  ["LACK", LACK_PARTS, LACK_STRUCTURE, LACK_SWEEP, LACK],
  ["BEKVAM", BEKVAM_PARTS, BEKVAM_STRUCTURE, BEKVAM_SWEEP, BEKVAM],
  ["DALFRED", DALFRED_PARTS, DALFRED_STRUCTURE, DALFRED_SWEEP, DALFRED],
  ["EKET", EKET_PARTS, EKET_STRUCTURE, EKET_SWEEP, EKET],
] as const;

const fmt = (v: Vec3): string => `[${v.map((n) => (Math.abs(n) < 1e-6 ? 0 : +n.toFixed(2))).join(",")}]`;
const same = (a: Vec3, b: Vec3): boolean => a.every((n, i) => Math.abs(n - b[i]) < 1e-6);
const unit = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

const score = { match: 0, flipped: 0, wrongAxis: 0, undetermined: 0, authored: 0, newlyCovered: 0 };

for (const [id, raw, structure, sweep, mod] of CORPUS) {
  // Lower the joints for TOPOLOGY first, with no geometry: a migrated part's edges live in JOINTS now, and without them Γ has no liaison for the pair and every derivation abstains with "no contact frame". Passing no geometry is what keeps this from being circular — the join arrays are all Γ needs, and the vectors are what this pass is about to compute.
  const parts = applyStructure(raw as Record<PartId, PartDef>, structure, (mod as { JOINTS?: never }).JOINTS) as Record<PartId, PartDef>;
  const liaisons = buildLiaisons(parts);
  const named = glbBoxes(path.join(MODELS, id, `${id}.glb`));
  const boxes: Record<PartId, PartBox> = {};
  for (const p of Object.values(parts)) {
    const b = named[p.meshName as string] ?? named[p.partId as string];
    if (b) boxes[p.partId] = b;
  }
  // The canonical build order, exactly as structuralSweep.furniture.test.ts builds it: the sign rule asks whether a corridor blocker is already standing when this part arrives, which is meaningless without it.
  const placeOrder = new Map<PartId, number>();
  composeFurnitureActions(mod.AUTHORED_ACTIONS, mod.FASTENER_RULES, parts, HARDWARE, mod.CLUSTERS).forEach((a, i) => {
    if (a.type === "placePart" && a.partId) placeOrder.set(a.partId, i);
  });
  const statements = statementsFor(parts, liaisons, buildComponents((mod as { COMPONENTS?: never }).COMPONENTS, parts), (mod as { JOINTS?: never }).JOINTS);
  const { geometry, notes } = deriveJointGeometry(parts, liaisons, boxes, sweep as SweepMap, statements, placeOrder);

  const noteFor = (pid: PartId): DerivationNote | undefined => notes.find((n) => n.partId === pid && n.status === "derived") ?? notes.find((n) => n.partId === pid);
  console.log(`\n══ ${id} ══  ${Object.keys(geometry).length} parts derived, ${new Set(notes.filter((n) => n.status === "undetermined" && !geometry[n.partId]).map((n) => n.partId)).size} undetermined`);

  for (const p of Object.values(parts)) {
    const authored = (p as PartDef & { placeDir?: Vec3 }).placeDir;
    const got = geometry[p.partId]?.placeDir;
    const n = noteFor(p.partId);
    if (authored) {
      score.authored++;
      const a = unit(authored);
      if (!got) {
        score.undetermined++;
        console.log(`  ✗ ${String(p.partId).padEnd(22)} authored ${fmt(a)}  UNDETERMINED — ${n?.why ?? "no statement"}`);
      } else if (same(got, a)) {
        score.match++;
        console.log(`  ✓ ${String(p.partId).padEnd(22)} ${fmt(got)}  ${n?.rule}/${n?.sign} ↔ ${n?.partner}`);
      } else if (same(got, [-a[0], -a[1], -a[2]])) {
        score.flipped++;
        console.log(`  ± ${String(p.partId).padEnd(22)} authored ${fmt(a)} but derived ${fmt(got)}  SIGN FLIPPED — ${n?.rule}/${n?.sign} ↔ ${n?.partner}`);
      } else {
        score.wrongAxis++;
        console.log(`  ✗ ${String(p.partId).padEnd(22)} authored ${fmt(a)} but derived ${fmt(got)}  WRONG AXIS — ${n?.rule}/${n?.sign} ↔ ${n?.partner}`);
      }
    } else if (got) {
      score.newlyCovered++;
      console.log(`  + ${String(p.partId).padEnd(22)} ${fmt(got)}  NEW (authors none today) — ${n?.rule}/${n?.sign} ↔ ${n?.partner}`);
    }
  }

  for (const pid of WHY) {
    const mine = notes.filter((n) => String(n.partId) === pid);
    if (!mine.length) continue;
    console.log(`  ── why ${pid} (authored ${JSON.stringify((parts[pid as PartId] as PartDef & { placeDir?: Vec3 })?.placeDir ?? null)}) ──`);
    for (const n of mine) {
      console.log(`     ↔ ${String(n.partner).padEnd(20)} ${n.kind.padEnd(6)} ${n.rule ?? "-"} ext ${n.ext ? fmt(n.ext) : "-"} exit ${n.exit ?? "-"} → ${n.value ? fmt(n.value) : `none (${n.why})`}`);
    }
  }

  if (WRITE) {
    const keys = Object.keys(geometry).sort();
    const body = keys
      .map((pid) => {
        const n = noteFor(pid as PartId);
        // A HARDWARE-derived vector has no slab to report — the connector's drive axis IS the answer, so there are no extents to quote.
        return `  ${JSON.stringify(pid)}: ${JSON.stringify(geometry[pid as PartId])},   // ${n?.kind} ↔ ${n?.partner}, ${n?.rule}${n?.ext ? `, ext ${fmt(n.ext)}` : ""}, sign: ${n?.sign}`;
      })
      .join("\n");
    // UNDETERMINED means the PART got no vector — not that one of its contacts lost. A part with three contacts can derive cleanly and still carry two "discarded" notes from the majority tie-break, and listing those here made the header claim a part had abstained when its answer sits a few lines below it.
    const undet = [...new Set(notes.filter((n) => n.status === "undetermined" && !geometry[n.partId]).map((n) => `${n.partId}: ${n.why}`))].sort();
    const out = path.join(OUT, id, "joints.gen.ts");
    fs.writeFileSync(
      out,
      `// GENERATED by src/game/helper-scripts/derive-joints.mts — do not edit by hand.
// Travel axes derived from the contact slabs at baked pose (core/model/jointGeometry.ts). Regenerate after any model re-export or JOINTS/STRUCTURE change; the derivedJoints pin test fails, named, when this file is stale.
// ${keys.length} derived, ${undet.length} undetermined:
${undet.map((u) => `//   ${u}`).join("\n") || "//   (none)"}
import type { JointGeometry } from "@/src/game/core/type";

export const JOINT_GEOMETRY = {
${body}
} as JointGeometry;
`,
    );
    console.log(`  → wrote ${out}`);

    // The SECOND artifact, and the one a reviewer reads: the authored overlay with the joints already lowered into it. Written in the same pass so it can never be composed against a stale joints.gen — and via the same composeStructure applyStructure itself calls, so the file records what the device runs rather than a second opinion about it.
    const authoredJoints = (mod as { JOINTS?: readonly JointDef[] }).JOINTS;
    const composedPath = path.join(OUT, id, "structure.gen.ts");
    if (!authoredJoints?.length) {
      // No joints to lower, so the composition IS the authored overlay. Re-exported rather than copied: a generated duplicate of a hand-written file is a second source of truth waiting to drift, and consumers still get one uniform name to import.
      fs.writeFileSync(
        composedPath,
        `// GENERATED by src/game/helper-scripts/derive-joints.mts — do not edit by hand.
// This furniture authors no JOINTS, so its composed structure IS its authored STRUCTURE. Re-exported so every consumer imports the same name whether or not a furniture has migrated; the day it authors one, this file becomes a literal.
export { STRUCTURE as STRUCTURE_COMPOSED } from "./authored";
`,
      );
    } else {
      const composed = composeStructure(parts, structure, authoredJoints, geometry) as Record<string, unknown>;
      const lines = Object.keys(composed)
        .sort()
        .map((pid) => `  ${JSON.stringify(pid)}: ${JSON.stringify(composed[pid])},`)
        .join("\n");
      fs.writeFileSync(
        composedPath,
        `// GENERATED by src/game/helper-scripts/derive-joints.mts — do not edit by hand.
// The authored STRUCTURE with this furniture's JOINTS lowered into it — what applyStructure spreads over the mesh facts, and therefore what the game actually runs. Review THIS to see a joint's consequences: the join array a joint emitted (or deliberately did not, where hardware already makes the edge), the dropOn it did or did not add, and the travel it took from joints.gen.
// Regenerate after any JOINTS/STRUCTURE change or model re-export; the derivedJoints pin test fails, named, when this file is stale.
import type { StructureOverlay } from "@/src/game/core/model/liaisons";

export const STRUCTURE_COMPOSED = {
${lines}
} as unknown as StructureOverlay;
`,
      );
    }
    console.log(`  → wrote ${composedPath}`);
  }
}

console.log(`\n══ scored against ${score.authored} authored placeDirs ══`);
console.log(`  exact match      ${score.match}`);
console.log(`  sign flipped     ${score.flipped}`);
console.log(`  wrong axis       ${score.wrongAxis}`);
console.log(`  undetermined     ${score.undetermined}`);
console.log(`  newly covered    ${score.newlyCovered}  (parts that author no placeDir today)`);
