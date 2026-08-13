// The "you can't buy this" notice, as a popup over the shop. The twin of
// PurchaseConfirmPopup — same card, same scrim, one button instead of two
import { StyleSheet, Image, Pressable, Text, View } from "react-native";

import { COIN_ICON } from "@/src/components/iconAssets";
import { CREAM, CREAM_LIFT, useFixedStyles, LEXEND } from "@/src/game/ui/system/theme";
import type { Theme } from "@/src/game/ui/system/theme";
import type { PurchaseBlock } from "./purchaseBlock";

const COIN_SIZE = 34;
const PILL_HEIGHT = 22;
// How far the price pill hides behind the coin, as on the item tiles
const PRICE_TUCK = 22;

export function PurchaseNoticePopup({
  name,
  price,
  minLevel,
  block,
  onClose,
}: {
  name: string;
  price: number;
  minLevel: number;
  block: PurchaseBlock;
  onClose: () => void;
}) {
  const s = useFixedStyles(makeStyles);
  const lead = block === "coins" ? "Not enough money to buy " : `Reach level ${minLevel} to buy `;
  return (
    <View style={s.layer}>
      {/* Tapping away dismisses, the same as Close */}
      <Pressable style={s.scrim} onPress={onClose} />

      <View style={s.card} accessibilityViewIsModal accessibilityRole="alert">
        <View style={s.wellWrap}>
          {/* Placeholder well, matching the grid tiles until item art exists */}
          <View style={s.well} />
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
      width: 200,
      height: 158,
      borderRadius: 6,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: t.border,
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
