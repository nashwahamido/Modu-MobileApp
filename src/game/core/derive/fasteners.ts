// Fastener defs, validated and lowered at GENERATION time — the v2 authoring shape from docs/superpowers/specs/2026-08-22-fastener-model-v2.md (as amended 2026-08-24). A furniture authors FASTENERS (the shape lives in core/type.ts); this module checks every def against its instances' mesh-name bindings with named errors, and lands each def's ROLE facts (`fastenerRole`, a connector's `preload`) on the instances through the structure overlay, so structure.gen.ts carries them and the device reads them as plain part fields. Sequencing is NOT lowered here any more: composition/composeActions.ts expands the same defs into actions at runtime, reading the roles off the parts.
// Extras (subordinate hardware riding a primary: the EKET plug on its half pin) pair to the NEAREST primary instance whose binding covers their own hosts — `primaryFor` is shared with the expansion so validator and sequencing can never disagree.
// Staging stays orthogonal (a carrier's stageOffset rewrites the expanded actions in withStaging). `lifecycle` lowers to the per-instance drive distances (`insertStage` / `insertRetract` / `insertProud`) — one fact stated once on the def, so there is no drop-step-versus-insertStage agreement left to validate; an instance that differs from its group still authors the flat field in STRUCTURE, which wins.
import type { FastenerDef, FastenerEntry, FastenerMap, FastenerPreload, FastenerRole, GroupId, PartDef, PartId } from "@/src/game/core/type";
import { primaryFor } from "../composition/composeActions";
import type { StructureOverlay } from "../model/liaisons";
import { groupParts } from "../scene/targets";

type Parts = Record<PartId, PartDef>;

export type FastenerFacts = Record<PartId, { fastenerRole: FastenerRole; preload?: FastenerPreload; insertStage?: number; insertRetract?: number; insertProud?: number }>;

const roleOf = (d: FastenerDef): "connector" | "securer" | "extra" | "cap" =>
  d.home === "part" ? "cap" : typeof d.home === "object" ? "extra" : d.role;

/** The facts this def puts on each of its instances: the role (and a connector's preload), then the lifecycle's drive distances. Key order matters only for the generated file's readability. */
const factsOf = (d: FastenerDef): FastenerFacts[PartId] => {
  const role = roleOf(d);
  const lc = d.lifecycle;
  return {
    fastenerRole: role,
    ...(role === "connector" ? { preload: (d as Extract<FastenerDef, { role: "connector" }>).preload } : {}),
    ...(lc?.drop ? { insertStage: lc.drop.stage } : {}),
    ...(lc?.insert?.retract !== undefined ? { insertRetract: lc.insert.retract } : {}),
    ...(lc?.insert?.proud !== undefined ? { insertProud: lc.insert.proud } : {}),
  };
};

/** Every authoring error in a fastener map, as plain messages — pure and path-free so both `fastenerFacts` (which throws) and a future recipe validator (which maps them to wizard steps) can use the same checks. */
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

    const lc = d.lifecycle;
    if (lc?.drop && !(lc.drop.stage > 0)) out.push(`${where}: lifecycle.drop.stage must be a positive distance (m) — it is how far outside the hole the fastener is dropped`);
    if (lc?.insert) {
      if (lc.insert.retract !== undefined && lc.insert.proud !== undefined) out.push(`${where}: lifecycle.insert states both retract and proud — the loose pose sits either inside the carrier or proud of flush, not both`);
      if (lc.insert.retract !== undefined && !(lc.insert.retract > 0)) out.push(`${where}: lifecycle.insert.retract must be a positive distance (m)`);
      if (lc.insert.proud !== undefined && !(lc.insert.proud >= 0)) out.push(`${where}: lifecycle.insert.proud must be ≥ 0 (0 = seats flush)`);
    }

    const role = roleOf(d);
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
        for (const field of ["pressJoins", "slideJoins", "screwJoins"] as const) {
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

/** Every instance's role facts, keyed by part. Throws on any authoring error — the generator refuses to write a structure.gen from a def that does not fit its instances. */
export function fastenerFacts(fasteners: FastenerMap, parts: Parts): FastenerFacts {
  const issues = fastenerIssues(fasteners, parts);
  if (issues.length) throw new Error(`invalid FASTENERS:\n` + issues.map((m) => "  - " + m).join("\n"));
  const out: FastenerFacts = {};
  for (const [group, d] of Object.entries(fasteners) as [GroupId, FastenerEntry][]) {
    const facts = factsOf(d);
    for (const p of groupParts(parts, group)) out[p.partId] = facts;
  }
  return out;
}

/** Land the role facts on the overlay, so structure.gen.ts shows them as reviewable text and `applyStructure` carries them onto the parts alongside every other authored field. Authored fields win: a hand-written `fastenerRole` on a part stays, which is the escape hatch for a single instance that differs from its group. */
export function withFastenerFacts(overlay: StructureOverlay, facts: FastenerFacts): StructureOverlay {
  const out: StructureOverlay = { ...overlay };
  for (const [id, facts_] of Object.entries(facts) as [PartId, FastenerFacts[PartId]][]) {
    const facts = facts_;
    out[id] = { ...facts, ...out[id] };
  }
  return out;
}
