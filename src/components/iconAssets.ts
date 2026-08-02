// Bundled icon art shared by more than one feature, resolved in one place so the room and
// the shop can never point at different files for the same thing.
import type { ImageSourcePropType } from "react-native";

export const COIN_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/Coins-icon.png");
// Note the space in the filename; that is how it is named on disk.
export const ASSEMBLE_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/Assemble -icon.png");

export const SHOP_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/Shop-icon.png");
export const INVENTORY_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/Inventory-icon.png");
export const VISIT_FRIENDS_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/Visit Friends-icon.png");
export const YOU_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/You-icon.png");
// Distinct from the older icon-settings.png, which the in-game HUD still uses.
export const SETTINGS_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/Settings-icon.png");

// Each star has its number baked into the artwork, so there is one file per level.
const LEVEL_ICONS: Record<number, ImageSourcePropType> = {
  1: require("@/src/assets/ui/icons/level-1.png"),
  2: require("@/src/assets/ui/icons/level-2.png"),
  3: require("@/src/assets/ui/icons/level-3.png"),
  4: require("@/src/assets/ui/icons/level-4.png"),
  5: require("@/src/assets/ui/icons/level-5.png"),
};

/** The star for a level, or null when there is none. Null rather than clamping to the
 *  nearest file, which would display a confidently wrong number. */
export function levelIcon(level: number): ImageSourcePropType | null {
  return LEVEL_ICONS[level] ?? null;
}
