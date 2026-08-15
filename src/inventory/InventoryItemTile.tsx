// One owned tile in the inventory popup: brand mark, picture well, name
import { StyleSheet, Image, Pressable, Text, View } from "react-native";

import { CatalogThumb } from "@/src/components/CatalogThumb";
import type { ItemSource } from "@/src/data/catalog/assets";
import { brandFor } from "@/src/game/content/brands";
import { CREAM, useFixedStyles, LEXEND } from "@/src/game/ui/system/theme";
import type { Theme } from "@/src/game/ui/system/theme";

// Well height as a fraction of the tile's width; the grid owns the width
const WELL_ASPECT = 0.79;
// Room for the brand mark to sit at the well's top-right without clipping. Its twin uses the same pad for its price badge, so the two grids' wells start on the same line.
const WELL_TOP_PAD = 14;
const IKEA_LOGO = brandFor("IKEA").logo;

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
  itemId,
  source,
  name,
  width,
  surface,
  ikea,
  placeable,
  onPress,
}: {
  /** Catalog id, for the well's picture */
  itemId: string;
  /** Which subtree the picture lives in. Unlike the shop's tile this grid mixes both, since it lists what was built alongside what was bought */
  source: ItemSource;
  name: string;
  /** Column width handed down by the grid */
  width: number;
  /** A wallpaper or a floor, whose picture is its own tile image rather than a variation's render */
  surface?: boolean;
  /** Shows the brand mark. Only buildable furniture carries a brand */
  ikea?: boolean;
  placeable?: boolean;
  onPress?: () => void;
}) {
  const s = useFixedStyles(makeStyles);
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

        {/* Over the well and under the brand mark, which must stay readable on top of the picture. Not interactive: the whole tile is the one control. */}
        <View style={[s.art, { height: wellHeight }]} pointerEvents="none">
          <CatalogThumb source={source} itemId={itemId} surface={surface} size={wellHeight} />
        </View>

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
    // Spans the well and centres the art in it; the height is the well's, passed inline
    art: {
      position: "absolute",
      top: WELL_TOP_PAD,
      left: 0,
      right: 0,
      alignItems: "center",
      justifyContent: "center",
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
      ...LEXEND.regular,
      fontSize: 14,
      color: CREAM.ink,
      textAlign: "center",
    },
  });
