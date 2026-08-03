// The "you can't buy this" notice, as a popup over the shop. The twin of
// PurchaseConfirmPopup — same card, same scrim, one button instead of two
import { StyleSheet, Image, Pressable, Text, View } from "react-native";

import { COIN_ICON } from "@/src/components/iconAssets";
import { useStyles } from "@/src/game/ui/theme";
import type { Theme } from "@/src/game/ui/theme";

const TEXT_COLOR = "#231F20";
const CARD = "#FBFAF3";
const CLOSE_FILL = "#3D3A38";
const CLOSE_TEXT = "#FBFAF3";
const COIN_SIZE = 34;
const PILL_HEIGHT = 22;
// How far the price pill hides behind the coin, as on the item tiles
const PRICE_TUCK = 22;

/** Why the item cannot be bought. Mirrors the shop's own PurchaseBlock */
export type NoticeBlock = "level" | "coins";

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
  block: NoticeBlock;
  onClose: () => void;
}) {
  const s = useStyles(makeStyles);
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
      backgroundColor: CARD,
      paddingHorizontal: 30,
      paddingTop: 26,
      paddingBottom: 22,
      alignItems: "center",
      shadowColor: "#929292",
      shadowOpacity: 0.22,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
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
      borderColor: "#D7D1CE",
      alignItems: "center",
      justifyContent: "center",
    },
    priceText: {
      fontFamily: "Lexend_700Bold",
      fontSize: 13,
      color: TEXT_COLOR,
      transform: [{ translateX: -3 }],
    },
    message: {
      marginTop: 22,
      fontFamily: "Lexend_400Regular",
      fontSize: 17,
      color: TEXT_COLOR,
      textAlign: "center",
    },
    messageName: {
      fontFamily: "Lexend_700Bold",
    },
    // Same footprint and radius as the confirm popup's Yes/No, so the two read as one set
    button: {
      marginTop: 20,
      minWidth: 76,
      height: 34,
      borderRadius: 13,
      paddingHorizontal: 18,
      backgroundColor: CLOSE_FILL,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#929292",
      shadowOpacity: 0.22,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    pressed: {
      opacity: 0.75,
    },
    buttonText: {
      fontFamily: "Lexend_400Regular",
      fontSize: 15,
      color: CLOSE_TEXT,
    },
  });
