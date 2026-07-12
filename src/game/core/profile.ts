// Default setting values, and the profiles (Helping Modes) that override them.

// A profile is a set of default-value overrides picked during onboarding — the user can still change any individual setting later in the settings panel. Add a profile by adding an entry to PROFILE_DEFAULTS (+ PROFILE_MODE if it pins an assembly mode). (Later, profiles may also drive which settings the quick panel shows; keep that in the UI, keyed on ProfileId.)

// Spec features NOT yet in the engine are tracked in MERGE_PLAN (profile gaps).

import { AccessibilitySettings } from "@/src/game/core/accessibility";
import { AssemblyMode } from "@/src/game/core/type";

export const DEFAULT_SETTINGS: AccessibilitySettings = {
  textLevel: "standard",
  audio: false,
  softHints: true,
  showInstructions: true,
  manualTools: false,
  focusMode: false,
  autoView: false,
  fontScale: 1,

  // dev-setting
  snapStyle: "magnetic",
  ghostStyle: "movingGhost",
  releaseBehavior: "autoReturn",
  lightingPreset: "auto",
  toonShader: false,
  snapDistance: 0.14,
  canvasStrafe: false,
  dragPlane: "adaptive",
};

export type ProfileId = "visual" | "momentum" | "clearPath" | "control";

export const PROFILE_DEFAULTS: Record<ProfileId, Partial<AccessibilitySettings>> = {
  // Autonomy and adjustable guidance: the DEFAULT profile at launch.
  control: {
    showInstructions: false,
    focusMode: false,
    autoView: false,
    softHints: true,
    manualTools: true,
    // dev-setting
    snapStyle: "magnetic",
    ghostStyle: "movingGhost",
    releaseBehavior: "autoReturn",
  },
  // Visual, low-text, spatial, multimodal guidance.
  visual: {
    textLevel: "simple",
    audio: true,
    fontScale: 1.1,
    autoView: true,
    softHints: false,
    // dev-setting
    ghostStyle: "staticSockets",
    snapStyle: "magnetic",
    releaseBehavior: "autoReturn",
  },

  // Motivation (adhd), short tasks, quick feedback, progress recovery.
  momentum: {
    focusMode: false,
    autoView: false,
    softHints: true,
    // dev-setting
    snapStyle: "onRelease",
    ghostStyle: "staticSockets",
    releaseBehavior: "float",
    snapDistance: 0.18,
    canvasStrafe: true,
    dragPlane: "level", // her engine: drag on a horizontal plane at the target's height
  },

  // Structured, predictable, step-by-step guidance (assembly mode: guide).
  clearPath: {
    textLevel: "standard",
    focusMode: true,
    autoView: true,
    softHints: true,
    manualTools: false,
    // dev-setting
    snapStyle: "magnetic",
    ghostStyle: "movingGhost",
    releaseBehavior: "autoReturn",
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