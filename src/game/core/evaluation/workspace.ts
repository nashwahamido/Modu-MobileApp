import { ActionId, AssemblyAction, Furniture, PartId } from "@/src/game/core/type";
import { buildLiaisons, neighbourMap } from "@/src/game/core/model/liaisons";
import type { ParkedIsland } from "./islands";

/**
 * THE workspace partition — the one place that answers "which placed parts are actually standing in the scene?". Tray-parking broke the old unstated invariant "placed ⇒ visible at its baked pose": a part can now be placed yet carded away in a parked island, and every consumer that re-derived that answer for itself (first-drop ring, camera pivot, fastener visibility, …) became a bug. Consumers now pick one of these named sets — never re-derive:
 * - `placed` — every completed placement. The LOGIC set: availability frontier, mergeability, undo bookkeeping. Carded parts stay in it on purpose (a bridge part must remain placeable or a carded island could never unlock).
 * - `inScene` — placed minus carded. The PRESENTATION/TARGETING set: what the camera frames, what counts as "the cluster has started", what gestures may aim at.
 * - `cardedIslandOf` — part → parked-island id, INCLUDING the island's fasteners (a screw driven entirely into carded parts cards with them and rides the island's driver while it returns).
 */
export interface Workspace {
  placed: ReadonlySet<PartId>;
  inScene: ReadonlySet<PartId>;
  cardedIslandOf: Readonly<Record<PartId, PartId>>;
}

export function workspaceOf(
  f: Furniture,
  completed: readonly ActionId[],
  parkedIslands: readonly ParkedIsland[],
): Workspace {
  const done = new Set(completed);
  const placed = new Set<PartId>();
  for (const a of f.actions) {
    if (a.type === "placePart" && a.partId && done.has(a.actionId)) {
      placed.add(a.partId);
    }
  }

  const cardedIslandOf: Record<PartId, PartId> = {};
  for (const isl of parkedIslands) {
    for (const m of isl.members) cardedIslandOf[m] = isl.id;
  }
  // Island members are STRUCTURAL by definition (components of Γ); fasteners follow the island their attachments live in.
  for (const p of Object.values(f.parts)) {
    if (p.type !== "fastener" || !p.attached?.length) continue;
    const isl = cardedIslandOf[p.attached[0]];
    if (isl && p.attached.every((a) => cardedIslandOf[a] === isl)) {
      cardedIslandOf[p.partId] = isl;
    }
  }

  const inScene = new Set([...placed].filter((id) => !cardedIslandOf[id]));
  return { placed, inScene, cardedIslandOf };
}

/** Γ adjacency for `f`, computed ONCE per furniture — the graph is immutable for a session, and rebuilding it inside per-store-change selectors (autoView, deriveSceneState, drag targeting) was a real jank source. */
const NEIGHBOURS_CACHE = new WeakMap<Furniture, Record<PartId, Set<PartId>>>();
export function neighboursOf(f: Furniture): Record<PartId, Set<PartId>> {
  let nb = NEIGHBOURS_CACHE.get(f);
  if (!nb) {
    nb = neighbourMap(f.liaisons ?? buildLiaisons(f.parts));
    NEIGHBOURS_CACHE.set(f, nb);
  }
  return nb;
}

/**
 * PRESENTATION/TARGETING gate for actions — which ones the tray, socket ghosts, hints, tighten gestures and the auto-view camera may offer right now. This never gates LOGIC availability (the engine keeps every carded-anchored action legal, or carded islands could never be worked on after merging home):
 * - insert/tighten on a fastener that cards with a parked island → hidden (the gesture would target invisible geometry).
 * - placePart whose EVERY placed joint neighbour is carded → hidden (the ghost would float in mid-air; the affordance to continue is the island card itself). A part with at least one in-scene neighbour stays offered — that's the bridge placement that unlocks a carded island.
 * - everything else (seeds, beats, combines) → offered.
 */
export function workspaceActionFilter(
  f: Furniture,
  ws: Workspace,
): (a: AssemblyAction) => boolean {
  const neighbours = neighboursOf(f);
  return (a) => {
    if (!a.partId) return true;
    if (a.type === "insertFastener" || a.type === "tightenFastener") {
      return !ws.cardedIslandOf[a.partId];
    }
    if (a.type !== "placePart") return true;
    const nb = neighbours[a.partId];
    if (!nb) return true;
    let placedNb = 0;
    let cardedNb = 0;
    for (const n of nb) {
      if (!ws.placed.has(n)) continue;
      placedNb++;
      if (ws.cardedIslandOf[n]) cardedNb++;
    }
    return placedNb === 0 || cardedNb < placedNb;
  };
}
