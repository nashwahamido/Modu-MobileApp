// Default setting values, and the profiles (Helping Modes) that override them.

// A profile is a set of default-value overrides picked during onboarding — the user can still change any individual setting later in the settings panel. Add a profile by adding an entry to PROFILE_DEFAULTS (+ PROFILE_MODE if it pins an assembly mode). (Later, profiles may also drive which settings the quick panel shows; keep that in the UI, keyed on ProfileId.)

// Spec features NOT yet in the engine are tracked in MERGE_PLAN (profile gaps).

import { AccessibilitySettings } from "@/src/game/core/accessibility";
import { AssemblyMode, FurnitureId } from "@/src/game/core/type";
import { asFurnitureId } from "@/src/game/core/ids";

export const DEFAULT_SETTINGS: AccessibilitySettings = {
  textLevel: "standard",
  audio: false,
  // On by default: effects are expected in a game, and unlike narration they do not talk over anything. Profiles that need a quiet build turn it off explicitly.
  soundEffects: true,
  // On by default: the build is a long, quiet task, and the track is what makes it feel like a place
  // rather than a form. It sits well under the effects and can be turned down without turning off.
  music: true,
  musicVolume: 0.5,
  buildMusic: true,
  buildMusicVolume: 0.5,
  softHints: true,
  showInstructions: true,
  manualTools: false,
  focusMode: false,
  fontScale: 1,

  // dev-setting
  releaseBehavior: "autoReturn",
  lightingPreset: "auto",
  snapDistance: 0.14,
  dragPlane: "adaptive",
};

export type ProfileId = "visual" | "momentum" | "clearPath" | "control";

/** Default onboarding task for each support profile. Catalogue choices still override this. */
// idk if we should keep this - Ge
export function furnitureForProfile(profile: ProfileId): FurnitureId {
  return asFurnitureId("dalfred-stool");
}

export const PROFILE_DEFAULTS: Record<ProfileId, Partial<AccessibilitySettings>> = {
  // Autonomy and adjustable guidance: the DEFAULT profile at launch.
  control: {
    showInstructions: false,
    focusMode: false,
    softHints: true,
    manualTools: true,
    // dev-setting
    releaseBehavior: "autoReturn",
    snapDistance: 0.14, // baseline: the magnet reaches no further than the default — this profile asks for the most precision.
  },
  // Visual, low-text, spatial, multimodal guidance.
  visual: {
    textLevel: "simple",
    audio: true,
    fontScale: 1.1,
    softHints: false,
    // dev-setting
    releaseBehavior: "autoReturn",
    snapDistance: 0.18, // wider than baseline: aiming is done by feel here, so the magnet takes over sooner.
  },

  // Motivation (adhd), short tasks, quick feedback, progress recovery.
  momentum: {
    focusMode: false,
    softHints: true,
    // dev-setting
    releaseBehavior: "float",
    snapDistance: 0.18, // wider than baseline: quick, low-effort placement — a near-miss should still seat.
  },

  // Structured, predictable, step-by-step guidance (assembly mode: guide).
  clearPath: {
    textLevel: "standard",
    focusMode: true,
    softHints: true,
    manualTools: false,
    // dev-setting
    releaseBehavior: "autoReturn",
    snapDistance: 0.2, // the most forgiving fit, at the geometry-safe cap (SNAP_DIST_MAX) — one step at a time, so a socket is rarely contested.
  },
};

/** Assembly gating each profile pins on apply (all deterministic). */
export const PROFILE_MODE: Record<ProfileId, AssemblyMode> = {
  visual: "guide",
  momentum: "guide",
  clearPath: "guide",
  control: "free",
};

/** The full settings a profile starts from. */
export function settingsForProfile(id: ProfileId): AccessibilitySettings {
  return { ...DEFAULT_SETTINGS, ...PROFILE_DEFAULTS[id] };
}