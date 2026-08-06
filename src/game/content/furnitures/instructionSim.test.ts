// Instruction-following simulation: plays every furniture to completion in every mode by doing exactly what the guidance layer suggests, and fuzzes free-mode orders, asserting at every visited state that
//   1. the run never deadlocks (some suggestion always exists until the build is done),
//   2. every soft hint for a blocked part grab points at a step the player can actually do right now (a hint naming a step that is itself blocked bounces the player between two errors — the reported EKET bottomPanel→backPanel circular pair). Pure engine-layer sim: no assets, no store, no scene — fixtures are composed inline exactly like each furniture's index.ts minus the GLB/thumb requires.
import { test } from "node:test";
import assert from "node:assert/strict";

import { composeFurnitureActions, FastenerRule } from "@/src/game/core/composition/composeActions";
import { applyStructure, buildLiaisons, StructureOverlay } from "@/src/game/core/model/liaisons";
import { buildComponents, isNonLeadBody, memberPlaceIdsForLead } from "@/src/game/core/model/components";
import { availableActions, availableInMode } from "@/src/game/core/evaluation/availability";
import { blockReason, reasonActionable } from "@/src/game/core/evaluation/blockReason";
import { combineReady, focusableClusterIds } from "@/src/game/core/evaluation/clusters";
import { HARDWARE } from "@/src/game/content/hardware";
import {
  ActionId,
  AssemblyMode,
  ClusterDef,
  ClusterId,
  ComponentMap,
  DraftAction,
  Furniture,
  Gate,
  LabelMap,
  PartDef,
  PartId,
} from "@/src/game/core/type";

import * as LACK from "./LACK/authored";
import { PARTS as LACK_PARTS } from "./LACK/parts.gen";
import * as BEKVAM from "./BEKVAM/authored";
import { PARTS as BEKVAM_PARTS } from "./BEKVAM/parts.gen";
import * as DALFRED from "./DALFRED/authored";
import { PARTS as DALFRED_PARTS } from "./DALFRED/parts.gen";
import * as EKET from "./EKET/authored";
import { PARTS as EKET_PARTS } from "./EKET/parts.gen";

interface AuthoredExports {
  AUTHORED_ACTIONS: readonly DraftAction[];
  FASTENER_RULES: readonly FastenerRule[];
  STRUCTURE: StructureOverlay;
  LABELS: LabelMap;
  CLUSTERS?: Record<ClusterId, ClusterDef>;
  COMPONENTS?: ComponentMap;
  GATES?: Record<string, Gate>;
}

function fixture(id: string, m: AuthoredExports, raw: Record<PartId, PartDef>): Furniture {
  const parts = applyStructure(raw, m.STRUCTURE);
  const actions = composeFurnitureActions(
    m.AUTHORED_ACTIONS,
    m.FASTENER_RULES,
    parts,
    HARDWARE,
    m.CLUSTERS,
  );
  return {
    meta: { id } as Furniture["meta"],
    model: 0,
    parts,
    actions,
    gates: m.GATES,
    liaisons: buildLiaisons(parts),
    components: m.COMPONENTS ? buildComponents(m.COMPONENTS, parts) : undefined,
    clusters: m.CLUSTERS,
    thumbs: {},
    instructions: {},
    labels: m.LABELS,
    xpPerStep: 0,
    xpBonusOnComplete: 0,
  } as Furniture;
}

const FIXTURES: { id: string; f: Furniture }[] = [
  { id: "lack-table", f: fixture("lack-table", LACK as AuthoredExports, LACK_PARTS) },
  { id: "bekvam-stool", f: fixture("bekvam-stool", BEKVAM as AuthoredExports, BEKVAM_PARTS) },
  { id: "dalfred-stool", f: fixture("dalfred-stool", DALFRED as AuthoredExports, DALFRED_PARTS) },
  { id: "eket-cabinet", f: fixture("eket-cabinet", EKET as AuthoredExports, EKET_PARTS) },
];

// deterministic PRNG so a fuzz failure reproduces from its seed
const mulberry32 = (seed: number) => (): number => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Execute an action the way store.completeAction does: a component lead drags its sibling bodies' placements in with it. */
function perform(f: Furniture, done: Set<ActionId>, id: ActionId): void {
  done.add(id);
  for (const m of memberPlaceIdsForLead(f.components, id)) done.add(m);
}

/** The focus a player lands on: stick with the current one while it has work, else the first cluster (then unfocused) that offers anything — the "this area is done, switch focus" flow. Undefined = nothing offered anywhere. */
function pickFocus(
  f: Furniture,
  done: ReadonlySet<ActionId>,
  mode: AssemblyMode,
  prev: ClusterId | null,
): ClusterId | null | undefined {
  const options: (ClusterId | null)[] = [
    ...(combineReady(f, done) ? [null] : []),
    prev,
    ...focusableClusterIds(f),
    null,
  ];
  for (const c of options) {
    if (availableInMode(f, done, mode, c).length) return c;
  }
  return undefined;
}

