// Joint entities — the v2 authoring shape from docs/superpowers/specs/2026-08-08-joint-model-v2.md, landed as a LOWERING SEAM only: a furniture may author JOINTS instead of the three flat arrays, and this module rewrites them into exactly the per-part fields the engine already reads. Evaluation, input and presentation are untouched, so the flat form stays the single runtime truth and nothing on device changes.
// Why the seam exists before any furniture needs it: a joint is a PAIR fact stored per-part today (the both-sides lockDir workaround), and every new kind widens the flat sprawl. The union makes each kind carry exactly its own payload, so adding one is a variant plus its touchpoints rather than another optional field on every part.
// ROTATION: `hinge` is deliberately representable here and deliberately NOT playable. The engine's whole motion primitive is linear — ParkInfo is {axis, offset} eased to zero, and even `screw` is a linear travel with a cosmetic whole-turn spin — so a pivot sweep cannot be faked by a lowering. Authoring one is therefore a clean, named error instead of a part that silently drops flush. To enable it later: add "hinge" to PLAYABLE_JOINT_KINDS and JoinKind, give ParkInfo a rotational variant (pivot + axis + sweep), teach placeEngagement to return it, and add the control that drives it — the authoring shape, the wire format and the validator message all already exist.
import type { JoinKind, JointGeometry, PartId, Vec3 } from "@/src/game/core/type";
import type { StructureOverlay } from "./liaisons";

/** What lowering needs to know about a part: its category, and the endpoints a fastener binds. Narrower than PartDef so `jointIssues` stays usable from the recipe path, where parts are still being assembled. */
type PartLike = { type: string; attached?: readonly PartId[] };

/** How a part comes at its seat: the travel direction and how far off the seat it parks before the drive gesture (the FEEL distance above the derived collision floor, per the v2 note's rule 4).
 * An approach is an OVERRIDE. The direction is normally DERIVED from the contact geometry (model/jointGeometry.ts) and stated here only when the mesh gets it wrong — a near-cubic contact slab whose axis ranking is rounding, a part that meets nothing (EKET's stabiliser rod hangs 3.7cm clear of its frames), or a measured device fact the geometry cannot see. `back` rides along because every joint that has needed one so far also needed the direction; split it out the day one needs a park distance and nothing else.
 * `dir` is required because it is the whole point — an override with no direction corrects the derivation to nothing, which would lower a bare `parkBackoff` the drag stack ignores but the sweep still reads as a travel span. */
export interface Approach {
  dir: Vec3;
  back?: number;
}

/** What every joint carries regardless of kind: its two endpoints, and optionally where on each part the joint physically CONTACTS (world-space). The contact point is a pair fact — `jointFrames.ts` already derives it per liaison and falls back to a per-part `jointAnchor` override — so authoring it here keeps one declaration instead of two per-part overrides that can disagree. */
interface JointBase {
  a: PartId;
  b: PartId;
  anchor?: { a?: Vec3; b?: Vec3 };
}

/** `gates: false` — a real joint that must NOT constrain the build order. A slide or screw edge is what `andFrontierTargets` reads as "you cannot enter a groove, or a thread, that is not there yet", which is right for the contact a motion BEGINS at and wrong for one it merely arrives at. DALFRED's support pin makes one downward slide through circleUpp's hole and lands its tip in circleDown's bore: two joints, one motion, and only the first is a precondition. Declaring the second still buys what declaring it is for — the derivation stops reading circleDown as an obstruction — while emitting no Γ edge, so nothing waits on it.
 * Only slide and screw carry the flag, because only they gate; a press or snap edge already constrains nothing.
 */
/** One joint between two STRUCTURAL parts, discriminated by kind so each carries exactly the data it needs and illegal combinations are unrepresentable rather than validator checks. Fasteners are deliberately NOT a variant: hardware is a physical part with its own lifecycle whose joint is a consequence of `attached`, so declaring it here too would store the same fact twice. */
export type JointDef =
  | (JointBase & { kind: "press"; mover?: PartId; approach?: Approach })
  | (JointBase & { kind: "slide"; mover: PartId; approach?: Approach; gates?: boolean })
  | (JointBase & { kind: "screw"; mover: PartId; approach?: Approach; gates?: boolean })
  /** A press with the drive gesture removed: the parts click together in the placement motion itself (EKET's suspension cover pushes over its bracket as it lands). It still TRAVELS — `dropOn` kills the PARK, not the direction, which is why it carries an approach like any other kind: BEKVAM's rails drop flush and still come in along −X, and the drag work plane reads that off the part. The `mover` is required precisely because the feel is one part's, not the pair's. Not the same as authoring nothing: a part with no joint drops for want of a placed partner, while this one drops even though its partner stands ready. */
  | (JointBase & { kind: "snap"; mover: PartId; approach?: Approach })
  /** The two-phase keyhole (project name: hook-and-slot): press in along the approach, then a short shove seats the bolts in their slots. `lock.dir` is the shove when `mover` moves; `lock.dirOther` is the shove when the OTHER endpoint moves — the pair-level fact v1 could only express by authoring lockDir on both parts and hoping they stayed in sync. */
  | (JointBase & { kind: "hookAndSlot"; mover: PartId; approach: Approach; lock: { dir: Vec3; travel?: number; dirOther?: Vec3 } })
  /** Rotational joint (hinge, folding leg, drop leaf, flip lid) — representable so recipes and the wizard can carry one, NOT yet playable (see the module header for the enable path). */
  | (JointBase & { kind: "hinge"; mover: PartId; pivot: Vec3; axis: Vec3; sweepDeg: number });

