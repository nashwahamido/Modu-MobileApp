// Where the onboarding voiceover lives in storage, DERIVED rather than listed.
//
// The clips are named on a strict pattern, so a path is an expression and not a lookup table:
//
//   onboarding/Intro-hey.mp3          the greeting and the handedness question, spoken as one
//   onboarding/Q3/Q3.mp3              question 3's prompt
//   onboarding/Q3/Q3-Opt2.mp3         question 3's SECOND answer
//
// That matters because a table would have to be kept in step with the bucket by hand, and the way
// it fails is silent: a mistyped key is a voice button that does nothing, on the first screen a new
// player sees. Derivation means adding a sixth question needs no code at all — only the recording.
// Same reasoning as data/catalog/assets.ts, which derives catalog paths from id + variation.
//
// PURE — no supabase import — so the builders can be unit-tested and so nothing here needs a client
// to reason about a path. Resolving a URL is the caller's job:
//   supabase.storage.from(VOICEOVER_BUCKET).getPublicUrl(introPath())

export const VOICEOVER_BUCKET = "Voiceover";

/** The onboarding subtree. Lowercase, unlike the Q folders inside it — storage paths are
 *  case-sensitive, so this is transcribed from the bucket rather than normalised to look tidy. */
const ROOT = "onboarding";

/** One extension for every clip, in one place. */
const EXT = ".mp3";

/** Questions are ONE-BASED in storage (Q1…Q5) where they are zero-based in `questions`, and options
 *  the same (Opt1…Opt3 against index 0…2). Every builder below takes the ARRAY index and does the
 *  conversion itself, so no caller has to remember to add one — that off-by-one is exactly the kind
 *  of mistake that would play the wrong answer's audio without ever throwing. */
const oneBased = (index: number): number => index + 1;

/** The greeting plus the handedness question — one recording, because the screen speaks them as one line. */
export function introPath(): string {
  return `${ROOT}/Intro-hey${EXT}`;
}

/** A question's prompt. `index` is its position in `questions`. */
export function promptPath(index: number): string {
  const q = oneBased(index);
  return `${ROOT}/Q${q}/Q${q}${EXT}`;
}

/** One answer of one question. Both arguments are ARRAY indices, matching `questions[index].options`. */
export function optionPath(index: number, optionIndex: number): string {
  const q = oneBased(index);
  return `${ROOT}/Q${q}/Q${q}-Opt${oneBased(optionIndex)}${EXT}`;
}

/** The companions' own subtree. Beside `onboarding` rather than inside it: the same four clips
 *  introduce the avatars wherever that happens, and only the recommendation screen plays them today. */
const AVATARS_ROOT = "avatars";

/**
 * A companion's introduction, spoken on the avatar recommendation screen.
 *
 * DERIVED from the name, because the four clips are named for the four companions exactly as
 * avatarModes.ts spells them — Felix, Lumi, Pebble, Sparky — capital included. That is a real
 * scheme rather than a coincidence, so a fifth companion needs a recording and no code.
 *
 * Takes the NAME and not the ModeId on purpose: the storage names follow the character, and mapping
 * "clearPath" to "Pebble" here would put a second copy of that pairing next to the one avatarModes
 * already owns. Callers hold the mode's own record and pass `avatarName` off it.
 */
export function avatarPath(avatarName: string): string {
  return `${AVATARS_ROOT}/${avatarName}${EXT}`;
}