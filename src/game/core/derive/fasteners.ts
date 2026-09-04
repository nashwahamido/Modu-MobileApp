// FASTENERS defs, validated and lowered at GENERATION time: every def checked against its instances' mesh-name bindings, its ROLE facts landed on them through the structure overlay.
// Sequencing is NOT lowered here — composition/composeActions.ts expands the same defs into actions at runtime, reading the roles off the parts.
// `primaryFor` is shared with that expansion, so the validator and the sequencing can never pair an extra differently.
// `lifecycle` lowers to the per-instance drive distances; an instance that differs from its group authors the flat field in STRUCTURE, which wins.
import type { FastenerDef, FastenerEntry, FastenerMap, FastenerPreload, FastenerRole, GroupId, PartDef, PartId } from "@/src/game/core/type";
import { primaryFor } from "../composition/composeActions";
import type { StructureOverlay } from "../model/liaisons";
import { groupParts } from "../scene/targets";

type Parts = Record<PartId, PartDef>;

export type FastenerFacts = Record<PartId, { fastenerRole: FastenerRole; preload?: FastenerPreload; insertStage?: number; insertRetract?: number; insertProud?: number }>;

const roleOf = (d: FastenerDef): "connector" | "securer" | "extra" | "cap" =>
  d.home === "part" ? "cap" : typeof d.home === "object" ? "extra" : d.role;

/** What a def puts on each instance: the role, a connector's preload, then the lifecycle's drive distances. Key order is for the generated file's readability only. */
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

/** Every authoring error as a plain message — path-free so `fastenerFacts` (which throws) and a recipe validator (which maps them to wizard steps) share the checks. */
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
        // A connector's joint exists BECAUSE the hardware is driven, so an authored join on the same pair defines it twice and the two can contradict. Hardware that merely secures an authored joint is a securer.
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

/** Every instance's role facts, keyed by part. Throws on any authoring error, so no structure.gen is written from a def that does not fit its instances. */
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

/** Land the role facts on the overlay, so `applyStructure` carries them onto the parts like any other authored field.
 * Authored fields win — a hand-written `fastenerRole` is the escape hatch for one instance that differs from its group. */
export function withFastenerFacts(overlay: StructureOverlay, facts: FastenerFacts): StructureOverlay {
  const out: StructureOverlay = { ...overlay };
  for (const [id, facts_] of Object.entries(facts) as [PartId, FastenerFacts[PartId]][]) {
    const facts = facts_;
    out[id] = { ...facts, ...out[id] };
  }
  return out;
}
