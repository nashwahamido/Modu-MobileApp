// The picture frame and name tab the shop and the inventory tiles share. Here rather than copied into both, because the two grids sit side by side in the same popup family and any drift between them reads as a bug.
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
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
const NAME_FONT_SIZE = 12;

// Below this short side the device is a phone; matches TABLET_MIN_SHORT_DP in game/ui/system/theme.ts
const TABLET_MIN_SHORT_DP = 600;
/**
 * How much bigger the name reads on a tablet.
 *
 * The tiles themselves already grow there — the grid solves their width from the measured panel — but
 * this tab is fixed points, so at phone size it ends up a thin strip of small type across a much
 * larger frame. Everything about the tab scales together: a bigger font in an unchanged 22pt pill
 * would put the letters through its border, and leaving the OVERLAP alone would float the tab off the
 * frame's edge it is supposed to straddle.
 */
const NAME_TABLET_SCALE = 1.3;

/**
 * The same factor, for anything else on a tile that is fixed points: the shop's price badge and its
 * owned badge. Exported so those cannot drift from the name they sit above — "about the size of the
 * titles" is a relationship, and a second copy of 1.3 in another file would only hold by luck.
 */
export function useTileScale(): number {
  const { width, height } = useWindowDimensions();
  return Math.min(width, height) >= TABLET_MIN_SHORT_DP ? NAME_TABLET_SCALE : 1;
}
/**
 * The CEILING the name is allowed to reach on a tablet, as a multiple of the scaled size.
 *
 * Paired with adjustsFontSizeToFit below: the text starts at this size and Android shrinks it until
 * the whole name fits on one line. So a short name ("Arm Chair") renders at the ceiling and a long one
 * ("Wooden Single Bed") steps down as far as it needs to — which is what "as big as it can be while
 * still readable" actually means for a grid where the names are wildly different lengths. Fixing one
 * size for all of them means either truncating the long ones or under-sizing the short ones.
 */
const NAME_MAX_BOOST = 1.45;
/** How far the shrink may go before the name would be too small to read. */
const NAME_MIN_SCALE = 0.62;

/** Render AFTER the well, so it paints over the frame's bottom edge rather than under it. */
export function ItemNameTab({ name }: { name: string }) {
  const { width, height } = useWindowDimensions();
  const k = Math.min(width, height) >= TABLET_MIN_SHORT_DP ? NAME_TABLET_SCALE : 1;
  return (
    <View
      style={[
        styles.tab,
        k === 1
          ? null
          : {
              height: NAME_TAB_HEIGHT * k,
              borderRadius: (NAME_TAB_HEIGHT * k) / 2,
              marginTop: -NAME_TAB_OVERLAP * k,
              // Tighter inset and padding than the phone's: every point here is a point the name
              // does not have to shrink by, and the tab is a pill on a frame rather than a button
              // that needs breathing room.
              marginHorizontal: NAME_TAB_INSET / 2,
              paddingHorizontal: 6 * k,
            },
      ]}
    >
      {/* PHONE BEHAVIOUR IS UNCHANGED: one line at the authored size, ellipsis if it does not fit.
          The auto-fit is tablet-only, where there is room for a much larger name to be worth having. */}
      <Text
        style={[styles.name, k === 1 ? null : { fontSize: NAME_FONT_SIZE * k * NAME_MAX_BOOST }]}
        numberOfLines={1}
        adjustsFontSizeToFit={k !== 1}
        minimumFontScale={k === 1 ? undefined : NAME_MIN_SCALE}
      >
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
    fontSize: NAME_FONT_SIZE,
    color: CREAM.ink,
    textAlign: "center",
  },
});
