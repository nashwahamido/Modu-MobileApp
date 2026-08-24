// The wire format for a furniture recipe: the INPUTS to composition, one JSON document, all ids plain strings (branding happens in loadRecipe). Validation is hand-rolled (repo has no schema dependency and hand-rolls its GLB parsers): every check appends a dotted-path error and parsing never throws — the portal maps these paths back to wizard questions, so path fidelity is a feature, not garnish. Optional fields stay ABSENT rather than defaulted: the engine's validator treats spurious presence (e.g. placeDir on a pin-pressed part) as an authoring error, so a defaults-everywhere parser would manufacture bugs.
import type { GateExpr } from "./gateExpr";
import type { FastenerRuleJson } from "./fastenerRules";

export const OVERLAY_KEYS = ["directJoins", "slideJoins", "screwJoins", "seed", "unstable", "tool", "placeDir", "parkBackoff", "insertRetract", "insertStage", "insertProud", "lockDir", "lockTravel", "dropOn", "toolAnchor", "fastenerKind", "engageDir", "stageOffset"] as const;

export interface RecipePartJson {
  partId: string; group: string; meshName: string; type: "structural" | "fastener"; cluster: string;
  pose: { position: [number, number, number]; rotation: [number, number, number, number] };
  visualCenterOffset?: [number, number, number];
  attached?: string[]; engageDir?: [number, number, number];
}

export interface RecipeActionJson {
  actionId?: string; type: string; stage: number; partId?: string; cluster?: string; tool?: string; motion?: string;
  requires?: string[]; requiresAny?: string[]; gate?: string;
}

export interface RecipeV1 {
  schemaVersion: 1;
  id: string;
  parts: Record<string, RecipePartJson>;
  structure: Record<string, Record<string, unknown>>;
  clusters?: Record<string, { id: string; label: string; seed?: boolean; slideJoins?: string[]; placeDir?: [number, number, number]; parkBackoff?: number; driveMotion?: "screw" }>;
  components?: Record<string, { label: { standard: string; simple?: string }; bodies: string[]; lead: string }>;
  fastenerRules: FastenerRuleJson[];
  actions: RecipeActionJson[];
  gates?: Record<string, GateExpr>;
  labels: Record<string, { standard: string; simple?: string }>;
  beats?: Record<string, { text?: string; simpleText?: string }>;
  pushOpen?: { axis: [number, number, number]; distance: number; popDistance?: number; testActionIds?: Record<string, string>; groups: { level: string; ratio: number; parts: string[] }[] };
  hardware?: Record<string, { tool: string; motion?: string; label?: { standard: string; simple?: string } }>;
  hulls?: unknown;
}

type Ctx = { errors: string[] };
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const err = (ctx: Ctx, path: string, msg: string): false => (ctx.errors.push(`${path}: ${msg}`), false);
const str = (ctx: Ctx, v: unknown, path: string): boolean => (typeof v === "string" && v.length > 0) || err(ctx, path, "expected non-empty string");
const num = (ctx: Ctx, v: unknown, path: string): boolean => typeof v === "number" || err(ctx, path, "expected number");
const vecN = (n: number) => (ctx: Ctx, v: unknown, path: string): boolean => (Array.isArray(v) && v.length === n && v.every((x) => typeof x === "number")) || err(ctx, path, `expected ${n} numbers`);
const vec3 = vecN(3);
const vec4 = vecN(4);
const strArr = (ctx: Ctx, v: unknown, path: string): boolean => (Array.isArray(v) && v.every((x) => typeof x === "string")) || err(ctx, path, "expected string array");
const bool = (ctx: Ctx, v: unknown, path: string): boolean => typeof v === "boolean" || err(ctx, path, "expected boolean");
const opt = (v: unknown, check: (ctx: Ctx, v: unknown, path: string) => boolean, ctx: Ctx, path: string): boolean => v === undefined || check(ctx, v, path);

// Value shape per overlay key — the keys were always checked but the VALUES sailed through untyped, and a junk value (placeDir: "north") survives the engine validator too (its geometric checks NaN out to false) and only surfaces as a NaN travel axis at runtime, on device, with no path.
const OVERLAY_VALUE_CHECKS: Record<(typeof OVERLAY_KEYS)[number], (ctx: Ctx, v: unknown, path: string) => boolean> = {
  directJoins: strArr, slideJoins: strArr, screwJoins: strArr,
  seed: bool, unstable: bool, dropOn: bool,
  tool: str, fastenerKind: str,
  placeDir: vec3, lockDir: vec3, toolAnchor: vec3, engageDir: vec3, stageOffset: vec3,
  parkBackoff: num, insertRetract: num, insertStage: num, insertProud: num, lockTravel: num,
};

function checkPart(ctx: Ctx, v: unknown, path: string): void {
  if (!isObj(v)) { err(ctx, path, "expected object"); return; }
  str(ctx, v.partId, `${path}.partId`); str(ctx, v.group, `${path}.group`); str(ctx, v.meshName, `${path}.meshName`); str(ctx, v.cluster, `${path}.cluster`);
  if (v.type !== "structural" && v.type !== "fastener") err(ctx, `${path}.type`, "expected structural|fastener");
  if (!isObj(v.pose)) err(ctx, `${path}.pose`, "expected object");
  else { vec3(ctx, v.pose.position, `${path}.pose.position`); vec4(ctx, v.pose.rotation, `${path}.pose.rotation`); }
  opt(v.visualCenterOffset, vec3, ctx, `${path}.visualCenterOffset`);
  opt(v.attached, strArr, ctx, `${path}.attached`);
  opt(v.engageDir, vec3, ctx, `${path}.engageDir`);
}

