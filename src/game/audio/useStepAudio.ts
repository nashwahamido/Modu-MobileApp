// The current step, read aloud.
//
// ONE SOURCE: the recorded voiceover in Supabase storage (game/audio/stepVoice). A step with no
// recording stays silent and the on-screen instruction text carries it. There used to be a bundled
// per-furniture clip behind this as a fallback; the clips were deleted once every model was recorded.
//
// Gated by settings.audio, which the objective hook passes in as `enabled`. That is the same switch
// the HUD's audio chip flips and the one the visual profile turns on by default; nothing here needs
// to know which profile is running, because `level` already carries that distinction — standard is
// what Control, Momentum and Clear Path show, simple is Lumi's.
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
  // ONE player, kept across steps and never rebuilt. A hook-owned player is tied to this component's
  // life, and the step changes far more often than the screen does; one player also means a new step
  // REPLACES the line still playing rather than talking over it.
  const playerRef = useRef<AudioPlayer | null>(null);
  // The step this effect was started for. Checked before playing, because the remote probe is async
  // and the player may have moved on by the time it returns — without this, a slow lookup speaks the
  // previous instruction over the current one.
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

    // probeRemote does two jobs, both of which matter here (see data/remoteAsset): it HEAD-checks the
    // URL, so a step with no recording goes quiet rather than handing the player a 404, and it
    // appends the ETag as a ?v= cache-buster — storage serves max-age=3600, so a re-recorded line
    // would otherwise keep playing the old take on a device for up to an hour. The result is cached
    // per session, so only the first time a step comes round pays for the round trip.
    void probeRemote(url).then((versioned) => {
      if (wantedRef.current !== actionId) return;
      if (!versioned) return;
      try {
        player.replace(versioned);
        player.play();
      } catch {
        // A play that fails mid-teardown is not worth surfacing.
      }
    });
  }, [enabled, actionId, furniture, level]);
}