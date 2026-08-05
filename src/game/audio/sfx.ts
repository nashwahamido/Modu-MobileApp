// The assembly task's sound effects.
//
// Players are created ONCE at module load, not through useAudioPlayer. A hook ties a player to a component's lifetime, and these are one-shots fired from a store subscription — the tap that ends a mallet strike must not depend on whichever control happens to be mounted. Creating them up front also means the first tap is not the one that pays for the decode.
//
// The clips shipped here are PLACEHOLDERS, synthesised for timing. Replace the files; nothing in the code needs to change, because everything is keyed by name.
import { createAudioPlayer, type AudioPlayer } from "expo-audio";

export type SfxName =
  | "tap"
  | "tick"
  | "seat"
  | "pickup"
  | "drop"
  | "stage";

const SOURCES: Record<SfxName, number> = {
  tap: require("@/src/assets/audio/sfx/tap.wav"),
  tick: require("@/src/assets/audio/sfx/tick.wav"),
  seat: require("@/src/assets/audio/sfx/seat.wav"),
  pickup: require("@/src/assets/audio/sfx/pickup.wav"),
  drop: require("@/src/assets/audio/sfx/drop.wav"),
  stage: require("@/src/assets/audio/sfx/stage.wav"),
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
};

const players = new Map<SfxName, AudioPlayer>();

function playerFor(name: SfxName): AudioPlayer | null {
  const existing = players.get(name);
  if (existing) return existing;
  try {
    const p = createAudioPlayer(SOURCES[name]);
    p.volume = GAIN[name];
    players.set(name, p);
    return p;
  } catch {
    // Audio is a garnish. A device that cannot open a player still has to be able to build furniture.
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