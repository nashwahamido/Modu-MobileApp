// @ts-nocheck — a plain-JavaScript drafter run with `npx tsx`; typed only through what it imports from core/derive.
// Run after a model re-export (alongside read-parts.mts).
//
// Drafts a FULL authored.ts for each furniture from its combined GLB and writes src/game/content/furnitures/<ID>/dev/authored.derived.ts — a starting skeleton to review, NOT shipped logic. What it fills in vs leaves for a human:
//
//   DERIVED (rough, edit freely):
//     LABELS            humanised group names
//     CLUSTERS          the distinct clusters
//     FASTENERS         one def per hardware group — ROLE prefilled from the article's leading word, extraOf from the analyzer's geometric pairing (core/derive/analyze.ts); the human's answer DECIDES
//     AUTHORED_ACTIONS  one placement per structural part (stage 1)
//     STRUCTURE.pressJoins fastener-free contacts found (fastened joints are in the mesh names, so they're NOT repeated here) GUESSED (derived, human VERIFIES): seed (footprint) · unstable (fastened- only) · stages (Γ waves) · requires (geometric traps) · difficulty/duration
//   TODO (human must decide): META catalogue facts · slide/screw join intent · beat prose overrides · hardware.ts line per unseen article
//
// Alongside the draft it writes dev/GAPS.json — the FINITE, machine-readable list of every decision it guessed or couldn't classify, one targeted question each. Feed that + the manual to a review agent (see helper-scripts/REVIEW-PROMPT.md) so the gaps are closed explicitly instead of hunted for by eye.
//
// The draft AIMS TO SOLVE as-is (derived stages = Γ waves, geometric trap requires, guessed seeds) — verify everything against the manual. Copy what's useful into authored.ts. The script never touches your authored.ts.
//
//   npx tsx src/game/helper-scripts/extract-structure.mts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeMeshes } from "@/src/game/core/derive/analyze";
import { readGlbMeshes } from "@/src/game/core/derive/glb";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MODELS = path.join(ROOT, "..", "..", "assets", "models", "furnitures");
const OUT = path.join(ROOT, "..", "content", "furnitures");
// AUTO-DISCOVERED: every assets/models/furnitures/<ID>/<ID>.glb gets a draft.
const FURNITURES = fs
  .readdirSync(MODELS, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(MODELS, d.name, `${d.name}.glb`)))
  .map((d) => d.name);

// contact tolerances (metres). Tuned on DALFRED — revisit per model.
const EPS = 0.004; // surfaces within 4 mm count as touching
const PRESSFIT = 0.12; // ≥12% of a part's surface in contact ⇒ a real seated face

// ───────── parts: identity from the analyzer (mesh-name convention + prefix detection), geometry from the shared GLB reader ─────────
function loadParts(glbPath) {
  const meshes = readGlbMeshes(fs.readFileSync(glbPath));
  const analysis = analyzeMeshes(meshes);
  const parts = {};
  for (const m of meshes) {
    const min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity];
    for (const v of m.verts)
      for (let k = 0; k < 3; k++) {
        if (v[k] < min[k]) min[k] = v[k];
        if (v[k] > max[k]) max[k] = v[k];
      }
    const a = analysis.parts[m.partId];
    parts[m.partId] = { partId: m.partId, group: m.group, cluster: m.cluster, type: a.type, attached: a.attached ?? null, verts: m.verts, min, max };
  }
  return { parts, analysis };
}

// ───────── Γ derivation ─────────
const edgeKey = (a, b) => [a, b].sort().join("__");

