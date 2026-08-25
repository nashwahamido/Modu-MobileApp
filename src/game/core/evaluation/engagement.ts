import { insertId, placeId, tightenId } from "@/src/game/core/ids";
import {
  ActionId,
  AssemblyAction,
  Furniture,
  LiaisonMap,
  PartDef,
  PartId,
  Vec3,
} from "@/src/game/core/type";
import {
  buildLiaisons,
  crossClusterThreads,
  fastenerKindOf,
  isConnector,
  isSlider,
  liaisonOther,
} from "../model/liaisons";
import { adaptSignedDir, entryDirViable, pickEntryDir } from "../model/sweep";
import { clusterCombineEngagement, clusterParkInfo, SLIDE_BACKOFF_M } from "./clusterCombine";

const gammaOf = (f: Furniture): LiaisonMap => f.liaisons ?? buildLiaisons(f.parts);

export type PlaceEngagement = "drop" | "screw" | "slide" | "press";

/** How far a pressing part parks off its seat before the push gesture drives it home, in meters; a press pushes less far than a slide (SLIDE_BACKOFF_M, in clusterCombine). */
export const PRESS_BACKOFF_M = 0.03;

/** Meters of the keyhole lock travel (StructuralFields.lockDir) when the part authors no lockTravel — the short slot-length shove, not a panel-scale glide. */
export const LOCK_TRAVEL_M = 0.015;

/** How far a screwing STRUCTURAL part (leg / tabletop) parks off its seat  before the rotation gesture sinks it home, in meters. */
export const SCREW_BACKOFF_M = 0.045;

/** Visible revolutions of the SPINNING part while a screw joint seats: full  turns only, so the start/end orientations equal the baked one — no pop. */
export const SCREW_SPIN_DEG = 360;

/** The preloaded connector of `kind` awaiting `partId` as its LATER endpoint: the other endpoint placed and the connector fully driven home. This is what turns the later placement into a joint-realizing gesture — threaded → the part screws on (LACK leg), pin → it presses on (BEKVÄM step over the standing dowel). */
function preloadedConnectorFor(
  f: Furniture,
  partId: string,
  done: ReadonlySet<ActionId>,
  kind: "threaded" | "pin",
): PartDef | null {
  for (const p of Object.values(f.parts)) {
    if (
      !isConnector(p) ||
      !p.attached!.includes(partId as never) ||
      fastenerKindOf(p) !== kind
    ) {
      continue;
    }
    const other = p.attached![0] === partId ? p.attached![1] : p.attached![0];
    if (
      done.has(placeId(other)) &&
      done.has(insertId(p.partId)) &&
      done.has(tightenId(p.partId))
    ) {
      return p;
    }
  }
  return null;
}

function preloadedThreadedFor(
  f: Furniture,
  partId: string,
  done: ReadonlySet<ActionId>,
): PartDef | null {
  return preloadedConnectorFor(f, partId, done, "threaded");
}

function preloadedPinFor(
  f: Furniture,
  partId: string,
  done: ReadonlySet<ActionId>,
): PartDef | null {
  return preloadedConnectorFor(f, partId, done, "pin");
}

function directScrewReceiver(
  f: Furniture,
  partId: string,
  done: ReadonlySet<ActionId>,
): PartDef | null {
  const part = f.parts[partId as never];
  for (const l of Object.values(gammaOf(f))) {
    if (l.kind !== "screw" || l.mover !== partId) continue;
    const t = liaisonOther(l, l.mover);
    const r = f.parts[t];
    if (r && r.cluster === part?.cluster && done.has(placeId(t))) return r;
  }
  return null;
}

function directScrewAxis(threader: PartDef, receiver: PartDef): Vec3 {
  // Authored placeDir wins, same doctrine as travelAxis: the centre-delta heuristic below reads DIAGONAL whenever the receiver's centre sits off the thread line (EKET's suspension cover vs its corner-hugging bracket). The screw axis points the way the threader backs out = opposite its authored seating travel.
  const authored = threader.placeDir ? unit(threader.placeDir) : null;
  if (authored) return [-authored[0] || 0, -authored[1] || 0, -authored[2] || 0];
  const d: [number, number, number] = [
    threader.pose.position[0] - receiver.pose.position[0],
    threader.pose.position[1] - receiver.pose.position[1],
    threader.pose.position[2] - receiver.pose.position[2],
  ];
  const l = Math.hypot(d[0], d[1], d[2]);
  if (l < 1e-6) return [0, 1, 0];
  return [d[0] / l, d[1] / l, d[2] / l];
}

