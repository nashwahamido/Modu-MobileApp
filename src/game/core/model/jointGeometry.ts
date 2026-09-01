// Travel vectors derived from the contact geometry, so a direction is a fact about the mesh instead of a hand-typed vector a re-export silently invalidates. The rule is one sentence: the join KIND — the only thing a human still states — selects which axis of the contact slab the part travels along, ACROSS it for a press, ALONG it for a slide. Everything here is pure and offline-friendly; helper-scripts/derive-joints.mts writes the result and derivedJoints.furniture.test.ts recomputes it, the same split sweep.ts and derive-sweep.mts already use.
// WHAT IT NEVER DOES: emit a join array. Derivation answers "which way", never "who joins whom", so a wrong derivation can misdirect a part but can never fabricate a Γ edge or move the build order.
import { liaisonId } from "@/src/game/core/ids";
import type {
  JoinKind,
  JointGeometry,
  LiaisonMap,
  PartBox,
  PartDef,
  PartId,
  SweepDirKey,
  SweepMap,
  Vec3,
} from "@/src/game/core/type";
import type { ComponentIndex } from "./components";
import { boxOverlap, CONTACT_EXPANSION_M, deriveJointFrames } from "./jointFrames";

/** One mover-side claim: `partId` travels into `partner`, and the join is of `kind`. Built either from a furniture's JOINTS or, until one exists, from the flat join arrays — which is what lets the whole corpus be measured before anything migrates. */
export interface JointStatement {
  partId: PartId;
  partner: PartId;
  kind: JoinKind;
}

/** Why a part got the vector it got, or why it got none. Emitted as a trailing comment in the generated file and tallied by the pin test — the escape-hatch count is only meaningful if every omission says what defeated it. */
export interface DerivationNote {
  partId: PartId;
  partner: PartId;
  kind: JoinKind;
  status: "derived" | "undetermined";
  /** Which slab axis the kind selected. Null when no slab was available at all. */
  rule?: "normal" | "slab-long" | "slab-mid";
  /** Where the sign came from: the contact points from the mover toward its partner, or the sweep said the reverse corridor was blocked. */
  sign?: "toward-partner" | "sweep" | "sweep-flipped";
  /** Whether the sweep actually VOUCHED for this candidate's exit corridor, as opposed to merely not objecting. Only "clear" candidates win a disagreement between two contacts of the same part. */
  exit?: "clear" | "unknown";
  ext?: Vec3;
  value?: Vec3;
  why?: string;
}

const EPS = 1e-6;

// Negation without producing -0: a cardinal direction's zero components are noise either way, but JSON.stringify writes -0 as "0", so an un-normalised vector can never deep-equal its own generated file and the staleness pin would fail forever.
const neg = (v: Vec3): Vec3 => [v[0] === 0 ? 0 : -v[0], v[1] === 0 ? 0 : -v[1], v[2] === 0 ? 0 : -v[2]];

const same = (a: Vec3, b: Vec3): boolean => Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS && Math.abs(a[2] - b[2]) < EPS;

/** A slab axis is always world-cardinal (box extents are), but a BRIDGED liaison's facing is a centre-to-centre line that generally is not — and every authored travel in the corpus is cardinal, so a non-cardinal candidate is evidence the derivation has no slab to stand on rather than a vector worth emitting. */
const cardinal = (v: Vec3): SweepDirKey | null => {
  const axes: [number, SweepDirKey, SweepDirKey][] = [
    [0, "+x", "-x"],
    [1, "+y", "-y"],
    [2, "+z", "-z"],
  ];
  for (const [i, pos, negK] of axes) {
    const others = [0, 1, 2].filter((k) => k !== i);
    if (Math.abs(Math.abs(v[i]) - 1) < 1e-3 && others.every((k) => Math.abs(v[k]) < 1e-3)) {
      return v[i] > 0 ? pos : negK;
    }
  }
  return null;
};

const unitAxis = (k: number): Vec3 => [k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0];

/** The exit corridor is clear when every blocker on the REVERSE of the travel is either placed LATER — it is not in the way yet when this part arrives — or one of the part's own joint partners, whose contact is what the park math and the two-phase lock handle by construction. This is verbatim the invariant structuralSweep.furniture.test.ts asserts over all 33 authored placeDirs (`:160-164`), and the "placed later" half is load-bearing: scored against the finished assembly instead of the moment of placement, nearly every corridor looks blocked and the rule abstains on everything. */
function exitClear(
  sweep: SweepMap | undefined,
  partId: PartId,
  travel: Vec3,
  partners: ReadonlySet<PartId>,
  placeOrder: ReadonlyMap<PartId, number>,
): boolean | null {
  const key = cardinal(neg(travel));
  if (!key) return null;
  const blockers = sweep?.[partId]?.[key];
  if (!blockers?.length) return true;
  const mine = placeOrder.get(partId) ?? Infinity;
  const earlier = blockers.filter((b) => (placeOrder.get(b) ?? Infinity) < mine);
  return earlier.every((b) => partners.has(b));
}

