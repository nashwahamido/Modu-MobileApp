// Fastener entities — the v2 authoring shape from docs/superpowers/specs/2026-08-22-fastener-model-v2.md (as amended 2026-08-24), landed as a LOWERING SEAM only: a furniture may author FASTENERS instead of hand-written FastenerRule lists + fastenerKind overrides, and this module rewrites them into exactly those flat facts. Evaluation, composition and presentation are untouched, so the flat form stays the single runtime truth and nothing on device changes.
// The def declares the FORM of a group's home (liaison + role, part, or extraOf another group); WHICH liaison/part/primary each INSTANCE binds to stays derived from the mesh-name `attached` pairs, exactly as today — the def never repeats a location the GLB already states. Lowering marries kind (def) to location (attached) and validates the fit per instance, so a mis-named mesh is a named error instead of broken gameplay.
// The FastenerKind enum survives BELOW this seam as the lowering target: a role/preload combination lowers to the kind whose runtime defaults implement it (securer→secured, connector{insert,press}→pin, connector{tighten,screw}→threaded, connector{tighten,press}→cam), emitted as a per-part override only where the group-name prefix would derive a different kind — reproducing byte-for-byte the overrides EKET authors by hand today.
// Extras (subordinate hardware riding a primary: the EKET plug on its half pin) lower to the sequencing today's PIN_TO_CAM table hand-authors: each extra instance pairs to the NEAREST primary instance whose binding covers its own hosts, and its insert requires its own host places, the inherited liaison's remaining endpoint places (the securer gate), then the primary's tighten. Securement is a property of the whole attachment bundle — primary plus extras — which today's runtime already realizes through those tighten edges.
// Staging stays orthogonal (a carrier's stageOffset rewrites the expanded actions in withStaging); `lifecycle` is validated here but lowers to nothing new — the 3-phase drop step remains the part-level `insertStage` switch. A per-instance `anchor` is deliberately absent from this seam: bindings vary per instance, so a group-level PartId cannot express it; it arrives with the geometry deriver as instance data.
import { placeId, tightenId } from "@/src/game/core/ids";
import type { FastenerKind, GroupId, PartDef, PartId, ToolId } from "@/src/game/core/type";
import type { FastenerRule } from "../composition/composeActions";
import { fastenerKindOf } from "./liaisons";
import { groupParts } from "../scene/targets";

type Parts = Record<PartId, PartDef>;

export type FastenerLifecycleStep = "drop" | "insert" | "tighten";

/** One hardware GROUP's def — its map key is the group, so the def carries form + capabilities and never a location. `stage` is the Γ-wave the expanded actions land in (stays a rule-level fact); `tool` is the rare per-build override ahead of the HARDWARE catalogue. */
export type FastenerDef =
  // joint-defining hardware: the joint exists BECAUSE this is driven (BEKVÄM dowel, LACK bolt, EKET rod dowel)
  | {
      home: "liaison";
      role: "connector";
      preload: { completesOn: "insert" | "tighten"; counterpartMountsBy: "press" | "screw" };
      lifecycle?: readonly FastenerLifecycleStep[];
    }
  // joint-locking hardware: the joint already exists (authored press/slide/screw); this secures it (the wood screws, EKET cam locks)
  | { home: "liaison"; role: "securer"; lifecycle?: readonly FastenerLifecycleStep[] }
  // subordinate hardware riding a primary (EKET plug on its half pin): liaison inherited per instance, no role, no preload
  | { home: { extraOf: GroupId }; lifecycle?: readonly FastenerLifecycleStep[] }
  // part-dressing hardware: no joint at all (DALFRED pole cap)
  | { home: "part"; lifecycle?: readonly FastenerLifecycleStep[] };

export type FastenerEntry = FastenerDef & { stage: number; tool?: ToolId };

export type FastenerMap = Record<GroupId, FastenerEntry>;

/** What lowering emits: the rule list expandFastenerRules already consumes, plus the per-part kind overrides that today live as hand-written `fastenerKind` fields in STRUCTURE. */
export interface LoweredFasteners {
  rules: FastenerRule[];
  kindOverrides: Record<PartId, FastenerKind>;
}

const LIFECYCLE_ORDER: readonly FastenerLifecycleStep[] = ["drop", "insert", "tighten"];

const DEFAULT_LIFECYCLE: readonly FastenerLifecycleStep[] = ["insert", "tighten"];

const roleOf = (d: FastenerDef): "connector" | "securer" | "extra" | "cap" =>
  d.home === "part" ? "cap" : typeof d.home === "object" ? "extra" : d.role;

