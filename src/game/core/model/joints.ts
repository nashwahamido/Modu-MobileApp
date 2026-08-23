// Joint entities — the v2 authoring shape from docs/superpowers/specs/2026-08-08-joint-model-v2.md, landed as a LOWERING SEAM only: a furniture may author JOINTS instead of the three flat arrays, and this module rewrites them into exactly the per-part fields the engine already reads. Evaluation, input and presentation are untouched, so the flat form stays the single runtime truth and nothing on device changes.
// Why the seam exists before any furniture needs it: a joint is a PAIR fact stored per-part today (the both-sides lockDir workaround), and every new kind widens the flat sprawl. The union makes each kind carry exactly its own payload, so adding one is a variant plus its touchpoints rather than another optional field on every part.
// ROTATION: `hinge` is deliberately representable here and deliberately NOT playable. The engine's whole motion primitive is linear — ParkInfo is {axis, offset} eased to zero, and even `screw` is a linear travel with a cosmetic whole-turn spin — so a pivot sweep cannot be faked by a lowering. Authoring one is therefore a clean, named error instead of a part that silently drops flush. To enable it later: add "hinge" to PLAYABLE_JOINT_KINDS and JoinKind, give ParkInfo a rotational variant (pivot + axis + sweep), teach placeEngagement to return it, and add the control that drives it — the authoring shape, the wire format and the validator message all already exist.
import type { PartId, Vec3 } from "@/src/game/core/type";
import type { StructureOverlay } from "./liaisons";

/** How a part comes at its seat: the travel direction and how far off the seat it parks before the drive gesture (the FEEL distance above the derived collision floor, per the v2 note's rule 4). */
export interface Approach {
  dir?: Vec3;
  back?: number;
}

/** What every joint carries regardless of kind: its two endpoints, and optionally where on each part the joint physically CONTACTS (world-space). The contact point is a pair fact — `jointFrames.ts` already derives it per liaison and falls back to a per-part `jointAnchor` override — so authoring it here keeps one declaration instead of two per-part overrides that can disagree. */
interface JointBase {
  a: PartId;
  b: PartId;
  anchor?: { a?: Vec3; b?: Vec3 };
}

/** One joint between two STRUCTURAL parts, discriminated by kind so each carries exactly the data it needs and illegal combinations are unrepresentable rather than validator checks. Fasteners are deliberately NOT a variant: hardware is a physical part with its own lifecycle whose joint is a consequence of `attached`, so declaring it here too would store the same fact twice. */
export type JointDef =
  | (JointBase & { kind: "press"; mover?: PartId; approach?: Approach })
  | (JointBase & { kind: "slide"; mover: PartId; dir: Vec3; back?: number })
  | (JointBase & { kind: "screw"; mover: PartId })
  /** The two-phase keyhole (project name: hook-and-slot): press in along the approach, then a short shove seats the bolts in their slots. `lock.dir` is the shove when `mover` moves; `lock.dirOther` is the shove when the OTHER endpoint moves — the pair-level fact v1 could only express by authoring lockDir on both parts and hoping they stayed in sync. */
  | (JointBase & { kind: "hookAndSlot"; mover: PartId; approach: Approach; lock: { dir: Vec3; travel?: number; dirOther?: Vec3 } })
  /** Rotational joint (hinge, folding leg, drop leaf, flip lid) — representable so recipes and the wizard can carry one, NOT yet playable (see the module header for the enable path). */
  | (JointBase & { kind: "hinge"; mover: PartId; pivot: Vec3; axis: Vec3; sweepDeg: number });

export type JointKind = JointDef["kind"];

/** The kinds the engine can actually drive today. A kind outside this set is a valid AUTHORING statement the runtime cannot honour yet, and lowering refuses it by name rather than degrading it into something that looks placeable. */
export const PLAYABLE_JOINT_KINDS: ReadonlySet<JointKind> = new Set<JointKind>(["press", "slide", "screw", "hookAndSlot"]);

type Mutable = {
  directJoins?: PartId[];
  slideJoins?: PartId[];
  screwJoins?: PartId[];
  placeDir?: Vec3;
  parkBackoff?: number;
  lockDir?: Vec3;
  lockTravel?: number;
  jointAnchor?: Vec3;
};

const endpoints = (j: JointDef): [PartId, PartId] => [j.a, j.b];

const other = (j: JointDef, from: PartId): PartId => (j.a === from ? j.b : j.a);

const isZero = (v: Vec3 | undefined): boolean => !v || Math.hypot(v[0], v[1], v[2]) < 1e-6;

const pairKey = (j: JointDef): string => [j.a, j.b].sort().join("__");

