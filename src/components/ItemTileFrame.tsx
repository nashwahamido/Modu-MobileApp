// The picture frame and name tab the shop and the inventory tiles share. Here rather than copied into both, because the two grids sit side by side in the same popup family and any drift between them reads as a bug.
import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { CREAM, LEXEND } from "@/src/game/ui/system/theme";

/** Well height as a fraction of the column width the grid hands down. */
export const WELL_ASPECT = 0.88;
/** Room above the well for a badge to overhang without clipping — the shop's price, the inventory's brand mark. Shared, so both grids' wells start on the same line. */
export const WELL_TOP_PAD = 14;
export const FRAME_FILL = "#EFE9E0";
export const FRAME_STROKE = "#8E8985";
export const FRAME_STROKE_WIDTH = 0.8;
export const FRAME_RADIUS = 14;
/** Row spacing, ON TOP of the grid's own gap. Only the rows: the grid's gap also sets the column spacing, and it feeds the tile-width solve. */
export const TILE_ROW_GAP = 4;

// The lavender wash over a level-locked item. A RADIAL fade, drawn as SVG: RN has no blur without a
// native module and no radial gradient in StyleSheet, so the soft centre-to-edge falloff has to be
// painted rather than filtered.
const LOCK_VEIL_CENTRE = "#BCA2DF";
const LOCK_VEIL_MID = "#DACCF1";
const LOCK_VEIL_EDGE = "#FAF7FE";

/**
 * Fills its parent with one soft circle: saturated at the centre, almost gone by the corners, so the
 * item underneath reads as veiled rather than replaced. The PARENT clips it — this paints a plain
 * rectangle, and the frame's rounded corners come from the box it is dropped into.
 */
export function LockWash() {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        {/* The mid stop sits EARLY on purpose: pushed to the middle it made the falloff read as flat, which is the whole difference between a glow and a wash */}
        <RadialGradient id="lockWash" cx="50%" cy="50%" r="62%">
          <Stop offset="0" stopColor={LOCK_VEIL_CENTRE} stopOpacity={0.96} />
          <Stop offset="0.3" stopColor={LOCK_VEIL_MID} stopOpacity={0.94} />
          <Stop offset="1" stopColor={LOCK_VEIL_EDGE} stopOpacity={0.92} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#lockWash)" />
    </Svg>
  );
}

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
    // The price pill's fill, so the two badges on a tile read as the same component
    backgroundColor: CREAM.card,
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
