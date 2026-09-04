import { insertId, placeId, tightenId } from "@/src/game/core/ids";
import { actionCluster } from "./clusters";
import { isConnector, preloadOf } from "../model/liaisons";
import { isStaged } from "../model/staging";
import {
  ActionId,
  AssemblyAction,
  ClusterId,
  Furniture,
  PartId,
} from "@/src/game/core/type";

export interface StabilityLock {
  cluster: ClusterId | undefined;
  allowed: Set<ActionId>;
}

function actionById(
  actions: readonly AssemblyAction[],
): Map<ActionId, AssemblyAction> {
  return new Map(actions.map((a) => [a.actionId, a]));
}

function placedStructuralPartIds(
  f: Furniture,
  done: ReadonlySet<ActionId>,
): Set<PartId> {
  const placed = new Set<PartId>();
  for (const a of f.actions) {
    if (a.type === "placePart" && a.partId && done.has(a.actionId)) {
      placed.add(a.partId);
    }
  }
  return placed;
}

function securingTightenActions(
  f: Furniture,
  partId: PartId,
): AssemblyAction[] {
  const byId = actionById(f.actions);
  const snap = placeId(partId);
  // Only same-stage tightens hold the stability lock: a later-stage securing screw is unreachable under guide's stage gate, so counting it would hold the whole stage hostage (BEKVÄM's stage-2 step screw vs the unstable stage-1 front rail).
  const snapStage = byId.get(snap)?.stage ?? Number.NEGATIVE_INFINITY;

  return f.actions.filter((a) => {
    if (a.type !== "tightenFastener") return false;
    if (a.stage > snapStage) return false;
    if (a.requires.includes(snap)) return true;

    return a.requires.some((r) => {
      const requiredAction = byId.get(r);
      return (
        requiredAction?.type === "insertFastener" &&
        (requiredAction.requires.includes(snap) ||
          requiredAction.requiresAny?.includes(snap))
      );
    });
  });
}

function addRequiredChain(
  byId: ReadonlyMap<ActionId, AssemblyAction>,
  actionId: ActionId,
  allowed: Set<ActionId>,
): void {
  if (allowed.has(actionId)) return;
  allowed.add(actionId);

  const action = byId.get(actionId);
  if (!action) return;
  for (const requiredActionId of action.requires) {
    addRequiredChain(byId, requiredActionId, allowed);
  }
}

function requiredChainIds(
  byId: ReadonlyMap<ActionId, AssemblyAction>,
  actionId: ActionId,
): Set<ActionId> {
  const chain = new Set<ActionId>();
  addRequiredChain(byId, actionId, chain);
  return chain;
}

function structuralSnapPrereqsDone(
  byId: ReadonlyMap<ActionId, AssemblyAction>,
  actionIds: ReadonlySet<ActionId>,
  done: ReadonlySet<ActionId>,
): boolean {
  for (const actionId of actionIds) {
    const action = byId.get(actionId);
    if (action?.type === "placePart" && !done.has(actionId)) return false;
  }
  return true;
}

function readyStabilizingActionIds(
  f: Furniture,
  partId: PartId,
  done: ReadonlySet<ActionId>,
): Set<ActionId> {
  const byId = actionById(f.actions);
  const allowed = new Set<ActionId>();

  for (const tighten of securingTightenActions(f, partId)) {
    if (done.has(tighten.actionId)) continue;
    const chain = requiredChainIds(byId, tighten.actionId);
    if (!structuralSnapPrereqsDone(byId, chain, done)) continue;

    for (const actionId of chain) {
      const action = byId.get(actionId);
      if (!action || action.type === "placePart" || done.has(actionId)) continue;
      allowed.add(actionId);
    }
  }

  return allowed;
}

interface JointGroup {
  cluster: ClusterId | undefined;
  missing: PartId;
  ownSteps: Set<ActionId>;
  allReady: boolean;
}

