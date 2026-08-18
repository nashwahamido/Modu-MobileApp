// One purchasable tile in the shop popup: price badge, picture well, name
import { StyleSheet, Image, Pressable, Text, View } from "react-native";

import { CatalogThumb } from "@/src/components/CatalogThumb";
import type { ItemSource } from "@/src/data/catalog/assets";
import { COIN_ICON, STAR_ICON } from "@/src/components/iconAssets";
import { CREAM, useFixedStyles, LEXEND } from "@/src/game/ui/system/theme";
import type { Theme } from "@/src/game/ui/system/theme";

// Well height as a fraction of the tile's width; the grid owns the width
const WELL_ASPECT = 0.79;
// Room for the price badge to overhang the well's top-left without clipping. Its twin uses the same pad for its brand mark, so the two grids' wells start on the same line.
const WELL_TOP_PAD = 14;
// How far the price pill is tucked under the coin, so it reads as flowing out of it
const PRICE_TUCK = 26;
// Shared by the price and owned pills, so the two read as the same component
const PILL_HEIGHT = 19;
const PILL_RADIUS = 10;
const PILL_BORDER = 0.6;
const COIN_SIZE = 34;
// Negative = left. The coin PNG has transparent margin, so the white you can see starts left of where the geometry says, and a centred number reads right of centre.
const PRICE_TEXT_NUDGE_X = -3;
// Where the price PILL lands inside the badge row: the coin is taller, so the row centres the pill rather than sitting it flush at the top.
const BADGE_LEFT = -6;
const PILL_TOP = (COIN_SIZE - PILL_HEIGHT) / 2;
const PILL_LEFT = BADGE_LEFT + COIN_SIZE - PRICE_TUCK;
// Matches the price badge's overall footprint, coin included
const OWNED_WIDTH = 70;