/** Every authoring error in a joint list, as plain messages — pure and path-free so both `lowerJoints` (which throws) and a future recipe validator (which maps them to wizard steps) can use the same checks. `parts` is optional: pass it to also catch joints naming parts that do not exist or are not structural. */
export function jointIssues(
  joints: readonly JointDef[],
  parts?: Record<PartId, { type: string }>,
): string[] {
  const out: string[] = [];
  const seen = new Map<string, JointKind>();
  for (const j of joints) {
    const where = `joint ${j.kind} "${j.a}"↔"${j.b}"`;
    if (j.a === j.b) out.push(`${where}: a joint needs two distinct parts`);
    if (parts) {
      for (const id of endpoints(j)) {
        const p = parts[id];
        if (!p) out.push(`${where}: references missing part "${id}"`);
        else if (p.type !== "structural") out.push(`${where}: endpoint "${id}" is a ${p.type} — joints connect STRUCTURAL parts; hardware makes its joint through \`attached\``);
      }
    }
    if ("mover" in j && j.mover !== undefined && j.mover !== j.a && j.mover !== j.b) {
      out.push(`${where}: mover "${j.mover}" is not one of its endpoints`);
    }
    const prev = seen.get(pairKey(j));
    if (prev) out.push(`${where}: this pair is already joined as "${prev}" — one joint has one kind`);
    else seen.set(pairKey(j), j.kind);

    if (!PLAYABLE_JOINT_KINDS.has(j.kind)) {
      out.push(`${where}: the "${j.kind}" kind is not playable yet — the engine's placement motion is linear (park offset eased to zero), so a pivot sweep has no runtime yet; see model/joints.ts for the enable path`);
      continue;
    }
    if (j.kind === "slide" && isZero(j.dir)) out.push(`${where}: a slide needs a non-zero dir — its travel axis is not derivable from poses`);
    if (j.kind === "press" && j.approach && !j.mover) out.push(`${where}: an approach describes how the MOVER travels, so the joint must name one`);
    if (j.kind === "hookAndSlot") {
      if (isZero(j.approach.dir)) out.push(`${where}: a hook-and-slot needs a non-zero approach.dir — the press leg has no direction`);
      if (isZero(j.lock.dir)) out.push(`${where}: a hook-and-slot needs a non-zero lock.dir — the lock leg has no direction`);
    }
  }
  return out;
}

/** Rewrite joint entities into the flat per-part overlay the engine reads. Throws on any authoring error — the same contract `buildComponents` uses, and it lands as a Result on the recipe path because `composeRecipe` wraps composition in a try/catch. */
export function lowerJoints(
  joints: readonly JointDef[],
  parts?: Record<PartId, { type: string }>,
): StructureOverlay {
  const issues = jointIssues(joints, parts);
  if (issues.length) throw new Error(`invalid JOINTS:\n` + issues.map((m) => "  - " + m).join("\n"));

  const out: Record<PartId, Mutable> = {};
  const at = (id: PartId): Mutable => (out[id] ??= {});
  const join = (id: PartId, field: "directJoins" | "slideJoins" | "screwJoins", target: PartId): void => {
    const list = (at(id)[field] ??= []);
    if (!list.includes(target)) list.push(target);
  };

  for (const j of joints) {
    // The contact point lowers to the per-part `jointAnchor` override the drag layer already reads. A part in several joints has several contact points but only one such field, which is exactly the v1 compromise this shape exists to retire — so two joints claiming DIFFERENT anchors for one part is an error here rather than a last-writer-wins surprise on device.
    for (const side of ["a", "b"] as const) {
      const value = j.anchor?.[side];
      if (!value) continue;
      const id = j[side];
      const prev = at(id).jointAnchor;
      if (prev && prev.some((v, i) => v !== value[i])) {
        throw new Error(`invalid JOINTS:\n  - part "${id}" is given two different anchors by two joints — the per-part jointAnchor can hold one; drop one, or let jointFrames derive it`);
      }
      at(id).jointAnchor = value;
    }

    switch (j.kind) {
      case "press": {
        // A press with no mover is the order-INDEPENDENT case (either side may come second and press onto the other), which is exactly what a bare directJoins entry means today, so it lands on `a` and Γ treats it as an undirected press edge.
        const carrier = j.mover ?? j.a;
        join(carrier, "directJoins", other(j, carrier));
        if (j.approach?.dir) at(carrier).placeDir = j.approach.dir;
        if (j.approach?.back !== undefined) at(carrier).parkBackoff = j.approach.back;
        break;
      }
      case "slide": {
        join(j.mover, "slideJoins", other(j, j.mover));
        at(j.mover).placeDir = j.dir;
        if (j.back !== undefined) at(j.mover).parkBackoff = j.back;
        break;
      }
      case "screw": {
        join(j.mover, "screwJoins", other(j, j.mover));
        break;
      }
      case "hookAndSlot": {
        // The press leg is a directJoins edge exactly like a plain press; the lock leg is the per-part lockDir the two-phase control reads. Authoring `lock.dirOther` writes the mirrored shove onto the other endpoint too, so a free-mode role swap keeps working — the same both-sides data v1 hand-maintained, now derived from ONE declaration.
        join(j.mover, "directJoins", other(j, j.mover));
        if (j.approach.dir) at(j.mover).placeDir = j.approach.dir;
        if (j.approach.back !== undefined) at(j.mover).parkBackoff = j.approach.back;
        at(j.mover).lockDir = j.lock.dir;
        if (j.lock.travel !== undefined) at(j.mover).lockTravel = j.lock.travel;
        if (j.lock.dirOther) {
          const partner = other(j, j.mover);
          at(partner).lockDir = j.lock.dirOther;
          if (j.lock.travel !== undefined) at(partner).lockTravel = j.lock.travel;
        }
        break;
      }
      case "hinge":
        // unreachable: jointIssues rejects every non-playable kind above
        break;
    }
  }
  return out as StructureOverlay;
}

/** Merge a lowered joint overlay UNDER an authored flat overlay: the three join arrays union (a part may be joined by both routes during a migration), and any scalar the flat overlay states wins, so a file part-way through migration keeps behaving exactly as it reads. */
export function mergeOverlays(base: StructureOverlay, over: StructureOverlay): StructureOverlay {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [id, entry] of Object.entries(base)) out[id] = { ...(entry as object) } as Record<string, unknown>;
  for (const [id, entry] of Object.entries(over)) {
    const target = (out[id] ??= {});
    for (const [key, value] of Object.entries(entry as object)) {
      if (key === "directJoins" || key === "slideJoins" || key === "screwJoins") {
        const merged = [...((target[key] as PartId[] | undefined) ?? [])];
        for (const t of (value as PartId[] | undefined) ?? []) if (!merged.includes(t)) merged.push(t);
        target[key] = merged;
      } else {
        target[key] = value;
      }
    }
  }
  return out as StructureOverlay;
}