/** Every soft hint a blocked part grab would show in this state that recommends a step the player cannot currently do. Keyed for dedupe across states. */
function hintViolations(f: Furniture, done: ReadonlySet<ActionId>): Map<string, string> {
  const out = new Map<string, string>();
  const availIds = new Set(availableActions(f, done).map((a) => a.actionId));
  for (const a of f.actions) {
    // hints fire when the player grabs a part from the tray (noteBlocked) — fastener steps surface differently
    if (a.type !== "placePart" && a.type !== "stagePart") continue;
    if (done.has(a.actionId) || availIds.has(a.actionId)) continue;
    if (a.partId && isNonLeadBody(f.components, a.partId)) continue;
    const r = blockReason(f, a.actionId, done);
    if (!r || reasonActionable(f, r, done)) continue;
    const key = `${a.actionId} → ${r.kind}:${r.target}`;
    if (!out.has(key)) {
      out.set(
        key,
        `grab ${a.actionId}: hint says "${r.kind} the ${r.target} first" but that step is itself blocked (done=${done.size})`,
      );
    }
  }
  return out;
}

interface RunResult {
  violations: Map<string, string>;
  deadlock: string | null;
}

function play(
  f: Furniture,
  mode: AssemblyMode,
  opts: { seed?: number; checkHints: boolean },
): RunResult {
  const rng = opts.seed != null ? mulberry32(opts.seed) : null;
  const done = new Set<ActionId>();
  const total = f.actions.length;
  const violations = new Map<string, string>();
  let focus: ClusterId | null = null;
  let guard = total * 4;

  while (done.size < total) {
    if (guard-- <= 0) return { violations, deadlock: `no-progress guard tripped at ${done.size}/${total}` };
    const next = pickFocus(f, done, mode, focus);
    if (next === undefined) {
      const remaining = f.actions
        .filter((a) => !done.has(a.actionId))
        .map((a) => a.actionId)
        .slice(0, 8);
      return {
        violations,
        deadlock: `nothing offered in any focus at ${done.size}/${total}; remaining: ${remaining.join(", ")}…`,
      };
    }
    focus = next;
    const avail = availableInMode(f, done, mode, focus);
    if (opts.checkHints) {
      for (const [k, v] of hintViolations(f, done)) violations.set(k, v);
    }
    const pick = rng ? avail[Math.floor(rng() * avail.length)] : avail[0];
    perform(f, done, pick.actionId);
  }
  return { violations, deadlock: null };
}

function assertClean(id: string, label: string, r: RunResult): void {
  assert.equal(r.deadlock, null, `${id} ${label}: ${r.deadlock}`);
  const sample = [...r.violations.values()].slice(0, 12);
  assert.equal(
    r.violations.size,
    0,
    `${id} ${label}: ${r.violations.size} misleading hint(s):\n  ${sample.join("\n  ")}`,
  );
}

// The rod bridges BOTH frames' cradles, but its liaison frontier is an OR (dowel edges) — only the authored requires stop it seating against one frame with the other side floating. Pin them so a requires cleanup can't silently regress it.
test("EKET: stabiliser rod take-out waits for the back panel and both frames", () => {
  const f = FIXTURES.find((x) => x.id === "eket-cabinet")!.f;
  for (const s of ["1", "2"]) {
    const stage = f.actions.find((a) => a.actionId === (`stage_stabilizerRod_${s}` as ActionId));
    assert.ok(stage, `stage_stabilizerRod_${s} exists`);
    for (const req of ["place_backPanel", `place_runnerFrameL_${s}`, `place_runnerFrameR_${s}`]) {
      assert.ok(
        stage!.requires.includes(req as ActionId),
        `stage_stabilizerRod_${s} requires ${req}`,
      );
    }
  }
});

// Cluster reorient beats were cut 2026-07-23 (the combine beat is the standing-up moment); only part-less test/finishing beats may keep the reorient type.
test("no cluster-bearing reorient beats exist", () => {
  for (const { id, f } of FIXTURES) {
    const bad = f.actions.filter((a) => a.type === "reorient" && a.cluster);
    assert.equal(bad.length, 0, `${id}: ${bad.map((a) => a.actionId).join(", ")}`);
  }
});

// DALFRED supportPin: slides down through circleUpp's centre hole — gated by its slide frontier (the plate must be up), never offered on an empty scene.
test("DALFRED: supportPin waits for circleUpp, then unlocks", () => {
  const f = FIXTURES.find((x) => x.id === "dalfred-stool")!.f;
  const pin = "place_supportPin" as ActionId;
  assert.ok(!availableActions(f, new Set()).some((a) => a.actionId === pin), "pin offered with no plate up");
  const done = new Set<ActionId>(["place_circleUpp" as ActionId]);
  assert.ok(availableActions(f, done).some((a) => a.actionId === pin), "pin still blocked with circleUpp placed");
});

const FUZZ_SEEDS = 25;

for (const { id, f } of FIXTURES) {
  for (const mode of ["strict", "guide", "free"] as AssemblyMode[]) {
    test(`${id} ${mode}: following the suggestion completes the build with actionable hints`, () => {
      assertClean(id, mode, play(f, mode, { checkHints: true }));
    });
  }

  test(`${id} free fuzz: random legal orders complete with actionable hints`, () => {
    for (let seed = 1; seed <= FUZZ_SEEDS; seed++) {
      assertClean(id, `fuzz seed ${seed}`, play(f, "free", { seed, checkHints: true }));
    }
  });
}
