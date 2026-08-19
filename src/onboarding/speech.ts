// Onboarding's voice: a RECORDED clip when there is one, synthesis when there is not.
//
// The recordings live in Supabase storage (see voiceAssets.ts for the path scheme) and are the good
// version — a real performance of Modu rather than a robot reading. But they can be missing for
// reasons entirely outside the player's control: offline on a train, a clip not yet uploaded, a
// storage hiccup. So expo-speech stays as the floor.
//
// THE FALLBACK IS THE POINT. This is the accessibility control on the first screen a new player
// sees, and a voice button that does nothing is worse than one that sounds synthetic — the player
// cannot tell a missing file from a broken app, and the whole reason they pressed it is that they
// wanted the text read to them.
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
    // Load lazily so older dev builds without the native module do not crash on app start.
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

// ONE player for the whole screen, created lazily and never replaced. Two reasons: a hook would tie
// it to a component's lifetime, and these clips are fired from buttons scattered across cards that
// mount and unmount as the player moves between questions; and one player means pressing a second
// button REPLACES the first clip rather than talking over it, which is the same rule Speech.stop()
// enforces for the synthesised path.
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

/** Silence whichever voice is talking — recorded or synthesised. Both, since either may be live. */
export function stop() {
  try {
    player?.pause();
  } catch {
    // A player disposed under us is not worth reporting; the next play() rebuilds one.
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

/** Synthesised speech. The floor under everything below, and the whole of the old behaviour. */
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

/**
 * Play the recorded clip at `storagePath`, falling back to speaking `text`.
 *
 * probeRemote does two jobs here, both of which matter (see data/remoteAsset.ts): it HEAD-checks the
 * URL so a missing clip becomes a fallback rather than a silent button, and it appends the ETag as a
 * ?v= cache-buster — storage serves cache-control: max-age=3600, so a RE-RECORDED line would
 * otherwise keep playing the old take on a device for up to an hour.
 *
 * The probe is cached per session, so only the first press of a given line pays for the round trip.
 */
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
      // Not in storage, or unreachable. Say it anyway.
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