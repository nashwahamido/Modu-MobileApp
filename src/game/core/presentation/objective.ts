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

/**
 * Whether this mode's objective bar INSTRUCTS — free mode shows "Build it your way" rather than a
 * step, so there is no line on screen to mirror.
 *
 * NO LONGER GATES STEP AUDIO. It did, on the rule that free mode stays quiet until asked, and that
 * silenced the Control profile entirely: Control is the only profile pinned to free, so turning
 * "Audio steps" on did nothing at all for the one group of players most likely to want it. The
 * toggle is the asking. See useStepObjective.
 *
 * Kept because it still describes something true about the bar, and because a mode that wants the
 * distinction later should find it here rather than reinvent it.
 */
export function speaksSteps(mode: AssemblyMode): boolean {
  return mode !== "free";
}