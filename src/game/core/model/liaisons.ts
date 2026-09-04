import { liaisonId } from "@/src/game/core/ids";
import {
  FastenerPreload,
  FastenerRole,
  JOIN_ARRAYS,
  JoinKind,
  Liaison,
  LiaisonMap,
  PartDef,
  PartId,
} from "@/src/game/core/type";

type Parts = Record<PartId, PartDef>;

const toArray = (x?: readonly PartId[]): readonly PartId[] => x ?? [];

/** What a fastener is FOR: the role lowering wrote onto it. A shipped furniture always carries one (validateFurniture enforces it); a bare fixture without one is "securer", the inert role — it never defines a joint and never preloads. The name-prefix fallback that used to live here is gone: prefixes are a tooling prefill (helper-scripts/fastener-roles.json), never a runtime fact. */
export function fastenerRoleOf(p: PartDef): FastenerRole {
  return p.fastenerRole ?? "securer";
}

/** A connector's ordering record; null for every other role. */
export function preloadOf(p: PartDef): FastenerPreload | null {
  return fastenerRoleOf(p) === "connector" ? (p.preload ?? null) : null;
}

/** A JOINT-DEFINING fastener bridging two named endpoints — the parts that get OR-side insertion + the preload lock. Was `fastenerKindOf(p) !== "secured"`, which reached the same set the long way round: every non-"secured" kind was a connector kind, so the enum was being asked a question the role answers directly. */
export function isConnector(p: PartDef): boolean {
  return (
    p.type === "fastener" &&
    fastenerRoleOf(p) === "connector" &&
    p.attached?.length === 2
  );
}

/** Overlay authored structural data (pressJoins / slideJoins / seed / unstable) onto the generated parts. Most joints come from the fasteners' `attached` (mesh names), so `pressJoins`/`slideJoins` are only needed for fastener-free contacts; the rest is build intent. `type`/`attached` are the RE-TYPING escape hatch: a part whose mesh name lied about its category (EKET's suspCap ships as a bare structural node) is re-typed here with its bindings, instead of renaming meshes in the GLB (see never-modify-models) or hand-editing parts.gen. */
export type StructureOverlay = Record<
  PartId,
  Partial<
    Pick<
      PartDef,
      | "type"
      | "attached"
      | "pressJoins"
      | "slideJoins"
      | "screwJoins"
      | "seed"
      | "unstable"
      | "tool"
      | "placeDir"
      | "parkBackoff"
      | "insertRetract"
      | "insertStage"
      | "insertProud"
      | "lockDir"
      | "lockTravel"
      | "dropOn"
      | "toolAnchor"
      | "fastenerRole"
      | "preload"
      | "engageDir"
      | "stageOffset"
      | "jointAnchor"
      | "noVisibilityGate"
    >
  >
>;

/** Spread the composed structure (structure.gen.ts — the authored overlay with JOINTS and FASTENERS already lowered in by derive/structure.ts) over the generated parts. A spread and nothing else: the device lowers nothing. */
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
      // A press states the pair, not a direction: it lands undirected so either endpoint may be the one that arrives. Slide and screw name their declarer the MOVER, which is what makes the AND frontier directional.
      for (const [field, kind] of JOIN_ARRAYS) {
        for (const t of toArray(p[field])) {
          addStructural(p.partId, t, kind, kind === "press" ? undefined : p.partId);
        }
      }
    }
    if (p.type === "fastener" && p.attached?.length === 2) {
      edgeOf(p.attached[0], p.attached[1]);
    }
  }

  // NAME the leftover. An edge that exists only because a fastener names both endpoints has carried no kind at all — 48 of the corpus's 85 liaisons, the MAJORITY of its joins, in a field every reader has to treat as optional. A hardware-made joint whose parts state no travel is a SNAP: they meet in the placement motion itself and the hardware does the joining.
  // GUARDED, because a part can travel THROUGH a hardware-made joint: BEKVAM's rails are screwed to their legs and still come in along X, EKET's runner frames land flat against a panel face. Where either endpoint states a travel this leaves the edge alone — calling that a snap would deny a motion the manual describes.
  // CLASSIFICATION ONLY: `snap` is deliberately outside PRESS_LIKE, so `validateFurniture` sees exactly the edges it saw before; `isSlider`, `directScrewReceiver`, `andFrontierTargets` and `crossClusterThreads` test for slide/screw/press and skip it exactly as they skipped `undefined`. Nothing reads it yet — that is the point. `dropOn` stays authored per-part, so no part's placement feel changes.
  for (const l of Object.values(liaisons)) {
    if (l.kind) continue;
    if (parts[l.a]?.placeDir || parts[l.b]?.placeDir) continue;
    l.kind = "snap";
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

/** The AND side of the frontier for placing `partId`: every SAME-cluster part it slides into (groove owners) or threads into (receivers) must already be placed — you can't enter a groove or a thread that isn't there. Cross-cluster threaded edges are the joint the COMBINE step realizes, never this placement's business, so they are excluded here. */
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

/** Threaded edges whose MOVER sits in `cluster` and whose other endpoint sits outside it — the joint a combineClusters step realizes as a screwing motion (DALFRED: the seat's pole winds into the base). */
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