export function placeEngagement(
  f: Furniture,
  action: AssemblyAction,
  done: ReadonlySet<ActionId>,
): PlaceEngagement {
  if (action.type === "combineClusters" && action.cluster) {
    // authored cluster overlay wins; furniture without one keeps the legacy cross-cluster-thread behaviour so DALFRED/LACK/BEKVAM are untouched
    const authored = clusterCombineEngagement(f.clusters, action.cluster);
    if (authored) return authored;
    const threads = crossClusterThreads(gammaOf(f), f.parts, action.cluster);
    return threads.length ? "screw" : "drop";
  }
  if (action.type !== "placePart" || !action.partId) return "drop";
  // dropOn: the part clicks home at drop even though a press/screw partner stands ready (EKET's suspension cover)
  if (f.parts[action.partId]?.dropOn) return "drop";
  if (directScrewReceiver(f, action.partId, done)) return "screw";
  if (preloadedThreadedFor(f, action.partId, done)) return "screw";
  if (isSlider(gammaOf(f), action.partId)) return "slide";
  if (pressPartnerPlaced(f, action.partId, done)) return "press";
  if (preloadedPinFor(f, action.partId, done)) return "press";
  return "drop";
}

const centreOf = (p: PartDef): Vec3 => {
  const [ox, oy, oz] = p.visualCenterOffset ?? [0, 0, 0];
  const [px, py, pz] = p.pose.position;
  return [px + ox, py + oy, pz + oz];
};

const unit = (v: Vec3): Vec3 | null => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l < 1e-6 ? null : [v[0] / l, v[1] / l, v[2] / l];
};

/** Unit direction `part` TRAVELS as it seats. Authored `placeDir` wins (the only reliable source — a groove's axis isn't in the poses). Else the centroid heuristic (toward the joint targets' centre), CHECKED against the generated sweep data when the furniture carries it: a heuristic direction whose corridor holds an already-placed third-party blocker is swapped for the nearest order-viable cardinal — sweep data only VETOES, it never re-derives a direction the state permits, so furniture without data (and every part whose heuristic answer is viable) behaves byte-identically to before. This is the order-aware half of the placeDir story: the authored value bakes one assembly order, the sweep check adapts the derived one to whichever order the player actually chose. */
/** The part's authored placeDir ORDER-ADAPTED, unit length; null when the part authors none. Exported because the DRAG layer must back its aim anchor and match segment off along the SAME direction the park uses — with only the park flipped, a legally reversed build order parks correctly but aims at a corridor the player cannot see (EKET's back panel bottom-first: the anchor pushed down into the closed bottom, the visibility gate never armed, the snap never went green).
 *
 * Two adaptation regimes, split on what physically constrains the motion:
 * - SLIDERS: the groove fixes the AXIS (not derivable — the device-proven lesson), so only the SIGN adapts, by the sweep's corridor veto.
 * - PRESS/KEYHOLE parts: the placed MATES fix the approach. Toward-their-centroid gives the axis and sign — one standing side pulls the horizontal sideways toward it (either side, so the authored sign flips for the mirrored order), both standing sides cancel laterally and the approach collapses to the closing axis (EKET's bottom panel authors exactly that vertical for its close-over-both; the top panel closing LAST needs its mirror, straight down, where its authored sideways vector would drag the edge dowels across the far side's face). When the mates agree with the authored axis the AUTHORED vector is returned (sign toward the mates) — byte-identical in every device-verified order; a cross-axis candidate must additionally pass the sweep's corridor veto (EKET's suspension bracket points down-toward-its-side's-centre, but the closed top vetoes a vertical approach and the authored sideways tap stands). No placed mates, or a degenerate centroid, falls back to sign-only adaptation. */
