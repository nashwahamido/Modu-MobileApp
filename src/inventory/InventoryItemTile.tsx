// One owned tile in the inventory popup: brand mark, picture well, name
import {
  StyleSheet,
  Image,
  View,
} from "react-native";
import { Pressable } from "@/src/components/Pressable";

import {
  FRAME_FILL,
  FRAME_RADIUS,
  FRAME_STROKE,
  FRAME_STROKE_WIDTH,
  ItemNameTab,
  TILE_ROW_GAP,
  WELL_ASPECT,
  WELL_TOP_PAD,
} from "@/src/components/ItemTileFrame";
import { CatalogThumb, gridThumbFill, gridVariation } from "@/src/components/CatalogThumb";
import type { ItemSource } from "@/src/data/catalog/assets";
import { brandFor } from "@/src/game/content/brands";
import { useFixedStyles } from "@/src/game/ui/system/theme";

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
        <View
          style={[s.art, { height: wellHeight - FRAME_STROKE_WIDTH * 2 }]}
          pointerEvents="none"
        >
          {/* The GRID face for this item (components/CatalogThumb) — an agreed portrait per model
              rather than whichever finish the catalog row calls default, which was "wooden" for all
              four built models and put a row of near-identical wood renders in the grid.

              size is inset for the BUILT models only (gridThumbFill) — their assembly-pipeline
              render is framed tight where a bought item's already carries its own air, so the four
              ran to the edges of their wells while everything around them sat inside. Bought items
              are unchanged and still fill. The colour picker and the purchase popups pass a real
              variation and their own size. */}
          <CatalogThumb
            source={source}
            itemId={itemId}
            variation={gridVariation(itemId)}
            surface={surface}
            size={Math.round(wellHeight * gridThumbFill(itemId))}
          />
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

      <ItemNameTab name={name} />
    </Pressable>
  );
}

const makeStyles = () =>
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
  });