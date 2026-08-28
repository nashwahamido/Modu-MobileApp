// Default setting values, and the profiles (Helping Modes) that override them. How to add one, and why each snapDistance is what it is: README.

import { AccessibilitySettings } from "@/src/game/core/accessibility";
import { AssemblyMode, FurnitureId } from "@/src/game/core/type";
import { asFurnitureId } from "@/src/game/core/ids";

export const DEFAULT_SETTINGS: AccessibilitySettings = {
  textLevel: "standard",
  audio: false,
  // Both on: a quiet build is something a profile asks for explicitly.
  soundEffects: true,
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
  snapDistance: 0.14,
};

export type ProfileId = "visual" | "momentum" | "clearPath" | "control";

// Default onboarding task per profile; catalogue choices still override it.
// idk if we should keep this - Ge (every profile answers the same today)
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
    snapDistance: 0.14, // baseline: the most precision
  },
  // Visual, low-text, spatial, multimodal guidance.
  visual: {
    textLevel: "simple",
    audio: true,
    fontScale: 1.1,
    softHints: false,
    // dev-setting
    releaseBehavior: "autoReturn",
    snapDistance: 0.18, // wider: aiming by feel
  },

  // Motivation (adhd), short tasks, quick feedback, progress recovery.
  momentum: {
    focusMode: false,
    softHints: true,
    // dev-setting
    releaseBehavior: "float",
    snapDistance: 0.18, // wider: a near-miss should still seat
  },

  // Structured, predictable, step-by-step guidance (assembly mode: guide).
  clearPath: {
    textLevel: "standard",
    focusMode: true,
    softHints: true,
    manualTools: false,
    // dev-setting
    releaseBehavior: "autoReturn",
    snapDistance: 0.2, // the geometry-safe cap (SNAP_DIST_MAX)
  },
};

// The assembly gating each profile pins on apply.
export const PROFILE_MODE: Record<ProfileId, AssemblyMode> = {
  visual: "guide",
  momentum: "guide",
  clearPath: "guide",
  control: "free",
};

// The full settings a profile starts from.
export function settingsForProfile(id: ProfileId): AccessibilitySettings {
  return { ...DEFAULT_SETTINGS, ...PROFILE_DEFAULTS[id] };
}