/** The kinds that travel ACROSS the contact — the mover meets a face and comes at it perpendicular. A `snap` is here too: dropOn kills the PARK, not the direction, so a snapped part still arrives along an axis (BEKVAM's rails drop flush and still travel −X). */
const ACROSS: ReadonlySet<JoinKind> = new Set<JoinKind>(["press", "screw", "snap"]);

/** Read today's flat authoring as joint statements, so the derivation can be measured against the whole corpus before a single furniture migrates. A part's OWN join arrays name it the mover; a part with no arrays but with liaisons is the Γ-default category — its edges come from hardware, and `snap` and `press` select the same axis, so the unstated kind costs the measurement nothing. */
export function statementsFromFlat(
  parts: Record<PartId, PartDef>,
  liaisons: LiaisonMap,
  components?: ComponentIndex,
): JointStatement[] {
  // Bodies of the SAME component are never a joint here: a component is one tray card, one drag, one placement gesture, so the contact between EKET's runner frame and the middle body it telescopes over is internal to a part the player handles whole — not a face anything approaches. Their directJoins stay (those edges are the non-lead bodies' only Γ reachability), which is exactly why the exclusion belongs here and not in the authoring.
  const together = (a: PartId, b: PartId): boolean =>
    !!components && !!components.byBody[a] && components.byBody[a] === components.byBody[b];
  const out: JointStatement[] = [];
  for (const p of Object.values(parts)) {
    if (p.type !== "structural") continue;
    let any = false;
    for (const [field, kind] of [["directJoins", "press"], ["slideJoins", "slide"], ["screwJoins", "screw"]] as const) {
      for (const t of p[field] ?? []) {
        if (together(p.partId, t)) continue;
        out.push({ partId: p.partId, partner: t, kind });
        any = true;
      }
    }
    if (any) continue;
    for (const l of Object.values(liaisons)) {
      if (l.a !== p.partId && l.b !== p.partId) continue;
      const partner = (l.a === p.partId ? l.b : l.a) as PartId;
      if (together(p.partId, partner)) continue;
      out.push({ partId: p.partId, partner, kind: "snap" });
    }
  }
  return out;
}

/** One statement's candidate travel, or null with the reason it failed. */
function candidateFor(
  s: JointStatement,
  parts: Record<PartId, PartDef>,
  liaisons: LiaisonMap,
  boxes: Record<PartId, PartBox>,
  frames: ReturnType<typeof deriveJointFrames>,
  sweep: SweepMap | undefined,
  partners: ReadonlySet<PartId>,
  placeOrder: ReadonlyMap<PartId, number>,
): DerivationNote {
  const base = { partId: s.partId, partner: s.partner, kind: s.kind };
  const l = liaisons[liaisonId(...([s.partId, s.partner].sort() as [PartId, PartId]))];
  const frame = l && frames[l.id];
  if (!l || !frame) return { ...base, status: "undetermined", why: "no contact frame for the pair" };
  if (frame.via === "bridge") return { ...base, status: "undetermined", why: "parts do not touch — a bridged liaison has a centre line, not a contact slab" };

  const normal = l.a === s.partId ? frame.facingA : neg(frame.facingA);
  const normalKey = cardinal(normal);
  if (!normalKey) return { ...base, status: "undetermined", why: `contact normal ${JSON.stringify(normal)} is not world-cardinal` };
  const normalAxis = "xyz".indexOf(normalKey[1]);

  const A = boxes[s.partId];
  const B = boxes[s.partner];
  const ov = A && B ? boxOverlap(A, B, CONTACT_EXPANSION_M) : null;
  if (!ov) return { ...base, status: "undetermined", why: "boxes do not overlap" };
  const ext: Vec3 = [ov.max[0] - ov.min[0], ov.max[1] - ov.min[1], ov.max[2] - ov.min[2]];

  if (ACROSS.has(s.kind)) {
    // The contact points from the mover toward its partner, which is the direction it closes on the face — then the sweep gets a veto, because a part can meet a face and still have to come at it the other way (EKET's runner clip wraps the carriage TIP: the push "toward" drives through the rail body).
    const towards = exitClear(sweep, s.partId, normal, partners, placeOrder);
    const away = exitClear(sweep, s.partId, neg(normal), partners, placeOrder);
    if (towards === false && away === true) {
      return { ...base, status: "derived", rule: "normal", sign: "sweep-flipped", exit: "clear", ext, value: neg(normal) };
    }
    if (towards === false && away === false) {
      return { ...base, status: "undetermined", rule: "normal", ext, why: "both signs have third-party blockers in the exit corridor" };
    }
    return { ...base, status: "derived", rule: "normal", sign: "toward-partner", exit: towards === true ? "clear" : "unknown", ext, value: normal };
  }

  // A slide shears ALONG the seam, so its travel is the longer of the two axes spanning the contact — and the slab gives no sign at all, leaving the sweep as the only evidence.
  const inPlane = [0, 1, 2].filter((k) => k !== normalAxis).sort((x, y) => ext[y] - ext[x]);
  const [long, mid] = inPlane;
  if (ext[long] - ext[mid] < 0.005) {
    return { ...base, status: "undetermined", rule: "slab-long", ext, why: `slab axes tied within 5mm (${ext[long].toFixed(3)} vs ${ext[mid].toFixed(3)}) — the ranking is rounding, not shape` };
  }
  const axis = unitAxis(long);
  const plus = exitClear(sweep, s.partId, axis, partners, placeOrder);
  const minus = exitClear(sweep, s.partId, neg(axis), partners, placeOrder);
  if (plus === true && minus !== true) return { ...base, status: "derived", rule: "slab-long", sign: "sweep", ext, value: axis };
  if (minus === true && plus !== true) return { ...base, status: "derived", rule: "slab-long", sign: "sweep", ext, value: neg(axis) };
  return { ...base, status: "undetermined", rule: "slab-long", ext, why: plus === true ? "both signs clear — the sweep cannot choose" : "neither sign clear" };
}