export function adaptedTravelDir(f: Furniture, part: PartDef, done: ReadonlySet<ActionId>): Vec3 | null {
  if (!part.placeDir) return null;
  const authored = unit(part.placeDir) ?? [0, -1, 0];
  const dirs = f.sweep?.[part.partId];
  const placed = (id: PartId) => done.has(placeId(id));
  const partners = partnersIn(f, part.partId);
  const signOnly = () => (dirs ? adaptSignedDir(dirs, placed, partners, authored) : authored);
  if (isSlider(gammaOf(f), part.partId)) return signOnly();
  const mates = [...partners].filter((id) => placed(id) && f.parts[id]);
  if (!mates.length) return signOnly();
  const c = mates.reduce<Vec3>(
    (s, id) => {
      const m = centreOf(f.parts[id]!);
      return [s[0] + m[0] / mates.length, s[1] + m[1] / mates.length, s[2] + m[2] / mates.length];
    },
    [0, 0, 0],
  );
  const pc = centreOf(part);
  const toward = unit([c[0] - pc[0], c[1] - pc[1], c[2] - pc[2]]);
  if (!toward) return signOnly();
  const authoredDom = [0, 1, 2].reduce((a, b) => (Math.abs(authored[a]) >= Math.abs(authored[b]) ? a : b)) as 0 | 1 | 2;
  // ONE mate never overrides the authored AXIS — the authored value IS the tuned approach to a single mate, and a big mate's centre can sit far from the local attachment (the corner-hugging suspension bracket vs its whole side panel — the same trap directScrewAxis documents). A single mate decides only the SIGN along the authored axis: toward it, so the mirrored one-side order flips.
  const signAlongAuthored = Math.sign(toward[authoredDom]);
  if (mates.length < 2) {
    if (!signAlongAuthored || signAlongAuthored === Math.sign(authored[authoredDom])) return authored;
    return [-authored[0] || 0, -authored[1] || 0, -authored[2] || 0];
  }
  const dom = [0, 1, 2].reduce((a, b) => (Math.abs(toward[a]) >= Math.abs(toward[b]) ? a : b)) as 0 | 1 | 2;
  const sign = Math.sign(toward[dom]) || 1;
  if (dom === authoredDom) {
    // same axis: keep the authored vector's cleanliness, with the sign facing the mates
    return Math.sign(authored[dom]) === sign ? authored : [-authored[0] || 0, -authored[1] || 0, -authored[2] || 0];
  }
  const candidate: Vec3 = [0, 0, 0].map((_, i) => (i === dom ? sign : 0)) as unknown as Vec3;
  if (entryDirViable(dirs, candidate, placed, partners)) return candidate;
  return signOnly();
}

function travelAxis(part: PartDef, targets: PartDef[], f?: Furniture, done?: ReadonlySet<ActionId>): Vec3 {
  if (part.placeDir) {
    // The authored value is the AXIS + preferred sign; the sweep may flip the SIGN to fit the build order the player actually chose (EKET's back panel slides up through the open bottom in the authored order, DOWN through the open top after a bottom-first close — a static vector can only say one of those).
    if (f && done) return adaptedTravelDir(f, part, done)!;
    return unit(part.placeDir) ?? [0, -1, 0];
  }
  let heuristic: Vec3 = [0, -1, 0];
  if (targets.length) {
    const c: Vec3 = [
      targets.reduce((s, t) => s + centreOf(t)[0], 0) / targets.length,
      targets.reduce((s, t) => s + centreOf(t)[1], 0) / targets.length,
      targets.reduce((s, t) => s + centreOf(t)[2], 0) / targets.length,
    ];
    const pc = centreOf(part);
    const toward = unit([c[0] - pc[0], c[1] - pc[1], c[2] - pc[2]]);
    if (toward) heuristic = toward;
  }
  if (!f?.sweep?.[part.partId] || !done) return heuristic;
  return pickEntryDir(f.sweep[part.partId], (id) => done.has(placeId(id)), partnersIn(f, part.partId), heuristic);
}

/** The parts `partId` MATES with — authored structural joins in either direction. Deliberately NOT every Γ neighbour: a fastener-created edge (EKET's cams give the back panel edges to ALL four box panels) is a securing relation, not a mate engagement, and treating it as a partner would swallow the ordering veto exactly where it matters. */
function partnersIn(f: Furniture, partId: PartId): Set<PartId> {
  const partners = new Set<PartId>();
  for (const q of Object.values(f.parts)) {
    for (const field of ["directJoins", "slideJoins", "screwJoins"] as const) {
      if (q.partId === partId) for (const t of q[field] ?? []) partners.add(t);
      else if (q[field]?.includes(partId)) partners.add(q.partId);
    }
  }
  return partners;
}

/** The placed structural parts joined to `partId` by an edge of `kind`. */
function joinedByKind(
  f: Furniture,
  partId: string,
  kind: "slide" | "press",
  done: ReadonlySet<ActionId>,
): PartDef[] {
  const out: PartDef[] = [];
  for (const l of Object.values(gammaOf(f))) {
    if (l.kind !== kind) continue;
    if (l.a !== partId && l.b !== partId) continue;
    if (kind === "slide" && l.mover !== partId) continue;
    const other = liaisonOther(l, partId as PartId);
    const op = f.parts[other];
    if (op && done.has(placeId(other))) out.push(op);
  }
  return out;
}