/** The kind whose runtime defaults implement this def's behaviour. Extras return null: their sequencing is authored by the lowered rule, and their presentation kind stays whatever the name prefix says. */
function impliedKind(d: FastenerDef): FastenerKind | null {
  switch (roleOf(d)) {
    case "securer":
    case "cap":
      return "secured";
    case "extra":
      return null;
    case "connector": {
      const p = (d as Extract<FastenerDef, { role: "connector" }>).preload;
      if (p.completesOn === "insert") return "pin";
      return p.counterpartMountsBy === "screw" ? "threaded" : "cam";
    }
  }
}

/** The prefix-derived kind, ignoring any override already applied to the part — lowering must decide overrides from the NAME baseline, whether it is handed raw or structured parts. */
const prefixKind = (p: PartDef): FastenerKind => fastenerKindOf({ ...p, fastenerKind: undefined } as PartDef);

const dist = (a: PartDef, b: PartDef): number => {
  const [x1, y1, z1] = a.pose.position;
  const [x2, y2, z2] = b.pose.position;
  return Math.hypot(x1 - x2, y1 - y2, z1 - z2);
};

/** Instance matching for an extra: the nearest primary-group instance whose binding covers every one of the extra's own hosts (same liaison + nearest — stricter than a group-wide nearest). */
function primaryFor(extra: PartDef, primaries: readonly PartDef[]): PartDef | undefined {
  const hosts = extra.attached ?? [];
  let best: PartDef | undefined;
  for (const c of primaries) {
    if (!hosts.every((h) => c.attached?.includes(h))) continue;
    if (!best || dist(extra, c) < dist(extra, best)) best = c;
  }
  return best;
}

/** Every authoring error in a fastener map, as plain messages — pure and path-free so both `lowerFasteners` (which throws) and a future recipe validator (which maps them to wizard steps) can use the same checks. */
export function fastenerIssues(fasteners: FastenerMap, parts: Parts): string[] {
  const out: string[] = [];
  const defs = Object.entries(fasteners) as [GroupId, FastenerEntry][];
  const defined = new Set(defs.map(([g]) => g));

  for (const p of Object.values(parts)) {
    if (p.type === "fastener" && !defined.has(p.group)) {
      out.push(`fastener part "${p.partId}" belongs to group "${p.group}", which has no FASTENERS def`);
    }
  }

  const connectorLiaisons = new Map<string, GroupId>();
  for (const [group, d] of defs) {
    const where = `fastener "${group}"`;
    const instances = groupParts(parts, group);
    if (instances.length === 0) out.push(`${where}: no parts carry this group`);
    for (const p of instances) {
      if (p.type !== "fastener") out.push(`${where}: part "${p.partId}" is ${p.type} — FASTENERS defs describe hardware only`);
    }

    const lifecycle = d.lifecycle ?? DEFAULT_LIFECYCLE;
    if (d.lifecycle) {
      if (d.lifecycle.length === 0) out.push(`${where}: lifecycle cannot be empty — omit it for the [insert, tighten] default`);
      const order = d.lifecycle.map((s) => LIFECYCLE_ORDER.indexOf(s));
      if (order.some((v, i) => i > 0 && v <= order[i - 1])) {
        out.push(`${where}: lifecycle must be an ordered subset of drop → insert → tighten, each step at most once`);
      }
    }

    // The drop step and the part-level 3-phase switch must agree — expandFastenerRules keys the placeFastener split off `insertStage` alone, so a drop without the scalar is inert and a scalar without the drop is an undeclared 3-phase.
    for (const p of instances) {
      const declared = lifecycle.includes("drop");
      if (declared && p.insertStage === undefined) {
        out.push(`${where}: lifecycle declares a drop step but instance "${p.partId}" has no insertStage — the drop lowers to nothing without the stage distance`);
      }
      if (!declared && p.insertStage !== undefined) {
        out.push(`${where}: instance "${p.partId}" authors insertStage but the lifecycle has no drop step — the runtime will play 3-phase the def does not declare`);
      }
    }

    const role = roleOf(d);
    if (role === "connector") {
      const completesOn = (d as Extract<FastenerDef, { role: "connector" }>).preload.completesOn;
      if (!lifecycle.includes(completesOn)) {
        out.push(`${where}: preload completes on "${completesOn}" but the lifecycle [${lifecycle.join(", ")}] has no such step`);
      }
    }

    const wantAttached = role === "cap" ? 1 : role === "extra" ? null : 2;
    for (const p of instances) {
      const n = p.attached?.length ?? 0;
      if (wantAttached === 2 && n !== 2) {
        out.push(`${where}: instance "${p.partId}" names ${n} attached part(s) — a liaison-homed ${role} needs exactly the joint's two endpoints in its mesh name`);
      }
      if (wantAttached === 1 && n !== 1) {
        out.push(`${where}: instance "${p.partId}" names ${n} attached part(s) — a part-homed fastener sits on exactly one`);
      }
    }

    if (role === "connector") {
      for (const p of instances) {
        if ((p.attached?.length ?? 0) !== 2) continue;
        const key = [...p.attached!].sort().join("__");
        const prev = connectorLiaisons.get(key);
        if (prev && prev !== group) out.push(`${where}: liaison "${key}" already has connector group "${prev}" — one joint has one defining group`);
        else connectorLiaisons.set(key, group);
        // A connector's joint exists BECAUSE the hardware is driven — an authored structural join on the same pair defines it twice, and the two can contradict (an authored press under counterpartMountsBy: screw). Hardware that merely secures an authored joint is a securer.
        const [a, b] = p.attached!;
        for (const field of ["directJoins", "slideJoins", "screwJoins"] as const) {
          if (parts[a]?.[field]?.includes(b) || parts[b]?.[field]?.includes(a)) {
            out.push(`${where}: liaison "${key}" also carries an authored ${field} join — the joint cannot both exist already and exist because this is driven; if the hardware merely secures it, its role is securer`);
          }
        }
      }
    }

    if (role === "extra") {
      const primaryGroup = (d.home as { extraOf: GroupId }).extraOf;
      const primaryDef = fasteners[primaryGroup];
      if (primaryGroup === group) out.push(`${where}: extraOf itself`);
      else if (!primaryDef) out.push(`${where}: extraOf "${primaryGroup}", which has no FASTENERS def`);
      else if (roleOf(primaryDef) === "extra" || roleOf(primaryDef) === "cap") {
        out.push(`${where}: extraOf "${primaryGroup}", a ${roleOf(primaryDef)} — extras ride a LIAISON-homed primary (depth 1, no chains, no extras on caps)`);
      } else {
        const primaries = groupParts(parts, primaryGroup);
        for (const p of groupParts(parts, group)) {
          if ((p.attached?.length ?? 0) === 0) out.push(`${where}: instance "${p.partId}" names no attached part — an extra's mesh name must name its host(s)`);
          else if (!primaryFor(p, primaries)) out.push(`${where}: instance "${p.partId}" has no "${primaryGroup}" instance covering its host(s) — nothing to ride`);
        }
      }
    }
  }
  return out;
}

