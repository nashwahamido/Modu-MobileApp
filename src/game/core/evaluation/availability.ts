import {
  ActionId,
  AssemblyAction,
  AssemblyMode,
  ClusterId,
  Furniture,
  GroupId,
  PartId,
} from "@/src/game/core/type";
import {
  actionCluster,
  actionsForClusterFocus,
  clusterComplete,
  clusterPrereqsMet,
  combineReady,
  requiresClusterFocus,
} from "./clusters";
import {
  andFrontierTargets,
  buildLiaisons,
  isReachable,
  neighbourMap,
} from "../model/liaisons";
import { isNonLeadBody } from "../model/components";
import { buildStabilityLocks, stabilityAllowsFrom } from "./stability";

/** Suggested focus stage: the earliest stage with incomplete work. */
export function currentStage(
  actions: readonly AssemblyAction[],
  done: ReadonlySet<ActionId>,
): number {
  const stages = [...new Set(actions.map((a) => a.stage))].sort((a, b) => a - b);
  for (const s of stages) {
    if (actions.some((a) => a.stage === s && !done.has(a.actionId))) return s;
  }
  return stages[stages.length - 1] ?? 1;
}

/** Actions the player may legally do now **/
export function availableActions(
  f: Furniture,
  done: ReadonlySet<ActionId>,
): AssemblyAction[] {
  // Memoized per completion state: the play screen recomputes availability from several independent subscribers on EVERY store update, and the stability scan is the priciest thing in the engine — EKET's loose-runner phase measured ~2ms/call on desktop, i.e. frame-eating on a phone. The key is the sorted done-set, so every caller's freshly-built Set of the same completed list hits, in any order (undo/redo included). Callers must treat the result as read-only.
  const key = [...done].sort().join("\n");
  const hit = availabilityCache.get(f);
  if (hit && hit.key === key) return hit.result;
  const result = computeAvailableActions(f, done);
  availabilityCache.set(f, { key, result });
  return result;
}

const availabilityCache = new WeakMap<
  Furniture,
  { key: string; result: AssemblyAction[] }
>();

/** The MOVES are counted by part GROUP rather than by raw action */
export function actionableGroups(
  f: Furniture,
  actions: readonly AssemblyAction[],
): GroupId[] {
  const out: GroupId[] = [];
  const seen = new Set<GroupId>();
  for (const a of actions) {
    if (!a.partId) continue;
    const group = f.parts[a.partId]?.group;
    if (!group || seen.has(group)) continue;
    seen.add(group);
    out.push(group);
  }
  return out;
}


export function nextAction(
  f: Furniture,
  offered: readonly AssemblyAction[],
  done: ReadonlySet<ActionId>,
  parked?: ActionId | null,
): AssemblyAction | undefined {
  const inScene = new Set<PartId>();
  for (const a of f.actions) {
    if (a.partId && done.has(a.actionId)) inScene.add(a.partId);
  }
  // Four tiers, each a preference over the one below rather than a re-sort.
  // `parked` is the action holding a gesture right now (store.driveActionId / orientationActionId) and outranks everything: the player has the part in hand mid-motion, so nothing else can be the next step.
  // Then a fastener already in its hole — the step under the player's hands, and a half-driven screw left behind is the state this whole rule exists to prevent.
  return (
    (parked ? offered.find((a) => a.actionId === parked) : undefined) ??
    offered.find(
      (a) => a.partId && inScene.has(a.partId) && f.parts[a.partId]?.type === "fastener",
    ) ??
    offered.find((a) => a.partId && inScene.has(a.partId)) ??
    offered[0]
  );
}

/** How many ways the WHOLE build is open right now. Decides whether a blocked-grab hint may name one blocker or has to stay generic: with several moves legal, the ranked "first actionable" candidate is one arbitrary pick among many. */
export function openWayCount(f: Furniture, done: ReadonlySet<ActionId>): number {
  return actionableGroups(f, availableActions(f, done)).length;
}

