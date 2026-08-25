// Serializes a bundled furniture's authored inputs into RecipeV1. Trivial by design: after module load every authored export IS plain data (the TS helper functions — drawer(s), slide(side,s), tightenActionIds(...) — have already evaluated), so serialization is re-keying, not translation. The two exceptions are EKET's gates and its one function-typed fastener rule, which have canonical JSON forms in eketGates.ts. This module is test-reachable AND the future seed for cloud-shipping bundled furniture without an app release.
import type { RecipeV1 } from "../schema";
import type { FastenerRuleJson } from "../fastenerRules";
import { EKET_GATE_EXPRS, EKET_PIN_RULE_JSON } from "./eketGates";

import * as EKET from "@/src/game/content/furnitures/EKET/authored";
import { PARTS as EKET_PARTS } from "@/src/game/content/furnitures/EKET/parts.gen";
import { SWEEP as EKET_SWEEP } from "@/src/game/content/furnitures/EKET/sweep.gen";
import * as BEKVAM from "@/src/game/content/furnitures/BEKVAM/authored";
import { PARTS as BEKVAM_PARTS } from "@/src/game/content/furnitures/BEKVAM/parts.gen";
import { SWEEP as BEKVAM_SWEEP } from "@/src/game/content/furnitures/BEKVAM/sweep.gen";
import * as DALFRED from "@/src/game/content/furnitures/DALFRED/authored";
import { PARTS as DALFRED_PARTS } from "@/src/game/content/furnitures/DALFRED/parts.gen";
import { SWEEP as DALFRED_SWEEP } from "@/src/game/content/furnitures/DALFRED/sweep.gen";
import * as LACK from "@/src/game/content/furnitures/LACK/authored";
import { PARTS as LACK_PARTS } from "@/src/game/content/furnitures/LACK/parts.gen";
import { SWEEP as LACK_SWEEP } from "@/src/game/content/furnitures/LACK/sweep.gen";

export type BundledId = "eket-cabinet" | "bekvam-stool" | "dalfred-stool" | "lack-table";

type AuthoredModule = { STRUCTURE: object; FASTENER_RULES: readonly { group: string; stage: number; tool?: string; requires?: unknown }[]; AUTHORED_ACTIONS: readonly object[]; LABELS: object; MODE?: string; BEATS?: object; CLUSTERS?: object; COMPONENTS?: object; PUSH_OPEN?: object; GATES?: object };

function plainRules(mod: AuthoredModule, overrides: Record<string, FastenerRuleJson>): FastenerRuleJson[] {
  return mod.FASTENER_RULES.map((r) => {
    if (r.requires) {
      const o = overrides[r.group];
      if (!o) throw new Error(`function-typed rule for group "${r.group}" has no JSON form`);
      return o;
    }
    return { group: r.group, stage: r.stage, ...(r.tool ? { tool: r.tool as never } : {}) };
  });
}

function serialize(id: BundledId, mod: AuthoredModule, parts: object, extra: { gates?: object; ruleOverrides?: Record<string, FastenerRuleJson>; sweep?: object }): RecipeV1 {
  return {
    schemaVersion: 1,
    id,
    parts: JSON.parse(JSON.stringify(parts)),
    // generated exit-sweep blocker data rides the recipe like the parts do: a recipe-composed build must be a PERFECT stand-in for the bundled one, and order-aware travel (engagement.adaptedTravelDir) reads Furniture.sweep — without this, a cloud build silently loses order adaptation
    ...(extra.sweep ? { sweep: JSON.parse(JSON.stringify(extra.sweep)) } : {}),
    structure: JSON.parse(JSON.stringify(mod.STRUCTURE)),
    ...(mod.CLUSTERS ? { clusters: JSON.parse(JSON.stringify(mod.CLUSTERS)) } : {}),
    ...(mod.COMPONENTS ? { components: JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(mod.COMPONENTS).map(([k, c]) => [k, { label: (c as { label: object }).label, bodies: (c as { bodies: string[] }).bodies, lead: (c as { lead: string }).lead }])))) } : {}),
    fastenerRules: plainRules(mod, extra.ruleOverrides ?? {}),
    actions: JSON.parse(JSON.stringify(mod.AUTHORED_ACTIONS)),
    ...(extra.gates ? { gates: JSON.parse(JSON.stringify(extra.gates)) } : {}),
    labels: JSON.parse(JSON.stringify(mod.LABELS)),
    // the OPENING mode is an authored input like everything else here — the serializer reads the authored module only, so a mode pinned in meta.ts alone would be silently dropped from a recipe-composed build (the authored module's own comment predicted exactly this)
    ...(mod.MODE ? { mode: mod.MODE as RecipeV1["mode"] } : {}),
    ...(mod.BEATS ? { beats: JSON.parse(JSON.stringify(mod.BEATS)) } : {}),
    ...(mod.PUSH_OPEN ? { pushOpen: JSON.parse(JSON.stringify(mod.PUSH_OPEN)) } : {}),
  };
}

export function bundledRecipe(id: BundledId): RecipeV1 {
  switch (id) {
    case "eket-cabinet": return serialize(id, EKET as never, EKET_PARTS, { gates: EKET_GATE_EXPRS, ruleOverrides: { dowel139435: EKET_PIN_RULE_JSON as never }, sweep: EKET_SWEEP });
    case "bekvam-stool": return serialize(id, BEKVAM as never, BEKVAM_PARTS, { sweep: BEKVAM_SWEEP });
    case "dalfred-stool": return serialize(id, DALFRED as never, DALFRED_PARTS, { sweep: DALFRED_SWEEP });
    case "lack-table": return serialize(id, LACK as never, LACK_PARTS, { sweep: LACK_SWEEP });
  }
}
