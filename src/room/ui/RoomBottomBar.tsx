// The room hub's bottom navigation: shop / inventory / assemble / visit friends / you
import { useState } from 'react';
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { StyleSheet, Image, Pressable, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronIcon } from '../../components/Icons';
import { ASSEMBLE_ICON, INVENTORY_ICON, SHOP_ICON, VISIT_FRIENDS_ICON, YOU_ICON } from '../../components/iconAssets';
import { ELEVATION, useStyles, useTheme } from "@/src/game/ui/theme";
import type { Theme } from "@/src/game/ui/theme";
import { SCREEN_SIDE_MARGIN, SCREEN_VERTICAL_MARGIN } from '../../hooks/use-safe-insets';

// Pinned to the mockup rather than the theme, so it holds across light/dark.
const TEXT_COLOR = '#231F20';
const LEXEND = {
  regular: 'Lexend_400Regular',
  semibold: 'Lexend_600SemiBold',
  bold: 'Lexend_700Bold',
  extrabold: 'Lexend_800ExtraBold',
  black: 'Lexend_900Black',
} as const;

// Reanimated, not RN's LayoutAnimation, which doesn't fire reliably on the New Architecture
const BAR_LAYOUT = LinearTransition.duration(220);
const BAR_ITEM_ENTERING = FadeIn.duration(160);
const BAR_ITEM_EXITING = FadeOut.duration(120);

// One box per glyph: each PNG fills its canvas differently, so a shared size wouldn't match
const BAR_ICON_SIZE = 36;
const SHOP_ICON_SIZE = 45;
const VISIT_FRIENDS_ICON_SIZE = 43;
const YOU_ICON_SIZE = 36;
// Negative = left. The cart's basket carries the mass, so a centred box reads right of centre
const SHOP_ICON_NUDGE_X = -4;
// Fixed slot height keeps every label on one line. Must be >= the tallest icon
const ICON_SLOT = 44;
// How far the assemble button is lifted out of the bar; the label alignment is solved from it
const ASSEMBLE_LIFT = 22;

const ASSEMBLE_COLLAR_SIZE = 76;
const ASSEMBLE_BUTTON_SIZE = 62;
// Larger than the button on purpose — the PNG is mostly transparent margin
const ASSEMBLE_ICON_SIZE = 86;
// Negative = up. The wrench head sits above the hand, so the hand reads low when centred
const ASSEMBLE_ICON_NUDGE_Y = -7;
// Button centre relative to assembleWrap's top; the collar's position is solved from it
const ASSEMBLE_CENTRE_OPEN = -ASSEMBLE_LIFT + ASSEMBLE_BUTTON_SIZE / 2;
const ASSEMBLE_CENTRE_CLOSED = ASSEMBLE_BUTTON_SIZE / 2;

// The collar is stroked across its top only — the rest is buried in the pill
const ASSEMBLE_COLLAR_ARC_HALF_SPAN_DEG = 65;
const ASSEMBLE_COLLAR_ARC = (() => {
  const r = ASSEMBLE_COLLAR_SIZE / 2;
  const half = (ASSEMBLE_COLLAR_ARC_HALF_SPAN_DEG * Math.PI) / 180;
  const dx = r * Math.sin(half);
  const dy = r * Math.cos(half);
  const leftX = r - dx;
  const rightX = r + dx;
  const y = r - dy;
  return `M ${leftX} ${y} A ${r} ${r} 0 0 1 ${rightX} ${y}`;
})();

