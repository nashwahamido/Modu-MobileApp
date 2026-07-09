import { insertId } from "@/src/game/core/ids";
import { ActionId, Furniture, PartId } from "@/src/game/core/type";
import { availableActions } from "./availability";
import { actionCluster, clusterComplete } from "./clusters";
import { andFrontierTargets, buildLiaisons, isConnector, neighbourMap } from "../model/liaisons";
import { looseUnstableParts, stabilityNextSteps } from "./stability";

export interface BlockReason {
  kind: "place" | "insert" | "secure" | "tighten" | "finishCluster";
  /** a part GROUP (place/insert/secure/tighten) or a cluster id (finishCluster). */
  target: string;
}

const groupOf = (f: Furniture, partId?: PartId): string | undefined =>
  partId ? (f.parts[partId]?.group ?? partId) : undefined;

/**
 * The first, most actionable reason `actionId` isn't available — or null if it's
 * actually available (or unknown). Order mirrors the common blockers so the hint
 * points at the most direct next step.
 */
export function blockReason(
  f: Furniture,
  actionId: ActionId,
  done: ReadonlySet<ActionId>,
): BlockReason | null {
  const action = f.actions.find((a) => a.actionId === actionId);
  if (!action || done.has(actionId)) return null;
  if (availableActions(f, done).some((a) => a.actionId === actionId)) return null;

  for (const r of action.requires) {
    if (done.has(r)) continue;
    const req = f.actions.find((a) => a.actionId === r);
    const g = groupOf(f, req?.partId);
    if (g) {
      const kind =
        req?.type === "tightenFastener"
          ? "tighten"
          : req?.type === "insertFastener"
            ? "insert"
            : "place";
      return { kind, target: g };
    }
  }

  if (action.requiresAny?.length && !action.requiresAny.some((r) => done.has(r))) {
    const req = f.actions.find((a) => a.actionId === action.requiresAny![0]);
    const g = groupOf(f, req?.partId);
    if (g) return { kind: "place", target: g };
  }

  if (action.type === "placePart" && action.partId) {
    const placed = new Set<PartId>();
    for (const a of f.actions) {
      if (a.type === "placePart" && a.partId && done.has(a.actionId)) placed.add(a.partId);
    }
    const liaisons = f.liaisons ?? buildLiaisons(f.parts);
    const missingAnd = andFrontierTargets(liaisons, f.parts, action.partId).find(
      (t) => !placed.has(t),
    );
    if (missingAnd) {
      const g = groupOf(f, missingAnd);
      if (g) return { kind: "place", target: g };
    }
    const nb = neighbourMap(liaisons)[action.partId];
    const unplaced = nb && [...nb].find((n) => !placed.has(n));
    const g = groupOf(f, unplaced || undefined);
    if (g) return { kind: "place", target: g };

    for (const p of Object.values(f.parts)) {
      if (!isConnector(p) || !p.attached!.includes(action.partId)) {
        continue;
      }
      const other = p.attached![0] === action.partId ? p.attached![1] : p.attached![0];
      if (placed.has(other) && !done.has(insertId(p.partId))) {
        return { kind: "insert", target: p.group };
      }
    }
  }

  const loose = looseUnstableParts(f, done);
  if (loose.length) {
    const g = groupOf(f, loose[0]);
    if (g) return { kind: "secure", target: g };
  }

  const nextSteps = stabilityNextSteps(f, action, done);
  if (nextSteps.size) {
    const na = f.actions.find((a) => nextSteps.has(a.actionId));
    const g = groupOf(f, na?.partId);
    if (g) {
      const kind =
        na?.type === "tightenFastener"
          ? "tighten"
          : na?.type === "insertFastener"
            ? "insert"
            : "place";
      return { kind, target: g };
    }
  }

  const cl = actionCluster(f, action);
  if (cl) {
    const unfinished = (f.clusters?.[cl]?.requires ?? []).find(
      (rc) => !clusterComplete(f, rc, done),
    );
    if (unfinished) return { kind: "finishCluster", target: unfinished };
  }

  return null;
}
