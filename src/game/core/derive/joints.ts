// Joint entities lowered into the flat per-part fields the engine reads — a seam only, so the flat form stays the runtime truth.
// A joint is a PAIR fact the flat form can only store per-part (the both-sides lockDir workaround); the union keeps each new kind to its own payload.
// `hinge` is representable but NOT playable — the motion primitive is linear. To enable: add it to PLAYABLE_JOINT_KINDS and JoinKind, give ParkInfo a rotational variant, teach placeEngagement to return it, add the control.
import { KIND_FACTS, type JoinKind, type JointGeometry, type PartId, type Vec3 } from "@/src/game/core/type";
import type { StructureOverlay } from "../model/liaisons";

// Narrower than PartDef so `jointIssues` works on the recipe path, where parts are still being assembled.
type PartLike = { type: string; attached?: readonly PartId[] };

// How a part comes at its seat: travel direction, and how far off it parks before the drive gesture.
// An OVERRIDE, stated only when the derived contact geometry is wrong or a device fact contradicts it.
// `dir` is required: without it the override corrects nothing, leaving a bare `parkBackoff` the drag stack ignores but the sweep reads as a travel span.
export interface Approach {
  dir: Vec3;
  back?: number;
}

// Two endpoints, and optionally the world-space contact point on each — a pair fact, so one declaration here instead of two per-part `jointAnchor` overrides that can disagree.
interface JointBase {
  a: PartId;
  b: PartId;
  anchor?: { a?: Vec3; b?: Vec3 };
}

// One joint between two STRUCTURAL parts, discriminated by kind so illegal combinations are unrepresentable.
// Fasteners are NOT a variant: hardware's joint follows from `attached`, so declaring it here would store the same fact twice.
// `gates: false` is a real joint that must NOT constrain the build order — right for a contact a motion merely ARRIVES at (DALFRED's pin lands in circleDown's bore on the way through circleUpp's hole). Only slide and screw gate.
export type JointDef =
  | (JointBase & { kind: "press"; mover?: PartId; approach?: Approach })
  | (JointBase & { kind: "slide"; mover: PartId; approach?: Approach; gates?: boolean })
  | (JointBase & { kind: "screw"; mover: PartId; approach?: Approach; gates?: boolean })
  // A press with the drive gesture removed — the parts click together in the placement motion itself.
  // It still TRAVELS: `dropOn` kills the PARK, not the direction. `mover` is required because the feel is one part's, not the pair's.
  | (JointBase & { kind: "snap"; mover: PartId; approach?: Approach })
  // The two-phase keyhole: press in along the approach, then a short shove seats the bolts.
  // `lock.dir` is the shove when `mover` moves, `lock.dirOther` when the OTHER endpoint does — one pair fact instead of two per-part lockDirs that can drift apart.
  | (JointBase & { kind: "hookAndSlot"; mover: PartId; approach: Approach; lock: { dir: Vec3; travel?: number; dirOther?: Vec3 } })
  // Rotational joint — representable so recipes and the wizard can carry one, NOT playable; see the header.
  | (JointBase & { kind: "hinge"; mover: PartId; pivot: Vec3; axis: Vec3; sweepDeg: number });

// The kinds the engine can drive. Lowering refuses anything else by name rather than degrading it into something placeable.
export const PLAYABLE_JOINT_KINDS: ReadonlySet<JoinKind> = new Set(
  (Object.keys(KIND_FACTS) as JoinKind[]).filter((k) => KIND_FACTS[k].playable),
);

type Mutable = {
  pressJoins?: PartId[];
  slideJoins?: PartId[];
  screwJoins?: PartId[];
  placeDir?: Vec3;
  parkBackoff?: number;
  lockDir?: Vec3;
  lockTravel?: number;
  dropOn?: boolean;
  jointAnchor?: Vec3;
};

const endpoints = (j: JointDef): [PartId, PartId] => [j.a, j.b];

const other = (j: JointDef, from: PartId): PartId => (j.a === from ? j.b : j.a);

const isZero = (v: Vec3 | undefined): boolean => !v || Math.hypot(v[0], v[1], v[2]) < 1e-6;

const pairKey = (j: JointDef): string => [j.a, j.b].sort().join("__");

// Every authoring error as a plain message, path-free so `lowerJoints` (which throws) and a recipe validator (which maps them to wizard steps) share the checks.
// `parts` is optional: pass it to also catch joints naming parts that do not exist or are not structural.
export function jointIssues(
  joints: readonly JointDef[],
  parts?: Record<PartId, PartLike>,
): string[] {
  const out: string[] = [];
  const seen = new Map<string, JoinKind>();
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
    // One check for every kind that travels: an approach only corrects a derivation, so a zero one corrects it to nothing.
    const approach = "approach" in j ? j.approach : undefined;
    if (approach && isZero(approach.dir)) out.push(`${where}: an approach needs a non-zero dir — it overrides a derived travel axis, and a zero vector overrides it with nothing`);
    if (j.kind === "press" && j.approach && !j.mover) out.push(`${where}: an approach describes how the MOVER travels, so the joint must name one`);
    if (j.kind === "hookAndSlot" && isZero(j.lock.dir)) out.push(`${where}: a hook-and-slot needs a non-zero lock.dir — the lock leg has no direction`);
  }
  return out;
}

