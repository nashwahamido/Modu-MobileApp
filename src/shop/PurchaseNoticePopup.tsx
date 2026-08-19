// The "you can't buy this" notice, as a popup over the shop. The twin of
// PurchaseConfirmPopup — same card, same scrim, one button instead of two
import { StyleSheet, Image, Pressable, Text, View } from "react-native";

import { COIN_ICON, STAR_ICON, levelIcon } from "@/src/components/iconAssets";
import {
  FRAME_FILL,
  FRAME_RADIUS,
  FRAME_STROKE,
  FRAME_STROKE_WIDTH,
  LockWash,
} from "@/src/components/ItemTileFrame";
import { CatalogThumb } from "@/src/components/CatalogThumb";
import { ItemSpinPreview } from "./ItemSpinPreview";
import { CREAM, CREAM_LIFT, useFixedStyles, LEXEND } from "@/src/game/ui/system/theme";
import type { Theme } from "@/src/game/ui/system/theme";
import type { PurchaseBlock } from "./purchaseBlock";

// The shop and inventory panels' edge, so every surface in this family shares one outline
const PANEL_STROKE = "#544F4B";
const PANEL_STROKE_WIDTH = 1.2;
// Shared with the surface fallback, which sizes its picture from the frame
const WELL_SIZE = { width: 200, height: 158 };
const LOCK_STAR_SIZE = 86;
const COIN_SIZE = 34;
const PILL_HEIGHT = 22;
// How far the price pill hides behind the coin, as on the item tiles
const PRICE_TUCK = 22;

export function PurchaseNoticePopup({
  itemId,
  name,
  price,
  minLevel,
  block,
  surface,
  onClose,
}: {
  itemId: string;
  name: string;
  price: number;
  minLevel: number;
  block: PurchaseBlock;
  /** A wallpaper or a floor: it has no model to turn, so it shows its tile picture instead */
  surface?: boolean;
  onClose: () => void;
}) {
  const s = useFixedStyles(makeStyles);
  const locked = block === "level";
  const lockStar = levelIcon(minLevel);
  const lead = locked ? `Reach level ${minLevel} to buy ` : "Not enough money to buy ";
  return (
    <View style={s.layer}>
      {/* Tapping away dismisses, the same as Close */}
      <Pressable style={s.scrim} onPress={onClose} />

      <View style={s.card} accessibilityViewIsModal accessibilityRole="alert">
        <View style={s.wellWrap}>
          {/* A piece you cannot afford YET turns as usual — you are being shown what your coins would buy. One you have not reached the level for is held back on purpose: a still picture behind a wash, with the star that says how far off it is. */}
          {locked || surface ? (
            <View style={s.well}>
              <CatalogThumb
                source="bought"
                itemId={itemId}
                surface={surface}
                size={WELL_SIZE.height}
              />
              {locked ? <LockWash /> : null}
              {locked ? (
                <View style={s.lockBadge} pointerEvents="none">
                  {/* The numbered artwork where it exists; past it, the blank star carries the level as text */}
                  <Image source={lockStar ?? STAR_ICON} style={s.lockStar} resizeMode="contain" />
                  {lockStar ? null : <Text style={s.lockLevel}>{minLevel}</Text>}
                </View>
              ) : null}
            </View>
          ) : (
            <ItemSpinPreview itemId={itemId} size={WELL_SIZE.height} style={s.well} />
          )}
          {/* Overhangs the well's top-left corner, exactly as on a tile */}
          <View style={s.priceBadge}>
            <Image source={COIN_ICON} style={s.priceIcon} resizeMode="contain" />
            <View style={s.pricePill}>
              <Text style={s.priceText}>{price}</Text>
            </View>
          </View>
        </View>

        <Text style={s.message}>
          {lead}
          <Text style={s.messageName}>{name}</Text>
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={({ pressed }) => [s.button, pressed && s.pressed]}
          onPress={onClose}
        >
          <Text style={s.buttonText}>Close</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    // Above the shop layer it sits on top of
    layer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 60,
      alignItems: "center",
      justifyContent: "center",
    },
    // t.scrim: the same shading OverlaySheet uses, so every popup dims the same way
    scrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: t.scrim,
    },
    card: {
      width: 460,
      maxWidth: "86%",
      borderRadius: 24,
      borderWidth: PANEL_STROKE_WIDTH,
      borderColor: PANEL_STROKE,
      backgroundColor: CREAM.card,
      paddingHorizontal: 30,
      paddingTop: 26,
      paddingBottom: 22,
      alignItems: "center",
      ...CREAM_LIFT.card,
    },
    // Top padding gives the price badge room to overhang without clipping
    wellWrap: {
      paddingTop: 14,
    },
    well: {
      ...WELL_SIZE,
      alignItems: "center",
      justifyContent: "center",
      // Clips the turning model to the frame's rounded corners
      overflow: "hidden",
      borderRadius: FRAME_RADIUS,
      backgroundColor: FRAME_FILL,
      borderWidth: FRAME_STROKE_WIDTH,
      borderColor: FRAME_STROKE,
    },

    lockBadge: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
    },
    lockStar: {
      width: LOCK_STAR_SIZE,
      height: LOCK_STAR_SIZE,
    },
    // Absolute, so it centres on the star
    lockLevel: {
      position: "absolute",
      ...LEXEND.bold,
      fontSize: 24,
      color: CREAM.card,
    },
    priceBadge: {
      position: "absolute",
      left: -6,
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
    // paddingLeft = tuck + paddingRight, so the number centres in the visible part
    pricePill: {
      marginLeft: -PRICE_TUCK,
      minWidth: 58,
      height: PILL_HEIGHT,
      borderRadius: PILL_HEIGHT / 2,
      paddingLeft: PRICE_TUCK + 8,
      paddingRight: 8,
      backgroundColor: "#FFFFFF",
      borderWidth: 0.6,
      borderColor: CREAM.hairline,
      alignItems: "center",
      justifyContent: "center",
    },
    priceText: {
      ...LEXEND.bold,
      fontSize: 13,
      color: CREAM.ink,
      transform: [{ translateX: -3 }],
    },
    message: {
      marginTop: 22,
      ...LEXEND.regular,
      fontSize: 17,
      color: CREAM.ink,
      textAlign: "center",
    },
    messageName: {
      ...LEXEND.bold,
    },
    // Same footprint and radius as the confirm popup's Yes/No, so the two read as one set
    button: {
      marginTop: 20,
      minWidth: 76,
      height: 34,
      borderRadius: 13,
      paddingHorizontal: 18,
      backgroundColor: CREAM.darkChip,
      alignItems: "center",
      justifyContent: "center",
      ...CREAM_LIFT.control,
    },
    pressed: {
      opacity: 0.75,
    },
    buttonText: {
      ...LEXEND.regular,
      fontSize: 15,
      color: CREAM.card,
    },
  });
