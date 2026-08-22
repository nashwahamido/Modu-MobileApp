// Lumi's tutorial voice: which recorded clip belongs to which step of the visual run.
//
// LISTED, not derived — and deliberately unlike onboarding/voiceAssets.ts, which builds its paths as
// an expression because its clips are named after the questions they belong to. Here the two halves
// were named by different people for different purposes: the recordings describe the ACTION a step
// teaches ("step5-bolt", "step8-spot-and-auto") while the step ids describe the step's place in the
// run ("place-connector", "visual-stuck-help"). Nothing derives one from the other, and a scheme
// that tried would fail the way a mistyped key fails — silently, on the run built for the players
// least able to fall back on reading the card.
//
// The NUMBERS are the step's position in VISUAL_TUTORIAL_STEPS, which is also the number the player
// sees on the card: the grip step is excluded from the count (MascotGuideOverlay), so "1 of 9" is
// index 1, and step1-long-press.mp3 is the clip for it. That the two agree is a coincidence worth
// not relying on — this table maps ids, so a step inserted anywhere leaves it correct or fails the
// test below, rather than shifting every clip by one.
//
// PURE — no supabase import, same rule as voiceAssets.ts and data/catalog/assets.ts — so the mapping
// can be unit-tested against the real step list without a client. Resolving a URL is the caller's
// job; useTutorialVoice.ts does it.

/** The subtree in the Voiceover bucket. Capital L, as uploaded — storage paths are case-sensitive. */
const FOLDER = "Lumi-tutorial";

/** One extension for every clip, in one place. */
const EXT = ".mp3";

/**
 * Step id → clip name, for every step of VISUAL_TUTORIAL_STEPS that has a recording.
 *
 * THE GRIP STEP IS ABSENT ON PURPOSE, not by omission. `hold-like-controller` is presented by
 * GripCoach's own full-screen card — its own art, its own "Got it" button — and the mascot's bubble
 * is not up yet, so the line was already excluded from the spoken path before any of this existed
 * (see the GRIP_STEP_ID branch in MascotGuideOverlay). There is no step0 clip in the bucket either.
 * tutorialVoiceClip returning null for it is the correct answer, not a gap to fill.
 *
 * `step1-undo-and-recenter.mp3` also sits in the bucket and is NOT referenced here: it is a second
 * take of step 7 uploaded under the wrong number (same duration, same bitrate, same byte length as
 * step7-undo-and-recenter.mp3, different contents). Listing paths rather than deriving them is what
 * makes a stray file inert instead of ambiguous.
 */
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

/**
 * The storage path for a tutorial step's recorded line, or null when it has none.
 *
 * Null covers three different situations and deliberately does not distinguish them: the grip step,
 * which is silent by design; a step from another profile's list, which has no Lumi recording; and a
 * step id that has been renamed since the table was written. The caller's response to all three is
 * the same — speak the card's text instead — and the test below is what keeps the third from going
 * unnoticed, rather than a runtime branch nobody would ever see.
 */
export function tutorialVoicePath(stepId: string | undefined): string | null {
  if (!stepId) return null;
  const clip = CLIPS[stepId];
  return clip ? `${FOLDER}/${clip}${EXT}` : null;
}

/** The ids this table covers, for the test that checks it against the real step list. */
export function recordedTutorialStepIds(): string[] {
  return Object.keys(CLIPS);
}