// Depth cap far above any real gate (EKET's deepest is 2): without it a hostile 100k-deep {all:[{all:[…]}]} blows the stack as a RangeError, breaking the "parsing never throws" contract this module promises.
const GATE_EXPR_MAX_DEPTH = 64;

function checkGateExpr(ctx: Ctx, v: unknown, path: string, depth = 0): void {
  if (depth > GATE_EXPR_MAX_DEPTH) { err(ctx, path, `gate expression nests deeper than ${GATE_EXPR_MAX_DEPTH} levels`); return; }
  if (!isObj(v)) { err(ctx, path, "expected object"); return; }
  if ("all" in v || "any" in v) {
    const list = (v as Record<string, unknown>)["all" in v ? "all" : "any"];
    if (!Array.isArray(list) || list.length === 0) err(ctx, path, "all/any expects a non-empty array");
    else list.forEach((e, i) => checkGateExpr(ctx, e, `${path}[${i}]`, depth + 1));
  } else if ("implies" in v) {
    const pair = v.implies;
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every((x) => typeof x === "string")) err(ctx, `${path}.implies`, "expected [ref, ref]");
  } else if ("done" in v) { str(ctx, v.done, `${path}.done`); }
  else err(ctx, path, "expected one of all|any|done|implies");
}

export function parseRecipe(json: unknown): { ok: true; recipe: RecipeV1 } | { ok: false; errors: string[] } {
  const ctx: Ctx = { errors: [] };
  if (!isObj(json)) return { ok: false, errors: ["root: expected object"] };
  if (json.schemaVersion !== 1) err(ctx, "schemaVersion", `expected 1, got ${String(json.schemaVersion)}`);
  str(ctx, json.id, "id");
  if (!isObj(json.parts) || Object.keys(json.parts).length === 0) err(ctx, "parts", "expected non-empty record");
  else for (const [k, v] of Object.entries(json.parts)) checkPart(ctx, v, `parts.${k}`);
  if (!isObj(json.structure)) err(ctx, "structure", "expected record");
  else for (const [k, v] of Object.entries(json.structure)) {
    if (!isObj(v)) { err(ctx, `structure.${k}`, "expected object"); continue; }
    for (const [key, val] of Object.entries(v)) {
      if (!(OVERLAY_KEYS as readonly string[]).includes(key)) err(ctx, `structure.${k}.${key}`, "unknown overlay key");
      else OVERLAY_VALUE_CHECKS[key as (typeof OVERLAY_KEYS)[number]](ctx, val, `structure.${k}.${key}`);
    }
    if (!isObj(json.parts) || !(k in json.parts)) err(ctx, `structure.${k}`, "overlay for unknown part");
  }
  if (!Array.isArray(json.fastenerRules)) err(ctx, "fastenerRules", "expected array");
  else json.fastenerRules.forEach((r, i) => { if (!isObj(r)) { err(ctx, `fastenerRules[${i}]`, "expected object"); return; } str(ctx, r.group, `fastenerRules[${i}].group`); num(ctx, r.stage, `fastenerRules[${i}].stage`); opt(r.tool, str, ctx, `fastenerRules[${i}].tool`); opt(r.requiresExtra, strArr, ctx, `fastenerRules[${i}].requiresExtra`); if (r.pairedWith !== undefined) { const p = r.pairedWith; if (!isObj(p)) err(ctx, `fastenerRules[${i}].pairedWith`, "expected object"); else if ("map" in p) { if (!isObj(p.map) || !Object.values(p.map).every((x) => typeof x === "string")) err(ctx, `fastenerRules[${i}].pairedWith.map`, "expected record of part ids"); } else if ("group" in p) str(ctx, p.group, `fastenerRules[${i}].pairedWith.group`); else err(ctx, `fastenerRules[${i}].pairedWith`, "expected {group} or {map}"); } });
  if (!Array.isArray(json.actions) || json.actions.length === 0) err(ctx, "actions", "expected non-empty array");
  else json.actions.forEach((a, i) => { if (!isObj(a)) { err(ctx, `actions[${i}]`, "expected object"); return; } str(ctx, a.type, `actions[${i}].type`); num(ctx, a.stage, `actions[${i}].stage`); opt(a.actionId, str, ctx, `actions[${i}].actionId`); opt(a.partId, str, ctx, `actions[${i}].partId`); opt(a.cluster, str, ctx, `actions[${i}].cluster`); opt(a.tool, str, ctx, `actions[${i}].tool`); opt(a.motion, str, ctx, `actions[${i}].motion`); opt(a.gate, str, ctx, `actions[${i}].gate`); opt(a.requires, strArr, ctx, `actions[${i}].requires`); opt(a.requiresAny, strArr, ctx, `actions[${i}].requiresAny`); });
  if (json.gates !== undefined) { if (!isObj(json.gates)) err(ctx, "gates", "expected record"); else for (const [k, v] of Object.entries(json.gates)) checkGateExpr(ctx, v, `gates.${k}`); }
  if (!isObj(json.labels)) err(ctx, "labels", "expected record");
  if (json.components !== undefined && isObj(json.components)) for (const [k, v] of Object.entries(json.components)) { if (!isObj(v)) { err(ctx, `components.${k}`, "expected object"); continue; } strArr(ctx, v.bodies, `components.${k}.bodies`); str(ctx, v.lead, `components.${k}.lead`); }
  if (json.pushOpen !== undefined) { const p = json.pushOpen; if (!isObj(p)) err(ctx, "pushOpen", "expected object"); else { vec3(ctx, p.axis, "pushOpen.axis"); num(ctx, p.distance, "pushOpen.distance"); if (!Array.isArray(p.groups)) err(ctx, "pushOpen.groups", "expected array"); } }
  return ctx.errors.length === 0 ? { ok: true, recipe: json as unknown as RecipeV1 } : { ok: false, errors: ctx.errors };
}
