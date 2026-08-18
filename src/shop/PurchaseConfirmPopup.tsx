// The "buy this?" confirmation, as a popup over the shop. Nothing is charged until Yes — the tap that opens this is not itself a purchase
import { StyleSheet, Image, Pressable, Text, View } from "react-native";

import { COIN_ICON } from "@/src/components/iconAssets";
import {
  FRAME_FILL,
  FRAME_RADIUS,
  FRAME_STROKE,
  FRAME_STROKE_WIDTH,
} from "@/src/components/ItemTileFrame";
import { CatalogThumb } from "@/src/components/CatalogThumb";
import { ItemSpinPreview } from "./ItemSpinPreview";
import { CREAM, CREAM_LIFT, useFixedStyles, LEXEND } from "@/src/game/ui/system/theme";
import type { Theme } from "@/src/game/ui/system/theme";


const YES_FILL = "#8D7BA8";
const YES_BORDER = "#605473";
const NO_FILL = "#595551";
const NO_BORDER = "#393837";
const PANEL_STROKE = "#544F4B";
const PANEL_STROKE_WIDTH = 1.2;
const BUTTON_HEIGHT = 34;
// Shared with the surface fallback, which sizes its picture from the frame
const WELL_SIZE = { width: 200, height: 158 };
const COIN_SIZE = 34;
const PILL_HEIGHT = 22;
const PRICE_TUCK = 22;

export function PurchaseConfirmPopup({
  itemId,
  name,
  price,
  surface,
  onConfirm,
  onClose,
}: {
  itemId: string;
  name: string;
  price: number;
  /** A wallpaper or a floor: it has no model to turn, so it shows its tile picture instead */
  surface?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const s = useFixedStyles(makeStyles);
  return (
    <View style={s.layer}>
   
      <Pressable style={s.scrim} onPress={onClose} />
      <View style={s.card} accessibilityViewIsModal accessibilityRole="alert">
        {/* A surface has no model to turn, so it shows the same picture the grid tile does */}
        {surface ? (
          <View style={s.well}>
            <CatalogThumb source="bought" itemId={itemId} surface size={WELL_SIZE.height} />
          </View>
        ) : (
          <ItemSpinPreview itemId={itemId} size={WELL_SIZE.height} style={s.well} />
        )}
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
    layer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 60,
      alignItems: "center",
      justifyContent: "center",
    },
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
      color: CREAM.ink,
    },
    askName: {
      ...LEXEND.bold,
    },
    priceBadge: {
      flexDirection: "row",
      alignItems: "center",
    },
    priceIcon: {
      zIndex: 2,
      width: COIN_SIZE,
      height: COIN_SIZE,
    },
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
    actions: {
      marginTop: 20,
      flexDirection: "row",
      gap: 40,
    },
    button: {
      minWidth: 76,
      height: BUTTON_HEIGHT,
      borderRadius: BUTTON_HEIGHT / 2,
      borderWidth: 0.8,
      alignItems: "center",
      justifyContent: "center",
      ...CREAM_LIFT.control,
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
      color: CREAM.card,
    },
  });