/** True when a press-fit (directJoins) partner of `partId` is already placed —  the push-fit needs something to press against. */
function pressPartnerPlaced(
  f: Furniture,
  partId: string,
  done: ReadonlySet<ActionId>,
): boolean {
  return joinedByKind(f, partId, "press", done).length > 0;
}

export interface ParkInfo {
  /** Unit direction the part travels to seat (placeDir or heuristic). */
  axis: Vec3;
  /** Backed-off offset from the baked seat where the part parks; the gesture  eases this to [0,0,0] as it drives home. Points OPPOSITE the travel axis. */
  offset: Vec3;
  /** Keyhole second phase (part.lockDir): the lock axis and the HOOKED offset the part rests at once the press leg has closed — `offset` above already includes it, so single-phase consumers park correctly without knowing; HookPressControl decomposes the legs from this. Absent for a plain one-phase press. */
  lock?: { axis: Vec3; offset: Vec3 };
}

function parkInfo(axis: Vec3, backoff: number): ParkInfo {
  return {
    axis,
    offset: [-axis[0] * backoff || 0, -axis[1] * backoff || 0, -axis[2] * backoff || 0],
  };
}

/** Fold a part's keyhole lock leg (lockDir/lockTravel) into its press park: the part parks backed off along BOTH legs — press in to the hooked offset, then the lockDir shove seats it. Identity for parts without lockDir. */
function withLock(part: PartDef, park: ParkInfo): ParkInfo {
  const axis = part.lockDir ? unit(part.lockDir) : null;
  if (!axis) return park;
  const t = part.lockTravel ?? LOCK_TRAVEL_M;
  const lockOffset: Vec3 = [-axis[0] * t || 0, -axis[1] * t || 0, -axis[2] * t || 0];
  return {
    axis: park.axis,
    offset: [
      park.offset[0] + lockOffset[0],
      park.offset[1] + lockOffset[1],
      park.offset[2] + lockOffset[2],
    ],
    lock: { axis, offset: lockOffset },
  };
}

/** Staging for a SLIDE placement: the glide axis and the backed-off park  offset. Null when `action` isn't a slider ready to glide. */
export function slideParkInfo(
  f: Furniture,
  action: AssemblyAction,
  done: ReadonlySet<ActionId>,
): ParkInfo | null {
  if (action.type === "combineClusters") {
    return action.cluster ? clusterParkInfo(f.clusters, action.cluster) : null;
  }
  if (action.type !== "placePart" || !action.partId) return null;
  if (!isSlider(gammaOf(f), action.partId)) return null;
  const part = f.parts[action.partId]!;
  const owners = joinedByKind(f, action.partId, "slide", done);
  return parkInfo(travelAxis(part, owners, f, done), part.parkBackoff ?? SLIDE_BACKOFF_M);
}

/** Staging for a PRESS placement: the push axis and the backed-off park offset.  Null when `action` isn't a push-fit against a placed partner — either an  authored press edge (directJoins) or the placed endpoint of a preloaded pin. */
export function pressParkInfo(
  f: Furniture,
  action: AssemblyAction,
  done: ReadonlySet<ActionId>,
): ParkInfo | null {
  if (action.type !== "placePart" || !action.partId) return null;
  const part = f.parts[action.partId]!;
  // a dropOn part never parks — the approach ghost must sit at the seat, matching the drop that placeEngagement returns
  if (part.dropOn) return null;
  const partners = joinedByKind(f, action.partId, "press", done);
  if (!partners.length) {
    const pin = preloadedPinFor(f, action.partId, done);
    const other =
      pin &&
      f.parts[
        pin.attached![0] === action.partId ? pin.attached![1] : pin.attached![0]
      ];
    if (!other) return null;
    // The standing pin IS the press direction: the part travels opposite the signed engage axis (which points toward the missing endpoint and flips with placement order), so a part pressable onto EITHER of two mirrored dowels (BEKVÄM step between two seed legs) approaches whichever one is up — an authored placeDir can only bake one side.
    const pinAxis = unit(engageAxis(pin, done));
    if (pinAxis) {
      return withLock(part, parkInfo(
        [-pinAxis[0] || 0, -pinAxis[1] || 0, -pinAxis[2] || 0],
        part.parkBackoff ?? PRESS_BACKOFF_M,
      ));
    }
    return withLock(part, parkInfo(travelAxis(part, [other], f, done), part.parkBackoff ?? PRESS_BACKOFF_M));
  }
  return withLock(part, parkInfo(travelAxis(part, partners, f, done), part.parkBackoff ?? PRESS_BACKOFF_M));
}

