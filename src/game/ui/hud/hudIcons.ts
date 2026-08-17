// The HUD's icon art, per theme.
//
// The light-theme icons are dark glyphs on cream chips; in dark mode that chrome inverts, so the
// same glyph would be dark-on-dark. These are the cream counterparts, drawn for the dark HUD.
//
// One registry rather than a `theme === "dark" ? a : b` at each call site: five components render
// these buttons, and the moment the choice is made per file they drift — one gets a dark variant,
// the next keeps the light one, and the row stops matching itself.
import type { ImageSourcePropType } from "react-native";
import { useGameStore } from "@/src/game/core/store";

export type HudIconName = "pause" | "undo" | "recenter" | "settings" | "tools" | "play" | "focus";

const LIGHT: Record<HudIconName, ImageSourcePropType> = {
  pause: require("@/src/assets/ui/icons/icon-pause.png"),
  undo: require("@/src/assets/ui/icons/icon-undo.png"),
  recenter: require("@/src/assets/ui/icons/icon-recenter.png"),
  settings: require("@/src/assets/ui/icons/icon-settings.png"),
  tools: require("@/src/assets/ui/icons/icon-tools.png"),
  play: require("@/src/assets/ui/icons/icon-play.png"),
  focus: require("@/src/assets/ui/icons/icon-focus.png"),
};

const DARK: Record<HudIconName, ImageSourcePropType> = {
  pause: require("@/src/assets/ui/icons/icon-pause-dark.png"),
  undo: require("@/src/assets/ui/icons/icon-undo-dark.png"),
  recenter: require("@/src/assets/ui/icons/icon-recenter-dark.png"),
  settings: require("@/src/assets/ui/icons/icon-settings-dark.png"),
  tools: require("@/src/assets/ui/icons/icon-tools-dark.png"),
  play: require("@/src/assets/ui/icons/icon-play-dark.png"),
  focus: require("@/src/assets/ui/icons/icon-focus-dark.png"),
};

/** The icon for a HUD control in the CURRENT theme. Dark art in dark mode, the original everywhere
 *  else — high-contrast rides with dark, since it shares the dark chrome. */
export function useHudIcon(name: HudIconName): ImageSourcePropType {
  const theme = useGameStore((s) => s.theme);
  return theme === "light" ? LIGHT[name] : DARK[name];
}

/** The same choice for code that already knows the theme and cannot call a hook. */
export function hudIcon(name: HudIconName, dark: boolean): ImageSourcePropType {
  return dark ? DARK[name] : LIGHT[name];
}