function aabbApart(a, b) {
  for (let k = 0; k < 3; k++)
    if (a.min[k] - b.max[k] > EPS || b.min[k] - a.max[k] > EPS) return true;
  return false;
}
function patch(a, b) {
  const cell = EPS,
    grid = new Map();
  for (const v of b.verts) {
    const k = `${Math.floor(v[0] / cell)},${Math.floor(v[1] / cell)},${Math.floor(v[2] / cell)}`;
    (grid.get(k) ?? grid.set(k, []).get(k)).push(v);
  }
  const e2 = EPS * EPS;
  let hits = 0;
  for (const v of a.verts) {
    const cx = Math.floor(v[0] / cell),
      cy = Math.floor(v[1] / cell),
      cz = Math.floor(v[2] / cell);
    let near = false;
    for (let dx = -1; dx <= 1 && !near; dx++)
      for (let dy = -1; dy <= 1 && !near; dy++)
        for (let dz = -1; dz <= 1 && !near; dz++) {
          const bk = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
          if (!bk) continue;
          for (const w of bk) {
            const ddx = v[0] - w[0],
              ddy = v[1] - w[1],
              ddz = v[2] - w[2];
            if (ddx * ddx + ddy * ddy + ddz * ddz <= e2) {
              near = true;
              break;
            }
          }
        }
    if (near) hits++;
  }
  return hits / a.verts.length;
}
function deriveGamma(structural, fasteners) {
  const gamma = new Set(),
    source = new Map();
  const structuralIds = new Set(structural.map((p) => p.partId));
  for (const f of fasteners) {
    const ends = (f.attached ?? []).filter((p) => structuralIds.has(p));
    // A fastener that names TWO structural endpoints (…__a&b) keys the joint between them — exactly like runtime buildLiaisons, and regardless of the securer/connector ROLE (that role comes from the hardware name, not the endpoint count, and isn't needed here). Record the edge so press-fit detection won't re-report an already-fastened pair.
    if (ends.length === 2) {
      const e = edgeKey(ends[0], ends[1]);
      gamma.add(e);
      source.set(e, "fastened");
      continue;
    }
    // ONE endpoint: a securer fastening a single part onto an already-existing joint (e.g. a cap). Keys no joint on its own — like runtime — so it adds nothing to Γ; the underlying joint surfaces via press-fit or a 2-end fastener, and ordering is handled by the securer default (every attached part placed first).
    if (ends.length === 1) continue;
    // names no structural endpoint at all — genuinely unusable. Flag it.
    console.warn(
      `  ⚠ ${f.partId}: fastener names no structural endpoint ` +
        `(attached=${JSON.stringify(f.attached)}) — skipped`,
    );
  }
  for (let i = 0; i < structural.length; i++)
    for (let j = i + 1; j < structural.length; j++) {
      const a = structural[i],
        b = structural[j],
        e = edgeKey(a.partId, b.partId);
      if (gamma.has(e) || aabbApart(a, b)) continue;
      if (Math.max(patch(a, b), patch(b, a)) >= PRESSFIT) {
        gamma.add(e);
        source.set(e, "press-fit");
      }
    }
  return { gamma, source };
}

// ───────── per-cluster suggested order (assembly-by-disassembly) ─────────
const SLACK = 0.003,
  LIP = 0.002,
  DIRS = [
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [2, 1],
    [2, -1],
  ];
function blocks(A, B, k, sign) {
  for (let j = 0; j < 3; j++) {
    if (j === k) continue;
    if (A.min[j] >= B.max[j] - SLACK || A.max[j] <= B.min[j] + SLACK)
      return false;
  }
  return sign > 0 ? B.max[k] > A.max[k] + LIP : B.min[k] < A.min[k] - LIP;
}
function freeDirs(A, present) {
  let f = 0;
  for (const [k, sign] of DIRS) {
    let bl = false;
    for (const B of present) {
      if (B === A) continue;
      if (blocks(A, B, k, sign)) {
        bl = true;
        break;
      }
    }
    if (!bl) f++;
  }
  return f;
}
function peel(list) {
  const present = new Set(list),
    order = [];
  while (present.size) {
    const cand = [...present]
      .map((p) => ({ p, free: freeDirs(p, present) }))
      .filter((c) => c.free > 0);
    if (!cand.length) return list.map((p) => p.partId);
    cand.sort(
      (a, b) =>
        b.free - a.free ||
        b.p.max[1] - a.p.max[1] ||
        a.p.partId.localeCompare(b.p.partId),
    );
    order.push(cand[0].p.partId);
    present.delete(cand[0].p);
  }
  return order.reverse();
}

