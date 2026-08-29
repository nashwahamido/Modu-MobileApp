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

// How far a pressing part parks off its seat; a press travels less far than a slide.
export const PRESS_BACKOFF_M = 0.03;

// Default keyhole lock travel: a slot-length shove, not a panel-scale glide.
export const LOCK_TRAVEL_M = 0.015;

// How far a screwing structural part parks off its seat before the dial sinks it home.
export const SCREW_BACKOFF_M = 0.045;

// Full turns only, so the start and end orientations equal the baked one — no pop.
export const SCREW_SPIN_DEG = 360;

/** The preloaded connector of `kind` waiting for `partId` as its LATER endpoint: other end placed, connector driven home. This is what turns the later placement into a screw-on or press-on gesture. */
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
  // Authored placeDir wins, as in travelAxis: the centre-delta below reads diagonal whenever the receiver's centre sits off the thread line. The screw axis is the way the threader backs OUT, so it is the reverse of its seating travel.
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
    // The authored overlay wins; furniture without one keeps the legacy cross-cluster-thread behaviour.
    const authored = clusterCombineEngagement(f.clusters, action.cluster);
    if (authored) return authored;
    const threads = crossClusterThreads(gammaOf(f), f.parts, action.cluster);
    return threads.length ? "screw" : "drop";
  }
  if (action.type !== "placePart" || !action.partId) return "drop";
  // dropOn: clicks home at drop even though a press/screw partner stands ready.
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

/** The part's authored placeDir, ORDER-ADAPTED; null when it authors none. Exported because the DRAG layer must back its aim anchor off along the SAME direction the park uses. Two adaptation regimes — sliders adapt the sign only, press/keyhole parts read their placed mates — both explained in the README. */
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
  // ONE mate never overrides the authored AXIS — a big mate's centre can sit far from the local attachment. It decides the SIGN only, so the mirrored order flips.
  const signAlongAuthored = Math.sign(toward[authoredDom]);
  if (mates.length < 2) {
    if (!signAlongAuthored || signAlongAuthored === Math.sign(authored[authoredDom])) return authored;
    return [-authored[0] || 0, -authored[1] || 0, -authored[2] || 0];
  }
  const dom = [0, 1, 2].reduce((a, b) => (Math.abs(toward[a]) >= Math.abs(toward[b]) ? a : b)) as 0 | 1 | 2;
  const sign = Math.sign(toward[dom]) || 1;
  if (dom === authoredDom) {
    // Same axis: keep the authored vector, sign facing the mates.
    return Math.sign(authored[dom]) === sign ? authored : [-authored[0] || 0, -authored[1] || 0, -authored[2] || 0];
  }
  const candidate: Vec3 = [0, 0, 0].map((_, i) => (i === dom ? sign : 0)) as unknown as Vec3;
  if (entryDirViable(dirs, candidate, placed, partners)) return candidate;
  return signOnly();
}

/** Unit direction `part` TRAVELS as it seats. Authored `placeDir` wins — a groove's axis is not in the poses. Otherwise the centroid heuristic, VETOED (never re-derived) by the generated sweep data when the furniture carries it. See README. */
function travelAxis(part: PartDef, targets: PartDef[], f?: Furniture, done?: ReadonlySet<ActionId>): Vec3 {
  if (part.placeDir) {
    // The authored value is the axis + a preferred sign; the sweep may flip the sign to fit the order the player actually chose.
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

/** The parts `partId` MATES with: authored structural joins, either direction. NOT every Γ neighbour — a fastener-created edge is a securing relation, and counting it would swallow the ordering veto. */
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

/** A press-fit partner is already placed — the push needs something to press against. */
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
  /** Where the part parks, relative to the baked seat; the gesture eases it to [0,0,0]. Points OPPOSITE the axis. */
  offset: Vec3;
  /** Keyhole second phase: the lock axis and the hooked offset. `offset` already includes it, so single-phase consumers need not know. Absent for a plain press. */
  lock?: { axis: Vec3; offset: Vec3 };
}

function parkInfo(axis: Vec3, backoff: number): ParkInfo {
  return {
    axis,
    offset: [-axis[0] * backoff || 0, -axis[1] * backoff || 0, -axis[2] * backoff || 0],
  };
}

/** Fold the keyhole lock leg into a press park, so the part backs off along BOTH legs. Identity without lockDir. */
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

/** Staging for a SLIDE placement. Null when `action` is not a slider ready to glide. */
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

/** Staging for a PRESS placement. Null unless the part pushes against a placed partner — an authored press edge, or the placed endpoint of a preloaded pin. */
export function pressParkInfo(
  f: Furniture,
  action: AssemblyAction,
  done: ReadonlySet<ActionId>,
): ParkInfo | null {
  if (action.type !== "placePart" || !action.partId) return null;
  const part = f.parts[action.partId]!;
  // A dropOn part never parks: its ghost sits at the seat, matching the drop placeEngagement returns.
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
    // The standing pin IS the press direction, and the signed axis flips with placement order — so a part pressable onto either of two mirrored dowels approaches whichever one is up.
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

/** SIGNED engage axis: from the fastener's seat toward the side it backs out of. The baked `engageDir` assumes it drives into `attached[0]`, so the reverse path flips it. */
export function engageAxis(part: PartDef, done: ReadonlySet<ActionId>): Vec3 {
  const e = part.engageDir ?? [0, 0, 0];
  if (isConnector(part)) {
    const aPlaced = done.has(placeId(part.attached![0]));
    const bPlaced = done.has(placeId(part.attached![1]));
    if (!aPlaced && bPlaced) return [-e[0] || 0, -e[1] || 0, -e[2] || 0];
  }
  return e;
}

/** Park offset for the LATER part of a screw joint; non-null only when that part is the spinner. */
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

/** Seated pose → the pose the drag actually DELIVERS the part to, or null when it drops flush. ONE branch for the whole engine, so everything downstream of a drop — the release site and the visibility gate alike — asks the same function (README). `eng` is a parameter so the release site can pass the engagement it already computed. */
export function parkOffsetFor(
  f: Furniture,
  action: AssemblyAction,
  done: ReadonlySet<ActionId>,
  eng: PlaceEngagement = placeEngagement(f, action, done),
): Vec3 | null {
  if (eng === "screw") return screwParkOffset(f, action, done);
  if (eng === "slide") return slideParkInfo(f, action, done)?.offset ?? null;
  if (eng === "press") return pressParkInfo(f, action, done)?.offset ?? null;
  return null;
}

/** Displacement of the PLACED spinner at the start of the screw phase — the reverse path, where the flush leg backs off and rises in. Null when the later part is the spinner. */
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

/** Which endpoint physically SPINS. Derived, not authored: the endpoint with FEWER connector joints is the satellite, so a leg spins and its 4-bolt tabletop hub does not — the same answer in either placement order. Ties are physically ambiguous; that is what `screwMover` is for. */
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

/** What the presentation needs to animate a screw-in: the SIGNED axis and which part spins. Null for non-screw placements. */
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
