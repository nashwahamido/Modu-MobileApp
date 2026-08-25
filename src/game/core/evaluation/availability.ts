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
  // Memoized per completion state: the play screen recomputes availability from several independent subscribers on EVERY store update (drag fit-state churn included), and the stability scan is the priciest thing in the engine — EKET's loose-runner phase measured ~2ms/call on desktop, i.e. frame-eating on a phone. The key is the sorted done-set, so every caller's freshly-built Set of the same completed list hits, in any order (undo/redo included). Callers must treat the result as read-only.
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

/** The distinct MOVES an action list offers, counted by part GROUP rather than by raw action: eight legal tightens of the same cam screw are one move to the player, because the tray cards and the hint copy both speak in groups. Actions with no partId name nothing, so they cannot be a move. */
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

/**
 * Of the actions on offer, the ONE that a "what next" surface should name — the objective bar, the spoken step, Spot's demonstration.
 *
 * NOT `offered[0]`, which is what every one of those used to take. The offered list is `f.actions` filtered, so its order is the order the model was AUTHORED in, and that is not a priority: LACK composes its four legs before any of its bolts, so from the moment the first leg unlocks it sits at the head of the list until it is placed. Push a second bolt into its hole and the list reads `[place_leg_1, tighten_bolt_2, …]` — the screw is half-driven, its tighten control is on screen under the player's finger, and every surface says "Install leg 1 of 4".
 *
 * So a part ALREADY IN THE SCENE outranks one still in the box. A tighten becomes legal only once its fastener is in, a staged carrier is seated only once it has been taken out — an action whose part has a completed action behind it is the continuation of a move the player has already started, and finishing it is what they are in the middle of doing. Ties fall back to composed order, which is the authored reading of "first".
 *
 * The LIST is left alone: availability is legality, not ranking, and reordering it there would move the tray, `resumeFocusCluster` and every group-ordered hint with it.
 */
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

/** How many ways the WHOLE build is open right now. Decides whether a blocked-grab hint may name one blocker or has to stay generic: with several moves legal, the ranked "first actionable" candidate is one arbitrary pick among many. */
export function openWayCount(f: Furniture, done: ReadonlySet<ActionId>): number {
  return actionableGroups(f, availableActions(f, done)).length;
}

function computeAvailableActions(
  f: Furniture,
  done: ReadonlySet<ActionId>,
): AssemblyAction[] {
  const liaisons = f.liaisons ?? buildLiaisons(f.parts);
  // The lock list is action-independent — building it per action (the old stabilityAllows call) made this scan O(actions²) in the loose-unstable phases.
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
