// Lumi's voice for the room's first-placement guide.
//
// LISTED, not derived — the same call as game/audio/tutorialVoice.ts and for the same reason. The
// clips are named for what Lumi SAYS ("Lumi-happy-with-placement", "Lumi-everything-is-ready")
// while the stages are named for what the player DOES ("reposition", "confirm"). Two vocabularies
// settled separately, with nothing connecting them but this table.
//
// LUMI ONLY. The guide itself runs for every profile — Felix, Pebble and Sparky all walk a player
// through their first placement — but the bucket holds one companion's recordings, so callers must
// ask for these on the visual profile alone. Handing Pebble's player Lumi's voice would be a worse
// failure than the synthesis they get today, and a silent one.
//
// PURE — no supabase import, matching onboarding/voiceAssets.ts and data/catalog/assets.ts — so the
// mapping can be unit-tested against the guide's own stage list without a client.

/** The subtree in the Voiceover bucket. Capital L, as uploaded — storage paths are case-sensitive. */
const FOLDER = "Lumi-room";

/** One extension for every clip, in one place. */
const EXT = ".mp3";

/**
 * Stage → clip. All five spoken stages are recorded.
 *
 * `rotate` arrived after the other four and was briefly the one stage that fell through to
 * synthesis — the fallback doing exactly its job while the recording was still to come, rather than
 * a gap papered over with a neighbouring clip that would have told the player to do the wrong thing.
 */
const CLIPS: Record<string, string> = {
  style: "Lumi-your-lack",
  reposition: "Lumi-happy-with-placement",
  rotate: "Lumi-that-looks-good",
  confirm: "Lumi-everything-is-ready",
  complete: "Lumi-lack-placed",
};

/**
 * The storage path for a guide stage's recorded line, or null when it has none.
 *
 * Null means "say it instead". Every spoken stage is recorded today, so the only stages that reach
 * it are `idle` — where the guide is not on screen at all — and any stage added later without a
 * recording. The test beside this file is what stops the second case from going unnoticed, rather
 * than a runtime branch nobody would ever see.
 */
export function roomGuideVoicePath(stage: string | undefined): string | null {
  if (!stage) return null;
  const clip = CLIPS[stage];
  return clip ? `${FOLDER}/${clip}${EXT}` : null;
}

/** The stages this table covers, for the test that checks it against the guide's own list. */
export function recordedRoomGuideStages(): string[] {
  return Object.keys(CLIPS);
}