// group_index → "Group index"; screw105251 → "Screw 105251"; leg → "Leg"
const humanize = (s) =>
  ((t) => t.charAt(0).toUpperCase() + t.slice(1))(
    s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([a-zA-Z])(\d)/g, "$1 $2").toLowerCase(),
  );

// ───────── emit a DRAFT authored.ts (every section a human refines) ─────────
function emit(id, parts, analysis) {
  const structural = Object.values(parts).filter((p) => p.type === "structural");
  const fasteners = Object.values(parts).filter((p) => p.type === "fastener");
  const clusterOf = (pid) => parts[pid]?.cluster;
  if (!structural.length) { console.log(`${id}: no structural parts — skipped`); return; }
  const { gamma, source } = deriveGamma(structural, fasteners);

  const clusters = [...new Set(structural.map((p) => p.cluster))];
  const order = {}, rank = new Map();
  for (const c of clusters) { order[c] = peel(structural.filter((p) => p.cluster === c)); order[c].forEach((pid, i) => rank.set(pid, i)); }

  // pressJoins: ONLY fastener-free contacts (fastened joints come from the mesh names).
  const liaised = new Map(structural.map((p) => [p.partId, []]));
  for (const e of gamma) {
    if (source.get(e) !== "press-fit") continue;
    const [a, b] = e.split("__");
    if (!liaised.has(a) || !liaised.has(b)) continue;
    const later = (rank.get(a) ?? 0) >= (rank.get(b) ?? 0) ? a : b;
    liaised.get(later).push(later === a ? b : a);
  }
  // seed GUESS: the largest-footprint part per cluster (a likely frame/starter).
  const footprint = (p) => (p.max[0] - p.min[0]) * (p.max[2] - p.min[2]);
  const seedGuess = new Set();
  for (const c of clusters) {
    const inC = structural.filter((p) => p.cluster === c);
    seedGuess.add(inC.reduce((m, p) => (footprint(p) > footprint(m) ? p : m), inC[0]).partId);
  }
  // ── derived STAGES: Γ waves out from the seed (per cluster). Seed layer is stage 1; each layer of parts touching earlier layers is the next stage. Plausible and SOLVABLE — align to the manual's step numbers when reviewing.
  const nb = new Map(structural.map((p) => [p.partId, new Set()]));
  for (const e of gamma) {
    const [a, b] = e.split("__");
    if (nb.has(a) && nb.has(b)) { nb.get(a).add(b); nb.get(b).add(a); }
  }
  const stageOf = new Map();
  for (const c of clusters) {
    const inC = new Set(structural.filter((p) => p.cluster === c).map((p) => p.partId));
    let frontier = [...inC].filter((pid) => seedGuess.has(pid));
    if (!frontier.length) frontier = [...inC].slice(0, 1);
    const seen = new Set(frontier);
    for (let wave = 1; frontier.length; wave++) {
      const next = [];
      for (const pid of frontier) {
        stageOf.set(pid, wave);
        for (const n of nb.get(pid) ?? []) {
          if (inC.has(n) && !seen.has(n)) { seen.add(n); next.push(n); }
        }
      }
      frontier = next;
    }
    for (const pid of inC) if (!stageOf.has(pid)) stageOf.set(pid, 1); // isolated part
  }

  // ── geometric REQUIRES: trap windows. If part L, once present, blocks part E from entering along EVERY axis, E must go in first — authored on the LATER (closing) part, exactly the drawer-bottom pattern.
  const trapReq = new Map(); // laterPartId -> Set(earlier partIds)
  for (const c of clusters) {
    const inC = structural.filter((p) => p.cluster === c);
    for (const E of inC) {
      for (const L of inC) {
        if (E === L || (rank.get(E.partId) ?? 0) >= (rank.get(L.partId) ?? 0)) continue;
        const eTrapped = DIRS.every(([k, sign]) => blocks(E, L, k, sign));
        const lTrapped = DIRS.every(([k, sign]) => blocks(L, E, k, sign));
        if (eTrapped && lTrapped) {
          console.warn(`  ⚠ ${E.partId} and ${L.partId} trap each other — geometry suspect, no requires emitted`);
          continue;
        }
        if (eTrapped) {
          (trapReq.get(L.partId) ?? trapReq.set(L.partId, new Set()).get(L.partId)).add(E.partId);
          // the closing part can never precede what it traps
          stageOf.set(L.partId, Math.max(stageOf.get(L.partId) ?? 1, stageOf.get(E.partId) ?? 1));
        }
        if (lTrapped) console.warn(`  ⚠ ${L.partId} would be trapped by earlier ${E.partId} — peel order suspect`);
      }
    }
  }

  // ── UNSTABLE guess: held ONLY by fasteners (every Γ edge 'fastened'), so it is loose until secured. A guess — delete where the part actually rests.
  const unstableGuess = new Set();
  for (const p of structural) {
    if (seedGuess.has(p.partId)) continue;
    const edges = [...gamma].filter((e) => e.split("__").includes(p.partId));
    if (edges.length && edges.every((e) => source.get(e) === "fastened")) unstableGuess.add(p.partId);
  }

  const maxStage = Math.max(1, ...stageOf.values());
  // FASTENERS draft: the analyzer's role prefill per group, and its extraOf proposal where two groups pair 1:1 by proximity. A def is written for EVERY hardware group — the validator rejects a group without one.
  const extraOf = new Map(analysis.pairings.map((pr) => [pr.extraGroup, pr.primaryGroup]));
  const defOf = (g) => {
    if (extraOf.has(g)) return { text: `{ home: { extraOf: ${JSON.stringify(extraOf.get(g))} } }`, note: `rides ${extraOf.get(g)} (paired 1:1 by proximity) — verify it is subordinate hardware, not a second joint` };
    const pre = analysis.rolePrefill[g] ?? { role: "securer" };
    if (pre.role === "cap") return { text: `{ home: "part" }`, note: "one host in its mesh name: dresses that part, no joint — verify" };
    if (pre.role === "connector") return { text: `{ home: "liaison", role: "connector", preload: ${JSON.stringify(pre.preload)} }`, note: "the joint exists BECAUSE this is driven; preload = when the counterpart may mount and how — verify both" };
    return { text: `{ home: "liaison", role: "securer" }`, note: "locks a joint that already exists (authored press/slide/screw) — verify" };
  };

  const sgroups = [...new Set(structural.map((p) => p.group))];
  const fgroups = [...new Set(fasteners.map((p) => p.group))];

  const L = [];
  L.push(`// DRAFT authored.ts — GENERATED by src/game/helper-scripts/extract-structure.mts.`);
  L.push(`// Aims to SOLVE as-is: review every GUESS, then save as authored.ts.`);
  L.push(`//   derived: labels · clusters · FASTENERS (role prefill + pairing) · placements · pressJoins`);
  L.push(`//   GUESSED (verify): seeds (footprint) · unstable (fastened-only) · stages ·`);
  L.push(`//     geometric trap requires · difficulty/duration`);
  L.push(`//   TODO (human): META catalogue facts · slide/screw join intent · beat overrides`);
  L.push(`import type { StructureOverlay } from "@/src/game/core/model/liaisons";`);
  L.push(`import type { DraftAction, ClusterDef, FastenerMap, InstructionContent, LabelMap } from "@/src/game/core/type";`);
  L.push(``);
  const stepGuess = structural.length + fasteners.length * 2 + clusters.length;
  const diffGuess = stepGuess <= 15 ? 1 : stepGuess <= 45 ? 2 : 3;
  const durGuess = Math.max(5, Math.round((stepGuess * 0.4) / 5) * 5);
  L.push(`// 1 ─ META — name/brand/category/link are catalogue facts (TODO);`);
  L.push(`//     difficulty + duration are GUESSES from ${stepGuess} estimated steps.`);
  L.push(`export const META = { name: ${JSON.stringify(humanize(id))}, difficulty: ${diffGuess} as const, duration: ${durGuess} };`);
  L.push(``);
  L.push(`// 2 ─ LABELS — STRUCTURAL groups only; TODO: improve wording.`);
  L.push(`//     (fastener labels come from data/hardware.ts — per-article, authored once)`);
  L.push(`export const LABELS: LabelMap = {`);
  for (const g of sgroups) L.push(`  ${g}: { standard: ${JSON.stringify(humanize(g))} },`);
  L.push(`};`);
  L.push(``);
  L.push(`// 3 ─ CLUSTERS.`);
  L.push(`export const CLUSTERS: Record<string, ClusterDef> = {`);
  for (const c of clusters) L.push(`  ${c}: { id: ${JSON.stringify(c)}, label: ${JSON.stringify(humanize(c))} },`);
  L.push(`};`);
  L.push(``);
  L.push(`// 4 ─ STRUCTURE — GUESSES to verify: seed = largest footprint per cluster;`);
  L.push(`//     unstable = held only by fasteners. pressJoins = fastener-free contacts`);
  L.push(`//     only (fastened joints come from the mesh names).`);
  L.push(`export const STRUCTURE: StructureOverlay = {`);
  for (const c of clusters) {
    L.push(`  // ── ${c} ──  suggested order (verify!): ${order[c].join(" → ")}`);
    for (const pid of order[c]) {
      const fields = [];
      if (seedGuess.has(pid)) fields.push(`seed: true`);
      if (unstableGuess.has(pid)) fields.push(`unstable: true`);
      const li = liaised.get(pid);
      if (li.length) fields.push(`pressJoins: [${li.map((x) => JSON.stringify(x)).join(", ")}]`);
      const body = fields.join(", ");
      let note = "GUESSED seed/unstable — verify";
      if (li.length) {
        const crossCluster = li.some((t) => clusterOf(t) !== clusterOf(pid));
        note += crossCluster
          ? "; pressJoins is CROSS-CLUSTER → likely screwJoins + combine (see GAPS.json)"
          : "; pressJoins = PRESS guess — press|slide|screw? (see GAPS.json)";
      }
      L.push(`  ${pid}: { ${body}${body ? " " : ""}}, // ${note}`);
    }
  }
  L.push(`};`);
  L.push(``);
  L.push(`// 5 ─ FASTENERS — one def per hardware group. The ROLE is a PREFILL from the`);
  L.push(`//     article's leading word (helper-scripts/fastener-roles.json) and extraOf from`);
  L.push(`//     geometric pairing; the def DECIDES, so verify each line against the manual:`);
  L.push(`//     connector = the joint exists because this is driven (dowel, bolt);`);
  L.push(`//     securer = it locks a joint that already exists (wood screw, cam lock);`);
  L.push(`//     part = dresses one part, no joint (end cap); extraOf = rides another group.`);
  L.push(`//     Stage and sequencing are DERIVED at compose time; tool/label/motion come`);
  L.push(`//     from the GLOBAL catalogue (content/hardware.ts) — one line per UNSEEN article.`);
  L.push(`export const FASTENERS: FastenerMap = {`);
  for (const g of fgroups) {
    const d = defOf(g);
    L.push(`  ${g}: ${d.text}, // ${d.note}`);
  }
  L.push(`} as unknown as FastenerMap;`);
  L.push(``);
  L.push(`// 6 ─ AUTHORED_ACTIONS — one placement per structural part. Ids derive from`);
  L.push(`//     (type, partId); stages are Γ waves; requires are GEOMETRIC traps (the`);
  L.push(`//     closing part waits for what it traps). Verify both against the manual.`);
  L.push(`//     Fastener insert/tighten expand from FASTENERS.`);
  L.push(`export const AUTHORED_ACTIONS: DraftAction[] = [`);
  for (const c of clusters) {
    L.push(`  // ── ${c} ──`);
    for (const pid of order[c]) {
      const req = [...(trapReq.get(pid) ?? [])].map((e) => `"place_${e}"`).join(", ");
      const trap = req ? ` // geometric: closes over ${[...trapReq.get(pid)].join(", ")}` : "";
      L.push(`  { type: "placePart", stage: ${stageOf.get(pid) ?? 1}, partId: "${pid}", requires: [${req}] },${trap}`);
    }
  }
  if (clusters.length > 1) {
    L.push(`  // TODO combine: combineReady waits for every cluster to finish.`);
    L.push(`  { actionId: "combine_assemblies", type: "combineClusters", stage: ${maxStage}, cluster: ${JSON.stringify(clusters[clusters.length - 1])}, requires: [] },`);
  }
  L.push(`  // TODO: add reorient/combine beats (a clustered reorient waits for its cluster to finish).`);
  L.push(`  { actionId: "finishing_checks", type: "reorient", stage: ${maxStage}, requires: [] },`);
  L.push(`];`);
  L.push(``);
  L.push(`// 7 ─ BEATS — OPTIONAL overrides. Part-less beats auto-word from the`);
  L.push(`//     cluster labels (buildInstructions defaults); add an entry ONLY where`);
  L.push(`//     the generic wording isn't good enough.`);
  L.push(`export const BEATS: Record<string, InstructionContent> = {};`);

  // ── GAPS manifest: the FINITE list of decisions this draft couldn't settle, one targeted question each. Feeds the AI/human review loop (see helper-scripts/REVIEW-PROMPT.md) so nothing is resolved by silent guess. Categories mirror what geometry can't know: physical facts it GUESSED (seed/unstable), join INTENT it can't see (press vs slide vs screw), and the manual-only decisions (drive steps, stages, requires, meta, beats).
  const gaps = [];
  for (const pid of seedGuess)
    gaps.push({ kind: "seed", part: pid, generatorGuess: true, confidence: "med",
      question: `Is "${pid}" really a valid STARTING part for its cluster (step 1 of that section in the manual)?` });
  for (const pid of unstableGuess)
    gaps.push({ kind: "unstable", part: pid, generatorGuess: true, confidence: "med",
      question: `Does "${pid}" fall out until a fastener secures it (vs resting on its own)?` });
  // join INTENT — every fastener-free contact is drafted as a PRESS (pressJoins).
  for (const e of gamma) {
    if (source.get(e) !== "press-fit") continue;
    const [a, b] = e.split("__");
    if (!liaised.has(a) || !liaised.has(b)) continue;
    const crossCluster = clusterOf(a) !== clusterOf(b);
    gaps.push({ kind: "joinIntent", joint: e, parts: [a, b], crossCluster,
      generatorGuess: "pressJoins", options: ["pressJoins", "slideJoins", "screwJoins"],
      confidence: crossCluster ? "low" : "med",
      question: crossCluster
        ? `Cross-cluster contact "${a}"↔"${b}": almost certainly the COMBINE joint — a screwJoins realized by a combineClusters step, NOT a same-cluster press. Confirm press | slide | screw.`
        : `Contact "${a}"↔"${b}" is drafted as a PRESS (pressJoins). Is it press | slide | screw?` });
  }
  // DRIVE steps — a structural part that is TAPPED or SCREWED home is a
  // TOOL-DRIVEN PLACEMENT (press/slide/screw + placeDir + a tool), NOT a separate tighten. A part joined by a TWO-endpoint fastener is already driven home by THAT fastener's tighten, so it's not a candidate; flag only the fastener-free (press) / loose parts, whose own placement must drive them.
  const securedByFastener = new Set();
  for (const f of fasteners) {
    const ends = (f.attached ?? []).filter((x) => parts[x]?.type === "structural");
    if (ends.length === 2) { securedByFastener.add(ends[0]); securedByFastener.add(ends[1]); }
  }
  for (const p of structural) {
    const pid = p.partId;
    if (securedByFastener.has(pid)) continue;
    const pressFit = [...gamma].some((e) => source.get(e) === "press-fit" && e.split("__").includes(pid));
    if (!pressFit && !unstableGuess.has(pid)) continue;
    gaps.push({ kind: "driveStep", part: pid, confidence: "low",
      question: `Is "${pid}" TAPPED or SCREWED home (not just dropped)? If so, give it a placeDir + a tool in STRUCTURE so its PRESS/SLIDE/SCREW placement DRIVES it in — do NOT add a separate tighten step (that pattern is for fasteners; a structural part drives home via its placement).` });
  }
  // fastener ROLES — every def is a prefill from a name or a proximity pairing; the manual decides
  for (const g of fgroups) {
    const d = defOf(g);
    gaps.push({ kind: "fastenerRole", group: g, generatorGuess: d.text, confidence: extraOf.has(g) ? "med" : "low",
      question: `Hardware group "${g}" is drafted as ${d.text} (${d.note}). Which is it: connector (joint exists because it is driven — and does the counterpart mount by press or screw, after insert or tighten?), securer, part-dressing, or an extra riding another group?` });
  }
  // manual-only decisions geometry can never settle
  gaps.push({ kind: "stages", scope: "all", confidence: "low",
    question: "Verify EVERY action's stage against the manual's numbered steps (drafted stages are Γ-waves from a guessed seed, not manual phases)." });
  gaps.push({ kind: "requires", scope: "all", confidence: "low",
    question: "Add manual ordering geometry can't see (e.g. tighten X before placing Y), beyond the geometric trap requires already drafted." });
  gaps.push({ kind: "meta", scope: "all",
    question: "Fill name / brand / category / link / difficulty / duration from the manual cover." });
  gaps.push({ kind: "beats", scope: "all",
    question: "Author the reorient / combine / finishing beats in the manual's order + wording (draft has placeholders only)." });

  const dir = path.join(OUT, id);
  if (!fs.existsSync(dir)) { console.log(`${id}: no furniture dir — skipped`); return; }
  const out = path.join(dir, "dev", "authored.derived.ts");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, L.join("\n") + "\n");
  const gapsOut = path.join(dir, "dev", "GAPS.json");
  fs.writeFileSync(gapsOut, JSON.stringify(gaps, null, 2) + "\n");

  // ── REVIEW KIT (additive — new file names; nothing above is replaced) ── dev/draft.gen.json           — the draft's DECISIONS, machine-readable dev/ANSWERS.template.json    — ONE simple, default-prefilled answer per decision Workflow: copy the template to review/ANSWERS.json, flip the few wrong defaults (accuracy stays a HUMAN/manual call — the defaults just make the right answer one keystroke away), then: node src/game/helper-scripts/apply-review.mjs <ID>   → review/authored.review.ts node --import tsx src/game/helper-scripts/verify-review.ts <ID> [--compare]
  const pressJoints = [...gamma]
    .filter((e) => source.get(e) === "press-fit")
    .map((e) => {
      const [a, b] = e.split("__");
      const later = (rank.get(a) ?? 0) >= (rank.get(b) ?? 0) ? a : b;
      return { joint: e, a, b, later, crossCluster: clusterOf(a) !== clusterOf(b) };
    });
  // same candidate filter as the driveStep gaps above
  const driveCandidates = structural
    .filter((p) => !securedByFastener.has(p.partId))
    .filter((p) =>
      pressJoints.some((j) => j.a === p.partId || j.b === p.partId) ||
      unstableGuess.has(p.partId))
    .map((p) => p.partId);
  const placementsJson = [];
  for (const c of clusters)
    for (const pid of order[c])
      placementsJson.push({
        partId: pid, cluster: c, stage: stageOf.get(pid) ?? 1,
        requires: [...(trapReq.get(pid) ?? [])].map((e) => `place_${e}`),
      });
  const draftJson = {
    id,
    meta: { name: humanize(id), difficulty: diffGuess, duration: durGuess },
    labels: Object.fromEntries(sgroups.map((g) => [g, humanize(g)])),
    clusters: clusters.map((c) => ({ id: c, label: humanize(c) })),
    order,
    placements: placementsJson,
    fasteners: fgroups.map((g) => ({ group: g, def: defOf(g).text })),
    joints: pressJoints,
    driveCandidates,
    maxStage,
  };
  fs.writeFileSync(path.join(dir, "dev", "draft.gen.json"), JSON.stringify(draftJson, null, 2) + "\n");
  const template = {
    _how: [
      "Copy this file to review/ANSWERS.json and edit — EVERY field is prefilled with the draft's guess.",
      "seeds / unstable: true|false per part (seed = may start its cluster; unstable = falls out until secured).",
      "joints: kind = pressJoins | slideJoins | screwJoins | none (+ mover = the moving part, for slide/screw).",
      "driveSteps: a part TAPPED/PRESSED home gets a tool (e.g. \"mallet\") and optionally placeDir [x,y,z]; leave null = plain drop.",
      "stages: align the numbers to the manual's steps. requires: extra ordering — \"tighten-group:<group>\" = after every fastener in that group is tight.",
      "beats: combine/finishing wording + reorients [{cluster, stage, id?}]. Then run apply-review.mjs (see dev/draft.gen.json header).",
    ],
    meta: { name: humanize(id), brand: "IKEA", category: null, difficulty: diffGuess, duration: durGuess, link: null },
    seeds: Object.fromEntries(structural.map((p) => [p.partId, seedGuess.has(p.partId)])),
    unstable: Object.fromEntries(structural.map((p) => [p.partId, unstableGuess.has(p.partId)])),
    joints: Object.fromEntries(pressJoints.map((j) => [j.joint, {
      kind: "pressJoins", mover: j.later,
      _hint: j.crossCluster
        ? "CROSS-CLUSTER — almost certainly screwJoins (realized by the combine step)"
        : "press | slide | screw | none?",
    }])),
    driveSteps: Object.fromEntries(driveCandidates.map((pid) => [pid, { tool: null, placeDir: null }])),
    stages: Object.fromEntries(placementsJson.map((p) => [`place_${p.partId}`, p.stage])),
    requires: Object.fromEntries(placementsJson.map((p) => [`place_${p.partId}`, p.requires])),
    beats: {
      combine: clusters.length > 1
        ? { cluster: clusters[clusters.length - 1], stage: maxStage, text: null, simpleText: null }
        : null,
      finishing: { stage: maxStage, requires: clusters.length > 1 ? ["combine_assemblies"] : [], text: null, simpleText: null },
      reorients: [],
    },
    labels: Object.fromEntries(sgroups.map((g) => [g, { standard: humanize(g), simple: null }])),
  };
  fs.writeFileSync(path.join(dir, "dev", "ANSWERS.template.json"), JSON.stringify(template, null, 2) + "\n");

  console.log(
    `${id}: drafted authored.ts — ${sgroups.length} labels, ${clusters.length} cluster(s), ` +
      `${fgroups.length} fastener def(s), ${structural.length} placements, ${[...gamma].filter((e) => source.get(e) === "press-fit").length} pressJoins ` +
      `· ${gaps.length} gaps → ${path.relative(path.join(ROOT, "..", ".."), out)} + dev/GAPS.json`,
  );
}

for (const id of FURNITURES) {
  const glb = path.join(MODELS, id, `${id}.glb`);
  if (!fs.existsSync(glb)) {
    console.log(`${id}: no GLB at ${path.relative(ROOT, glb)} — skipped`);
    continue;
  }
  const { parts, analysis } = loadParts(glb);
  emit(id, parts, analysis);
}
