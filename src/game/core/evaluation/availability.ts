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

// Suggested focus stage: the earliest stage with incomplete work.
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

//Actions the player may legally do now:

export function availableActions(
  f: Furniture,
  done: ReadonlySet<ActionId>,
): AssemblyAction[] {
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

// The distinct MOVES an action list offers, counted by part GROUP not by raw action
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

// NOT `offered[0]`
export function nextAction(
  f: Furniture,
  offered: readonly AssemblyAction[],
  done: ReadonlySet<ActionId>,
): AssemblyAction | undefined {
  const inScene = new Set<PartId>();
  for (const a of f.actions) {
    if (a.partId && done.has(a.actionId)) inScene.add(a.partId);
  }
  return offered.find((a) => a.partId && inScene.has(a.partId)) ?? offered[0];
}

// See how many ways the WHOLE build is open right now. Decides whether a blocked-grab hint be specific or generic
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

// The section a RESUMED build should focus, derived from progress
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
