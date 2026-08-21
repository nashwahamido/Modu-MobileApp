import { AssemblyMode } from "@/src/game/core/type";

export interface ObjectiveInput {
  mode: AssemblyMode;
  /** Player still has to choose a cluster to work on. */
  needsFocusChoice: boolean;
  /** Instruction text of the first offered action (null when none offered). */
  stepText: string | null;
  completedCount: number;
  totalCount: number;
}

export function objectiveText(o: ObjectiveInput): string | null {
  if (o.mode === "free") return null;
  if (o.needsFocusChoice) return "Choose focus";
  if (o.totalCount > 0 && o.completedCount === o.totalCount) return "All done!";
  return o.stepText ?? "Switch focus";
}

/** Whether step audio should auto-speak the current step in this mode —  mirrors the objective policy (free mode stays quiet until asked). */
export function speaksSteps(mode: AssemblyMode): boolean {
  return mode !== "free";
}
