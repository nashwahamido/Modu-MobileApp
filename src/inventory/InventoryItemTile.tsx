
import { StyleSheet, Image, Pressable, Text, View } from "react-native";

import { brandFor } from "@/src/game/content/brands";
import { useStyles } from "@/src/game/ui/theme";
import type { Theme } from "@/src/game/ui/theme";

const TEXT_COLOR = "#231F20";
const WELL_ASPECT = 0.79;
const IKEA_LOGO = brandFor("IKEA").logo;
const WELL_TOP_PAD = 14;

const LOGO_CANVAS = { w: 3000, h: 2000 };
const LOGO_BLOCK = { x: 345, y: 517, w: 2310, h: 945 };
const MARK_WIDTH = 40;
const MARK_SCALE = MARK_WIDTH / LOGO_BLOCK.w;
const MARK = {
  width: MARK_WIDTH,
  height: Math.round(LOGO_BLOCK.h * MARK_SCALE),
  imageWidth: LOGO_CANVAS.w * MARK_SCALE,
  imageHeight: LOGO_CANVAS.h * MARK_SCALE,
  imageLeft: -LOGO_BLOCK.x * MARK_SCALE,
  imageTop: -LOGO_BLOCK.y * MARK_SCALE,
};

export function InventoryItemTile({
  name,
  width,
  ikea,
  placeable,
  onPress,
}: {
  name: string;
  /** Column width handed down by the grid */
  width: number;
  /** Shows the brand mark. Only buildable furniture carries a brand */
  ikea?: boolean;
  placeable?: boolean;
  onPress?: () => void;
}) {
  const s = useStyles(makeStyles);
  const wellHeight = Math.round(width * WELL_ASPECT);
  return (
    <Pressable
      accessibilityRole="button"
      // One control, so its label carries everything the visuals say
      accessibilityLabel={
        name + (ikea ? ", IKEA" : "") + (placeable ? ", tap to place" : ", cannot be placed yet")
      }
      accessibilityState={{ disabled: !placeable }}
      style={({ pressed }) => [s.tile, { width }, pressed && placeable && s.tilePressed]}
      onPress={placeable ? onPress : undefined}
      disabled={!placeable}
    >
      <View style={s.wellWrap}>
        <View style={[s.well, { width, height: wellHeight }]} />
        {ikea ? (
          <View
            style={s.brandMark}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Image source={IKEA_LOGO} style={s.brandImage} resizeMode="stretch" />
          </View>
        ) : null}
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
    wellWrap: {
      paddingTop: WELL_TOP_PAD,
    },
    well: {
      borderRadius: 6,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: t.border,
    },
    brandMark: {
      position: "absolute",
      right: 0,
      top: WELL_TOP_PAD,
      width: MARK.width,
      height: MARK.height,
      borderRadius: 5,
      overflow: "hidden",
    },
    brandImage: {
      position: "absolute",
      left: MARK.imageLeft,
      top: MARK.imageTop,
      width: MARK.imageWidth,
      height: MARK.imageHeight,
    },
    name: {
      marginTop: 8,
      fontFamily: "Lexend_400Regular",
      fontSize: 14,
      color: TEXT_COLOR,
      textAlign: "center",
    },
  });
