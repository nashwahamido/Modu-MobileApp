import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { CARD_CHROME, CREAM, LEXEND } from "@/src/game/ui/system/theme";

export const WELL_ASPECT = 0.88;

export const GRID_THUMB_FILL = 0.78;
export const WELL_TOP_PAD = 14;
export const FRAME_FILL = "#EFE9E0";
export const FRAME_STROKE = "#8E8985";
export const FRAME_STROKE_WIDTH = 0;
export const FRAME_RADIUS = 14;
export const TILE_ROW_GAP = 4;

const LOCK_VEIL_CENTRE = "#BCA2DF";
const LOCK_VEIL_MID = "#DACCF1";
const LOCK_VEIL_EDGE = "#FAF7FE";

export function LockWash() {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
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

const NAME_TAB_HEIGHT = 22;
const NAME_TAB_INSET = 4;
const NAME_TAB_OVERLAP = 13;
const NAME_FONT_SIZE = 12;

const TABLET_MIN_SHORT_DP = 600;
const NAME_TABLET_SCALE = 1.3;

export function useTileScale(): number {
  const { width, height } = useWindowDimensions();
  return Math.min(width, height) >= TABLET_MIN_SHORT_DP ? NAME_TABLET_SCALE : 1;
}

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
              marginHorizontal: NAME_TAB_INSET / 2,
              paddingHorizontal: 6 * k,
            },
      ]}
    >
      <Text style={[styles.name, k === 1 ? null : { fontSize: NAME_FONT_SIZE * k }]} numberOfLines={1}>
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
    backgroundColor: CREAM.card,
    ...CARD_CHROME,
    borderWidth: 0,
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