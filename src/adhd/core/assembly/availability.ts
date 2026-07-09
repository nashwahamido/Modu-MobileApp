// Evaluates the assembly DAG. Generic — takes a furniture's actions + gates and
// knows nothing about any specific furniture.
import { AssemblyAction, Gate } from "@/src/adhd/core/type";

/**
 * Suggested focus stage: the earliest stage with incomplete work. This is a
 * UI SCAFFOLD only (a gentle "where to look next"), NOT a hard gate — clusters
 * can be built in any order, so availability does not depend on it.
 */
export function currentStage(
  actions: readonly AssemblyAction[],
  done: ReadonlySet<string>,
): number {
  const stages = [...new Set(actions.map((a) => a.stage))].sort((a, b) => a - b);
  for (const s of stages) {
    if (actions.some((a) => a.stage === s && !done.has(a.actionId))) return s;
  }
  return stages[stages.length - 1] ?? 1;
}

/**
 * Actions the player may legally do now: not yet done, every `requires`
 * complete, and the named `gate` (if any) passing. No stage gate — independent
 * clusters (e.g. base vs seat) can progress in any order; cross-stage ordering
 * within a cluster is encoded explicitly in `requires` / gates.
 */
export function availableActions(
  actions: readonly AssemblyAction[],
  gates: Record<string, Gate>,
  done: ReadonlySet<string>,
): AssemblyAction[] {
  return actions.filter((a) => {
    if (done.has(a.actionId)) return false;
    if (!a.requires.every((r) => done.has(r))) return false;
    if (!a.gate) return true;
    const gate = gates[a.gate];
    if (!gate) throw new Error(`unknown gate "${a.gate}" on ${a.actionId}`);
    return gate(done);
  });
}
