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
// The same file the in-game HUD uses (game/ui/hud/hudIcons.ts), so the gear is one drawing everywhere.
export const SETTINGS_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/icon-settings.png");

// Blank, so the level is drawn over it as text. The fallback past the last numbered star, and the shop's lock badge
export const STAR_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/star-universal-icon.png");

export const XP_ICON: ImageSourcePropType = require("@/src/assets/ui/icons/icon-xp.png");

// Stars with the number baked into the artwork, indexed by level
/**
 * LEVEL -> the star that has THAT NUMBER PAINTED ON IT.
 *
 * THE FILENAMES DO NOT MATCH THEIR ARTWORK, and this table is the correction. Open the assets and
 * lvl-3.png has a 6 on it, lvl-6.png has a 3, lvl-4 has a 5 and lvl-5 has a 4 — the middle of the
 * set was exported in reverse. Levels 1 and 2 happen to be right.
 *
 *     file        drawn on it
 *     lvl-1  ->   1
 *     lvl-2  ->   2
 *     lvl-3  ->   6
 *     lvl-4  ->   5
 *     lvl-5  ->   4
 *     lvl-6  ->   3
 *
 * Mapped here rather than by renaming the files, deliberately: the names are referenced from the
 * room HUD, the profile page, both shop lock badges and the level-up card, and a rename would touch
 * every one of them plus anything outside this repo that expects them. The crossing looks wrong
 * because it IS wrong — the mismatch is in the artwork, and this is the single place that knows it.
 *
 * If the art is ever re-exported in order, straighten this table and delete this comment.
 */
const LEVEL_ICONS: Record<number, ImageSourcePropType> = {
  1: require("@/src/assets/ui/icons/lvl-1.png"),
  2: require("@/src/assets/ui/icons/lvl-2.png"),
  3: require("@/src/assets/ui/icons/lvl-6.png"),
  4: require("@/src/assets/ui/icons/lvl-5.png"),
  5: require("@/src/assets/ui/icons/lvl-4.png"),
  6: require("@/src/assets/ui/icons/lvl-3.png"),
};

// Null past the last numbered star, so callers fall back to STAR_ICON with the level drawn as text
export function levelIcon(level: number): ImageSourcePropType | null {
  return LEVEL_ICONS[level] ?? null;
}