import FASTENER_KINDS from "@/src/game/core/model/fastener-kinds.json";
import { liaisonId } from "@/src/game/core/ids";
import {
  FastenerKind,
  JoinKind,
  Liaison,
  LiaisonMap,
  PartDef,
  PartId,
} from "@/src/game/core/type";

type Parts = Record<PartId, PartDef>;

const toArray = (x?: readonly PartId[]): readonly PartId[] => x ?? [];

const KIND_BY_PREFIX = FASTENER_KINDS.prefixes as Record<string, FastenerKind>;

/** What a fastener DOES: the authored `fastenerKind` override, else derived
 *  from the group name's prefix (fastener-kinds.json). A group matching no
 *  prefix (a typeOverride / an unlisted `…__a&b` name) falls back to
 *  "secured" — the inert choice: it never defines a joint or preloads. */
export function fastenerKindOf(p: PartDef): FastenerKind {
  if (p.fastenerKind) return p.fastenerKind;
  for (const [prefix, kind] of Object.entries(KIND_BY_PREFIX)) {
    if (p.group.toLowerCase().startsWith(prefix)) return kind;
  }
  return "secured";
}

/** A JOINT-DEFINING fastener bridging two named endpoints (bolt/pin/cam between
 *  `…__a&b`) — the parts that get OR-side insertion + the preload lock. Any
 *  non-"secured" kind qualifies; only a plain securer (screw/nail/…) does not. */
export function isConnector(p: PartDef): boolean {
  return (
    p.type === "fastener" &&
    fastenerKindOf(p) !== "secured" &&
    p.attached?.length === 2
  );
}

/**
 * Overlay authored structural data (directJoins / slideJoins / seed / unstable)
 * onto the generated parts. Most joints come from the fasteners' `attached`
 * (mesh names), so `directJoins`/`slideJoins` are only needed for fastener-free
 * contacts; the rest is build intent.
 */
export type StructureOverlay = Record<
  PartId,
  Partial<
    Pick<
      PartDef,
      | "directJoins"
      | "slideJoins"
      | "screwJoins"
      | "seed"
      | "unstable"
      | "tool"
      | "placeDir"
    >
  >
>;

export function applyStructure(parts: Parts, overlay: StructureOverlay): Parts {
  const out: Parts = {};
  for (const [id, p] of Object.entries(parts) as [PartId, PartDef][]) {
    out[id] = overlay[id] ? { ...p, ...overlay[id] } : p;
  }
  return out;
}

/** Build Γ from structural adjacency + connector endpoints. Purely derived. */
export function buildLiaisons(parts: Parts): LiaisonMap {
  const liaisons: LiaisonMap = {};

  const edgeOf = (a: PartId, b: PartId): Liaison | null => {
    if (a === b) return null;
    if (parts[a]?.type !== "structural" || parts[b]?.type !== "structural") return null;
    const [x, y] = [a, b].sort();
    const id = liaisonId(x, y);
    return (liaisons[id] ??= { id, a: x, b: y });
  };

  const addStructural = (a: PartId, b: PartId, kind: JoinKind, mover?: PartId): void => {
    const e = edgeOf(a, b);
    if (!e) return;
    e.kind = kind;
    if (mover) e.mover = mover;
  };

  for (const p of Object.values(parts)) {
    if (p.type === "structural") {
      for (const t of toArray(p.directJoins)) addStructural(p.partId, t, "press");
      for (const t of toArray(p.slideJoins))
        addStructural(p.partId, t, "slide", p.partId);
      for (const t of toArray(p.screwJoins))
        addStructural(p.partId, t, "screw", p.partId);
    }
    if (p.type === "fastener" && p.attached?.length === 2) {
      edgeOf(p.attached[0], p.attached[1]);
    }
  }

  return liaisons;
}

/** The other endpoint of an edge, from `partId`'s side. */
export const liaisonOther = (l: Liaison, partId: PartId): PartId =>
  l.a === partId ? l.b : l.a;

/** Every edge that touches `partId`. */
export function liaisonsOf(liaisons: LiaisonMap, partId: PartId): Liaison[] {
  return Object.values(liaisons).filter((l) => l.a === partId || l.b === partId);
}

/** True when `partId` is the SLIDER of any slide edge (enters grooves). */
export function isSlider(liaisons: LiaisonMap, partId: PartId): boolean {
  return Object.values(liaisons).some(
    (l) => l.kind === "slide" && l.mover === partId,
  );
}

/**
 * The AND side of the frontier for placing `partId`: every SAME-cluster part it
 * slides into (groove owners) or threads into (receivers) must already be
 * placed — you can't enter a groove or a thread that isn't there. Cross-cluster
 * threaded edges are the joint the COMBINE step realizes, never this
 * placement's business, so they are excluded here.
 */
export function andFrontierTargets(
  liaisons: LiaisonMap,
  parts: Parts,
  partId: PartId,
): PartId[] {
  const cluster = parts[partId]?.cluster;
  const out: PartId[] = [];
  for (const l of Object.values(liaisons)) {
    if (l.mover !== partId) continue;
    if (l.kind !== "slide" && l.kind !== "screw") continue;
    const other = liaisonOther(l, partId);
    if (parts[other]?.cluster === cluster) out.push(other);
  }
  return out;
}

/**
 * Threaded edges whose MOVER sits in `cluster` and whose other endpoint sits
 * outside it — the joint a combineClusters step realizes as a screwing motion
 * (DALFRED: the seat's pole winds into the base).
 */
export function crossClusterThreads(
  liaisons: LiaisonMap,
  parts: Parts,
  cluster: string,
): Liaison[] {
  return Object.values(liaisons).filter((l) => {
    if (l.kind !== "screw" || !l.mover) return false;
    if (parts[l.mover]?.cluster !== cluster) return false;
    return parts[liaisonOther(l, l.mover)]?.cluster !== cluster;
  });
}

/** Adjacency for the snap frontier (the OR side): who shares a joint with whom. */
export function neighbourMap(liaisons: LiaisonMap): Record<PartId, Set<PartId>> {
  const nb: Record<PartId, Set<PartId>> = {};
  for (const l of Object.values(liaisons)) {
    (nb[l.a] ??= new Set()).add(l.b);
    (nb[l.b] ??= new Set()).add(l.a);
  }
  return nb;
}

/** A structural part is on the frontier when any joint neighbour is placed. */
export function isReachable(
  partId: PartId,
  placed: ReadonlySet<PartId>,
  neighbours: Record<PartId, Set<PartId>>,
  seed?: boolean,
): boolean {
  if (seed) return true;
  const nb = neighbours[partId];
  if (!nb) return false;
  for (const n of nb) if (placed.has(n)) return true;
  return false;
}
