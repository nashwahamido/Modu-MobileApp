// The current tutorial step, read aloud — Lumi's run only.
//
// TWO SOURCES, in order: the recorded clip in Supabase storage (game/audio/tutorialVoice) if the
// step has one, and expo-speech if it does not. Exactly the shape useStepAudio uses for assembly
// instructions, and for the same reason: the recordings are the good version, but they can be
// missing for reasons the player has no control over — offline, a clip not yet uploaded, a storage
// hiccup — and the visual profile is the run where being read to is the whole point.
//
// THE FALLBACK IS NOT A NICETY HERE. This replaced a path that spoke every line through expo-speech
// unconditionally, so anything less than a working fallback would be a regression for the profile
// least able to absorb one: a step that says nothing looks identical to a step the player has
// already heard, and Lumi's cards are deliberately short because the voice is carrying the detail.
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { useEffect, useRef } from "react";

import { supabase } from "@/src/config/supabase";
import { probeRemote } from "@/src/data/remoteAsset";
import { VOICEOVER_BUCKET } from "@/src/game/audio/stepVoice";
import { tutorialVoicePath } from "@/src/game/audio/tutorialVoice";

type SpeechOptions = { language?: string; pitch?: number; rate?: number };
type SpeechModule = {
  stop: () => void;
  speak: (text: string, options?: SpeechOptions) => void;
};

let speechModule: SpeechModule | null | undefined;
let warnedUnavailable = false;

// Loaded LAZILY rather than imported at module scope, matching onboarding/speech.ts. The overlay
// used to import expo-speech eagerly, which meant a dev build predating the native module took the
// crash on app start rather than on the first line spoken. Same trade there as here: a synthetic
// voice is a degraded tutorial, a missing native module used to be no app at all.
function getSpeechModule(): SpeechModule | null {
  if (speechModule !== undefined) return speechModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    speechModule = require("expo-speech") as SpeechModule;
  } catch {
    speechModule = null;
    if (!warnedUnavailable) {
      warnedUnavailable = true;
      console.warn(
        "[tutorial] expo-speech is unavailable in this build; steps without a recorded clip will be silent.",
      );
    }
  }
  return speechModule;
}

function speakFallback(text: string, rate: number) {
  if (!text.trim()) return;
  const speech = getSpeechModule();
  if (!speech) return;
  try {
    speech.stop();
    speech.speak(text, { rate });
  } catch {
    speechModule = null;
  }
}

function silence(player: AudioPlayer | null) {
  try {
    player?.pause();
  } catch {
    // A player torn down under us is not worth reporting; the next play rebuilds one.
  }
  const speech = getSpeechModule();
  if (!speech) return;
  try {
    speech.stop();
  } catch {
    speechModule = null;
  }
}

/**
 * Speak the tutorial step named by `stepId`, or `text` if it has no recording.
 *
 * `enabled` carries the whole gating condition the caller has already computed — the audio setting
 * plus every state where the bubble is not the thing on screen (the map, a reward, a blocked drag).
 * Passing it in rather than reading the store here keeps ONE list of those conditions, in the
 * component that knows about them, instead of two that drift.
 */
export function useTutorialVoice(
  stepId: string | undefined,
  text: string,
  enabled: boolean,
  rate = 0.82,
): void {
  // ONE player, kept across steps and never rebuilt — the same reasoning as useStepAudio. A player
  // owned by the hook's render would be tied to a component that re-renders far more often than the
  // step changes, and one player means a new step REPLACES the line still playing rather than
  // talking over it, which is what Speech.stop() enforces on the synthesised side.
  const playerRef = useRef<AudioPlayer | null>(null);
  // The step this effect was started for. The remote probe is async and the tutorial may have moved
  // on by the time it returns; without this guard a slow lookup speaks the previous step's line over
  // the current one, which in a tutorial is worse than silence.
  const wantedRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    wantedRef.current = stepId;

    // Returned from EVERY path below, including the ones that fall back to synthesis. An earlier
    // draft returned it only where a clip played, which left a spoken line running after the overlay
    // unmounted — the tutorial closing while Lumi carried on talking over the build.
    const stopBoth = () => {
      silence(playerRef.current);
    };

    if (!enabled || !stepId) {
      stopBoth();
      return stopBoth;
    }

    if (!playerRef.current) {
      try {
        playerRef.current = createAudioPlayer();
      } catch {
        speakFallback(text, rate);
        return stopBoth;
      }
    }
    const player = playerRef.current;
    if (!player) {
      speakFallback(text, rate);
      return stopBoth;
    }

    // Whichever voice was talking stops before the next one starts, recorded or synthesised — the
    // step has changed, so the previous line is no longer the instruction on screen.
    silence(player);

    const path = tutorialVoicePath(stepId);
    if (!path) {
      // The grip step, or a step with no recording. Say it rather than skip it.
      speakFallback(text, rate);
      return stopBoth;
    }

    const { data } = supabase.storage.from(VOICEOVER_BUCKET).getPublicUrl(path);
    const url = data?.publicUrl;
    if (!url) {
      speakFallback(text, rate);
      return stopBoth;
    }

    // probeRemote does two jobs, both of which matter (see data/remoteAsset): it HEAD-checks the URL,
    // so a clip that is missing or unreachable falls back instead of leaving the step silent, and it
    // appends the ETag as a ?v= cache-buster — storage serves max-age=3600, so a re-recorded line
    // would otherwise keep playing the old take on a device for up to an hour. Cached per session,
    // so only the first time a step comes round pays for the round trip.
    void probeRemote(url).then((versioned) => {
      if (wantedRef.current !== stepId) return;
      if (!versioned) {
        speakFallback(text, rate);
        return;
      }
      try {
        player.replace(versioned);
        player.play();
      } catch {
        speakFallback(text, rate);
      }
    });

    return stopBoth;
  }, [enabled, stepId, text, rate]);
}