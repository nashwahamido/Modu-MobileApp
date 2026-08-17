// The assembly task's background music.
//
// A SINGLE player created lazily and kept at module scope, like sfx.ts and for the same reason: the
// track has to survive whichever screen or control happens to be mounted, and a hook would tie it to
// one component's lifetime.
//
// Deliberately NOT part of playSfx: effects are one-shots keyed by name, this is one long loop with
// its own volume and its own setting, and folding it into that table would make every caller of a
// tap sound reason about a music track.
import { createAudioPlayer, type AudioPlayer } from "expo-audio";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TRACK = require("@/src/assets/audio/music/assembly-theme.mp3");

/** The ceiling the setting scales against, NOT the volume itself: at 1.0 this track would compete
 *  with the taps and the spoken steps, so "full" in the UI means this much of the actual signal. */
const MUSIC_CEILING = 0.45;

/** The setting's own 0-1, applied through the ceiling above. */
let level = 0.5;

let player: AudioPlayer | null = null;
let wanted = false;

function ensure(): AudioPlayer | null {
  if (player) return player;
  try {
    player = createAudioPlayer(TRACK);
    player.loop = true;
    player.volume = level * MUSIC_CEILING;
  } catch {
    // Audio is a nicety: a device that refuses the player should still build furniture.
    player = null;
  }
  return player;
}

/** Start the loop, or resume it if paused. Safe to call repeatedly. */
export function startMusic() {
  wanted = true;
  const p = ensure();
  if (!p) return;
  try {
    if (!p.playing) p.play();
  } catch {
    /* ignore — see ensure() */
  }
}

/** Pause and rewind. Rewinds because the build screen is somewhere you LEAVE, not a track to resume
 *  mid-phrase three sessions later. */
export function stopMusic() {
  wanted = false;
  if (!player) return;
  try {
    player.pause();
    player.seekTo(0);
  } catch {
    /* ignore */
  }
}

/** Set the level (0-1) live — a drag on the slider should be audible while it moves, not on the next
 *  screen. Kept even while stopped, so starting again uses the level the player chose. */
export function setMusicVolume(next: number) {
  level = Math.min(1, Math.max(0, next));
  if (player) {
    try {
      player.volume = level * MUSIC_CEILING;
    } catch {
      /* ignore */
    }
  }
}

/** Follow the setting: called when the toggle flips and when the build screen mounts or unmounts. */
export function setMusicEnabled(on: boolean) {
  if (on) startMusic();
  else stopMusic();
}

/** Whether the loop is meant to be running. */
export function musicWanted() {
  return wanted;
}