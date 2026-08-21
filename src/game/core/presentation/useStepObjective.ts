// The objective-bar text for the current step, plus the matching auto-spoken audio — one policy, shared by the game (play.tsx) and the tutorial. needsFocusChoice is computed per-screen (the combine stage differs) and passed in.
import { useStepAudio } from "@/src/game/audio/useStepAudio";
import { instructionText } from "@/src/game/core/presentation/instructions";
import { objectiveText } from "@/src/game/core/presentation/objective";
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

  // The whole furniture, not just its audio map: the recorded voiceover is addressed by the model's
  // id and the step's position in its action list, so the hook needs both. `textLevel` picks which
  // recording — standard for Control, Momentum and Clear Path, simple for Lumi's visual profile.
  //
  // NO MODE GATE. This used to fall silent in `free` mode on the rule that free mode "stays quiet
  // until asked" — but Control is the only profile pinned to free, and settings.audio IS the asking.
  // A player who turns Audio steps on and hears nothing has been overruled by a default.
  //
  // The objective BAR still reads "Build it your way" in free mode: it is deliberately not
  // instructing, and that is a separate decision from whether the step can be read aloud on request.
  // needsFocusChoice still silences it — there is no single step to speak while the player is
  // choosing which area to work on.
  useStepAudio(
    furniture,
    needsFocusChoice ? undefined : firstAvailable,
    audioOn,
    textLevel,
  );

  return objective;
}