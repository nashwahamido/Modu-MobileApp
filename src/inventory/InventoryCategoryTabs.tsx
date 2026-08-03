// The inventory popup's header, an INVENTORY badge that flows into a pill holding the categories
import { StyleSheet, Image, Pressable, Text, View } from "react-native";
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from "react-native-svg";

import { INVENTORY_ICON } from "@/src/components/iconAssets";
import { IconPlaceholder } from "@/src/components/IconPlaceholder";
import { CATEGORY_LABELS, SHOP_CATEGORY_TABS } from "@/src/data";
import type { ShopCategory } from "@/src/data";
import { useStyles } from "@/src/game/ui/theme";
import type { Theme } from "@/src/game/ui/theme";

const ACTIVE_TILE = "#D3CBD2";
const TEXT_COLOR = "#231F20";
const CHROME = "#F7F0E6";
const BAR_HEIGHT = 80;
const CIRCLE_SIZE = 100;
const HAIRLINE = "#D7D1CE";
const HAIRLINE_WIDTH = 0.4;
const BADGE_ICON_SIZE = 46;
const BADGE_GLOW_SIZE = 92;
const BADGE_GLOW = "#FFFCF7";
const BADGE_ARC = (() => {
  // Radius pulled in by the stroke width or the line clips at the canvas edge
  const r = CIRCLE_SIZE / 2 - HAIRLINE_WIDTH;
  const c = CIRCLE_SIZE / 2;
  // Ends where the circle crosses the pill's edges so two strokes meet end to end
  const dy = Math.min(BAR_HEIGHT / 2, r);
  const dx = Math.sqrt(Math.max(r * r - dy * dy, 0));
  // Top edge, round the left, to the bottom edge- counter-clockwise, always >180deg
  return `M ${c + dx} ${c - dy} A ${r} ${r} 0 1 0 ${c + dx} ${c + dy}`;
})();

export function InventoryCategoryTabs({
  category,
  onCategory,
  rightInset = 0,
}: {
  category: ShopCategory;
  onCategory: (next: ShopCategory) => void;
  rightInset?: number;
}) {
  const s = useStyles(makeStyles);
  return (
    <View style={s.header}>
     
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
        {/* Inside the icon's wrapper, so it centres on the icon and not on the badge. */}
        <View style={s.badgeIconWrap}>
          <Svg width={BADGE_GLOW_SIZE} height={BADGE_GLOW_SIZE} style={s.badgeGlow} pointerEvents="none">
            <Defs>
              <RadialGradient id="inventoryBadgeGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={BADGE_GLOW} stopOpacity={1} />
                <Stop offset="0.5" stopColor={BADGE_GLOW} stopOpacity={0.65} />
                <Stop offset="1" stopColor={BADGE_GLOW} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle
              cx={BADGE_GLOW_SIZE / 2}
              cy={BADGE_GLOW_SIZE / 2}
              r={BADGE_GLOW_SIZE / 2}
              fill="url(#inventoryBadgeGlow)"
            />
          </Svg>
          <Image source={INVENTORY_ICON} style={s.badgeIcon} resizeMode="contain" />
        </View>
        <Text style={s.badgeLabel}>INVENTORY</Text>
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    header: {
      zIndex: 2,
      justifyContent: "center",
    },
    bar: {
      height: BAR_HEIGHT,
      marginLeft: CIRCLE_SIZE * 0.5,
      borderRadius: 24,
      backgroundColor: CHROME,
      borderWidth: HAIRLINE_WIDTH,
      borderColor: HAIRLINE,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 33,
      paddingLeft: 62,
      paddingRight: 14,
    },
    tab: {
      alignItems: "center",
      flexShrink: 0,
    },
    // fixed size, not padding: keeps every frame identical and stops row shifting
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
      borderRadius: 18,
      overflow: "hidden",
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
    badge: {
      position: "absolute",
      left: 0,
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
    badgeGlow: {
      position: "absolute",
      left: (BADGE_ICON_SIZE - BADGE_GLOW_SIZE) / 2,
      top: (BADGE_ICON_SIZE - BADGE_GLOW_SIZE) / 2,
    },
    badgeIcon: {
      width: BADGE_ICON_SIZE,
      height: BADGE_ICON_SIZE,
    },
    badgeLabel: {
      fontFamily: "Lexend_600SemiBold",
      fontSize: 10.5,
      letterSpacing: 0.4,
      color: TEXT_COLOR,
    },
  });
