import { createAudioPlayer, type AudioPlayer } from "expo-audio";

export type MusicTrackId = "assembly" | "ambient" | "onboarding";

const SOURCES: Record<MusicTrackId, number> = {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  assembly: require("@/src/assets/audio/music/assembly-theme.mp3"),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ambient: require("@/src/assets/audio/music/room-theme.mp3"),
  onboarding: require("@/src/assets/audio/music/onboarding-theme.mp3"),
};

const TRIM: Record<MusicTrackId, number> = {
  assembly: 1,
  ambient: 1,
  onboarding: 0.6,
};

const MUSIC_CEILING = 0.45;

const players: Partial<Record<MusicTrackId, AudioPlayer>> = {};
const levels: Record<MusicTrackId, number> = { assembly: 0.5, ambient: 0.5, onboarding: 0.5 };
const enabled: Record<MusicTrackId, boolean> = { assembly: true, ambient: true, onboarding: true };
let current: MusicTrackId | null = null;

function playerFor(id: MusicTrackId): AudioPlayer | null {
  const existing = players[id];
  if (existing) return existing;
  try {
    const p = createAudioPlayer(SOURCES[id]);
    p.loop = true;
    p.volume = levels[id] * MUSIC_CEILING * TRIM[id];
    players[id] = p;
    return p;
  } catch {
    return null;
  }
}

function apply() {
  for (const id of Object.keys(SOURCES) as MusicTrackId[]) {
    const p = players[id];
    const shouldPlay = enabled[id] && current === id;
    if (shouldPlay) {
      const target = playerFor(id);
      if (target) {
        try {
          target.volume = levels[id] * MUSIC_CEILING * TRIM[id];
          if (!target.playing) target.play();
        } catch {
        }
      }
    } else if (p) {
      try {
        p.pause();
        if (current !== id) p.seekTo(0);
      } catch {
      }
    }
  }
}

export function setMusicTrack(track: MusicTrackId | null) {
  if (current === track) return;
  current = track;
  apply();
}

export function setMusicEnabled(track: MusicTrackId, on: boolean) {
  enabled[track] = on;
  apply();
}

export function setMusicVolume(track: MusicTrackId, next: number) {
  const safe = Number.isFinite(next) ? next : 0.5;
  levels[track] = Math.min(1, Math.max(0, safe));
  apply();
}

export function stopMusic() {
  current = null;
  apply();
}