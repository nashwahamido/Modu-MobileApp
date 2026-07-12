export function stop() {
  return;
}

export function speak(_text: string, _options?: { language?: string; pitch?: number; rate?: number }) {
  // Voice playback is intentionally a safe placeholder in this branch.
  // The UI keeps the voice affordance without adding a native TTS dependency.
  return;
}