/** The kinds the engine can actually drive today. A kind outside this set is a valid AUTHORING statement the runtime cannot honour yet, and lowering refuses it by name rather than degrading it into something that looks placeable. */
export const PLAYABLE_JOINT_KINDS: ReadonlySet<JoinKind> = new Set<JoinKind>(["press", "slide", "screw", "hookAndSlot", "snap"]);

type Mutable = {
  directJoins?: PartId[];
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

/** Every authoring error in a joint list, as plain messages — pure and path-free so both `lowerJoints` (which throws) and a future recipe validator (which maps them to wizard steps) can use the same checks. `parts` is optional: pass it to also catch joints naming parts that do not exist or are not structural. */
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
    // One check for every kind that travels, because they all state it the same way: an approach is only ever written to correct a derivation, so a zero one corrects it to nothing.
    const approach = "approach" in j ? j.approach : undefined;
    if (approach && isZero(approach.dir)) out.push(`${where}: an approach needs a non-zero dir — it overrides a derived travel axis, and a zero vector overrides it with nothing`);
    if (j.kind === "press" && j.approach && !j.mover) out.push(`${where}: an approach describes how the MOVER travels, so the joint must name one`);
    if (j.kind === "hookAndSlot" && isZero(j.lock.dir)) out.push(`${where}: a hook-and-slot needs a non-zero lock.dir — the lock leg has no direction`);
  }
  return out;
}

/** Rewrite joint entities into the flat per-part overlay the engine reads. Throws on any authoring error — the same contract `buildComponents` uses, and it lands as a Result on the recipe path because `composeRecipe` wraps composition in a try/catch.
 * `geometry` is the generated travel table (joints.gen.ts). It is consulted HERE rather than merged underneath so that derivation stays opt-in per joint: a furniture that authors no JOINTS consumes none of it and keeps exactly today's behaviour, even though the generator computes a value for every part it can. */
export function lowerJoints(
  joints: readonly JointDef[],
  parts?: Record<PartId, PartLike>,
  geometry?: JointGeometry,
): StructureOverlay {
  const issues = jointIssues(joints, parts);
  if (issues.length) throw new Error(`invalid JOINTS:\n` + issues.map((m) => "  - " + m).join("\n"));

  const out: Record<PartId, Mutable> = {};
  const at = (id: PartId): Mutable => (out[id] ??= {});
  const join = (id: PartId, field: "directJoins" | "slideJoins" | "screwJoins", target: PartId): void => {
    const list = (at(id)[field] ??= []);
    if (!list.includes(target)) list.push(target);
  };
  /** True when HARDWARE already makes this pair's Γ edge — the same predicate buildLiaisons uses (a fastener with exactly two `attached`, securers included), NOT `isConnector`, which would exclude the plain screws that hold BEKVAM together. */
  const bridged = (a: PartId, b: PartId): boolean =>
    Object.values(parts ?? {}).some((p) => p.type === "fastener" && p.attached?.length === 2 && p.attached.includes(a) && p.attached.includes(b));
  // The one place a joint's travel becomes flat fields. The authored approach wins; absent one, the generated table supplies the direction, and a part the generator could not decide simply gets nothing and keeps whatever it already authors.
  const travel = (id: PartId, a: Approach | undefined): void => {
    const dir = a?.dir ?? geometry?.[id]?.placeDir;
    if (dir) at(id).placeDir = dir;
    if (a?.back !== undefined) at(id).parkBackoff = a.back;
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

    // A PRESS or SNAP whose pair hardware already joins emits its vectors only. The edge exists either way, and stamping a press kind onto it would let a part press home before its own dowel is in — BEKVAM's rails would open the moment a leg is down, and "the dowel locks drive the real BEKVÄM order by themselves" collapses.
    // A SLIDE or SCREW is different, and the difference is not cosmetic: those kinds are what `andFrontierTargets` reads to require the groove owner or the thread receiver be placed FIRST. Withholding them silently removes a gate — DALFRED's supportPin is bridged to circleUpp and its flat authoring declared the slideJoins anyway, so suppressing it dropped "the pin waits for circleUpp" and the test that names that behaviour went red. A press edge withheld costs nothing because the press kind gates nothing; a slide edge withheld costs the ordering.
    const hardwareJoins = bridged(j.a, j.b) && (j.kind === "press" || j.kind === "snap");

    switch (j.kind) {
      case "press": {
        // A press with no mover is the order-INDEPENDENT case (either side may come second and press onto the other), which is exactly what a bare directJoins entry means today, so it lands on `a` and Γ treats it as an undirected press edge.
        const carrier = j.mover ?? j.a;
        if (!hardwareJoins) join(carrier, "directJoins", other(j, carrier));
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
        // `dropOn` only has work to do when something else would push placeEngagement off "drop" — a press edge, a slide/screw edge, or a preload. On a hardware-joined pair no join array is emitted, so there is no press edge to suppress and the flag would be inert; EKET's suspension cover authors one today purely to cancel the edge its own directJoins creates.
        if (!hardwareJoins) {
          join(j.mover, "directJoins", other(j, j.mover));
          at(j.mover).dropOn = true;
        }
        travel(j.mover, j.approach);
        break;
      }
      case "hookAndSlot": {
        // The press leg is a directJoins edge exactly like a plain press; the lock leg is the per-part lockDir the two-phase control reads. The OTHER endpoint's shove is not authored: a joint states the pair once, and per-part vectors for both sides are what the geometry generator emits — the same argument that retired `approachOther`.
        if (!hardwareJoins) join(j.mover, "directJoins", other(j, j.mover));
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
