import { insertId } from "@/src/game/core/ids";
import { ActionId, AssemblyAction, Furniture, PartId } from "@/src/game/core/type";
import { availableActions } from "./availability";
import { actionCluster, clusterComplete } from "./clusters";
import { andFrontierTargets, buildLiaisons, isConnector, neighbourMap } from "../model/liaisons";
import { stabilityNextSteps } from "./stability";

export interface BlockReason {
  kind: "place" | "insert" | "secure" | "tighten" | "finishCluster";
  /** a part GROUP (place/insert/secure/tighten) or a cluster id (finishCluster). */
  target: string;
}

/** A hint about a component's non-lead body is unactionable by construction (non-leads are never carded or offered) — point at the lead the player actually drags instead. */
const hintPartId = (f: Furniture, partId?: PartId): PartId | undefined => {
  if (!partId || !f.components) return partId;
  const c = f.components.byBody[partId];
  return c && f.components.lead[c] !== partId ? f.components.lead[c] : partId;
};

const groupOf = (f: Furniture, partId?: PartId): string | undefined =>
  partId ? (f.parts[partId]?.group ?? partId) : undefined;

const kindForType = (t?: AssemblyAction["type"]): BlockReason["kind"] =>
  t === "tightenFastener" ? "tighten"
  : t === "insertFastener" || t === "placeFastener" ? "insert"
  : "place";

/** True when a hint's recommendation can be acted on RIGHT NOW — some available action performs it. A hint that names a step the player cannot do (because that step is itself blocked) sends them bouncing between two errors instead of forward; see the EKET bottomPanel→backPanel circular pair. */
export function reasonActionable(
  f: Furniture,
  reason: BlockReason,
  done: ReadonlySet<ActionId>,
): boolean {
  const avail = availableActions(f, done);
  const group = (partId?: PartId) => (partId ? f.parts[partId]?.group : undefined);
  switch (reason.kind) {
    case "place":
      return avail.some(
        (a) =>
          (a.type === "placePart" || a.type === "stagePart") &&
          group(a.partId) === reason.target,
      );
    case "insert":
      return avail.some(
        (a) =>
          (a.type === "insertFastener" || a.type === "placeFastener") &&
          group(a.partId) === reason.target,
      );
    // strictly a tighten — the insert a tighten waits on is its own candidate now (see pushStep), so answering "yes" here for a fastener still in the tray only mislabels the step
    case "tighten":
      return avail.some(
        (a) => a.type === "tightenFastener" && group(a.partId) === reason.target,
      );
    // securing a loose part = driving the fasteners attached to it
    case "secure":
      return avail.some((a) => {
        const p = a.partId ? f.parts[a.partId] : undefined;
        return (
          p?.type === "fastener" &&
          !!p.attached?.some((t) => f.parts[t]?.group === reason.target)
        );
      });
    case "finishCluster":
      return avail.some((a) => actionCluster(f, a) === reason.target);
  }
}

/** Every plausible blocker for `action`, most-specific first: authored requires → requiresAny → the stability lock's own allowed steps → the slide/thread frontier → liaison neighbours → half-made preload joints → the cluster prerequisite. The caller picks the first ACTIONABLE one, so listing several loose candidates here is fine. */
function candidateReasons(
  f: Furniture,
  action: AssemblyAction,
  done: ReadonlySet<ActionId>,
): BlockReason[] {
  const out: BlockReason[] = [];
  const seen = new Set<string>();
  const push = (kind: BlockReason["kind"], target?: string): void => {
    if (!target || seen.has(`${kind}:${target}`)) return;
    seen.add(`${kind}:${target}`);
    out.push({ kind, target });
  };
  const pushPart = (kind: BlockReason["kind"], partId?: PartId): void =>
    push(kind, groupOf(f, hintPartId(f, partId)));

  // A tighten sits BEHIND its own insert, so the insert goes in as the earlier candidate: naming "tighten the screw" while that screw is still in the tray points at a step that does not exist yet. Both go in and the actionable-first pick decides which verb the state supports.
  const pushStep = (a: AssemblyAction): void => {
    if (!a.partId) return;
    if (a.type === "tightenFastener") pushPart("insert", a.partId);
    pushPart(kindForType(a.type), a.partId);
  };

  const byId = new Map(f.actions.map((a) => [a.actionId, a]));
  for (const r of action.requires) {
    if (done.has(r)) continue;
    const req = byId.get(r);
    if (req) pushStep(req);
  }

  if (action.requiresAny?.length && !action.requiresAny.some((r) => done.has(r))) {
    for (const r of action.requiresAny) {
      const req = byId.get(r);
      if (req) pushStep(req);
    }
  }

  // the stability lock's OWN prescription — what it allows is exactly what unfreezes the cluster ("tighten the runner screw"), so it outranks the geometric guesses below
  for (const id of stabilityNextSteps(f, action, done)) {
    const na = byId.get(id);
    if (na) pushStep(na);
  }

  if (action.type === "placePart" && action.partId) {
    const placed = new Set<PartId>();
    for (const a of f.actions) {
      if (a.type === "placePart" && a.partId && done.has(a.actionId)) placed.add(a.partId);
    }
    const liaisons = f.liaisons ?? buildLiaisons(f.parts);
    for (const t of andFrontierTargets(liaisons, f.parts, action.partId)) {
      if (!placed.has(t)) pushPart("place", t);
    }
    const nb = neighbourMap(liaisons)[action.partId];
    for (const n of nb ?? []) {
      if (!placed.has(n)) pushPart("place", n);
    }

    for (const p of Object.values(f.parts)) {
      if (!isConnector(p) || !p.attached!.includes(action.partId)) {
        continue;
      }
      const other = p.attached![0] === action.partId ? p.attached![1] : p.attached![0];
      if (placed.has(other) && !done.has(insertId(p.partId))) {
        push("insert", p.group);
      }
    }
  }

  const cl = actionCluster(f, action);
  if (cl) {
    for (const rc of f.clusters?.[cl]?.requires ?? []) {
      if (!clusterComplete(f, rc, done)) push("finishCluster", rc);
    }
  }

  return out;
}

/** The most actionable reason `actionId` isn't available — or null if it's actually available (or unknown). Candidates are ranked most-specific-first, but a recommendation the player cannot act on right now is worse than a vaguer one they can, so the first ACTIONABLE candidate wins; a synthesized pointer at any doable step in the same cluster backstops the rare state where none is. */
export function blockReason(
  f: Furniture,
  actionId: ActionId,
  done: ReadonlySet<ActionId>,
): BlockReason | null {
  const action = f.actions.find((a) => a.actionId === actionId);
  if (!action || done.has(actionId)) return null;
  if (availableActions(f, done).some((a) => a.actionId === actionId)) return null;

  const candidates = candidateReasons(f, action, done);
  const actionable = candidates.find((r) => reasonActionable(f, r, done));
  if (actionable) return actionable;

  const avail = availableActions(f, done);
  const cl = actionCluster(f, action);
  const fallback =
    avail.find((a) => a.partId && actionCluster(f, a) === cl) ??
    avail.find((a) => a.partId);
  if (fallback) {
    return { kind: kindForType(fallback.type), target: groupOf(f, hintPartId(f, fallback.partId))! };
  }
  return candidates[0] ?? null;
}
