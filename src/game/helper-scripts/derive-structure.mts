// Regenerates each furniture's joints.gen.ts — the travel vectors derived from the contact slabs at baked pose (core/derive/jointGeometry.ts) — and structure.gen.ts, the authored STRUCTURE with JOINTS and FASTENERS lowered in (core/derive/structure.ts): the one flat artifact the device applies. Run AFTER derive-sweep.mts, whose blocker data the sign rule consumes, and after any model re-export or JOINTS/FASTENERS/STRUCTURE change:
//   npx tsx src/game/helper-scripts/derive-structure.mts            # report only, writes nothing
//   npx tsx src/game/helper-scripts/derive-structure.mts --write     # emit joints.gen.ts + structure.gen.ts
// The report is the point during bring-up: it scores every derived vector against the placeDir the corpus authors by hand today, so the rule is measured against 33 device-verified values before anything consumes it. The derivedJoints.furniture.test.ts pin asserts the checked-in files match a fresh computation — a stale file fails there, named.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyStructure, buildLiaisons, type StructureOverlay } from "@/src/game/core/model/liaisons";
import { composeStructure } from "@/src/game/core/derive/structure";
import { HARDWARE } from "@/src/game/content/hardware";
import { authoredPlaceDir, deriveFurnitureGeometry, type AuthoredModule } from "@/src/game/core/derive/pipeline";
import type { DerivationNote } from "@/src/game/core/derive/jointGeometry";
import type { PartBox, PartDef, PartId, SweepMap, Vec3 } from "@/src/game/core/type";
import { boxesByName } from "@/src/game/core/derive/boxes";
import { readGlbMeshes } from "@/src/game/core/derive/glb";

import * as LACK from "@/src/game/content/furnitures/LACK/authored";
import * as BEKVAM from "@/src/game/content/furnitures/BEKVAM/authored";
import * as DALFRED from "@/src/game/content/furnitures/DALFRED/authored";
import * as EKET from "@/src/game/content/furnitures/EKET/authored";
import { PARTS as LACK_PARTS } from "@/src/game/content/furnitures/LACK/parts.gen";
import { SWEEP as LACK_SWEEP } from "@/src/game/content/furnitures/LACK/sweep.gen";
import { PARTS as BEKVAM_PARTS } from "@/src/game/content/furnitures/BEKVAM/parts.gen";
import { SWEEP as BEKVAM_SWEEP } from "@/src/game/content/furnitures/BEKVAM/sweep.gen";
import { PARTS as DALFRED_PARTS } from "@/src/game/content/furnitures/DALFRED/parts.gen";
import { SWEEP as DALFRED_SWEEP } from "@/src/game/content/furnitures/DALFRED/sweep.gen";
import { PARTS as EKET_PARTS } from "@/src/game/content/furnitures/EKET/parts.gen";
import { SWEEP as EKET_SWEEP } from "@/src/game/content/furnitures/EKET/sweep.gen";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MODELS = path.join(ROOT, "..", "..", "assets", "models", "furnitures");
const OUT = path.join(ROOT, "..", "content", "furnitures");
const WRITE = process.argv.includes("--write");
// `--why partA,partB` dumps EVERY candidate contact for those parts, not just the winning one — the generator's value is that it can explain an abstention, and an abstention is only readable next to the contacts that produced it.
const WHY = new Set((process.argv.find((a) => a.startsWith("--why="))?.slice(6) ?? "").split(",").filter(Boolean));

const glbBoxes = (file: string): Record<string, PartBox> => boxesByName(readGlbMeshes(fs.readFileSync(file)));

const CORPUS: [string, Record<PartId, PartDef>, SweepMap, AuthoredModule][] = [
  ["LACK", LACK_PARTS, LACK_SWEEP, LACK as AuthoredModule],
  ["BEKVAM", BEKVAM_PARTS, BEKVAM_SWEEP, BEKVAM as AuthoredModule],
  ["DALFRED", DALFRED_PARTS, DALFRED_SWEEP, DALFRED as AuthoredModule],
  ["EKET", EKET_PARTS, EKET_SWEEP, EKET as AuthoredModule],
];

const fmt = (v: Vec3): string => `[${v.map((n) => (Math.abs(n) < 1e-6 ? 0 : +n.toFixed(2))).join(",")}]`;
const same = (a: Vec3, b: Vec3): boolean => a.every((n, i) => Math.abs(n - b[i]) < 1e-6);
const unit = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

const score = { match: 0, flipped: 0, wrongAxis: 0, undetermined: 0, authored: 0, newlyCovered: 0 };

