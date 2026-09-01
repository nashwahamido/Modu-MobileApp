import FASTENER_ROLES from "@/src/game/core/model/fastener-roles.json";
import { liaisonId } from "@/src/game/core/ids";
import { lowerJoints, mergeOverlays, type JointDef } from "./joints";
import {
  FastenerPreload,
  FastenerRole,
  JoinKind,
  JointGeometry,
  Liaison,
  LiaisonMap,
  PartDef,
  PartId,
} from "@/src/game/core/type";

type Parts = Record<PartId, PartDef>;

const toArray = (x?: readonly PartId[]): readonly PartId[] => x ?? [];

type RolePrefill = { role: FastenerRole; preload?: FastenerPreload };

const PREFILL_BY_PREFIX = FASTENER_ROLES.prefixes as Record<string, RolePrefill>;

/** The name-prefix prefill, used ONLY when a part carries no generated `fastenerRole` — an un-authored GLB, or a fastener group with no FASTENERS def. A shipped furniture never reaches this path: lowerFasteners writes the role onto every instance. `cap` is the one prefix the name cannot settle alone, so the mesh name's attached count decides between dressing one part and locking two. */
function prefillFor(p: PartDef): RolePrefill {
  for (const [prefix, fill] of Object.entries(PREFILL_BY_PREFIX)) {
    if (!p.group.toLowerCase().startsWith(prefix)) continue;
    if (prefix === "cap" && (p.attached?.length ?? 0) === 1) return { role: "cap" };
    return fill;
  }
  return { role: "securer" };
}

/** What a fastener is FOR: the generated `fastenerRole`, else the group name's prefill. */
export function fastenerRoleOf(p: PartDef): FastenerRole {
  return p.fastenerRole ?? prefillFor(p).role;
}

/** A connector's ordering record. Reads the generated field first so an authored def always wins, and only falls back to the prefill for the same un-authored cases as `fastenerRoleOf`. Null for every other role. */
export function preloadOf(p: PartDef): FastenerPreload | null {
  if (fastenerRoleOf(p) !== "connector") return null;
  return p.preload ?? prefillFor(p).preload ?? null;
}

/** A JOINT-DEFINING fastener bridging two named endpoints — the parts that get OR-side insertion + the preload lock. Was `fastenerKindOf(p) !== "secured"`, which reached the same set the long way round: every non-"secured" kind was a connector kind, so the enum was being asked a question the role answers directly. */
export function isConnector(p: PartDef): boolean {
  return (
    p.type === "fastener" &&
    fastenerRoleOf(p) === "connector" &&
    p.attached?.length === 2
  );
}

/** Overlay authored structural data (directJoins / slideJoins / seed / unstable) onto the generated parts. Most joints come from the fasteners' `attached` (mesh names), so `directJoins`/`slideJoins` are only needed for fastener-free contacts; the rest is build intent. `type`/`attached` are the RE-TYPING escape hatch: a part whose mesh name lied about its category (EKET's suspCap ships as a bare structural node) is re-typed here with its bindings, instead of renaming meshes in the GLB (see never-modify-models) or hand-editing parts.gen. */
export type StructureOverlay = Record<
  PartId,
  Partial<
    Pick<
      PartDef,
      | "type"
      | "attached"
      | "directJoins"
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

/** The authored overlay with any JOINTS already lowered into it — everything a human decides about a part, in the exact shape it will be spread over the mesh facts. Exported and generated to `structure.gen.ts` because it is the ONE artifact nobody could review before: `parts.gen`, `sweep.gen`, `joints.gen` and `authored.ts` are all checked in, but the MERGE of them lived only in memory at load time, and predicting it means simulating the bridged-pair suppression, the dropOn split and the geometry fallback by hand. `applyStructure` calls this, so what the file records is what the device runs. */
export function composeStructure(
  parts: Parts,
  overlay: StructureOverlay,
  joints?: readonly JointDef[],
  geometry?: JointGeometry,
): StructureOverlay {
  return joints?.length ? mergeOverlays(lowerJoints(joints, parts, geometry), overlay) : overlay;
}

/** Overlay the authored structure onto the generated parts. `joints` is the v2 authoring route (model/joints.ts): joint ENTITIES are lowered into the same flat fields first, then the flat overlay lands on top, so a furniture may use either form or both during a migration and the engine downstream never learns the difference. `geometry` is the generated travel table (joints.gen.ts), which lowering consults for any joint that does not override it — passing it without `joints` does nothing, which is what keeps derivation opt-in per joint. */
export function applyStructure(
  parts: Parts,
  overlay: StructureOverlay,
  joints?: readonly JointDef[],
  geometry?: JointGeometry,
): Parts {
  const merged = composeStructure(parts, overlay, joints, geometry);
  const out: Parts = {};
  for (const [id, p] of Object.entries(parts) as [PartId, PartDef][]) {
    out[id] = merged[id] ? { ...p, ...merged[id] } : p;
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
