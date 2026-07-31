// The objective-bar text for the current step, plus the matching auto-spoken audio — one policy, shared by the game (play.tsx) and the tutorial. needsFocusChoice is computed per-screen (the combine stage differs) and passed in.
import { useStepAudio } from "@/src/game/audio/useStepAudio";
import { instructionText } from "@/src/game/core/presentation/instructions";
import {
  objectiveText,
  speaksSteps,
} from "@/src/game/core/presentation/objective";
import type {
  ActionId,
  AssemblyMode,
  Furniture,
  TextLevel,
} from "@/src/game/core/type";

interface StepObjectiveInput {
  furniture: Furniture | null | undefined;
  /** actionId of the first offered action (undefined when none offered). */
  firstAvailable: ActionId | undefined;
  needsFocusChoice: boolean;
  mode: AssemblyMode;
  textLevel: TextLevel;
  audioOn: boolean;
  completedCount: number;
  totalCount: number;
}

export function useStepObjective({
  furniture,
  firstAvailable,
  needsFocusChoice,
  mode,
  textLevel,
  audioOn,
  completedCount,
  totalCount,
}: StepObjectiveInput): string {
  const objective = objectiveText({
    mode,
    needsFocusChoice,
    stepText:
      furniture && firstAvailable
        ? instructionText(furniture.instructions, firstAvailable, textLevel)
        : null,
    completedCount,
    totalCount,
  });

  useStepAudio(
    furniture?.audio,
    needsFocusChoice || !speaksSteps(mode) ? undefined : firstAvailable,
    audioOn,
  );

  return objective;
}
