// Serialized fastener rules. The only function-typed rule in the codebase (EKET's pin→cam) decomposes into data: requiresExtra (refs appended to the engine's attached-derived default) and pairedWith (each instance requires its partner tightened). Pairing is a RULE first — nearest instance of the partner group, resolved from the poses already in the recipe — because the bore-mate relation IS proximity (verified on EKET: 1.9mm winner vs ~190mm runner-up, bijective). The explicit map form exists for geometry the rule cannot disambiguate; composition rejects an ambiguous rule loudly so the portal can bake a map instead.
import type { FastenerRule } from "@/src/game/core/composition/composeActions";
import { asGroupId, placeId, stageId, tightenId } from "@/src/game/core/ids";
import { stagedCarrierOf } from "@/src/game/core/model/staging";
import type { PartDef, PartId, ToolId } from "@/src/game/core/type";
import { expandRefs, type ActionRef } from "./refs";

export type PairedWith = { group: string } | { map: Record<string, string> };

export interface FastenerRuleJson {
  group: string;
  stage: number;
  tool?: ToolId;
  requiresExtra?: ActionRef[];
  pairedWith?: PairedWith;
}

type Parts = Record<PartId, PartDef>;

// A match must be near in absolute terms AND clearly nearer than the runner-up, and the whole assignment must be one-to-one. Calibration: EKET's true pairs sit at 1.9mm with ~190mm margin; 5cm absolute / 0.5 ratio pass that with two orders of magnitude to spare while rejecting anything a human would have to squint at.
const PAIR_ABS_MAX_M = 0.05;
const PAIR_MARGIN_RATIO = 0.5;

const dist = (a: PartDef, b: PartDef): number => Math.hypot(...a.pose.position.map((v, i) => v - b.pose.position[i]) as [number, number, number]);

export function resolvePairing(json: FastenerRuleJson, parts: Parts): Record<PartId, PartId> {
  const paired = json.pairedWith;
  if (!paired) return {};
  const all = Object.values(parts) as PartDef[];
  if ("map" in paired) {
    for (const [a, b] of Object.entries(paired.map)) {
      if (!(a in parts)) throw new Error(`pairedWith.map references unknown part "${a}"`);
      if (!(b in parts)) throw new Error(`pairedWith.map references unknown part "${b}"`);
    }
    return paired.map as Record<PartId, PartId>;
  }
  const instances = all.filter((p) => p.group === json.group);
  const partners = all.filter((p) => p.group === paired.group);
  if (instances.length === 0 || partners.length === 0) throw new Error(`pairedWith group "${paired.group}" or rule group "${json.group}" matches no parts`);
  const out: Record<PartId, PartId> = {};
  const used = new Set<PartId>();
  for (const inst of instances) {
    const ranked = partners.map((p) => [p, dist(inst, p)] as const).sort((a, b) => a[1] - b[1]);
    const [winner, d] = ranked[0];
    const runnerUp = ranked[1]?.[1] ?? Infinity;
    // Negated comparisons so DEGENERATE distances reject rather than pass: an exact 0mm tie (duplicated nodes) and a NaN pose both fail every ">" test and used to pair silently and arbitrarily — ambiguity must throw, never guess.
    if (!(d <= PAIR_ABS_MAX_M) || !(d < runnerUp * PAIR_MARGIN_RATIO)) throw new Error(`pairedWith is ambiguous for "${inst.partId}" (nearest ${winner.partId} at ${(d * 1000).toFixed(1)}mm, runner-up ${(runnerUp * 1000).toFixed(1)}mm) — bake an explicit map`);
    if (used.has(winner.partId)) throw new Error(`pairedWith is not one-to-one: "${winner.partId}" is nearest to two instances — bake an explicit map`);
    used.add(winner.partId);
    out[inst.partId] = winner.partId;
  }
  return out;
}

export function toFastenerRule(json: FastenerRuleJson, parts: Parts): FastenerRule {
  const pairing = resolvePairing(json, parts);
  const extras = json.requiresExtra ? expandRefs(json.requiresExtra, parts) : [];
  const hasOverride = extras.length > 0 || Object.keys(pairing).length > 0;
  return {
    group: asGroupId(json.group),
    stage: json.stage,
    tool: json.tool,
    // The override closure must mirror defaultInsertRequires' staged branch: hardware fitted into a STAGED carrier goes in once the carrier is out (stage beat), not once its endpoints are placed — the carrier's own placement requires this insert, so the attached-places base the non-staged branch uses would compose an insert↔place cycle and fail solvability with no hint at the cause.
    requires: hasOverride
      ? (p: PartDef) => {
          const carrier = stagedCarrierOf(p, parts);
          const base = carrier ? [stageId(carrier)] : (p.attached ?? []).map(placeId);
          return [...base, ...extras, ...(pairing[p.partId] ? [tightenId(pairing[p.partId])] : [])];
        }
      : undefined,
  };
}
