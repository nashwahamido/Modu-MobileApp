// Bundled icon art shared by more than one feature, resolved in one place so the room and the shop can never point at different files for the same thing.
import type { ImageSourcePropType } from "react-native";

export const COIN_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/Coins-icon.png");
// Note the space in the filename; that is how it is named on disk.
export const ASSEMBLE_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/Assemble-icon.png");

export const SHOP_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/Shop-icon.png");
export const INVENTORY_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/Inventory-icon.png");
// The room, as a destination — the purchase popup's "place it now" choice.
export const HOME_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/icon-home.png");
export const VISIT_FRIENDS_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/VisitFriends-icon.png");
export const YOU_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/You-icon.png");
// Distinct from the older icon-settings.png, which the in-game HUD still uses.
export const SETTINGS_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/Settings-icon.png");

// Blank, so the level is drawn over it as text. The fallback past the last numbered star, and the shop's lock badge
export const STAR_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/star-universal-icon.png");

export const XP_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/icon-xp.png");

// Stars with the number baked into the artwork, indexed by level
const LEVEL_ICONS: Record<number, ImageSourcePropType> = {
  1: require("@/src/assets/ui/icons/lvl-1.png"),
  2: require("@/src/assets/ui/icons/lvl-2.png"),
  3: require("@/src/assets/ui/icons/lvl-3.png"),
  4: require("@/src/assets/ui/icons/lvl-4.png"),
  5: require("@/src/assets/ui/icons/lvl-5.png"),
  6: require("@/src/assets/ui/icons/lvl-6.png"),
};

// Null past the last numbered star, so callers fall back to STAR_ICON with the level drawn as text
export function levelIcon(level: number): ImageSourcePropType | null {
  return LEVEL_ICONS[level] ?? null;
}
