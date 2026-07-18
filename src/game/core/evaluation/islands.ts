import { ActionId, ClusterId, Furniture, PartId } from "@/src/game/core/type";
import { buildLiaisons, neighbourMap } from "@/src/game/core/model/liaisons";
import { insertId } from "@/src/game/core/ids";
import { labelFor } from "@/src/game/core/presentation/labels";
import { clusterLabel } from "@/src/game/core/evaluation/clusters";

export interface Island {
  /** Stable island id = the seed member's partId. */
  id: PartId;
  seed: PartId;
  members: PartId[];
  cluster: ClusterId;
}

/** Placed STRUCTURAL part ids, in furniture-action order. */
function placedStructurals(f: Furniture, done: ReadonlySet<ActionId>): PartId[] {
  const out: PartId[] = [];
  for (const a of f.actions) {
    if (a.type === "placePart" && a.partId && done.has(a.actionId)) {
      if (f.parts[a.partId]?.type === "structural") out.push(a.partId);
    }
  }
  return out;
}

/** Connected components of PLACED structural parts, via placed–placed joint edges. */
export function islandsOf(f: Furniture, completed: readonly ActionId[]): Island[] {
  const done = new Set(completed);
  const neighbours = neighbourMap(f.liaisons ?? buildLiaisons(f.parts));
  const placed = placedStructurals(f, done);
  const placedSet = new Set(placed);
  const seen = new Set<PartId>();
  const islands: Island[] = [];

  for (const start of placed) {
    if (seen.has(start)) continue;
    const members: PartId[] = [];
    const queue: PartId[] = [start];
    seen.add(start);
    while (queue.length) {
      const p = queue.shift() as PartId;
      members.push(p);
      for (const n of neighbours[p] ?? []) {
        if (placedSet.has(n) && !seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    // Stable id: the islandRoot member, else the flagged seed member, else the
    // lexicographically smallest member.
    const seedMember =
      members.find((p) => f.parts[p]?.islandRoot) ??
      members.find((p) => f.parts[p]?.seed) ??
      [...members].sort()[0];
    islands.push({
      id: seedMember,
      seed: seedMember,
      members,
      cluster: f.parts[seedMember].cluster,
    });
  }
  return islands;
}

/** Proper human name for an island — seed part's label, fallback cluster label. */
export function islandLabel(
  f: Furniture,
  island: { seed: PartId; cluster: ClusterId },
): string {
  const seedPart = f.parts[island.seed];
  return seedPart ? labelFor(f.labels, seedPart.group) : clusterLabel(f, island.cluster);
}

/** True when some member of `parkedMembers` has a PLACED structural neighbour
 *  outside the set — i.e. a bridge part on the active side now touches this
 *  island, so it may be brought home. */
export function isMergeable(
  f: Furniture,
  completed: readonly ActionId[],
  parkedMembers: readonly PartId[],
): boolean {
  const done = new Set(completed);
  const neighbours = neighbourMap(f.liaisons ?? buildLiaisons(f.parts));
  const memberSet = new Set(parkedMembers);
  const placedOutside = new Set(
    placedStructurals(f, done).filter((p) => !memberSet.has(p)),
  );
  for (const m of parkedMembers) {
    for (const n of neighbours[m] ?? []) {
      if (!memberSet.has(n) && placedOutside.has(n)) return true;
    }
  }
  return false;
}

/** The active island that should PARK when `newSeedPartId` is placed as a new
 *  disconnected seed: the component containing the most-recently-placed
 *  structural part in `priorCompleted`. Returns null if there is no prior
 *  island, or if the new seed neighbours it (then it merges, it does not park). */
export function islandToParkOnSeed(
  f: Furniture,
  priorCompleted: readonly ActionId[],
  newSeedPartId: PartId,
  parked: readonly { members: readonly PartId[] }[] = [],
): Island | null {
  const islands = islandsOf(f, priorCompleted);
  if (islands.length === 0) return null;

  // Most-recently-placed IN-SCENE structural part OF THE NEW PART'S CLUSTER (completed is in completion order). Cluster-scoped because strict/free orders interleave clusters — the globally-last placement may belong to another cluster's workspace, which must never mask this cluster's active island. Carded members are skipped: after an un-bridged swap the most recent placement can itself sit in a tray card, and the ACTIVE island is by definition the one still standing in the scene. (v1 islands are per-cluster: a seed in a different cluster starts its own cluster's work and parks nothing there.)
  const cluster = f.parts[newSeedPartId]?.cluster;
  const carded = new Set(parked.flatMap((p) => p.members));
  let lastStructural: PartId | null = null;
  for (let i = priorCompleted.length - 1; i >= 0; i--) {
    const a = f.actions.find((x) => x.actionId === priorCompleted[i]);
    if (
      a?.type === "placePart" &&
      a.partId &&
      !carded.has(a.partId) &&
      f.parts[a.partId]?.type === "structural" &&
      f.parts[a.partId]?.cluster === cluster
    ) {
      lastStructural = a.partId;
      break;
    }
  }
  if (!lastStructural) return null;

  const active = islands.find((is) => is.members.includes(lastStructural as PartId));
  if (!active) return null;

  const neighbours = neighbourMap(f.liaisons ?? buildLiaisons(f.parts));
  const activeSet = new Set(active.members);
  for (const n of neighbours[newSeedPartId] ?? []) {
    if (activeSet.has(n)) return null; // would connect → not a new island
  }
  return active;
}

/** A parked island as stored by the game store: frozen membership + the action
 *  whose placement triggered the park (used to un-park precisely on undo). */
export interface ParkedIsland {
  id: PartId;
  members: PartId[];
  trigger: ActionId;
}

/** True when `island` is a LONE part rather than a real island: a single structural member with NO realized connection — no placed structural neighbour (it's a 1-member component) and no completed insert of any fastener attached to it (an inserted fastener IS a realized connection: part+fastener = 2 parts). A lone part never cards — it degrades back to a plain tray part when displaced. */
export function isLoneIsland(
  f: Furniture,
  done: ReadonlySet<ActionId>,
  island: { members: readonly PartId[] },
): boolean {
  if (island.members.length !== 1) return false;
  const m = island.members[0];
  for (const p of Object.values(f.parts)) {
    if (p.type !== "fastener" || !p.attached?.includes(m)) continue;
    if (done.has(insertId(p.partId))) return false;
  }
  return true;
}

/** Completed list AFTER degrading lone parts displaced by the successful placement of `placedPartId`: every same-cluster, in-scene, LONE component other than the new part's own returns to the tray as a plain part — its placement is removed from `completed`. (Two connectionless parts can never coexist; only real islands earn a card.) */
export function degradeLoneIslands(
  f: Furniture,
  completed: readonly ActionId[],
  parked: readonly ParkedIsland[],
  placedPartId: PartId,
): ActionId[] {
  const done = new Set(completed);
  const carded = new Set(parked.flatMap((p) => p.members));
  const cluster = f.parts[placedPartId]?.cluster;
  const remove = new Set<ActionId>();
  for (const isl of islandsOf(f, completed)) {
    if (isl.members.includes(placedPartId)) continue;
    if (isl.members.some((m) => carded.has(m))) continue;
    if (isl.cluster !== cluster) continue;
    if (!isLoneIsland(f, done, isl)) continue;
    const placeAction = f.actions.find(
      (a) => a.type === "placePart" && a.partId === isl.members[0],
    );
    if (placeAction) remove.add(placeAction.actionId);
  }
  return remove.size ? completed.filter((id) => !remove.has(id)) : [...completed];
}

/** The parked-islands array AFTER completing `actionId`. PURE LIAISON RULE (no authored flag): any placePart that starts a new, same-cluster, disconnected component cards the prior active island — the boundary of an island is connection, so a pickup with no liaison into the active island is by definition new work. A LONE active part is never carded: it degrades to the tray instead (degradeLoneIslands, applied by the store at placement commit). `priorCompleted` is the completed list BEFORE `actionId`. */
export function parkTriggeredBy(
  f: Furniture,
  priorCompleted: readonly ActionId[],
  actionId: ActionId,
  parked: readonly ParkedIsland[],
): ParkedIsland[] {
  const a = f.actions.find((x) => x.actionId === actionId);
  if (!a || a.type !== "placePart" || !a.partId) {
    return [...parked];
  }
  const toPark = islandToParkOnSeed(f, priorCompleted, a.partId, parked);
  if (!toPark || parked.some((p) => p.id === toPark.id)) return [...parked];
  if (isLoneIsland(f, new Set(priorCompleted), toPark)) return [...parked];
  return [...parked, { id: toPark.id, members: toPark.members, trigger: actionId }];
}

/** The parked-islands array AFTER undoing `undoneActionId`. Removes the island
 *  that undone action parked (matched by `trigger`), and drops any island whose
 *  members are no longer all placed. `completedAfterUndo` excludes the undone id. */
export function unparkAfterUndo(
  f: Furniture,
  completedAfterUndo: readonly ActionId[],
  undoneActionId: ActionId,
  parked: readonly ParkedIsland[],
): ParkedIsland[] {
  const placed = new Set<PartId>();
  for (const cid of completedAfterUndo) {
    const a = f.actions.find((x) => x.actionId === cid);
    if (a?.type === "placePart" && a.partId) placed.add(a.partId);
  }
  return parked
    .filter((p) => p.trigger !== undoneActionId)
    .filter((p) => p.members.every((m) => placed.has(m)));
}
