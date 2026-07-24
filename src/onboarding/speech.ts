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

export function stop() {
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
