// The "buy this?" confirmation, as a popup over the shop. Nothing is charged until Yes —
// the tap that opens this is not itself a purchase
import { StyleSheet, Image, Pressable, Text, View } from "react-native";

import { COIN_ICON } from "@/src/components/iconAssets";
import { useStyles, LEXEND } from "@/src/game/ui/theme";
import type { Theme } from "@/src/game/ui/theme";

const TEXT_COLOR = "#231F20";
const CARD = "#FBFAF3";
// Sage for accept, warm clay for decline, each with a darker stroke of its own hue
const YES_FILL = "#C2CEB1";
const YES_BORDER = "#919A85";
const NO_FILL = "#E1C1B3";
const NO_BORDER = "#A99186";
const COIN_SIZE = 34;
const PILL_HEIGHT = 22;
// How far the price pill hides behind the coin, as on the item tiles
const PRICE_TUCK = 22;

export function PurchaseConfirmPopup({
  name,
  price,
  onConfirm,
  onClose,
}: {
  name: string;
  price: number;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const s = useStyles(makeStyles);
  return (
    <View style={s.layer}>
      {/* Tapping away declines, the same as No */}
      <Pressable style={s.scrim} onPress={onClose} />

      <View style={s.card} accessibilityViewIsModal accessibilityRole="alert">
        {/* Placeholder well, matching the grid tiles until item art exists */}
        <View style={s.well} />

        {/* A row, not one Text: the coin badge is a View and cannot be inlined into a string */}
        <View style={s.question}>
          <Text style={s.ask}>Purchase </Text>
          <Text style={[s.ask, s.askName]}>{name}</Text>
          <Text style={s.ask}> for </Text>
          <View style={s.priceBadge}>
            <Image source={COIN_ICON} style={s.priceIcon} resizeMode="contain" />
            <View style={s.pricePill}>
              <Text style={s.priceText}>{price}</Text>
            </View>
          </View>
          <Text style={s.ask}> ?</Text>
        </View>

        <View style={s.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Yes, buy ${name} for ${price} coins`}
            style={({ pressed }) => [s.button, s.yes, pressed && s.pressed]}
            onPress={onConfirm}
          >
            <Text style={s.buttonText}>Yes</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="No, cancel"
            style={({ pressed }) => [s.button, s.no, pressed && s.pressed]}
            onPress={onClose}
          >
            <Text style={s.buttonText}>No</Text>
          </Pressable>
        </View>
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
    well: {
      width: 200,
      height: 158,
      borderRadius: 6,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: t.border,
    },
    question: {
      marginTop: 22,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      flexWrap: "wrap",
    },
    ask: {
      ...LEXEND.regular,
      fontSize: 17,
      color: TEXT_COLOR,
    },
    askName: {
      ...LEXEND.bold,
    },
    priceBadge: {
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
      ...LEXEND.bold,
      fontSize: 13,
      color: TEXT_COLOR,
      transform: [{ translateX: -3 }],
    },
    actions: {
      marginTop: 20,
      flexDirection: "row",
      gap: 22,
    },
    button: {
      minWidth: 76,
      height: 34,
      borderRadius: 13,
      borderWidth: 0.4,
      alignItems: "center",
      justifyContent: "center",
      // Barely there, so the buttons lift off the card without reading as raised chips
      shadowColor: "#929292",
      shadowOpacity: 0.22,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    yes: {
      backgroundColor: YES_FILL,
      borderColor: YES_BORDER,
    },
    no: {
      backgroundColor: NO_FILL,
      borderColor: NO_BORDER,
    },
    pressed: {
      opacity: 0.75,
    },
    buttonText: {
      ...LEXEND.regular,
      fontSize: 15,
      color: TEXT_COLOR,
    },
  });
