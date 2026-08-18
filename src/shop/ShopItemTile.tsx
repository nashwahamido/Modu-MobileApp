// One purchasable tile in the shop popup: price badge, picture well, name
import { StyleSheet, Image, Pressable, Text, View } from "react-native";

import { CatalogThumb } from "@/src/components/CatalogThumb";
import { COIN_ICON, STAR_ICON, levelIcon } from "@/src/components/iconAssets";
import {
  FRAME_FILL,
  FRAME_RADIUS,
  FRAME_STROKE,
  FRAME_STROKE_WIDTH,
  LockWash,
  TILE_ROW_GAP,
  ItemNameTab,
  WELL_ASPECT,
  WELL_TOP_PAD,
} from "@/src/components/ItemTileFrame";
import { CREAM, useFixedStyles, LEXEND } from "@/src/game/ui/system/theme";
import type { Theme } from "@/src/game/ui/system/theme";


const PRICE_TUCK = 26;
const PILL_HEIGHT = 19;
const PILL_RADIUS = 10;
const PILL_BORDER = 0.6;
const PILL_PAD = 5;
const COIN_SIZE = 34;
const PRICE_TEXT_NUDGE_X = -3;
const BADGE_LEFT = -6;
const PILL_TOP = (COIN_SIZE - PILL_HEIGHT) / 2;
const PILL_LEFT = BADGE_LEFT + COIN_SIZE - PRICE_TUCK;
const OWNED_WIDTH = 70;

export function ShopItemTile({
  itemId,
  name,
  price,
  width,
  surface,
  owned,
  lockLevel,
  onPress,
  disabled,
}: {
  /** Catalog id, for the well's picture. Source is "bought" by construction: the shop IS the item_buy catalogue */
  itemId: string;
  name: string;
  price: number;
  width: number;
  /** A wallpaper or a floor, whose picture is its own tile image rather than a variation's render */
  surface?: boolean;
  owned?: boolean;
  lockLevel?: number;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const s = useFixedStyles(makeStyles);
  const locked = lockLevel !== undefined;
  const lockStar = lockLevel === undefined ? null : levelIcon(lockLevel);
  const wellHeight = Math.round(width * WELL_ASPECT);
  return (
    <Pressable
      accessibilityRole="button"
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
        <View
          style={[s.art, { height: wellHeight - FRAME_STROKE_WIDTH * 2 }]}
          pointerEvents="none"
        >
          <CatalogThumb source="bought" itemId={itemId} surface={surface} size={wellHeight} />
        </View>

        {/* A tint, not a blur — RN has no blur without a native module */}
        {/* The same wash the "reach level N" popup uses, so a locked tile and the popup it opens are one picture */}
        {locked ? (
          <View style={s.veil} pointerEvents="none">
            <LockWash />
          </View>
        ) : null}
        {locked ? (
          <View style={s.lockBadge} pointerEvents="none">
            {/* The numbered artwork where it exists; past it, the blank star carries the level as text */}
            <Image source={lockStar ?? STAR_ICON} style={s.lockStar} resizeMode="contain" />
            {lockStar ? null : <Text style={s.lockLevel}>{lockLevel}</Text>}
          </View>
        ) : null}

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

      <ItemNameTab name={name} />
    </Pressable>
  );
}

const makeStyles = (_t: Theme) =>
  StyleSheet.create({
    tile: {
      marginBottom: TILE_ROW_GAP,
    },
    tilePressed: {
      opacity: 0.7,
    },
    wellWrap: {
      paddingTop: WELL_TOP_PAD,
    },
    well: {
      borderRadius: FRAME_RADIUS,
      backgroundColor: FRAME_FILL,
      borderWidth: FRAME_STROKE_WIDTH,
      borderColor: FRAME_STROKE,
    },
    // Spans the well and centres the art in it; the height is the well's, passed inline
    art: {
      position: "absolute",
      // Inset by the stroke, so a surface's picture fills the frame right up to its outline without painting over it
      top: WELL_TOP_PAD + FRAME_STROKE_WIDTH,
      left: FRAME_STROKE_WIDTH,
      right: FRAME_STROKE_WIDTH,
      borderRadius: FRAME_RADIUS - FRAME_STROKE_WIDTH,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
    },
    // Geometry only: the wash inside paints the colour, and this box is what clips it to the frame.
    // Inset by the stroke, like the art box — painted over its own outline, the frame reads as blurred.
    veil: {
      position: "absolute",
      top: WELL_TOP_PAD + FRAME_STROKE_WIDTH,
      left: FRAME_STROKE_WIDTH,
      right: FRAME_STROKE_WIDTH,
      bottom: FRAME_STROKE_WIDTH,
      borderRadius: FRAME_RADIUS - FRAME_STROKE_WIDTH,
      overflow: "hidden",
    },
    lockBadge: {
      ...StyleSheet.absoluteFillObject,
      top: WELL_TOP_PAD,
      alignItems: "center",
      justifyContent: "center",
    },
   
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
  
    priceIcon: {
      zIndex: 2,
      width: COIN_SIZE,
      height: COIN_SIZE,
    },
    lockStar: {
      width: 58,
      height: 58,
    },
   
    pricePill: {
      marginLeft: -PRICE_TUCK,
      minWidth: 43,
      height: PILL_HEIGHT,
      borderRadius: PILL_RADIUS,
      paddingLeft: PRICE_TUCK + PILL_PAD,
      paddingRight: PILL_PAD,
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
  });
