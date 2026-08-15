// The picture frame and name tab the shop and the inventory tiles share. Here rather than copied into both, because the two grids sit side by side in the same popup family and any drift between them reads as a bug.
import { StyleSheet, Text, View } from "react-native";

import { CREAM, LEXEND } from "@/src/game/ui/system/theme";

/** Well height as a fraction of the column width the grid hands down. */
export const WELL_ASPECT = 0.88;
/** Room above the well for a badge to overhang without clipping — the shop's price, the inventory's brand mark. Shared, so both grids' wells start on the same line. */
export const WELL_TOP_PAD = 14;
export const FRAME_STROKE = "#8E8985";
export const FRAME_STROKE_WIDTH = 0.8;
export const FRAME_RADIUS = 14;
/** Row spacing, ON TOP of the grid's own gap. Only the rows: the grid's gap also sets the column spacing, and it feeds the tile-width solve. */
export const TILE_ROW_GAP = 4;

// The tab rides ON the frame's bottom edge: inset from its sides, and pulled up so it straddles the line
const NAME_TAB_HEIGHT = 22;
const NAME_TAB_INSET = 4;
const NAME_TAB_OVERLAP = 13;

/** Render AFTER the well, so it paints over the frame's bottom edge rather than under it. */
export function ItemNameTab({ name }: { name: string }) {
  return (
    <View style={styles.tab}>
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tab: {
    marginTop: -NAME_TAB_OVERLAP,
    marginHorizontal: NAME_TAB_INSET,
    height: NAME_TAB_HEIGHT,
    borderRadius: NAME_TAB_HEIGHT / 2,
    paddingHorizontal: 8,
    backgroundColor: "#F9F3EB",
    borderWidth: 0.6,
    borderColor: FRAME_STROKE,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    ...LEXEND.semibold,
    fontSize: 12,
    color: CREAM.ink,
    textAlign: "center",
  },
});
