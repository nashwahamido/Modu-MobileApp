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
  }
  const speech = getSpeechModule();
  if (!speech) return;
  try {
    speech.stop();
  } catch {
    speechModule = null;
  }
}

export function useTutorialVoice(
  stepId: string | undefined,
  text: string,
  enabled: boolean,
  rate = 0.82,
): void {
  const playerRef = useRef<AudioPlayer | null>(null);
  const wantedRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    wantedRef.current = stepId;

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

    silence(player);

    const path = tutorialVoicePath(stepId);
    if (!path) {
      speakFallback(text, rate);
      return stopBoth;
    }

    const { data } = supabase.storage.from(VOICEOVER_BUCKET).getPublicUrl(path);
    const url = data?.publicUrl;
    if (!url) {
      speakFallback(text, rate);
      return stopBoth;
    }

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