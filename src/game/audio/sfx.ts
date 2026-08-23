// The assembly task's sound effects.
//
// Players are created ONCE at module load, not through useAudioPlayer. A hook ties a player to a component's lifetime, and these are one-shots fired from a store subscription — the tap that ends a mallet strike must not depend on whichever control happens to be mounted. Creating them up front also means the first tap is not the one that pays for the decode.
//
// The .wav clips are still PLACEHOLDERS, synthesised for timing. The .mp3 ones are authored. Replacing a file needs no code change — everything is keyed by name.
import { createAudioPlayer, type AudioPlayer } from "expo-audio";

export type SfxName =
  | "tap"
  | "tick"
  | "seat"
  | "pickup"
  | "drop"
  | "stage"
  | "error"
  // Authored clips. `click` is the one that fires most often in the app, so it is mixed lowest.
  | "click"
  | "complete"
  | "clusterComplete"
  | "dropItem"
  | "levelUp"
  // The avatar recommendation landing. Its own name rather than reusing "complete": that one is the
  // build fanfare and would drift with it the next time the build's sound is retuned.
  | "recommendation";

const SOURCES: Record<SfxName, number> = {
  tap: require("@/src/assets/audio/sfx/tap.wav"),
  tick: require("@/src/assets/audio/sfx/tick.wav"),
  seat: require("@/src/assets/audio/sfx/seat.wav"),
  pickup: require("@/src/assets/audio/sfx/pickup.wav"),
  drop: require("@/src/assets/audio/sfx/drop.wav"),
  stage: require("@/src/assets/audio/sfx/stage.wav"),
  error: require("@/src/assets/audio/sfx/error.wav"),
  click: require("@/src/assets/audio/sfx/button-click.mp3"),
  complete: require("@/src/assets/audio/sfx/complete.mp3"),
  clusterComplete: require("@/src/assets/audio/sfx/cluster-complete.mp3"),
  dropItem: require("@/src/assets/audio/sfx/drop-item.mp3"),
  levelUp: require("@/src/assets/audio/sfx/level-up.mp3"),
  // Her cluster-complete clip, not complete.wav. Kept under its own NAME so the recommendation and
  // the stage fanfare can be retuned apart even while they share a file today.
  recommendation: require("@/src/assets/audio/sfx/cluster-complete.mp3"),
};

/** Per-effect volume, so the mix can be balanced without re-exporting audio. The ticks and taps fire
 *  many times a minute and sit well under the moments that only happen once. */
const GAIN: Record<SfxName, number> = {
  tap: 0.55,
  tick: 0.32,
  seat: 0.7,
  pickup: 0.4,
  drop: 0.35,
  stage: 0.75,
  // Deliberately quiet: it fires at the exact moment of a mistake, and a loud buzzer would
  // punish where the design wants a calm "not that one".
  error: 0.4,
  // A click rides under EVERY button in the app, several times a minute. It has to be present
  // without becoming the sound of the app. The clip was authored ~15 dB below the others and has
  // been lifted to match them, so this number is now doing what it says rather than compensating
  // for the file: at the original level, 0.28 put the click 25 dB under every other effect, which
  // on a phone speaker is silence.
  click: 0.45,
  // The two that mark the end of something. Loudest in the set, because they happen once.
  complete: 0.85,
  clusterComplete: 0.75,
  levelUp: 0.85,
  // Lands under a piece of furniture settling into a room, next to the placement animation rather
  // than on top of it.
  dropItem: 0.55,
  // A moment, not a reward: it lands under the avatar's pop rather than over it. TRIMMED from 0.7
  // when the source changed to her cluster-complete clip, which peaks 3.5 dB hotter than the
  // complete.wav it replaced — at the old number the recommendation would have arrived louder than
  // the build's own fanfare. 0.47 puts it back where it was by ear.
  recommendation: 0.47,
};

const players = new Map<SfxName, AudioPlayer>();

function playerFor(name: SfxName): AudioPlayer | null {
  const existing = players.get(name);
  if (existing) return existing;
  try {
    const source = SOURCES[name];
    // A NAME WITH NO SOURCE is the failure that looks exactly like "the sound does not work": the
    // call succeeds, nothing plays, and nothing is logged. It happens when sfx.ts and a caller are
    // out of step — a new effect wired up before its entry landed, or a stale bundle. Types cannot
    // catch it at runtime, and Metro strips them, so it is checked here.
    if (source === undefined) {
      if (__DEV__) console.warn(`[sfx] no source registered for "${name}" — nothing will play`);
      return null;
    }
    const p = createAudioPlayer(source);
    p.volume = GAIN[name];
    players.set(name, p);
    return p;
  } catch (err) {
    // Audio is a garnish. A device that cannot open a player still has to be able to build furniture
    // — but in dev it should say so rather than fail into silence.
    if (__DEV__) console.warn(`[sfx] could not create a player for "${name}"`, err);
    return null;
  }
}

/**
 * Fire an effect. Re-seeks to zero first, so a rapid sequence — the ticks of a screw, a run of mallet
 * taps — retriggers instead of being swallowed while the previous play is still running.
 */
export function playSfx(name: SfxName): void {
  const p = playerFor(name);
  if (!p) return;
  try {
    p.seekTo(0);
    p.play();
  } catch {
    // A play that fails mid-teardown is not worth surfacing.
  }
}

/** Warms the pool so the first interaction of a build is not the one that decodes. */
export function preloadSfx(): void {
  (Object.keys(SOURCES) as SfxName[]).forEach(playerFor);
}