function computeAvailableActions(
  f: Furniture,
  done: ReadonlySet<ActionId>,
): AssemblyAction[] {
  const liaisons = f.liaisons ?? buildLiaisons(f.parts);
  const stabilityLocks = buildStabilityLocks(f, done);
  const neighbours = neighbourMap(liaisons);

  const placed = new Set<PartId>();
  for (const a of f.actions) {
    if (a.type === "placePart" && a.partId && done.has(a.actionId)) {
      placed.add(a.partId);
    }
  }

  const clusterStarted = (clusterId: ClusterId): boolean => {
    for (const partId of placed) {
      if (f.parts[partId]?.cluster === clusterId) return true;
    }
    return false;
  };
  return f.actions.filter((a) => {
    if (a.partId && isNonLeadBody(f.components, a.partId)) return false;
    if (done.has(a.actionId)) return false;
    if (!a.requires.every((r) => done.has(r))) return false;
    if (a.requiresAny?.length && !a.requiresAny.some((r) => done.has(r))) return false;

    const cluster = actionCluster(f, a);
    if (cluster && !clusterPrereqsMet(f, cluster, done)) return false;

    if (a.type === "placePart" && a.partId) {
      const part = f.parts[a.partId];
      const andTargets = andFrontierTargets(liaisons, f.parts, a.partId);
      if (andTargets.some((t) => !placed.has(t))) return false;
      const startsEmptyCluster =
        !!part?.seed && !clusterStarted(part.cluster);
      if (
        part?.type === "structural" &&
        !isReachable(a.partId, placed, neighbours, startsEmptyCluster)
      ) {
        return false;
      }
    }

    if (a.type === "combineClusters" && !combineReady(f, done)) return false;

    if (!stabilityAllowsFrom(stabilityLocks, f, a)) return false;

    if (a.type === "reorient" && a.cluster && !clusterComplete(f, a.cluster, done)) {
      return false;
    }

    if (a.gate) {
      const gate = f.gates?.[a.gate];
      if (!gate) throw new Error(`unknown gate "${a.gate}" on ${a.actionId}`);
      if (!gate(done)) return false;
    }
    return true;
  });
}

/**
 * The actions a given MODE offers right now. All three modes filter the same legal set from `availableActions` — never loosening it:
 *   - free   — everything legal in the focused cluster (current behaviour).
 *   - guide  — same, but only actions at their cluster's current (lowest
 *              incomplete) stage, so stages are done in order.
 *   - strict — exactly one action: the lowest-`order` legal step. Predetermined,
 *              so it ignores cluster focus and drives the sequence itself.
 */
/** The section a RESUMED build should focus, derived from progress rather than persisted: the autosave never carried `activeCluster`, so every relaunch of a mid-build multi-cluster furniture dropped the player back into the section chooser ("switch focus") no matter where they stopped — EKET, cabinet 24% done, asked as though nothing were underway. The answer is where the work is: the cluster of the first legally available action in composed order. Null for a FRESH build (the chooser is the intended first question), for the combine stage (unfocused is correct there — mustChoose already yields to combineReady), and for single-cluster furniture. */
export function resumeFocusCluster(
  f: Furniture,
  done: ReadonlySet<ActionId>,
): ClusterId | null {
  if (!requiresClusterFocus(f) || done.size === 0 || combineReady(f, done)) return null;
  for (const a of availableActions(f, done)) {
    const cluster = actionCluster(f, a);
    if (cluster) return cluster;
  }
  return null;
}

export function availableInMode(
  f: Furniture,
  done: ReadonlySet<ActionId>,
  mode: AssemblyMode,
  activeCluster: ClusterId | null,
): AssemblyAction[] {
  const legal = availableActions(f, done);

  if (mode === "strict") {
    const next = legal.reduce<AssemblyAction | null>(
      (best, a) => (best === null || a.order < best.order ? a : best),
      null,
    );
    return next ? [next] : [];
  }

  const focused = actionsForClusterFocus(f, legal, activeCluster);
  if (mode === "free") return focused;

  // Guide's stage gate is PACING, not legality — legality lives in requires/gates/stability. The offering is therefore each cluster's lowest stage with legally AVAILABLE work, not clusterCurrentStage (lowest with INCOMPLETE work): the two differ exactly when the current stage's remainder is blocked by a later-stage prerequisite, and pinning to the incomplete stage then offers NOTHING forever. Measured deadlock (2026-08-25): EKET built bottom-first in free mode, resumed in guide — topPanel (stage 1) gate-waits for backPanel (stage 2), clusterCurrentStage stayed 1, guide went permanently empty ("Switch focus", bare tray). With the floor on available work, that state offers backPanel; every normally-paced build is untouched, because a stage with available work IS the current stage.
  const stageFloor = new Map<ClusterId, number>();
  for (const a of focused) {
    const cluster = actionCluster(f, a);
    if (cluster == null) continue;
    const floor = stageFloor.get(cluster);
    if (floor === undefined || a.stage < floor) stageFloor.set(cluster, a.stage);
  }
  return focused.filter((a) => {
    const cluster = actionCluster(f, a);
    return cluster == null || a.stage === stageFloor.get(cluster);
  });
}