function preloadConnectorLocks(
  f: Furniture,
  done: ReadonlySet<ActionId>,
): StabilityLock[] {
  const placed = placedStructuralPartIds(f, done);

  const joints = new Map<string, JointGroup>();

  for (const part of Object.values(f.parts)) {
    if (!isConnector(part)) continue;

    const [a, b] = part.attached!;
    const aPlaced = placed.has(a);
    const bPlaced = placed.has(b);
    if (aPlaced === bPlaced) continue;

    const missing = aPlaced ? b : a;
    // A STAGED endpoint is not a half-made joint waiting to be locked: the sub-assembly is deliberately built away from the furniture and installed late, so its connector must not preload-lock the cluster the moment the OTHER endpoint lands (the EKET runner frames go down in stage 1, the rod arrives in stage 3 — a lock here would freeze the whole cabinet in between).
    if (isStaged(f.parts[missing])) continue;
    const key = [a, b].sort().join("__");
    const group =
      joints.get(key) ??
      ({
        cluster: part.cluster,
        missing,
        ownSteps: new Set<ActionId>(),
        allReady: true,
      } as JointGroup);

    const inserted = done.has(insertId(part.partId));
    const tightened = done.has(tightenId(part.partId));
    if (!inserted) {
      group.ownSteps.add(insertId(part.partId));
      group.allReady = false;
    } else if (preloadOf(part)?.completesOn === "tighten") {
      // The declared preload, read as itself. This branch used to spell the same condition as `kind === "threaded" || kind === "cam"` — the two of four drive-names that happened to mean completesOn-tighten, a coincidence a reader had to reconstruct from the enum's definition. It shipped releasing on insert for two months precisely because that reconstruction was easy to get wrong.
      if (!tightened) {
        group.ownSteps.add(tightenId(part.partId));
        group.allReady = false;
      }
    } else {
      group.ownSteps.add(tightenId(part.partId));
    }

    joints.set(key, group);
  }

  return [...joints.values()].map((g) => {
    const allowed = new Set(g.ownSteps);
    if (g.allReady) allowed.add(placeId(g.missing));
    return { cluster: g.cluster, allowed };
  });
}

// The securing screw-PLACE special case (a structural mover whose `screwJoins` named the unstable part) was DELETED 2026-08-24: its one user, EKET's suspCap, re-typed to an ordinary fastener securer on the cover↔bracket liaison, so covers are secured by the cap's tighten through the ordinary rule above.
export function unstablePartSecured(
  f: Furniture,
  partId: PartId,
  done: ReadonlySet<ActionId>,
): boolean {
  if (!done.has(placeId(partId))) return false;
  return securingTightenActions(f, partId).every((a) => done.has(a.actionId));
}

export function looseUnstableParts(
  f: Furniture,
  done: ReadonlySet<ActionId>,
): PartId[] {
  return Object.values(f.parts)
    .filter((p) => p.type === "structural" && p.unstable)
    .filter((p) => done.has(placeId(p.partId)))
    .filter((p) => !unstablePartSecured(f, p.partId, done))
    .map((p) => p.partId);
}

/** Every stability lock active in `done` — independent of the action being tested, so a caller sweeping many actions (availableActions) builds this ONCE instead of rebuilding the loose-part/connector scan per action. */
export function buildStabilityLocks(
  f: Furniture,
  done: ReadonlySet<ActionId>,
): StabilityLock[] {
  return looseUnstableParts(f, done)
    .map(
      (partId): StabilityLock => ({
        cluster: f.parts[partId]?.cluster,
        allowed: readyStabilizingActionIds(f, partId, done),
      }),
    )
    .concat(preloadConnectorLocks(f, done))
    .filter((lock) => lock.allowed.size > 0);
}

function locksApplicableTo(
  f: Furniture,
  locks: readonly StabilityLock[],
  action: AssemblyAction,
): StabilityLock[] {
  const cluster = actionCluster(f, action);
  return cluster == null
    ? [...locks]
    : locks.filter((l) => l.cluster == null || l.cluster === cluster);
}

/** stabilityAllows against a prebuilt lock list (see buildStabilityLocks). */
export function stabilityAllowsFrom(
  locks: readonly StabilityLock[],
  f: Furniture,
  action: AssemblyAction,
): boolean {
  if (action.type === "tightenFastener") return true;

  const applicable = locksApplicableTo(f, locks, action);
  if (applicable.length === 0) return true;
  return applicable.some((l) => l.allowed.has(action.actionId));
}

export function stabilityAllows(
  f: Furniture,
  action: AssemblyAction,
  done: ReadonlySet<ActionId>,
): boolean {
  if (action.type === "tightenFastener") return true;
  return stabilityAllowsFrom(buildStabilityLocks(f, done), f, action);
}

/** When a lock blocks `action`: everything the locks WOULD allow instead —  hint material ("insert the cam bolt first"). Empty when nothing blocks. */
export function stabilityNextSteps(
  f: Furniture,
  action: AssemblyAction,
  done: ReadonlySet<ActionId>,
): Set<ActionId> {
  const applicable = locksApplicableTo(f, buildStabilityLocks(f, done), action);
  if (
    applicable.length === 0 ||
    applicable.some((l) => l.allowed.has(action.actionId))
  ) {
    return new Set();
  }
  return new Set(applicable.flatMap((l) => [...l.allowed]));
}