/** Every part's derived travel, plus a note per statement. A part claimed by several joints must get ONE answer: candidates that disagree leave it undetermined rather than letting loop order pick, because a part travels one way and two contacts saying otherwise is evidence the rule does not fit — EKET's topPanel meets a side panel on each flank and the two normals are opposite, which is exactly the order-dependence `adaptedTravelDir` resolves at runtime and a static file must not pretend to settle. */
export function deriveJointGeometry(
  parts: Record<PartId, PartDef>,
  liaisons: LiaisonMap,
  boxes: Record<PartId, PartBox>,
  sweep: SweepMap | undefined,
  statements: readonly JointStatement[],
  placeOrder: ReadonlyMap<PartId, number>,
): { geometry: JointGeometry; notes: DerivationNote[] } {
  const frames = deriveJointFrames(parts, liaisons, boxes);
  const partnersOf = new Map<PartId, Set<PartId>>();
  for (const s of statements) {
    (partnersOf.get(s.partId) ?? partnersOf.set(s.partId, new Set()).get(s.partId)!).add(s.partner);
  }

  // A part can only arrive at a face that is STANDING when it arrives: EKET's top panel meets a side on each flank and the two normals are opposite, but only the LEFT side is up when the top goes on, so the right one is not a face it approached — it is a face that later approaches IT. Where a part has such faces they are the whole candidate set. Where it has none it OPENS the build in this order, and its authored travel describes the other legal orders in which it arrives second (EKET's side panels and drawer sides are all seeds that still author one), so every face it will eventually meet stays a candidate rather than the part being left with nothing.
  const earlierOnly = new Map<PartId, JointStatement[]>();
  const allOf = new Map<PartId, JointStatement[]>();
  for (const s of statements) {
    (allOf.get(s.partId) ?? allOf.set(s.partId, []).get(s.partId)!).push(s);
    if ((placeOrder.get(s.partner) ?? Infinity) < (placeOrder.get(s.partId) ?? Infinity)) {
      (earlierOnly.get(s.partId) ?? earlierOnly.set(s.partId, []).get(s.partId)!).push(s);
    }
  }
  const considered = [...allOf.keys()].flatMap((pid) => earlierOnly.get(pid) ?? allOf.get(pid)!);

  const notes: DerivationNote[] = [];
  const byPart = new Map<PartId, DerivationNote[]>();
  for (const s of considered) {
    const note = candidateFor(s, parts, liaisons, boxes, frames, sweep, partnersOf.get(s.partId) ?? new Set(), placeOrder);
    notes.push(note);
    (byPart.get(s.partId) ?? byPart.set(s.partId, []).get(s.partId)!).push(note);
  }

  const geometry: JointGeometry = {};
  for (const [partId, list] of byPart) {
    const derived = list.filter((n) => n.status === "derived" && n.value);
    if (!derived.length) continue;
    let winners = derived;
    if (!derived.every((n) => same(n.value!, derived[0].value!))) {
      // A part that meets several others has a candidate per contact, and they need not agree — BEKVAM's front rail meets both legs AND the step, and the step's face points a different way. The tie-break is the same evidence the sign rule uses: a part cannot have arrived along a corridor that was already occupied, so only candidates whose exit the sweep VOUCHES for stay in the running. A face nothing can reach is not the face the part came in through.
      const clear = derived.filter((n) => n.exit === "clear");
      if (!clear.length || !clear.every((n) => same(n.value!, clear[0].value!))) {
        for (const n of list) {
          n.status = "undetermined";
          n.why = clear.length
            ? "several unblocked contacts claim different travel — order-dependent, resolved at runtime, not here"
            : "contacts disagree and none has a clear exit corridor";
          delete n.value;
        }
        continue;
      }
      for (const n of derived) {
        if (n.exit !== "clear") {
          n.status = "undetermined";
          n.why = `contact discarded: ${JSON.stringify(n.value)} has no clear exit corridor while another contact does`;
          delete n.value;
        }
      }
      winners = clear;
    }
    geometry[partId] = { placeDir: winners[0].value! };
  }
  return { geometry, notes };
}
