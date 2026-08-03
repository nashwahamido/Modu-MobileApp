// Bundled icon art shared by more than one feature, resolved in one place so the room and
// the shop can never point at different files for the same thing.
import type { ImageSourcePropType } from "react-native";

export const COIN_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/Coins-icon.png");
// Note the space in the filename; that is how it is named on disk.
export const ASSEMBLE_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/Assemble-icon.png");

export const SHOP_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/Shop-icon.png");
export const INVENTORY_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/Inventory-icon.png");
export const VISIT_FRIENDS_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/VisitFriends-icon.png");
export const YOU_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/You-icon.png");
// Distinct from the older icon-settings.png, which the in-game HUD still uses.
export const SETTINGS_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/Settings-icon.png");

// Blank, so the level is drawn over it as text. Replaces the old level-1..5 files, which each
// had a number baked in and so could only ever cover the levels that had artwork
export const STAR_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/star-universal-icon.png");