export function ShopItemTile({
  itemId,
  name,
  price,
  width,
  surface,
  source = "bought",
  owned,
  lockLevel,
  onPress,
  disabled,
}: {
  /** Catalog id, for the well's picture */
  itemId: string;
  name: string;
  price: number;
  /** Column width handed down by the grid */
  width: number;
  /** A wallpaper or a floor, whose picture is its own tile image rather than a variation's render */
  surface?: boolean;
  /**
   * Which room/<source>/ subtree this item's picture lives under. Defaults to "bought", which every item_buy
   * row is — and which used to be hardcoded here, on the reasoning that "the shop IS the item_buy catalogue".
   * That stopped being true when getShopItems started appending testing workshop_drafts: their assets sit
   * under room/workshop/, so the hardcoded value built a URL into the published subtree for something that has
   * not been published, 404'd, and CatalogThumb rendered nothing. ShopItem.source has carried the right answer
   * the whole time (see its own comment in data/shop/items.ts, which predicts exactly this failure) — the tile
   * simply was not asking for it.
   */
  source?: ItemSource;
  owned?: boolean;
  /** Required level, when the player is below it. Undefined = unlocked */
  lockLevel?: number;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const s = useFixedStyles(makeStyles);
  const locked = lockLevel !== undefined;
  const wellHeight = Math.round(width * WELL_ASPECT);
  return (
    <Pressable
      accessibilityRole="button"
      // One control, so its label carries everything the visuals say
      accessibilityLabel={
        `${name}, ${price} coins` +
        (owned ? ", owned" : "") +
        (locked ? `, locked until level ${lockLevel}` : "")
      }
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [s.tile, { width }, pressed && !disabled && s.tilePressed]}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={s.wellWrap}>
        <View style={[s.well, { width, height: wellHeight }]} />

        {/* Directly over the well and under everything else, so the veil dims a locked item's picture and the price badge stays on top of it. Not interactive: the whole tile is the one control. */}
        <View style={[s.art, { height: wellHeight }]} pointerEvents="none">
          <CatalogThumb source={source} itemId={itemId} surface={surface} size={wellHeight} />
        </View>

        {/* A tint, not a blur — RN has no blur without a native module */}
        {locked ? <View style={s.veil} pointerEvents="none" /> : null}
        {locked ? (
          <View style={s.lockBadge} pointerEvents="none">
            <Image source={STAR_ICON} style={s.lockStar} resizeMode="contain" />
            <Text style={s.lockLevel}>{lockLevel}</Text>
          </View>
        ) : null}

        {/* Last, so it stays legible over the veil on a locked tile */}
        {owned ? (
          <View style={s.ownedBadge}>
            <Text style={s.ownedText}>owned</Text>
          </View>
        ) : (
          <View style={s.priceBadge}>
            <Image source={COIN_ICON} style={s.priceIcon} resizeMode="contain" />
            <View style={s.pricePill}>
              <Text style={s.priceText}>{price}</Text>
            </View>
          </View>
        )}
      </View>

      <Text style={s.name} numberOfLines={1}>
        {name}
      </Text>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    tile: {
      marginBottom: 18,
    },
    tilePressed: {
      opacity: 0.7,
    },
    // Top padding gives the price badge room to overhang without clipping
    wellWrap: {
      paddingTop: WELL_TOP_PAD,
    },
    well: {
      borderRadius: 6,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: t.border,
    },
    // Spans the well and centres the art in it; the height is the well's, passed inline
    art: {
      position: "absolute",
      top: WELL_TOP_PAD,
      left: 0,
      right: 0,
      alignItems: "center",
      justifyContent: "center",
    },
    veil: {
      ...StyleSheet.absoluteFillObject,
      top: WELL_TOP_PAD,
      borderRadius: 6,
      backgroundColor: "#DFD7CA",
      opacity: 0.72,
    },
    lockBadge: {
      ...StyleSheet.absoluteFillObject,
      top: WELL_TOP_PAD,
      alignItems: "center",
      justifyContent: "center",
    },
    // Absolute, so it centres on the star
    lockLevel: {
      position: "absolute",
      ...LEXEND.bold,
      fontSize: 17,
      color: CREAM.card,
    },
    priceBadge: {
      position: "absolute",
      left: BADGE_LEFT,
      top: 0,
      flexDirection: "row",
      alignItems: "center",
    },
    // zIndex keeps the coin on top of the pill tucked under it
    priceIcon: {
      zIndex: 2,
      width: COIN_SIZE,
      height: COIN_SIZE,
    },
    lockStar: {
      width: 58,
      height: 58,
    },
    // paddingLeft = tuck + paddingRight, so the number centres in the visible part
    pricePill: {
      marginLeft: -PRICE_TUCK,
      minWidth: 54,
      height: PILL_HEIGHT,
      borderRadius: PILL_RADIUS,
      paddingLeft: PRICE_TUCK + 8,
      paddingRight: 8,
      backgroundColor: CREAM.card,
      borderWidth: PILL_BORDER,
      borderColor: CREAM.hairline,
      alignItems: "center",
      justifyContent: "center",
    },
    priceText: {
      ...LEXEND.bold,
      fontSize: 11,
      color: CREAM.ink,
      transform: [{ translateX: PRICE_TEXT_NUDGE_X }],
    },
    // Replaces the price badge outright, aligned to where the price PILL sits
    ownedBadge: {
      position: "absolute",
      left: PILL_LEFT,
      top: PILL_TOP,
      width: OWNED_WIDTH,
      height: PILL_HEIGHT,
      borderRadius: PILL_RADIUS,
      backgroundColor: "#D9EDBA",
      borderWidth: PILL_BORDER,
      borderColor: "#B5C996",
      alignItems: "center",
      justifyContent: "center",
    },
    ownedText: {
      ...LEXEND.bold,
      fontSize: 11,
      color: CREAM.ink,
    },
    name: {
      marginTop: 8,
      ...LEXEND.regular,
      fontSize: 14,
      color: CREAM.ink,
      textAlign: "center",
    },
  });
