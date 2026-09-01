import {
  useState } from "react";
import { StyleSheet,
  Image,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Pressable } from "@/src/components/Pressable";

import { GRID_EDGE } from "@/src/components/popupInsets";
import {
  BOARD_DROP,
  BOARD_LABEL_OUTLINE,
  POPUP_BOARD,
  boardHeight,
  spanBoardWidth,
} from "@/src/components/popupBoard";
import { CATEGORY_LABELS, SHOP_CATEGORY_TABS } from "@/src/data";
import type { ShopCategory } from "@/src/data";
import { CREAM, LEXEND, useScaledStyles } from "@/src/game/ui/system/theme";
import type { Theme } from "@/src/game/ui/system/theme";

const ACTIVE_DISC = "#D4CED9";

const TABLET_ICON_LIFT = 1.25;

const CATEGORY_ART: Record<
  ShopCategory,
  { src: number; size: number; nudgeY?: number; tabletLift?: number }
> = {
  fur: { src: require("@/src/assets/ui/icons/Furniture.png"), size: 54 },
  wall: { src: require("@/src/assets/ui/icons/Wallpaper.png"), size: 48 },
  floor: { src: require("@/src/assets/ui/icons/floor.png"), size: 54, nudgeY: 4, tabletLift: 1.05 },
  deco: { src: require("@/src/assets/ui/icons/deco.png"), size: 56 },
  win: { src: require("@/src/assets/ui/icons/Window.png"), size: 44 },
  lit: { src: require("@/src/assets/ui/icons/Lighting.png"), size: 59 },
};
const BOARD_OVERHANG_X = 21;
const TABLET_MIN_SHORT_DP = 600;
const MAX_TAB_SCALE = 1.45;
const TAB_FILL = 0.88;
const PHONE_TAB_SCALE = 0.9;
const TAB_DISC = 64;
const TAB_GAP = 36;
const ROW_PADDING_X = 18;
const OUTLINE_WIDTH = 0.6;
const OUTLINE_OFFSETS: { width: number; height: number }[] = [
  { width: -OUTLINE_WIDTH, height: 0 },
  { width: OUTLINE_WIDTH, height: 0 },
  { width: 0, height: -OUTLINE_WIDTH },
  { width: 0, height: OUTLINE_WIDTH },
  { width: -OUTLINE_WIDTH, height: -OUTLINE_WIDTH },
  { width: OUTLINE_WIDTH, height: -OUTLINE_WIDTH },
  { width: -OUTLINE_WIDTH, height: OUTLINE_WIDTH },
  { width: OUTLINE_WIDTH, height: OUTLINE_WIDTH },
];

export function CategoryBoardTabs({
  category,
  onCategory,
}: {
  category: ShopCategory;
  onCategory: (next: ShopCategory) => void;
}) {
  const [row, setRow] = useState({ width: 0, height: 0 });
  const [available, setAvailable] = useState(0);
  const { width: screenW, height: screenH } = useWindowDimensions();

  const naturalRow =
    SHOP_CATEGORY_TABS.length * TAB_DISC +
    (SHOP_CATEGORY_TABS.length - 1) * TAB_GAP +
    ROW_PADDING_X * 2;
  const tablet = Math.min(screenW, screenH) >= TABLET_MIN_SHORT_DP;
  const tileSpan = available - GRID_EDGE * 2;
  const k =
    tablet && available > 0
      ? Math.max(
          1,
          Math.min(MAX_TAB_SCALE, (tileSpan * TAB_FILL) / (naturalRow + BOARD_OVERHANG_X * 2)),
        )
      : PHONE_TAB_SCALE;

  const s = useScaledStyles(makeStyles, k);
  const iconScale = (id: ShopCategory) =>
    tablet ? k * (CATEGORY_ART[id].tabletLift ?? TABLET_ICON_LIFT) : k;
  return (
    <View
      style={[s.header, tablet ? { marginTop: BOARD_DROP * k } : null]}
      onLayout={(e) => setAvailable(e.nativeEvent.layout.width)}
    >
      {row.width > 0
        ? (() => {
            const width = tablet
              ? spanBoardWidth(
                  available,
                  Math.max(screenW, screenH) / Math.min(screenW, screenH),
                )
              : row.width + BOARD_OVERHANG_X * 2 * k;
            const height = boardHeight(width);
            return (
              <Image
                source={POPUP_BOARD}
                style={[
                  s.board,
                  {
                    marginLeft: -width / 2,
                    top: (row.height - height) / 2,
                    width,
                    height,
                  },
                ]}
                resizeMode="stretch"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
            );
          })()
        : null}

      <View
        style={s.row}
        onLayout={(e) =>
          setRow({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })
        }
      >
        {SHOP_CATEGORY_TABS.map((id) => {
          const active = id === category;
          return (
            <Pressable
              key={id}
              accessibilityRole="tab"
              accessibilityLabel={CATEGORY_LABELS[id]}
              accessibilityState={{ selected: active }}
              style={s.tab}
              onPress={() => onCategory(id)}
            >
              <View style={s.iconWrap}>
                {active ? <View style={s.activeDisc} pointerEvents="none" /> : null}
                <Image
                  source={CATEGORY_ART[id].src}
                  style={{
                    width: CATEGORY_ART[id].size * iconScale(id),
                    height: CATEGORY_ART[id].size * iconScale(id),
                    transform: [{ translateY: (CATEGORY_ART[id].nudgeY ?? 0) * iconScale(id) }],
                  }}
                  resizeMode="contain"
                />
              </View>
              <View style={tablet ? null : s.labelTight}>
                {OUTLINE_OFFSETS.map((o) => (
                  <Text
                    key={`${o.width},${o.height}`}
                    style={[
                      s.label,
                      s.labelOutline,
                      { transform: [{ translateX: o.width }, { translateY: o.height }] },
                    ]}
                    numberOfLines={1}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  >
                    {CATEGORY_LABELS[id]}
                  </Text>
                ))}
                <Text style={s.label} numberOfLines={1}>
                  {CATEGORY_LABELS[id]}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    header: {
      zIndex: 2,
      alignItems: "center",
    },
    board: {
      position: "absolute",
      left: "50%",
    },
    row: {
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: 36,
      paddingHorizontal: 18,
    },
    tab: {
      alignItems: "center",
      flexShrink: 0,
    },
    iconWrap: {
      width: TAB_DISC,
      height: TAB_DISC,
      borderRadius: TAB_DISC / 2,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    activeDisc: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: TAB_DISC / 2,
      backgroundColor: ACTIVE_DISC,
      overflow: "hidden",
    },
    label: {
      marginTop: 2,
      ...LEXEND.medium,
      fontSize: 13.5,
      lineHeight: 17,
      color: CREAM.ink,
      textAlign: "center",
    },
    labelTight: {
      marginTop: -8,
    },
    labelOutline: {
      position: "absolute",
      left: 0,
      right: 0,
      color: BOARD_LABEL_OUTLINE,
    },
  });