for (const [id, raw, sweep, mod] of CORPUS) {
  // The derivation itself lives in core/derive/pipeline.ts, so derivedJoints.furniture.test.ts can pin this file by running the SAME function rather than a second copy of the setup that has to be kept in step by hand.
  const named = glbBoxes(path.join(MODELS, id, `${id}.glb`));
  const { parts, geometry, notes } = deriveFurnitureGeometry(raw, mod, named, sweep, HARDWARE);

  const noteFor = (pid: PartId): DerivationNote | undefined => notes.find((n) => n.partId === pid && n.status === "derived") ?? notes.find((n) => n.partId === pid);
  console.log(`\n══ ${id} ══  ${Object.keys(geometry).length} parts derived, ${new Set(notes.filter((n) => n.status === "undetermined" && !geometry[n.partId]).map((n) => n.partId)).size} undetermined`);

  for (const p of Object.values(parts)) {
    const authored = authoredPlaceDir(p);
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
    console.log(`  ── why ${pid} (authored ${JSON.stringify(authoredPlaceDir(parts[pid as PartId]) ?? null)}) ──`);
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
      `// GENERATED by src/game/helper-scripts/derive-structure.mts — do not edit by hand.
// Travel axes derived from the contact slabs at baked pose (core/derive/jointGeometry.ts). Regenerate after any model re-export or JOINTS/STRUCTURE change; the derivedJoints pin test fails, named, when this file is stale.
// ${keys.length} derived, ${undet.length} undetermined:
${undet.map((u) => `//   ${u}`).join("\n") || "//   (none)"}
import type { JointGeometry } from "@/src/game/core/type";

export const JOINT_GEOMETRY = {
${body}
} as JointGeometry;
`,
    );
    console.log(`  → wrote ${out}`);

    // The SECOND artifact, and the one the device runs: the authored overlay with the joints lowered into it and every fastener instance's role landed on it. Written in the same pass so it can never be composed against a stale joints.gen — and via the same composeStructure the pin test recomputes, so the file records what the device applies rather than a second opinion about it.
    // RAW parts, not the composed ones above: the bridged-pair rule sees the hardware the GLB declares — a fastener the overlay RE-TYPES (EKET's suspCap) is still a bare structural node at this point and bridges nothing. Handing it the re-typed parts made this file claim a suppression the device never performs.
    const composedPath = path.join(OUT, id, "structure.gen.ts");
    const composed = composeStructure(raw, mod.STRUCTURE, { joints: mod.JOINTS, geometry, fasteners: mod.FASTENERS }) as Record<string, unknown>;
    const lines = Object.keys(composed)
      .sort()
      .map((pid) => `  ${JSON.stringify(pid)}: ${JSON.stringify(composed[pid])},`)
      .join("\n");
    fs.writeFileSync(
      composedPath,
      `// GENERATED by src/game/helper-scripts/derive-structure.mts — do not edit by hand.
// The authored STRUCTURE with this furniture's JOINTS lowered into it and its FASTENERS' role facts on every instance — what applyStructure spreads over the mesh facts, and therefore what the game actually runs. Review THIS to see a joint's or a def's consequences: the join array a joint emitted (or deliberately did not, where hardware already makes the edge), the dropOn it did or did not add, the travel it took from joints.gen, the role and preload each fastener carries.
// Regenerate after any JOINTS/FASTENERS/STRUCTURE change or model re-export; the derivedJoints pin test fails, named, when this file is stale.
import type { StructureOverlay } from "@/src/game/core/model/liaisons";

export const STRUCTURE_COMPOSED = {
${lines}
} as unknown as StructureOverlay;
`,
    );
    console.log(`  → wrote ${composedPath}`);

    // The THIRD artifact: Γ itself. Purely derived from the composed parts, and until now derived on the DEVICE at import time — which meant the 85 edges the whole build order rests on, most of which state no kind of their own and are NAMED by buildLiaisons' snap heuristic, could only be seen by running the game. Frozen here so an edge appearing, vanishing or changing kind shows up as a reviewable diff.
    // COMPOSED parts, not raw: the heuristic guards on `placeDir`, which only exists after applyStructure, so composing against the raw ones would name edges snap that the device leaves unnamed.
    const gammaPath = path.join(OUT, id, "liaisons.gen.ts");
    const gamma = buildLiaisons(applyStructure(raw, composed as StructureOverlay));
    // buildLiaisons' own insertion order, NOT sorted: consumers iterate Object.values(liaisons), and the point of freezing Γ is that nothing about it moves.
    const edges = Object.values(gamma);
    const gammaLines = edges
      .map((l) => {
        // Annotate what the heuristic DID. `snap` can only come from it, and a kindless edge is one it declined to name because an endpoint states a travel — the two facts a reviewer is here for.
        const why = l.kind === "snap" ? "   // NAMED by the heuristic — hardware-made, neither endpoint states a travel" : l.kind ? "" : "   // UNNAMED — hardware-made, but an endpoint states a travel";
        return `  ${JSON.stringify(l.id)}: ${JSON.stringify(l)},${why}`;
      })
      .join("\n");
    const byKind = new Map<string, number>();
    for (const l of edges) byKind.set(l.kind ?? "(unnamed)", (byKind.get(l.kind ?? "(unnamed)") ?? 0) + 1);
    fs.writeFileSync(
      gammaPath,
      `// GENERATED by src/game/helper-scripts/derive-structure.mts — do not edit by hand.
// Γ: the liaison graph core/model/liaisons.ts derives from the COMPOSED parts (structure.gen.ts spread over parts.gen.ts) — every joint the game knows about, with the mover and kind each one carries. The frontier, the build order, the joint frames and every blockReason read this.
// Nothing here is authored. An edge exists because a part names a join target or because a fastener names both endpoints, and its kind is either lowered from a JOINT or NAMED by the snap heuristic; the per-line notes say which.
// Regenerate after any JOINTS/FASTENERS/STRUCTURE change or model re-export; the liaisons pin test fails, named, when this file is stale.
// ${edges.length} edges: ${[...byKind].sort().map(([k, n]) => `${n} ${k}`).join(", ")}
import type { LiaisonMap } from "@/src/game/core/type";

export const LIAISONS = {
${gammaLines}
} as unknown as LiaisonMap;
`,
    );
    console.log(`  → wrote ${gammaPath}`);
  }
}

console.log(`\n══ scored against ${score.authored} authored placeDirs ══`);
console.log(`  exact match      ${score.match}`);
console.log(`  sign flipped     ${score.flipped}`);
console.log(`  wrong axis       ${score.wrongAxis}`);
console.log(`  undetermined     ${score.undetermined}`);
console.log(`  newly covered    ${score.newlyCovered}  (parts that author no placeDir today)`);