// Rewrite joints into the flat per-part overlay. Throws on any authoring error, the contract `buildComponents` uses.
// `geometry` (joints.gen.ts) is read HERE rather than merged underneath, so derivation stays opt-in per joint.
export function lowerJoints(
  joints: readonly JointDef[],
  parts?: Record<PartId, PartLike>,
  geometry?: JointGeometry,
): StructureOverlay {
  const issues = jointIssues(joints, parts);
  if (issues.length) throw new Error(`invalid JOINTS:\n` + issues.map((m) => "  - " + m).join("\n"));

  const out: Record<PartId, Mutable> = {};
  const at = (id: PartId): Mutable => (out[id] ??= {});
  const join = (id: PartId, field: "pressJoins" | "slideJoins" | "screwJoins", target: PartId): void => {
    const list = (at(id)[field] ??= []);
    if (!list.includes(target)) list.push(target);
  };
  // True when HARDWARE already makes this pair's Γ edge — buildLiaisons' predicate, NOT `isConnector`, which would exclude the plain screws holding BEKVAM together.
  const bridged = (a: PartId, b: PartId): boolean =>
    Object.values(parts ?? {}).some((p) => p.type === "fastener" && p.attached?.length === 2 && p.attached.includes(a) && p.attached.includes(b));
  // Where a joint's travel becomes flat fields: the authored approach wins, else the generated table, else nothing and the part keeps what it authors.
  const travel = (id: PartId, a: Approach | undefined): void => {
    const dir = a?.dir ?? geometry?.[id]?.placeDir;
    if (dir) at(id).placeDir = dir;
    if (a?.back !== undefined) at(id).parkBackoff = a.back;
  };

  for (const j of joints) {
    // The contact point lowers to the per-part `jointAnchor`, and a part in several joints has only that one field — so two joints claiming DIFFERENT anchors is an error here, not last-writer-wins on device.
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

    // A PRESS or SNAP already joined by hardware emits its vectors only: the edge exists either way, and stamping a press kind on it would let a part press home before its own dowel is in.
    // A SLIDE or SCREW still emits, since those are what `andFrontierTargets` reads to require the groove owner or thread receiver be placed FIRST.
    const hardwareJoins = bridged(j.a, j.b) && (j.kind === "press" || j.kind === "snap");

    switch (j.kind) {
      case "press": {
        // A press with no mover is order-INDEPENDENT — either side may press onto the other — so it lands on `a` and Γ reads an undirected edge.
        const carrier = j.mover ?? j.a;
        if (!hardwareJoins) join(carrier, "pressJoins", other(j, carrier));
        travel(carrier, j.approach);
        break;
      }
      case "slide": {
        if (!hardwareJoins && j.gates !== false) join(j.mover, "slideJoins", other(j, j.mover));
        travel(j.mover, j.approach);
        break;
      }
      case "screw": {
        if (!hardwareJoins && j.gates !== false) join(j.mover, "screwJoins", other(j, j.mover));
        travel(j.mover, j.approach);
        break;
      }
      case "snap": {
        // `dropOn` only has work when something else pushes placeEngagement off "drop". A hardware-joined pair emits no join array, so there is nothing to cancel.
        if (!hardwareJoins) {
          join(j.mover, "pressJoins", other(j, j.mover));
          at(j.mover).dropOn = true;
        }
        travel(j.mover, j.approach);
        break;
      }
      case "hookAndSlot": {
        // The press leg is a pressJoins edge like any press; the lock leg is the per-part lockDir the two-phase control reads.
        if (!hardwareJoins) join(j.mover, "pressJoins", other(j, j.mover));
        travel(j.mover, j.approach);
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

// Merge a lowered overlay UNDER an authored flat one: join arrays union, and any scalar the flat overlay states wins, so a part-migrated file behaves as it reads.
export function mergeOverlays(base: StructureOverlay, over: StructureOverlay): StructureOverlay {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [id, entry] of Object.entries(base)) out[id] = { ...(entry as object) } as Record<string, unknown>;
  for (const [id, entry] of Object.entries(over)) {
    const target = (out[id] ??= {});
    for (const [key, value] of Object.entries(entry as object)) {
      if (key === "pressJoins" || key === "slideJoins" || key === "screwJoins") {
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
