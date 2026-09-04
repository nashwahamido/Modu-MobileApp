// Joint entities as a LOWERING SEAM only: a furniture may author JOINTS instead of the three flat arrays, and this rewrites them into the per-part fields the engine already reads.
// The flat form stays the single runtime truth, so nothing on device changes. A joint is a PAIR fact the flat form can only store per-part (the both-sides lockDir workaround), and the union keeps each new kind to its own payload.
// `hinge` is representable but NOT playable: the motion primitive is linear ({axis, offset} eased to zero), so a pivot sweep cannot be faked by lowering and authoring one is a named error instead of a part that silently drops flush.
// To enable it: add "hinge" to PLAYABLE_JOINT_KINDS and JoinKind, give ParkInfo a rotational variant, teach placeEngagement to return it, add the control that drives it.
import { KIND_FACTS, type JoinKind, type JointGeometry, type PartId, type Vec3 } from "@/src/game/core/type";
import type { StructureOverlay } from "../model/liaisons";

/** All lowering needs of a part. Narrower than PartDef so `jointIssues` stays usable from the recipe path, where parts are still being assembled. */
type PartLike = { type: string; attached?: readonly PartId[] };

/** How a part comes at its seat: travel direction, and how far off it parks before the drive gesture (the FEEL distance above the derived collision floor).
 * An OVERRIDE — the direction is normally derived from contact geometry, and stated here only when the mesh gets it wrong or a device fact the geometry cannot see says otherwise.
 * `dir` is required: an override with no direction corrects the derivation to nothing, leaving a bare `parkBackoff` the drag stack ignores but the sweep still reads as a travel span. */
export interface Approach {
  dir: Vec3;
  back?: number;
}

/** What every joint carries: its two endpoints, and optionally the world-space contact point on each part.
 * The contact point is a pair fact, so authoring it here keeps one declaration instead of two per-part `jointAnchor` overrides that can disagree. */
interface JointBase {
  a: PartId;
  b: PartId;
  anchor?: { a?: Vec3; b?: Vec3 };
}

/** One joint between two STRUCTURAL parts, discriminated by kind so illegal combinations are unrepresentable rather than validator checks.
 * Fasteners are NOT a variant: hardware's joint is a consequence of `attached`, so declaring it here too would store the same fact twice.
 * `gates: false` marks a real joint that must NOT constrain the build order — right for a contact a motion merely ARRIVES at, since only slide and screw edges gate.
 * DALFRED's support pin slides through circleUpp's hole into circleDown's bore: two joints, one motion, and only the first is a precondition. Declaring the second still stops the derivation reading circleDown as an obstruction, while emitting no Γ edge. */
export type JointDef =
  | (JointBase & { kind: "press"; mover?: PartId; approach?: Approach })
  | (JointBase & { kind: "slide"; mover: PartId; approach?: Approach; gates?: boolean })
  | (JointBase & { kind: "screw"; mover: PartId; approach?: Approach; gates?: boolean })
  /** A press with the drive gesture removed — the parts click together in the placement motion itself (EKET's suspension cover over its bracket).
   * It still TRAVELS: `dropOn` kills the PARK, not the direction, so it carries an approach like any other kind (BEKVAM's rails drop flush and still come in along −X).
   * `mover` is required because the feel is one part's, not the pair's. */
  | (JointBase & { kind: "snap"; mover: PartId; approach?: Approach })
  /** The two-phase keyhole: press in along the approach, then a short shove seats the bolts in their slots.
   * `lock.dir` is the shove when `mover` moves, `lock.dirOther` the shove when the OTHER endpoint does — one pair fact instead of two per-part lockDirs that can drift apart. */
  | (JointBase & { kind: "hookAndSlot"; mover: PartId; approach: Approach; lock: { dir: Vec3; travel?: number; dirOther?: Vec3 } })
  /** Rotational joint (hinge, folding leg, drop leaf, flip lid) — representable so recipes and the wizard can carry one, NOT playable; see the module header. */
  | (JointBase & { kind: "hinge"; mover: PartId; pivot: Vec3; axis: Vec3; sweepDeg: number });

/** The kinds the engine can drive. Anything outside is valid authoring the runtime cannot honour yet, and lowering refuses it by name rather than degrading it into something placeable. */
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

/** Every authoring error as a plain message — path-free so `lowerJoints` (which throws) and a recipe validator (which maps them to wizard steps) share the checks.
 * `parts` is optional: pass it to also catch joints naming parts that do not exist or are not structural. */
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
    // One check for every kind that travels: an approach only ever corrects a derivation, so a zero one corrects it to nothing.
    const approach = "approach" in j ? j.approach : undefined;
    if (approach && isZero(approach.dir)) out.push(`${where}: an approach needs a non-zero dir — it overrides a derived travel axis, and a zero vector overrides it with nothing`);
    if (j.kind === "press" && j.approach && !j.mover) out.push(`${where}: an approach describes how the MOVER travels, so the joint must name one`);
    if (j.kind === "hookAndSlot" && isZero(j.lock.dir)) out.push(`${where}: a hook-and-slot needs a non-zero lock.dir — the lock leg has no direction`);
  }
  return out;
}

/** Rewrite joint entities into the flat per-part overlay the engine reads. Throws on any authoring error, the same contract `buildComponents` uses.
 * `geometry` (joints.gen.ts) is consulted HERE rather than merged underneath, so derivation stays opt-in per joint — a furniture authoring no JOINTS consumes none of it. */
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
  /** True when HARDWARE already makes this pair's Γ edge. The same predicate buildLiaisons uses, NOT `isConnector` — that would exclude the plain screws holding BEKVAM together. */
  const bridged = (a: PartId, b: PartId): boolean =>
    Object.values(parts ?? {}).some((p) => p.type === "fastener" && p.attached?.length === 2 && p.attached.includes(a) && p.attached.includes(b));
  // The one place a joint's travel becomes flat fields: the authored approach wins, else the generated table, else nothing and the part keeps what it authors.
  const travel = (id: PartId, a: Approach | undefined): void => {
    const dir = a?.dir ?? geometry?.[id]?.placeDir;
    if (dir) at(id).placeDir = dir;
    if (a?.back !== undefined) at(id).parkBackoff = a.back;
  };

  for (const j of joints) {
    // The contact point lowers to the per-part `jointAnchor` the drag layer reads, and a part in several joints has only that one field.
    // So two joints claiming DIFFERENT anchors for one part is an error here, not a last-writer-wins surprise on device.
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

    // A PRESS or SNAP whose pair hardware already joins emits its vectors only: the edge exists either way, and stamping a press kind on it would let a part press home before its own dowel is in.
    // A SLIDE or SCREW still emits, because those are what `andFrontierTargets` reads to require the groove owner or thread receiver be placed FIRST — withholding one silently drops the gate.
    const hardwareJoins = bridged(j.a, j.b) && (j.kind === "press" || j.kind === "snap");

    switch (j.kind) {
      case "press": {
        // A press with no mover is the order-INDEPENDENT case — either side may press onto the other — so it lands on `a` and Γ reads an undirected press edge.
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
        // `dropOn` only has work when something else pushes placeEngagement off "drop". On a hardware-joined pair no join array is emitted, so there is no edge to cancel and the flag would be inert.
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

/** Merge a lowered joint overlay UNDER an authored flat one: the three join arrays union, and any scalar the flat overlay states wins.
 * That way a file part-way through migration keeps behaving exactly as it reads. */
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