/** Rewrite fastener defs into the flat facts the composition layer reads: one FastenerRule per def (input order preserved — action order follows it), kind overrides only where the name prefix would derive a different kind than the role implies. Throws on any authoring error — the joints-seam contract. */
export function lowerFasteners(fasteners: FastenerMap, parts: Parts): LoweredFasteners {
  const issues = fastenerIssues(fasteners, parts);
  if (issues.length) throw new Error(`invalid FASTENERS:\n` + issues.map((m) => "  - " + m).join("\n"));

  const rules: FastenerRule[] = [];
  const kindOverrides: Record<PartId, FastenerKind> = {};

  for (const [group, d] of Object.entries(fasteners) as [GroupId, FastenerEntry][]) {
    const implied = impliedKind(d);
    if (implied) {
      for (const p of groupParts(parts, group)) {
        if (prefixKind(p) !== implied) kindOverrides[p.partId] = implied;
      }
    }

    const base: FastenerRule = { group, stage: d.stage, ...(d.tool ? { tool: d.tool } : {}) };
    if (roleOf(d) !== "extra") {
      rules.push(base);
      continue;
    }

    // Extra sequencing: own host places, then the inherited liaison's remaining endpoints (the securer gate — load-bearing when the primary is a connector, whose own tighten precedes the later endpoint), then the primary's completion. Pairing is resolved here, once, so the rule closure carries plain data.
    const primaries = groupParts(parts, (d.home as { extraOf: GroupId }).extraOf);
    const pairing = new Map<PartId, PartDef>();
    for (const p of groupParts(parts, group)) pairing.set(p.partId, primaryFor(p, primaries)!);
    rules.push({
      ...base,
      requires: (p) => {
        const primary = pairing.get(p.partId)!;
        const hosts = p.attached ?? [];
        const remaining = (primary.attached ?? []).filter((id) => !hosts.includes(id));
        return [...hosts.map(placeId), ...remaining.map(placeId), tightenId(primary.partId)];
      },
    });
  }
  return { rules, kindOverrides };
}
