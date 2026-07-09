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

const gammaOf = (f: Furniture): LiaisonMap => f.liaisons ?? buildLiaisons(f.parts);

export type PlaceEngagement = "drop" | "screw" | "slide" | "press";

/** How far a sliding / pressing part parks off its seat before the gesture
 *  drives it home, in meters. Slide travels further than a press push. */
export const SLIDE_BACKOFF_M = 0.1;
export const PRESS_BACKOFF_M = 0.03;

/** How far a screwing STRUCTURAL part (leg / tabletop) parks off its seat
 *  before the rotation gesture sinks it home, in meters. */
export const SCREW_BACKOFF_M = 0.045;

/** Visible revolutions of the SPINNING part while a screw joint seats: full
 *  turns only, so the start/end orientations equal the baked one — no pop. */
export const SCREW_SPIN_DEG = 360;

function preloadedThreadedFor(
  f: Furniture,
  partId: string,
  done: ReadonlySet<ActionId>,
): PartDef | null {
  for (const p of Object.values(f.parts)) {
    if (
      !isConnector(p) ||
      !p.attached!.includes(partId as never) ||
      fastenerKindOf(p) !== "threaded"
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
    const threads = crossClusterThreads(gammaOf(f), f.parts, action.cluster);
    return threads.length ? "screw" : "drop";
  }
  if (action.type !== "placePart" || !action.partId) return "drop";
  if (directScrewReceiver(f, action.partId, done)) return "screw";
  if (preloadedThreadedFor(f, action.partId, done)) return "screw";
  if (isSlider(gammaOf(f), action.partId)) return "slide";
  if (pressPartnerPlaced(f, action.partId, done)) return "press";
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

/**
 * Unit direction `part` TRAVELS as it seats. Authored `placeDir` wins (the only
 * reliable source — a groove's axis isn't in the poses). Else a coarse
 * heuristic: the part backs out AWAY from the joint targets, so it travels
 * TOWARD their centroid. Falls back to world-down when that is degenerate.
 */
function travelAxis(part: PartDef, targets: PartDef[]): Vec3 {
  if (part.placeDir) return unit(part.placeDir) ?? [0, -1, 0];
  if (targets.length) {
    const c: Vec3 = [
      targets.reduce((s, t) => s + centreOf(t)[0], 0) / targets.length,
      targets.reduce((s, t) => s + centreOf(t)[1], 0) / targets.length,
      targets.reduce((s, t) => s + centreOf(t)[2], 0) / targets.length,
    ];
    const pc = centreOf(part);
    const toward = unit([c[0] - pc[0], c[1] - pc[1], c[2] - pc[2]]);
    if (toward) return toward;
  }
  return [0, -1, 0];
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

/** True when a press-fit (directJoins) partner of `partId` is already placed —
 *  the push-fit needs something to press against. */
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
  /** Backed-off offset from the baked seat where the part parks; the gesture
   *  eases this to [0,0,0] as it drives home. Points OPPOSITE the travel axis. */
  offset: Vec3;
}

function parkInfo(axis: Vec3, backoff: number): ParkInfo {
  return {
    axis,
    offset: [-axis[0] * backoff || 0, -axis[1] * backoff || 0, -axis[2] * backoff || 0],
  };
}

/** Staging for a SLIDE placement: the glide axis and the backed-off park
 *  offset. Null when `action` isn't a slider ready to glide. */
export function slideParkInfo(
  f: Furniture,
  action: AssemblyAction,
  done: ReadonlySet<ActionId>,
): ParkInfo | null {
  if (action.type !== "placePart" || !action.partId) return null;
  if (!isSlider(gammaOf(f), action.partId)) return null;
  const part = f.parts[action.partId]!;
  const owners = joinedByKind(f, action.partId, "slide", done);
  return parkInfo(travelAxis(part, owners), SLIDE_BACKOFF_M);
}

/** Staging for a PRESS placement: the push axis and the backed-off park offset.
 *  Null when `action` isn't a push-fit against a placed partner. */
export function pressParkInfo(
  f: Furniture,
  action: AssemblyAction,
  done: ReadonlySet<ActionId>,
): ParkInfo | null {
  if (action.type !== "placePart" || !action.partId) return null;
  const partners = joinedByKind(f, action.partId, "press", done);
  if (!partners.length) return null;
  const part = f.parts[action.partId]!;
  return parkInfo(travelAxis(part, partners), PRESS_BACKOFF_M);
}

/**
 * SIGNED engage axis for a fastener — points from its seat toward the side it
 * backs out of (= toward the MISSING endpoint). The baked `engageDir` assumes
 * the fastener drives into `attached[0]`; when the OTHER endpoint is the one
 * placed (the reverse path: bolt into the LEG instead of the table), the
 * fastener enters from the opposite side, so the axis flips.
 */
export function engageAxis(part: PartDef, done: ReadonlySet<ActionId>): Vec3 {
  const e = part.engageDir ?? [0, 0, 0];
  if (isConnector(part)) {
    const aPlaced = done.has(placeId(part.attached![0]));
    const bPlaced = done.has(placeId(part.attached![1]));
    if (!aPlaced && bPlaced) return [-e[0] || 0, -e[1] || 0, -e[2] || 0];
  }
  return e;
}

/**
 * Park offset for the LATER part of a screw joint — non-null only when the
 * later part is itself the spinner. Null → it seats directly (and, when the
 * placement isn't a screw at all, it just drops flush as usual).
 */
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

/**
 * Displacement of the PLACED spinner at the start of the screw phase (reverse
 * path: the flush leg backs off away from the incoming top, then rises in as
 * the gesture progresses). Null when the spinner is the later part instead.
 */
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

/**
 * Which endpoint physically SPINS when a threaded joint screws together —
 * DERIVED, no authoring: the endpoint with FEWER connector joints is the
 * satellite (a LACK leg carries 1 bolt; the top is a 4-bolt hub you'd never
 * spin). Independent of placement order, so the LEG is the spinner in both
 * the top-first and leg-first paths. Ties fall to attached[0]'s counterpart…
 * rare and physically ambiguous anyway — that's what the authored
 * `screwMover` override on the fastener is for.
 */
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

/**
 * Everything the presentation needs to animate a screw-in for `action` (the
 * later endpoint of a preloaded threaded joint): the SIGNED axis and which
 * part spins. Null for non-screw placements.
 */
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
