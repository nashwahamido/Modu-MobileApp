import { insertId, placeId, tightenId } from "@/src/game/core/ids";
import { actionCluster } from "./clusters";
import { fastenerKindOf, isConnector } from "../model/liaisons";
import {
  ActionId,
  AssemblyAction,
  ClusterId,
  Furniture,
  PartId,
} from "@/src/game/core/type";

interface StabilityLock {
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

  return f.actions.filter((a) => {
    if (a.type !== "tightenFastener") return false;
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
    } else if (fastenerKindOf(part) === "threaded") {
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

function applicableLocks(
  f: Furniture,
  action: AssemblyAction,
  done: ReadonlySet<ActionId>,
): StabilityLock[] {
  const locks: StabilityLock[] = looseUnstableParts(f, done)
    .map(
      (partId): StabilityLock => ({
        cluster: f.parts[partId]?.cluster,
        allowed: readyStabilizingActionIds(f, partId, done),
      }),
    )
    .concat(preloadConnectorLocks(f, done))
    .filter((lock) => lock.allowed.size > 0);

  const cluster = actionCluster(f, action);
  return cluster == null
    ? locks
    : locks.filter((l) => l.cluster == null || l.cluster === cluster);
}

export function stabilityAllows(
  f: Furniture,
  action: AssemblyAction,
  done: ReadonlySet<ActionId>,
): boolean {
  if (action.type === "tightenFastener") return true;

  const applicable = applicableLocks(f, action, done);
  if (applicable.length === 0) return true;
  return applicable.some((l) => l.allowed.has(action.actionId));
}

/** When a lock blocks `action`: everything the locks WOULD allow instead —  hint material ("insert the cam bolt first"). Empty when nothing blocks. */
export function stabilityNextSteps(
  f: Furniture,
  action: AssemblyAction,
  done: ReadonlySet<ActionId>,
): Set<ActionId> {
  const applicable = applicableLocks(f, action, done);
  if (
    applicable.length === 0 ||
    applicable.some((l) => l.allowed.has(action.actionId))
  ) {
    return new Set();
  }
  return new Set(applicable.flatMap((l) => [...l.allowed]));
}
