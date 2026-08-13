// The shop popup's header: a SHOP badge that flows into a pill holding the category tabs. Tabs come from src/data/shop/items.ts, so adding a category is a one-line change there.
import { StyleSheet, Image, Pressable, ScrollView, Text, View } from "react-native";
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from "react-native-svg";

import { badgeArcPath } from "@/src/components/badgeArc";
import { SHOP_ICON } from "@/src/components/iconAssets";
import { IconPlaceholder } from "@/src/components/IconPlaceholder";
import { CATEGORY_LABELS, SHOP_CATEGORY_TABS } from "@/src/data";
import type { ShopCategory } from "@/src/data";
import { CREAM, useFixedStyles, LEXEND } from "@/src/game/ui/system/theme";
import type { Theme } from "@/src/game/ui/system/theme";

// Kept in step with InventoryCategoryTabs, its twin. The two headers are separate components on purpose, so anything that must LOOK the same is a shared token or a shared helper rather than a number copied between them.
const BAR_HEIGHT = 80;
// Bigger than the bar, so the badge overhangs and reads as sitting in front of the pill
const CIRCLE_SIZE = 100;
// Sized to the word: SHOP is short, so the icon can run large without crowding the label. Its twin runs both smaller for the much longer INVENTORY.
const BADGE_ICON_SIZE = 54;
const BADGE_LABEL_SIZE = 13;
const BADGE_LABEL_TRACKING = 0.5;
// Well beyond the icon, so the glow's falloff has room to fade out
const BADGE_GLOW_SIZE = 92;

const BADGE_ARC = badgeArcPath(CIRCLE_SIZE, BAR_HEIGHT, CREAM.hairlineWidth);

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
  const s = useFixedStyles(makeStyles);
  return (
    <View style={s.header}>
      {/* Indented from the left, leaving the space the badge is positioned into. */}
      <View style={[s.bar, { marginRight: rightInset }]}>
        {/* Scrolls, because six fixed-width tabs are already wider than the pill on a phone and the panel's overflow:hidden simply clipped the last ones away — windows and lighting were unreachable rather than merely cramped */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.scroll}
          contentContainerStyle={s.tabs}
        >
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
        </ScrollView>
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
          <Path d={BADGE_ARC} fill="none" stroke={CREAM.hairline} strokeWidth={CREAM.hairlineWidth} />
        </Svg>
        {/* Inside the icon's wrapper, so it centres on the cart and not on the badge. */}
        <View style={s.badgeIconWrap}>
          <Svg width={BADGE_GLOW_SIZE} height={BADGE_GLOW_SIZE} style={s.badgeGlow} pointerEvents="none">
            <Defs>
              <RadialGradient id="shopBadgeGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={CREAM.badgeGlow} stopOpacity={1} />
                <Stop offset="0.5" stopColor={CREAM.badgeGlow} stopOpacity={0.65} />
                <Stop offset="1" stopColor={CREAM.badgeGlow} stopOpacity={0} />
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
    // zIndex, or the grid below (a later sibling) paints over the badge's overhang
    header: {
      zIndex: 2,
      justifyContent: "center",
    },
    // The frame only. Everything about how the tabs sit inside it now belongs to the scroller below, since the row is no longer laid out against this box's width
    bar: {
      height: BAR_HEIGHT,
      // Half the diameter, so the pill's edge runs through the badge's centre
      marginLeft: CIRCLE_SIZE * 0.5,
      borderRadius: 24,
      backgroundColor: CREAM.chrome,
      borderWidth: CREAM.hairlineWidth,
      borderColor: CREAM.hairline,
      // So a scrolled row is cut off by the pill's rounded edge rather than drawn past it
      overflow: "hidden",
    },
    // flex:1 fills the pill's height, so the row centres vertically against the frame and not against its own content
    scroll: {
      flex: 1,
    },
    tabs: {
      alignItems: "center",
      // Centred with a fixed gap, so the tabs sit as a group instead of spreading. flexGrow, so that centring still applies on a screen wide enough to hold every tab — where this scroller never scrolls and the pill looks exactly as it did before
      flexGrow: 1,
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
    // Repeats the radius: on Android, swapping in a background can otherwise redraw the view with a square drawable and lose the base style's rounding
    iconWrapActive: {
      backgroundColor: CREAM.activeTile,
      borderRadius: 18,
      overflow: "hidden",
    },
    label: {
      marginTop: 2,
      ...LEXEND.regular,
      fontSize: 12,
      lineHeight: 16,
      color: CREAM.ink,
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
      backgroundColor: CREAM.chrome,
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
      ...LEXEND.semibold,
      fontSize: BADGE_LABEL_SIZE,
      letterSpacing: BADGE_LABEL_TRACKING,
      color: CREAM.ink,
    },
  });
