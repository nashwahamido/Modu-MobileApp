// Fastener entities — the v2 authoring shape from docs/superpowers/specs/2026-08-22-fastener-model-v2.md (as amended 2026-08-24), landed as a LOWERING SEAM only: a furniture may author FASTENERS instead of hand-written FastenerRule lists + fastenerKind overrides, and this module rewrites them into exactly those flat facts. Evaluation, composition and presentation are untouched, so the flat form stays the single runtime truth and nothing on device changes.
// The def declares the FORM of a group's home (liaison + role, part, or extraOf another group); WHICH liaison/part/primary each INSTANCE binds to stays derived from the mesh-name `attached` pairs, exactly as today — the def never repeats a location the GLB already states. Lowering marries kind (def) to location (attached) and validates the fit per instance, so a mis-named mesh is a named error instead of broken gameplay.
// 2026-09-01 (spec step 3): the FastenerKind enum below this seam is GONE. A def's role and preload now land on the part unchanged (`fastenerRole`, `preload`) and evaluation reads them directly, instead of being squeezed through four drive-names — secured/threaded/pin/cam — that every call site then decoded back into the same two questions ("is this a connector", "does it complete on tighten"). The cam name retired with the enum: it had zero corpus users, its cell {tighten, press} is now just a preload record, and the two-piece fitting it conflated is a connector plus an extra.
// Extras (subordinate hardware riding a primary: the EKET plug on its half pin) lower to the sequencing today's PIN_TO_CAM table hand-authors: each extra instance pairs to the NEAREST primary instance whose binding covers its own hosts, and its insert requires its own host places, the inherited liaison's remaining endpoint places (the securer gate), then the primary's tighten. Securement is a property of the whole attachment bundle — primary plus extras — which today's runtime already realizes through those tighten edges.
// Staging stays orthogonal (a carrier's stageOffset rewrites the expanded actions in withStaging); `lifecycle` is validated here but lowers to nothing new — the 3-phase drop step remains the part-level `insertStage` switch. A per-instance `anchor` is deliberately absent from this seam: bindings vary per instance, so a group-level PartId cannot express it; it arrives with the geometry deriver as instance data.
import { placeId, tightenId } from "@/src/game/core/ids";
import type { FastenerPreload, FastenerRole, GroupId, PartDef, PartId, ToolId } from "@/src/game/core/type";
import type { FastenerRule } from "../composition/composeActions";
import { groupParts } from "../scene/targets";
import type { StructureOverlay } from "./liaisons";

type Parts = Record<PartId, PartDef>;

export type FastenerLifecycleStep = "drop" | "insert" | "tighten";

/** One hardware GROUP's def — its map key is the group, so the def carries form + capabilities and never a location. No stage: a fastener's stage is derived from the placements it joins (composeActions.deriveFastenerStages). `tool` is the rare per-build override ahead of the HARDWARE catalogue. */
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

export type FastenerEntry = FastenerDef & { tool?: ToolId };

export type FastenerMap = Record<GroupId, FastenerEntry>;

/** What lowering emits: the rule list expandFastenerRules already consumes, plus the per-part role facts the evaluation layer reads. `partFacts` covers EVERY instance of every defined group, not just the ones whose name would have prefilled something else — the point of the 2026-09-01 migration is that a shipped furniture's behaviour rests on its def and never on a mesh name. */
export interface LoweredFasteners {
  rules: FastenerRule[];
  partFacts: Record<PartId, { fastenerRole: FastenerRole; preload?: FastenerPreload }>;
}

const LIFECYCLE_ORDER: readonly FastenerLifecycleStep[] = ["drop", "insert", "tighten"];

const DEFAULT_LIFECYCLE: readonly FastenerLifecycleStep[] = ["insert", "tighten"];

const roleOf = (d: FastenerDef): "connector" | "securer" | "extra" | "cap" =>
  d.home === "part" ? "cap" : typeof d.home === "object" ? "extra" : d.role;

/** The role facts this def puts on each of its instances. A one-line function now that role IS the runtime vocabulary — it used to be `impliedKind`, translating the def into whichever of four drive-names happened to imply the same behaviour, which is exactly the indirection this migration removed. */
const factsOf = (d: FastenerDef): { fastenerRole: FastenerRole; preload?: FastenerPreload } => {
  const role = roleOf(d);
  return role === "connector"
    ? { fastenerRole: role, preload: (d as Extract<FastenerDef, { role: "connector" }>).preload }
    : { fastenerRole: role };
};

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
  const partFacts: LoweredFasteners["partFacts"] = {};

  for (const [group, d] of Object.entries(fasteners) as [GroupId, FastenerEntry][]) {
    const facts = factsOf(d);
    for (const p of groupParts(parts, group)) partFacts[p.partId] = facts;

    const base: FastenerRule = { group, ...(d.tool ? { tool: d.tool } : {}) };
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
  return { rules, partFacts };
}

/** Land the lowered role facts back on the authoring overlay — the one line every furniture writes between `lowerFasteners` and its exported STRUCTURE, so that `applyStructure` carries role and preload onto the parts alongside every other authored field, and structure.gen.ts shows them as reviewable text. Authored fields win: a hand-written `fastenerRole` on a part stays, which is the escape hatch for a single instance that differs from its group. */
export function withFastenerFacts(overlay: StructureOverlay, lowered: LoweredFasteners): StructureOverlay {
  const out: StructureOverlay = { ...overlay };
  for (const [id, facts] of Object.entries(lowered.partFacts) as [PartId, LoweredFasteners["partFacts"][PartId]][]) {
    out[id] = { ...facts, ...out[id] };
  }
  return out;
}
