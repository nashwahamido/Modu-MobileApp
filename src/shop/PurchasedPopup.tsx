// What a purchase ends on: the item is bought, and the player says where it goes.
//
// The two choices are NOT the same kind of action, which is why they are offered together rather than
// one being a default. "Room" leaves the shop and starts placing the piece; "Inventory" keeps the
// player shopping and says so with a message that clears itself. Either way the item is already
// owned — this popup spends nothing and can be dismissed without losing the purchase.
import {
  StyleSheet,
  Image,
  Text,
  View,
} from "react-native";
import { Pressable } from "@/src/components/Pressable";

import { HOME_ICON, INVENTORY_ICON } from "@/src/components/iconAssets";
import { CREAM, CREAM_LIFT, useFixedStyles, LEXEND } from "@/src/game/ui/system/theme";
import type { Theme } from "@/src/game/ui/system/theme";

// The one purple in this popup: the headline says "done" and nothing else competes with it
const TITLE_COLOUR = "#897B9E";
const CHOICE_ICON_SIZE = 46;
// The shop and inventory panels' edge, so every surface in this family shares one outline
const PANEL_STROKE = "#544F4B";
// 0 = no outline, matching the shop and inventory panels these cards open over. The cards are told
// apart from the scrim by their fill and their lift, which is enough — an outline as well read as a
// second border stacked on the panel behind.
const PANEL_STROKE_WIDTH = 0;

export function PurchasedPopup({
  name,
  onRoom,
  onInventory,
  onClose,
}: {
  name: string;
  onRoom: () => void;
  onInventory: () => void;
  onClose: () => void;
}) {
  const s = useFixedStyles(makeStyles);
  return (
    <View style={s.layer}>
      {/* Tapping away keeps the item; it is bought either way, and the inventory is where it already is */}
      <Pressable style={s.scrim} onPress={onClose} />

      <View style={s.card} accessibilityViewIsModal accessibilityRole="alert">
        <Text style={s.title}>Item is purchased !</Text>
        <Text style={s.prompt}>Place in the</Text>

        <View style={s.choices}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Place ${name} in the room now`}
            style={({ pressed }) => [s.choice, pressed && s.pressed]}
            onPress={onRoom}
          >
            <Image source={HOME_ICON} style={s.choiceIcon} resizeMode="contain" />
            <Text style={s.choiceLabel}>Room</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Keep ${name} in your inventory`}
            style={({ pressed }) => [s.choice, pressed && s.pressed]}
            onPress={onInventory}
          >
            <Image source={INVENTORY_ICON} style={s.choiceIcon} resizeMode="contain" />
            <Text style={s.choiceLabel}>Inventory</Text>
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
      borderWidth: PANEL_STROKE_WIDTH,
      borderColor: PANEL_STROKE,
      backgroundColor: CREAM.card,
      paddingHorizontal: 30,
      paddingTop: 26,
      paddingBottom: 26,
      alignItems: "center",
      ...CREAM_LIFT.card,
    },
    title: {
      ...LEXEND.bold,
      fontSize: 21,
      color: TITLE_COLOUR,
      textAlign: "center",
    },
    prompt: {
      marginTop: 18,
      ...LEXEND.regular,
      fontSize: 15,
      color: CREAM.ink,
      textAlign: "center",
    },
    choices: {
      marginTop: 18,
      flexDirection: "row",
      // Wide enough that neither can be hit by mistake: this choice sends the player to two different places
      gap: 76,
    },
    choiceIcon: {
      width: CHOICE_ICON_SIZE,
      height: CHOICE_ICON_SIZE,
    },
    choice: {
      alignItems: "center",
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    pressed: {
      opacity: 0.7,
    },
    choiceLabel: {
      marginTop: 8,
      ...LEXEND.semibold,
      fontSize: 15,
      color: CREAM.ink,
    },
  });
