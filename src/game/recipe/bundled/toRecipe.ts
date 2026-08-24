// Serializes a bundled furniture's authored inputs into RecipeV1. Trivial by design: after module load every authored export IS plain data (the TS helper functions — drawer(s), slide(side,s), tightenActionIds(...) — have already evaluated), so serialization is re-keying, not translation. The two exceptions are EKET's gates and its one function-typed fastener rule, which have canonical JSON forms in eketGates.ts. This module is test-reachable AND the future seed for cloud-shipping bundled furniture without an app release.
import type { RecipeV1 } from "../schema";
import type { FastenerRuleJson } from "../fastenerRules";
import { EKET_GATE_EXPRS, EKET_PIN_RULE_JSON } from "./eketGates";

import * as EKET from "@/src/game/content/furnitures/EKET/authored";
import { PARTS as EKET_PARTS } from "@/src/game/content/furnitures/EKET/parts.gen";
import * as BEKVAM from "@/src/game/content/furnitures/BEKVAM/authored";
import { PARTS as BEKVAM_PARTS } from "@/src/game/content/furnitures/BEKVAM/parts.gen";
import * as DALFRED from "@/src/game/content/furnitures/DALFRED/authored";
import { PARTS as DALFRED_PARTS } from "@/src/game/content/furnitures/DALFRED/parts.gen";
import * as LACK from "@/src/game/content/furnitures/LACK/authored";
import { PARTS as LACK_PARTS } from "@/src/game/content/furnitures/LACK/parts.gen";

export type BundledId = "eket-cabinet" | "bekvam-stool" | "dalfred-stool" | "lack-table";

type AuthoredModule = { STRUCTURE: object; FASTENER_RULES: readonly { group: string; stage: number; tool?: string; requires?: unknown }[]; AUTHORED_ACTIONS: readonly object[]; LABELS: object; BEATS?: object; CLUSTERS?: object; COMPONENTS?: object; PUSH_OPEN?: object; GATES?: object };

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

function serialize(id: BundledId, mod: AuthoredModule, parts: object, extra: { gates?: object; ruleOverrides?: Record<string, FastenerRuleJson> }): RecipeV1 {
  return {
    schemaVersion: 1,
    id,
    parts: JSON.parse(JSON.stringify(parts)),
    structure: JSON.parse(JSON.stringify(mod.STRUCTURE)),
    ...(mod.CLUSTERS ? { clusters: JSON.parse(JSON.stringify(mod.CLUSTERS)) } : {}),
    ...(mod.COMPONENTS ? { components: JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(mod.COMPONENTS).map(([k, c]) => [k, { label: (c as { label: object }).label, bodies: (c as { bodies: string[] }).bodies, lead: (c as { lead: string }).lead }])))) } : {}),
    fastenerRules: plainRules(mod, extra.ruleOverrides ?? {}),
    actions: JSON.parse(JSON.stringify(mod.AUTHORED_ACTIONS)),
    ...(extra.gates ? { gates: JSON.parse(JSON.stringify(extra.gates)) } : {}),
    labels: JSON.parse(JSON.stringify(mod.LABELS)),
    ...(mod.BEATS ? { beats: JSON.parse(JSON.stringify(mod.BEATS)) } : {}),
    ...(mod.PUSH_OPEN ? { pushOpen: JSON.parse(JSON.stringify(mod.PUSH_OPEN)) } : {}),
  };
}

export function bundledRecipe(id: BundledId): RecipeV1 {
  switch (id) {
    case "eket-cabinet": return serialize(id, EKET as never, EKET_PARTS, { gates: EKET_GATE_EXPRS, ruleOverrides: { dowel139435: EKET_PIN_RULE_JSON as never } });
    case "bekvam-stool": return serialize(id, BEKVAM as never, BEKVAM_PARTS, {});
    case "dalfred-stool": return serialize(id, DALFRED as never, DALFRED_PARTS, {});
    case "lack-table": return serialize(id, LACK as never, LACK_PARTS, {});
  }
}
