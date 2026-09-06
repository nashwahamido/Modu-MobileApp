import type { ImageSourcePropType } from "react-native";
import { useThemeId } from "@/src/game/ui/system/theme";

export type HudIconName =
  | "pause"
  | "undo"
  | "recenter"
  | "settings"
  | "tools"
  | "play"
  | "focus"
  | "soundOn"
  | "soundOff";

const LIGHT: Record<HudIconName, ImageSourcePropType> = {
  pause: require("@/src/assets/ui/icons/icon-pause.png"),
  undo: require("@/src/assets/ui/icons/icon-undo.png"),
  recenter: require("@/src/assets/ui/icons/icon-recenter.png"),
  settings: require("@/src/assets/ui/icons/icon-settings.png"),
  tools: require("@/src/assets/ui/icons/icon-tools.png"),
  play: require("@/src/assets/ui/icons/icon-play.png"),
  focus: require("@/src/assets/ui/icons/icon-focus.png"),
  soundOn: require("@/src/assets/ui/icons/icon-sound-on.png"),
  soundOff: require("@/src/assets/ui/icons/icon-sound-off.png"),
};

const DARK: Record<HudIconName, ImageSourcePropType> = {
  pause: require("@/src/assets/ui/icons/icon-pause-dark.png"),
  undo: require("@/src/assets/ui/icons/icon-undo-dark.png"),
  recenter: require("@/src/assets/ui/icons/icon-recenter-dark.png"),
  settings: require("@/src/assets/ui/icons/icon-settings-dark.png"),
  tools: require("@/src/assets/ui/icons/icon-tools-dark.png"),
  play: require("@/src/assets/ui/icons/icon-play-dark.png"),
  focus: require("@/src/assets/ui/icons/icon-focus-dark.png"),
  soundOn: require("@/src/assets/ui/icons/icon-sound-on-dark.png"),
  soundOff: require("@/src/assets/ui/icons/icon-sound-off-dark.png"),
};

export function useHudIcon(name: HudIconName): ImageSourcePropType {
  const theme = useThemeId();
  return theme === "light" ? LIGHT[name] : DARK[name];
}

export function hudIcon(name: HudIconName, dark: boolean): ImageSourcePropType {
  return dark ? DARK[name] : LIGHT[name];
}