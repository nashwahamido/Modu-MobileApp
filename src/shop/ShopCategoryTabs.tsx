// The shop popup's header: a SHOP badge that flows into a pill holding the category tabs
// Tabs come from src/data/shopItems.ts, so adding a category is a one-line change there
import { StyleSheet, Image, Pressable, Text, View } from "react-native";
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from "react-native-svg";

import { SHOP_ICON } from "@/src/components/iconAssets";
import { CATEGORY_LABELS, SHOP_CATEGORY_TABS } from "@/src/data";
import type { ShopCategory } from "@/src/data";
import { useStyles } from "@/src/game/ui/theme";
import type { Theme } from "@/src/game/ui/theme";
import { IconPlaceholder } from "./ShopPlaceholders";

// The one lavender in the shop, meaning exactly one thing: the category you are in
const ACTIVE_TILE = "#D3CBD2";
const TEXT_COLOR = "#231F20";
const CHROME = "#F7F0E6";
const BAR_HEIGHT = 80;
// Bigger than the bar, so the badge overhangs and reads as sitting in front of the pill
const CIRCLE_SIZE = 100;
// The room's bottom-bar hairline, reused so every piece of chrome is the same material
const HAIRLINE = "#D7D1CE";
const HAIRLINE_WIDTH = 0.4;
const BADGE_ICON_SIZE = 54;
// Well beyond the icon, so the glow's falloff has room to fade out
const BADGE_GLOW_SIZE = 92;
const BADGE_GLOW = "#FFFCF7";

// An arc not a border: the circle's right side is buried in the pill, and a full ring would draw a seam across the join
const BADGE_ARC = (() => {
  // Radius pulled in by the stroke width, or the line clips at the canvas edge
  const r = CIRCLE_SIZE / 2 - HAIRLINE_WIDTH;
  const c = CIRCLE_SIZE / 2;
  // Ends where the circle crosses the pill's edges, so the two strokes meet end to end
  const dy = Math.min(BAR_HEIGHT / 2, r);
  const dx = Math.sqrt(Math.max(r * r - dy * dy, 0));
  // Top edge, round the left, to the bottom edge: counter-clockwise, always >180deg
  return `M ${c + dx} ${c - dy} A ${r} ${r} 0 1 0 ${c + dx} ${c + dy}`;
})();

export function ShopCategoryTabs({
  category,
  onCategory,
  rightInset = 0,
}: {
  category: ShopCategory;
  onCategory: (next: ShopCategory) => void;
  /** The grid's side padding, so the pill ends level with the last column of items. */
  rightInset?: number;
}) {
  const s = useStyles(makeStyles);
  return (
    <View style={s.header}>
      {/* Indented from the left, leaving the space the badge is positioned into. */}
      <View style={[s.bar, { marginRight: rightInset }]}>
        {SHOP_CATEGORY_TABS.map((id) => {
          const active = id === category;
          return (
            <Pressable
              key={id}
              accessibilityRole="tab"
              accessibilityLabel={CATEGORY_LABELS[id]}
              // So the fill colour is never the only signal of the active tab.
              accessibilityState={{ selected: active }}
              style={s.tab}
              onPress={() => onCategory(id)}
            >
              <View style={[s.iconWrap, active && s.iconWrapActive]}>
                <IconPlaceholder size={38} />
              </View>
              <Text style={s.label} numberOfLines={1}>
                {CATEGORY_LABELS[id]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Last, so it paints over the pill's left end. Not a button: it only says where you are. */}
      <View
        style={s.badge}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Svg
          width={CIRCLE_SIZE}
          height={CIRCLE_SIZE}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Path d={BADGE_ARC} fill="none" stroke={HAIRLINE} strokeWidth={HAIRLINE_WIDTH} />
        </Svg>
        {/* Inside the icon's wrapper, so it centres on the cart and not on the badge. */}
        <View style={s.badgeIconWrap}>
          <Svg width={BADGE_GLOW_SIZE} height={BADGE_GLOW_SIZE} style={s.badgeGlow} pointerEvents="none">
            <Defs>
              <RadialGradient id="shopBadgeGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={BADGE_GLOW} stopOpacity={1} />
                <Stop offset="0.5" stopColor={BADGE_GLOW} stopOpacity={0.65} />
                <Stop offset="1" stopColor={BADGE_GLOW} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle
              cx={BADGE_GLOW_SIZE / 2}
              cy={BADGE_GLOW_SIZE / 2}
              r={BADGE_GLOW_SIZE / 2}
              fill="url(#shopBadgeGlow)"
            />
          </Svg>
          <Image source={SHOP_ICON} style={s.badgeIcon} resizeMode="contain" />
        </View>
        <Text style={s.badgeLabel}>SHOP</Text>
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    header: {
      justifyContent: "center",
    },
    bar: {
      height: BAR_HEIGHT,
      // Half the diameter, so the pill's edge runs through the badge's centre
      marginLeft: CIRCLE_SIZE * 0.5,
      borderRadius: 24,
      backgroundColor: CHROME,
      borderWidth: HAIRLINE_WIDTH,
      borderColor: HAIRLINE,
      flexDirection: "row",
      alignItems: "center",
      // Centred with a fixed gap, so the tabs sit as a group instead of spreading
      justifyContent: "center",
      gap: 33,
      // Clears the badge overlapping this end, without moving the pill
      paddingLeft: 62,
      paddingRight: 14,
    },
    // flexShrink:0, or a cramped row squeezes the tabs and distorts the frame below
    tab: {
      alignItems: "center",
      flexShrink: 0,
    },
    // Fixed size, not padding: keeps every frame identical and stops the row shifting
    iconWrap: {
      width: 70,
      height: 52,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    iconWrapActive: {
      backgroundColor: ACTIVE_TILE,
    },
    label: {
      marginTop: 2,
      fontFamily: "Lexend_400Regular",
      fontSize: 12,
      lineHeight: 16,
      color: TEXT_COLOR,
      textAlign: "center",
      textTransform: "lowercase",
    },
    // No border: the stroke is the SVG arc, so it stops at the pill
    badge: {
      position: "absolute",
      left: 0,
      // Absolute children ignore justifyContent, so the centring is solved here
      top: (BAR_HEIGHT - CIRCLE_SIZE) / 2,
      width: CIRCLE_SIZE,
      height: CIRCLE_SIZE,
      borderRadius: CIRCLE_SIZE / 2,
      backgroundColor: CHROME,
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
    },
    badgeIconWrap: {
      alignItems: "center",
      justifyContent: "center",
    },
    // Bigger than the icon, so it is centred by offset rather than by flex
    badgeGlow: {
      position: "absolute",
      left: (BADGE_ICON_SIZE - BADGE_GLOW_SIZE) / 2,
      top: (BADGE_ICON_SIZE - BADGE_GLOW_SIZE) / 2,
    },
    // Nudged left: the cart's basket carries the mass, so a centred box reads right of centre
    badgeIcon: {
      width: BADGE_ICON_SIZE,
      height: BADGE_ICON_SIZE,
      transform: [{ translateX: -3 }],
    },
    badgeLabel: {
      fontFamily: "Lexend_600SemiBold",
      fontSize: 15,
      letterSpacing: 0.5,
      color: TEXT_COLOR,
    },
  });
