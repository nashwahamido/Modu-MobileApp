import { availableActions } from "@/src/game/core/evaluation/availability";
import { ActionId, AssemblyAction, Furniture } from "@/src/game/core/type";
import type { ValidationIssue } from "./validateFurniture";

// stable ordering of a batch of concurrently-legal actions: earliest stage, then the author's own `order`, then id
const batchOrder = (a: AssemblyAction, b: AssemblyAction): number =>
  a.stage - b.stage || a.order - b.order || (a.actionId < b.actionId ? -1 : 1);

// a topological linearization of every action, obtained by running the real legality engine forward. `order` is the sequence; `unreached` lists actions that never become legal
export function deriveTopoOrder(f: Furniture): {
  order: ActionId[];
  unreached: ActionId[];
} {
  const done = new Set<ActionId>();
  const order: ActionId[] = [];
  for (let round = 0; round <= f.actions.length; round++) {
    // copy before sorting — availableActions returns a cached array that must stay in engine order
    const avail = [...availableActions(f, done)].sort(batchOrder);
    if (avail.length === 0) break;
    for (const a of avail) {
      order.push(a.actionId);
      done.add(a.actionId);
    }
  }
  const unreached = f.actions
    .filter((a) => !done.has(a.actionId))
    .map((a) => a.actionId);
  return { order, unreached };
}

// warn when the AUTHORED array order is not a valid build sequence
export function sequenceIssues(f: Furniture): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const reachable = new Set(deriveTopoOrder(f).order);

  const seq = [...f.actions].sort(
    (a, b) => a.order - b.order || (a.actionId < b.actionId ? -1 : 1),
  );
  const done = new Set<ActionId>();
  for (const a of seq) {
    if (reachable.has(a.actionId)) {
      const legalNow = availableActions(f, done).some(
        (x) => x.actionId === a.actionId,
      );
      if (!legalNow) {
        issues.push({
          level: "warn",
          message:
            `action "${a.actionId}" is listed before the steps it depends on — ` +
            `the authored order isn't a valid build sequence (strict mode still ` +
            `solves it, but reorder for a readable guide)`,
        });
      }
    }
    done.add(a.actionId);
  }
  return issues;
}
