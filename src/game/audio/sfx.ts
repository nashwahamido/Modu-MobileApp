import { createAudioPlayer, type AudioPlayer } from "expo-audio";

export type SfxName =
  | "tap"
  | "tick"
  | "seat"
  | "pickup"
  | "drop"
  | "stage"
  | "error"
  | "click"
  | "complete"
  | "clusterComplete"
  | "dropItem"
  | "levelUp"
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
  recommendation: require("@/src/assets/audio/sfx/cluster-complete.mp3"),
};

const GAIN: Record<SfxName, number> = {
  tap: 0.55,
  tick: 0.32,
  seat: 0.7,
  pickup: 0.4,
  drop: 0.35,
  stage: 0.75,
  error: 0.4,
  click: 0.45,
  complete: 0.85,
  clusterComplete: 0.75,
  levelUp: 0.85,
  dropItem: 0.55,
  recommendation: 0.47,
};

const players = new Map<SfxName, AudioPlayer>();

function playerFor(name: SfxName): AudioPlayer | null {
  const existing = players.get(name);
  if (existing) return existing;
  try {
    const source = SOURCES[name];
    if (source === undefined) {
      if (__DEV__) console.warn(`[sfx] no source registered for "${name}" — nothing will play`);
      return null;
    }
    const p = createAudioPlayer(source);
    p.volume = GAIN[name];
    players.set(name, p);
    return p;
  } catch (err) {
    if (__DEV__) console.warn(`[sfx] could not create a player for "${name}"`, err);
    return null;
  }
}

export function playSfx(name: SfxName): void {
  const p = playerFor(name);
  if (!p) return;
  try {
    p.seekTo(0);
    p.play();
  } catch {
  }
}

export function preloadSfx(): void {
  (Object.keys(SOURCES) as SfxName[]).forEach(playerFor);
}