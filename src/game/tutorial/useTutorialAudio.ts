import { useAudioPlayer } from "expo-audio";
import { useEffect } from "react";
import type { TutorialAudioSource } from "./steps";

export function useTutorialAudio(
  source: TutorialAudioSource | undefined,
  enabled: boolean,
): void {
  const player = useAudioPlayer();

  useEffect(() => {
    if (!enabled || !source) return;
    player.replace(source);
    player.play();
  }, [enabled, player, source]);
}