export function RoomBottomBar({
  onOpenShop,
  onOpenInventory,
}: {
  onOpenShop: () => void;
  onOpenInventory: () => void;
}) {
  const s = useStyles(makeStyles);
  // t.bg is the room's backdrop colour, used for the chevron's outline
  const t = useTheme();
  // Immersive mode reports 0 insets, so these floors sit UNDER the design's own offsets
  const insets = useSafeAreaInsets();
  const padL = 22 + Math.max(insets.left, SCREEN_SIDE_MARGIN);
  const padBottom = 22 + Math.max(insets.bottom, SCREEN_VERTICAL_MARGIN);
  const [barOpen, setBarOpen] = useState(true);

  return (
    <Animated.View
      layout={BAR_LAYOUT}
      style={[
        s.bottomBarWrap,
        { bottom: padBottom },
        barOpen ? s.bottomBarWrapOpen : [s.bottomBarWrapClosed, { left: padL }],
      ]}
    >
      {!barOpen ? (
        // Lifted, or the collar overhanging the collapsed pill paints over it
        <Animated.View style={s.chevronLift} entering={BAR_ITEM_ENTERING} exiting={BAR_ITEM_EXITING} layout={BAR_LAYOUT}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Expand menu"
            accessibilityState={{ expanded: false }}
            hitSlop={12}
            style={s.chevronButton}
            onPress={() => setBarOpen(true)}
          >
            <View style={s.chevronLeft}>
              <ChevronIcon size={26} up color="#595551" outlineColor={t.bg} outlineWidth={0.5} />
            </View>
          </Pressable>
        </Animated.View>
      ) : null}

      <Animated.View layout={BAR_LAYOUT} style={[s.bottomBar, !barOpen && s.bottomBarClosed]}>
        {barOpen ? (
          <Animated.View entering={BAR_ITEM_ENTERING} exiting={BAR_ITEM_EXITING} layout={BAR_LAYOUT}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Shop"
              style={s.barItem}
              onPress={onOpenShop}
            >
              <View style={s.iconSlot}>
                <Image source={SHOP_ICON} style={s.shopIcon} resizeMode="contain" />
              </View>
              <Text style={s.barLabel}>shop</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {barOpen ? (
          <Animated.View entering={BAR_ITEM_ENTERING} exiting={BAR_ITEM_EXITING} layout={BAR_LAYOUT}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Inventory"
              style={s.barItem}
              onPress={onOpenInventory}
            >
              <View style={s.iconSlot}>
                <Image source={INVENTORY_ICON} style={s.barIcon} resizeMode="contain" />
              </View>
              <Text style={s.barLabel}>inventory</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        <Animated.View layout={BAR_LAYOUT} style={s.assembleWrap}>
          {/* Expanded: an SVG, since only the popped-out top arc is stroked. */}
          {/* Collapsed: a View, so the border runs full circle and the shadow traces it. */}
          {barOpen ? (
            <Svg width={ASSEMBLE_COLLAR_SIZE} height={ASSEMBLE_COLLAR_SIZE} style={s.assembleCollar} pointerEvents="none">
              <Circle
                cx={ASSEMBLE_COLLAR_SIZE / 2}
                cy={ASSEMBLE_COLLAR_SIZE / 2}
                r={ASSEMBLE_COLLAR_SIZE / 2}
                fill="#FBFAF3"
              />
              <Path d={ASSEMBLE_COLLAR_ARC} fill="none" stroke="#D7D1CE" strokeWidth={0.4} />
            </Svg>
          ) : (
            <View style={s.assembleCollarClosed} pointerEvents="none" />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Assemble"
            style={[s.assembleButton, !barOpen && s.assembleButtonClosed]}
            onPress={() => router.push("/catalogue" as Href)}
          >
            <Image source={ASSEMBLE_ICON} style={s.assembleIcon} resizeMode="contain" />
          </Pressable>
          {barOpen ? <Text style={[s.barLabel, s.assembleLabel]}>assemble</Text> : null}
        </Animated.View>

        {barOpen ? (
          <Animated.View entering={BAR_ITEM_ENTERING} exiting={BAR_ITEM_EXITING} layout={BAR_LAYOUT}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Visit friends"
              style={s.barItem}
              onPress={() => router.push("/profile" as Href)}
            >
              <View style={s.iconSlot}>
                <Image source={VISIT_FRIENDS_ICON} style={s.friendsIcon} resizeMode="contain" />
              </View>
              <Text style={s.barLabel}>visit friends</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {barOpen ? (
          <Animated.View entering={BAR_ITEM_ENTERING} exiting={BAR_ITEM_EXITING} layout={BAR_LAYOUT}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Your profile"
              style={s.barItem}
              onPress={() => router.push("/profile" as Href)}
            >
              <View style={s.iconSlot}>
                <Image source={YOU_ICON} style={s.youIcon} resizeMode="contain" />
              </View>
              <Text style={s.barLabel}>you</Text>
            </Pressable>
          </Animated.View>
        ) : null}
      </Animated.View>

      {barOpen ? (
        <Animated.View entering={BAR_ITEM_ENTERING} exiting={BAR_ITEM_EXITING} layout={BAR_LAYOUT}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Collapse menu"
            accessibilityState={{ expanded: true }}
            hitSlop={12}
            style={s.chevronButton}
            onPress={() => setBarOpen(false)}
          >
            <View style={s.chevronRight}>
              <ChevronIcon size={26} up color="#595551" outlineColor={t.bg} outlineWidth={0.5} />
            </View>
          </Pressable>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  // The chevron is a sibling of the pill, so it sits outside the pill's border
  bottomBarWrap: {
    position: 'absolute',
    zIndex: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  bottomBarWrapOpen: {
    alignSelf: 'center',
  },
  // Keeps the chevron clear of the collar, which overhangs the shrunken pill
  bottomBarWrapClosed: {
    gap: 14,
  },
  chevronLift: {
    zIndex: 2,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 70,
    paddingHorizontal: 24,
    borderRadius: 22,
    borderWidth: 0.4,
    borderColor: '#D7D1CE',
    backgroundColor: '#FBFAF3',
    gap: 30,
    ...ELEVATION.card,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 6,
    shadowColor: '#929292',
  },
  bottomBarClosed: {
    height: 62,
    paddingHorizontal: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
    gap: 0,
  },
  chevronButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronLeft: {
    transform: [{ rotate: '270deg' }],
  },
  chevronRight: {
    transform: [{ rotate: '90deg' }],
  },
  // Wide enough for "visit friends" at 12px
  barItem: {
    width: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Matched to the shop's category labels so both bars share a type scale
  barLabel: {
    fontFamily: LEXEND.regular,
    fontSize: 12,
    lineHeight: 16,
    color: TEXT_COLOR,
    marginTop: 4,
    textAlign: 'center',
  },
  // Fixed height, so resizing an icon never moves its label
  iconSlot: {
    height: ICON_SLOT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barIcon: {
    width: BAR_ICON_SIZE,
    height: BAR_ICON_SIZE,
  },
  shopIcon: {
    width: SHOP_ICON_SIZE,
    height: SHOP_ICON_SIZE,
    transform: [{ translateX: SHOP_ICON_NUDGE_X }],
  },
  friendsIcon: {
    width: VISIT_FRIENDS_ICON_SIZE,
    height: VISIT_FRIENDS_ICON_SIZE,
  },
  youIcon: {
    width: YOU_ICON_SIZE,
    height: YOU_ICON_SIZE,
  },
  // Assemble has no icon slot, so it pads out the difference to keep its label in line
  assembleLabel: {
    marginTop: 4 + (ICON_SLOT - (ASSEMBLE_BUTTON_SIZE - ASSEMBLE_LIFT)),
  },
  assembleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Absolute, with its top solved from the button's centre so the two stay concentric
  assembleCollar: {
    position: 'absolute',
    alignSelf: 'center',
    top: ASSEMBLE_CENTRE_OPEN - ASSEMBLE_COLLAR_SIZE / 2,
  },
  // Bigger than the button, so it is centred by offset — flex won't centre an overflowing child
  assembleIcon: {
    position: 'absolute',
    left: (ASSEMBLE_BUTTON_SIZE - ASSEMBLE_ICON_SIZE) / 2,
    top: (ASSEMBLE_BUTTON_SIZE - ASSEMBLE_ICON_SIZE) / 2 + ASSEMBLE_ICON_NUDGE_Y,
    width: ASSEMBLE_ICON_SIZE,
    height: ASSEMBLE_ICON_SIZE,
  },
  assembleButton: {
    width: ASSEMBLE_BUTTON_SIZE,
    height: ASSEMBLE_BUTTON_SIZE,
    borderRadius: ASSEMBLE_BUTTON_SIZE / 2,
    marginTop: -ASSEMBLE_LIFT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D3CBD2',
  },
  // Collapsed there is no bar to pop out of, so the lift is dropped
  assembleButtonClosed: {
    marginTop: 0,
  },
  // Free-standing: a View, so the border runs full circle and the shadow traces it
  assembleCollarClosed: {
    position: 'absolute',
    alignSelf: 'center',
    top: ASSEMBLE_CENTRE_CLOSED - ASSEMBLE_COLLAR_SIZE / 2,
    width: ASSEMBLE_COLLAR_SIZE,
    height: ASSEMBLE_COLLAR_SIZE,
    borderRadius: ASSEMBLE_COLLAR_SIZE / 2,
    backgroundColor: '#FBFAF3',
    borderWidth: 0.4,
    borderColor: '#D7D1CE',
    ...ELEVATION.card,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 6,
    shadowColor: '#929292',
  },
});
