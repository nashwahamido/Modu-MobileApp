import { createAudioPlayer, type AudioPlayer } from "expo-audio";

import { supabase } from "@/src/config/supabase";
import { probeRemote } from "@/src/data/remoteAsset";
import { VOICEOVER_BUCKET } from "@/src/onboarding/voiceAssets";

type SpeechOptions = {
  language?: string;
  pitch?: number;
  rate?: number;
};

type SpeechModule = {
  stop: () => void;
  speak: (text: string, options?: SpeechOptions) => void;
};

let speechModule: SpeechModule | null | undefined;
let warnedUnavailable = false;

function getSpeechModule() {
  if (speechModule !== undefined) return speechModule;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    speechModule = require("expo-speech") as SpeechModule;
  } catch (error) {
    speechModule = null;
    if (!warnedUnavailable) {
      warnedUnavailable = true;
      console.warn("expo-speech is not available in this development build. Rebuild the iOS app to enable voice.");
    }
  }

  return speechModule;
}

let player: AudioPlayer | null = null;

function getPlayer(): AudioPlayer | null {
  if (player) return player;
  try {
    player = createAudioPlayer();
    return player;
  } catch {
    return null;
  }
}

export function stop() {
  try {
    player?.pause();
  } catch {
    player = null;
  }

  const module = getSpeechModule();
  if (!module) return;
  try {
    module.stop();
  } catch (error) {
    speechModule = null;
  }
}

export function speak(text: string, options?: SpeechOptions) {
  if (!text.trim()) return;

  const module = getSpeechModule();
  if (!module) return;

  try {
    module.stop();
    module.speak(text, {
      language: options?.language ?? "en-US",
      pitch: options?.pitch ?? 1.05,
      rate: options?.rate ?? 0.92,
    });
  } catch (error) {
    speechModule = null;
  }
}

export function speakLine(storagePath: string, text: string, options?: SpeechOptions) {
  stop();

  const audio = getPlayer();
  if (!audio) {
    speak(text, options);
    return;
  }

  const { data } = supabase.storage.from(VOICEOVER_BUCKET).getPublicUrl(storagePath);
  const url = data?.publicUrl;
  if (!url) {
    speak(text, options);
    return;
  }

  void probeRemote(url).then((versioned) => {
    if (!versioned) {
      speak(text, options);
      return;
    }
    try {
      audio.replace(versioned);
      audio.play();
    } catch {
      speak(text, options);
    }
  });
}