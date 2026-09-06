// The accessibility settings — types only. Default values and the profiles that override them live in profile.ts.

import { TextLevel } from "@/src/game/core/type";

// =============  Interaction axes ================

// dev-setting - removed
export type ReleaseBehavior = "float" | "autoReturn";
/** Lighting rig: "auto" = each render style's natural rig; the rest force a mood. */
export type LightingPreset = "auto" | "studio" | "warm" | "soft" | "golden";

export type DragPlane = "adaptive" | "level"; //only adaptive now

// ===============  The settings =================
export interface AccessibilitySettings {
  textLevel: TextLevel;
  audio: boolean;
  soundEffects: boolean;
  music: boolean;
  musicVolume: number;
  buildMusic: boolean;
  buildMusicVolume: number;
  softHints: boolean;
  manualTools: boolean;
  showInstructions: boolean;
  focusMode: boolean;
  fontScale: number;

  // dev-setting
  releaseBehavior: ReleaseBehavior;
  lightingPreset: LightingPreset;
  snapDistance: number;
  dragPlane: DragPlane;
}
