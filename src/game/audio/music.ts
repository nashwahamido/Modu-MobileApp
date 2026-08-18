// The app's background music: two tracks, one player each, switched by ROUTE.
//
// Players are created lazily and kept at module scope, like sfx.ts and for the same reason: the
// music has to survive whichever screen is mounted, and a hook would tie it to one component's
// lifetime. Deliberately not part of playSfx — effects are one-shots keyed by name; these are long
// loops with their own level and their own setting.
//
// WHY A REGISTRY rather than a play/stop call per screen: the two tracks must never overlap, and
// the only way to guarantee that is for one place to own "which track is playing". Screens declare
// where they are (see useRouteMusic); this decides what that means.
import { createAudioPlayer, type AudioPlayer } from "expo-audio";

export type MusicTrackId = "assembly" | "ambient";

const SOURCES: Record<MusicTrackId, number> = {
  // The build's own theme: workshop-ish, steady, meant to sit under a long focused task.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  assembly: require("@/src/assets/audio/music/assembly-theme.mp3"),
  // Everywhere else — the room, the catalogue, the profile, the shop.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ambient: require("@/src/assets/audio/music/room-theme.mp3"),
};

/** The ceiling the setting scales against, NOT the volume itself: at 1.0 either track would compete
 *  with the taps and the spoken steps, so "100%" in the UI means this much of the actual signal. */
const MUSIC_CEILING = 0.45;

const players: Partial<Record<MusicTrackId, AudioPlayer>> = {};
// PER TRACK, not global: assembly music is set in the build's own settings and ambient music in the
// General tab, and a player who silences one usually means only that one.
const levels: Record<MusicTrackId, number> = { assembly: 0.5, ambient: 0.5 };
const enabled: Record<MusicTrackId, boolean> = { assembly: true, ambient: true };
let current: MusicTrackId | null = null;

function playerFor(id: MusicTrackId): AudioPlayer | null {
  const existing = players[id];
  if (existing) return existing;
  try {
    const p = createAudioPlayer(SOURCES[id]);
    p.loop = true;
    p.volume = levels[id] * MUSIC_CEILING;
    players[id] = p;
    return p;
  } catch {
    // Audio is a nicety: a device that refuses the player should still build furniture.
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
          target.volume = levels[id] * MUSIC_CEILING;
          if (!target.playing) target.play();
        } catch {
          /* ignore */
        }
      }
    } else if (p) {
      try {
        p.pause();
        // Rewind the one we LEFT: a track resumed three screens later mid-phrase sounds like a bug.
        if (current !== id) p.seekTo(0);
      } catch {
        /* ignore */
      }
    }
  }
}

/** Which track this part of the app wants — or null for silence (onboarding). */
export function setMusicTrack(track: MusicTrackId | null) {
  if (current === track) return;
  current = track;
  apply();
}

/** The on/off setting for ONE track. Zero volume counts as off — see the settings meter. */
export function setMusicEnabled(track: MusicTrackId, on: boolean) {
  enabled[track] = on;
  apply();
}

/** Set ONE track's level (0-1) live: a change should be audible while the finger is still on the
 *  control.
 *
 *  GUARDED against a non-finite value: a settings object written before these fields existed hands
 *  in `undefined`, Math.max turns that into NaN, and a NaN volume plays SILENTLY while every other
 *  signal — the toggle, the route, the player — still looks correct. Falling back to the default
 *  means an old profile plays rather than mysteriously not. */
export function setMusicVolume(track: MusicTrackId, next: number) {
  const safe = Number.isFinite(next) ? next : 0.5;
  levels[track] = Math.min(1, Math.max(0, safe));
  apply();
}

/** Stop everything — for a sign-out or a hard reset. Screens should use setMusicTrack(null). */
export function stopMusic() {
  current = null;
  apply();
}