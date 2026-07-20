import { useAudioPlayer } from "expo-audio";
import { useEffect } from "react";
import { stepAudio } from "@/src/game/core/presentation/instructions";
import { ActionId, AudioMap } from "@/src/game/core/type";

export function useStepAudio(
  audio: AudioMap | undefined,
  actionId: ActionId | undefined,
  enabled: boolean,
): void {
  const player = useAudioPlayer();
  useEffect(() => {
    if (!enabled || !actionId) return;
    const clip = stepAudio(audio, actionId);
    if (!clip) return;
    player.replace(clip);
    player.play();
  }, [enabled, actionId, audio, player]);
}
