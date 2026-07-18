import {
  ActionId,
  AssemblyAction,
  AssemblyMode,
  ClusterId,
  Furniture,
  PartId,
} from "@/src/game/core/type";
import {
  actionCluster,
  actionsForClusterFocus,
  clusterComplete,
  clusterCurrentStage,
  clusterPrereqsMet,
  combineReady,
} from "./clusters";
import {
  andFrontierTargets,
  buildLiaisons,
  isReachable,
  neighbourMap,
} from "../model/liaisons";
import { stabilityAllows } from "./stability";

/** Suggested focus stage: the earliest stage with incomplete work. This is a UI SCAFFOLD only (a gentle "where to look next"), NOT a hard gate — clusters can be built in any order, so availability does not depend on it. */
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

/**
 * Actions the player may legally do now:
 *   - not yet done,
 *   - every `requires` complete (the AND side),
 *   - any authored cluster prerequisites are complete,
 *   - the snap FRONTIER passes (the OR side): a structural part can only be
 *     placed once a joint neighbour is built, unless it is a cluster `seed`
 *     starting an otherwise empty cluster —
 *     derived generically from Γ, replacing per-furniture gates like
 *     "anyLegSnapped",
 *   - the slide/thread frontier passes (the AND side, read from Γ): a mover
 *     needs EVERY same-cluster groove owner / receiver placed — you can't
 *     enter a groove or a thread that isn't there.
 *     (The reverse trap — "the back panel closes the groove" — is authored as
 *     a `requires` on the CLOSING part, so it stays explainable by hints.)
 *   - generic stability: an unstable snapped part must be secured before
 *     another unstable part in the same cluster can snap.
 *   - the named `gate` (if any) passes — reserved for future exceptional rules.
 * No stage gate — independent clusters can progress in any order.
 */
export function availableActions(
  f: Furniture,
  done: ReadonlySet<ActionId>,
): AssemblyAction[] {
  const liaisons = f.liaisons ?? buildLiaisons(f.parts);
  const neighbours = neighbourMap(liaisons);

  const placed = new Set<PartId>();
  for (const a of f.actions) {
    if (a.type === "placePart" && a.partId && done.has(a.actionId)) {
      placed.add(a.partId);
    }
  }

  return f.actions.filter((a) => {
    if (done.has(a.actionId)) return false;
    if (!a.requires.every((r) => done.has(r))) return false;
    if (a.requiresAny?.length && !a.requiresAny.some((r) => done.has(r))) return false;

    const cluster = actionCluster(f, a);
    if (cluster && !clusterPrereqsMet(f, cluster, done)) return false;

    if (a.type === "placePart" && a.partId) {
      const part = f.parts[a.partId];
      const andTargets = andFrontierTargets(liaisons, f.parts, a.partId);
      if (andTargets.some((t) => !placed.has(t))) return false;
      // A seed bypasses the snap frontier entirely: it may start its cluster
      // OR a parallel island of it (EKET preps both side panels flat and
      // independently before the box joins them into one component).
      if (
        part?.type === "structural" &&
        !isReachable(a.partId, placed, neighbours, !!part?.seed)
      ) {
        return false;
      }
    }

    if (a.type === "combineClusters" && !combineReady(f, done)) return false;

    if (!stabilityAllows(f, a, done)) return false;

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

  return focused.filter((a) => {
    const cluster = actionCluster(f, a);
    return cluster == null || a.stage === clusterCurrentStage(f, cluster, done);
  });
}
