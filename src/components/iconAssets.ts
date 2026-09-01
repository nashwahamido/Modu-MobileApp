import type { ImageSourcePropType } from "react-native";

export const COIN_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/Coins-icon.png");
export const ASSEMBLE_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/Assemble-icon.png");

export const SHOP_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/Shop-icon.png");
export const INVENTORY_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/Inventory-icon.png");
export const HOME_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/icon-home.png");
export const VISIT_FRIENDS_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/VisitFriends-icon.png");
export const YOU_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/You-icon.png");
export const SETTINGS_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/icon-settings.png");

export const STAR_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/star-universal-icon.png");

export const XP_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/icon-xp.png");

const LEVEL_ICONS: Record<number, ImageSourcePropType> = {
  1: require("@/src/assets/ui/icons/lvl-1.png"),
  2: require("@/src/assets/ui/icons/lvl-2.png"),
  3: require("@/src/assets/ui/icons/lvl-3.png"),
  4: require("@/src/assets/ui/icons/lvl-4.png"),
  5: require("@/src/assets/ui/icons/lvl-5.png"),
  6: require("@/src/assets/ui/icons/lvl-6.png"),
};

export function levelIcon(level: number): ImageSourcePropType | null {
  return LEVEL_ICONS[level] ?? null;
}