/** SIGNED engage axis for a fastener — points from its seat toward the side it backs out of (= toward the MISSING endpoint). The baked `engageDir` assumes the fastener drives into `attached[0]`; when the OTHER endpoint is the one placed (the reverse path: bolt into the LEG instead of the table), the fastener enters from the opposite side, so the axis flips. */
export function engageAxis(part: PartDef, done: ReadonlySet<ActionId>): Vec3 {
  const e = part.engageDir ?? [0, 0, 0];
  if (isConnector(part)) {
    const aPlaced = done.has(placeId(part.attached![0]));
    const bPlaced = done.has(placeId(part.attached![1]));
    if (!aPlaced && bPlaced) return [-e[0] || 0, -e[1] || 0, -e[2] || 0];
  }
  return e;
}

/** Park offset for the LATER part of a screw joint — non-null only when the later part is itself the spinner. Null → it seats directly (and, when the placement isn't a screw at all, it just drops flush as usual). */
export function screwParkOffset(
  f: Furniture,
  action: AssemblyAction,
  done: ReadonlySet<ActionId>,
): Vec3 | null {
  if (action.type !== "placePart" || !action.partId) return null;
  const receiver = directScrewReceiver(f, action.partId, done);
  if (receiver) {
    const axis = directScrewAxis(f.parts[action.partId]!, receiver);
    return [
      axis[0] * SCREW_BACKOFF_M,
      axis[1] * SCREW_BACKOFF_M,
      axis[2] * SCREW_BACKOFF_M,
    ];
  }
  const connector = preloadedThreadedFor(f, action.partId, done);
  if (!connector) return null;
  if (screwMoverFor(f, connector, action.partId) !== action.partId) return null;
  const axis = engageAxis(connector, done);
  return [
    axis[0] * SCREW_BACKOFF_M,
    axis[1] * SCREW_BACKOFF_M,
    axis[2] * SCREW_BACKOFF_M,
  ];
}

/** Displacement of the PLACED spinner at the start of the screw phase (reverse path: the flush leg backs off away from the incoming top, then rises in as the gesture progresses). Null when the spinner is the later part instead. */
export function screwMoverParkOffset(
  f: Furniture,
  action: AssemblyAction,
  done: ReadonlySet<ActionId>,
): Vec3 | null {
  if (action.type !== "placePart" || !action.partId) return null;
  const connector = preloadedThreadedFor(f, action.partId, done);
  if (!connector) return null;
  if (screwMoverFor(f, connector, action.partId) === action.partId) return null;
  const axis = engageAxis(connector, done);
  return [
    -axis[0] * SCREW_BACKOFF_M || 0,
    -axis[1] * SCREW_BACKOFF_M || 0,
    -axis[2] * SCREW_BACKOFF_M || 0,
  ];
}

/** Which endpoint physically SPINS when a threaded joint screws together — DERIVED, no authoring: the endpoint with FEWER connector joints is the satellite (a LACK leg carries 1 bolt; the top is a 4-bolt hub you'd never spin). Independent of placement order, so the LEG is the spinner in both the top-first and leg-first paths. Ties fall to attached[0]'s counterpart… rare and physically ambiguous anyway — that's what the authored `screwMover` override on the fastener is for. */
export function screwMoverFor(
  f: Furniture,
  connector: PartDef,
  tieBreaker?: string,
): string {
  if (connector.screwMover) return connector.screwMover;
  const [a, b] = connector.attached!;
  const degree = (pid: string) =>
    Object.values(f.parts).filter(
      (p) =>
        p.type === "fastener" &&
        fastenerKindOf(p) !== "secured" &&
        p.attached?.includes(pid as never),
    ).length;
  const da = degree(a);
  const db = degree(b);
  if (da < db) return a;
  if (db < da) return b;
  return tieBreaker ?? b;
}

/** Everything the presentation needs to animate a screw-in for `action` (the later endpoint of a preloaded threaded joint): the SIGNED axis and which part spins. Null for non-screw placements. */
export function screwSpinInfo(
  f: Furniture,
  action: AssemblyAction,
  done: ReadonlySet<ActionId>,
): { axis: Vec3; mover: string } | null {
  if (action.type !== "placePart" || !action.partId) return null;
  const receiver = directScrewReceiver(f, action.partId, done);
  if (receiver) {
    return {
      axis: directScrewAxis(f.parts[action.partId]!, receiver),
      mover: action.partId,
    };
  }
  const connector = preloadedThreadedFor(f, action.partId, done);
  if (!connector) return null;
  return {
    axis: engageAxis(connector, done),
    mover: screwMoverFor(f, connector, action.partId),
  };
}
