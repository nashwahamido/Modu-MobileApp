import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { useEffect, useRef } from "react";

import { supabase } from "@/src/config/supabase";
import { probeRemote } from "@/src/data/remoteAsset";
import { stepVoicePath, VOICEOVER_BUCKET } from "@/src/game/audio/stepVoice";
import type { ActionId, Furniture, TextLevel } from "@/src/game/core/type";

export function useStepAudio(
  furniture: Furniture | null | undefined,
  actionId: ActionId | undefined,
  enabled: boolean,
  level: TextLevel,
): void {
  const playerRef = useRef<AudioPlayer | null>(null);
  const wantedRef = useRef<ActionId | undefined>(undefined);

  useEffect(() => {
    wantedRef.current = actionId;
    if (!enabled || !actionId || !furniture) return;

    if (!playerRef.current) {
      try {
        playerRef.current = createAudioPlayer();
      } catch {
        return;
      }
    }
    const player = playerRef.current;
    if (!player) return;

    const path = stepVoicePath(furniture, actionId, level);
    if (!path) return;

    const { data } = supabase.storage.from(VOICEOVER_BUCKET).getPublicUrl(path);
    const url = data?.publicUrl;
    if (!url) return;

    void probeRemote(url).then((versioned) => {
      if (wantedRef.current !== actionId) return;
      if (!versioned) return;
      try {
        player.replace(versioned);
        player.play();
      } catch {
      }
    });
  }, [enabled, actionId, furniture, level]);
}