const FOLDER = "Lumi-tutorial";

const EXT = ".mp3";

const CLIPS: Record<string, string> = {
  "visual-pickup-and-place": "step1-long-press",
  "visual-settings": "step2-settings",
  "hud-focus": "step3-focus",
  "view-under-table": "step4-joystick",
  "place-connector": "step5-bolt",
  "tighten-connector": "step6-turn-clockwise",
  "visual-undo-recenter": "step7-undo-and-recenter",
  "visual-stuck-help": "step8-spot-and-auto",
  "install-four-legs": "step9-continue",
};

export function tutorialVoicePath(stepId: string | undefined): string | null {
  if (!stepId) return null;
  const clip = CLIPS[stepId];
  return clip ? `${FOLDER}/${clip}${EXT}` : null;
}

export function recordedTutorialStepIds(): string[] {
  return Object.keys(CLIPS);
}