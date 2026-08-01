import type {
  AccessibilitySettings,
  ControlGuidanceLevel,
} from "@/src/game/core/accessibility";

/** Single source of truth for the three Control companion support presets. */
export const CONTROL_GUIDANCE_PRESETS: Record<
  ControlGuidanceLevel,
  Partial<AccessibilitySettings>
> = {
  minimal: {
    softHints: false,
    audio: false,
    showInstructions: false,
    focusMode: false,
    showUiOverlay: false,
  },
  balanced: {
    softHints: false,
    audio: false,
    showInstructions: true,
    focusMode: false,
    showUiOverlay: true,
  },
  detailed: {
    softHints: true,
    audio: true,
    showInstructions: true,
    focusMode: true,
    showUiOverlay: true,
  },
};

export function controlGuidanceIsCustomized(
  settings: AccessibilitySettings,
): boolean {
  const preset = CONTROL_GUIDANCE_PRESETS[settings.controlGuidanceLevel];
  return Object.entries(preset).some(
    ([key, value]) => settings[key as keyof AccessibilitySettings] !== value,
  );
}
