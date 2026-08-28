// The accessibility settings — types only. Default values and the profiles that override them live in profile.ts. See README.

import { TextLevel } from "@/src/game/core/type";

// --------------- interaction axes
// dev-setting
// "autoReturn" sends a part released away from a socket back to the tray; "float" leaves it where you set it down.
export type ReleaseBehavior = "float" | "autoReturn";

// --------------- the settings
export interface AccessibilitySettings {
  textLevel: TextLevel;
  audio: boolean; // the spoken instruction clips
  soundEffects: boolean; // taps, detents, seating, finishing
  music: boolean; // AMBIENT music: everywhere that is not a build
  musicVolume: number; // 0-1
  buildMusic: boolean; // ASSEMBLY music: the build screens only
  buildMusicVolume: number; // 0-1
  softHints: boolean; // FREE-mode nudge when reaching for a not-yet-available part
  manualTools: boolean; // player equips the tool; off = the system does
  showInstructions: boolean; // step text in the top bar
  focusMode: boolean; // current part + action only, rest of the chrome hidden
  fontScale: number;

  // dev-setting
  releaseBehavior: ReleaseBehavior;
  snapDistance: number; // snap ACCEPTANCE radius in meters; consumers clamp to ≤0.2
}
