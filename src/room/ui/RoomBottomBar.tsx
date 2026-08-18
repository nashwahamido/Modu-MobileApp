// the room hub's bottom navigation:shop / inventory/ assemble/ visit friends /you
import { useState } from 'react';
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { StyleSheet, Image, Pressable, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { ChevronIcon } from '../../components/Icons';
import { ASSEMBLE_ICON, INVENTORY_ICON, SHOP_ICON, VISIT_FRIENDS_ICON, YOU_ICON } from '../../components/iconAssets';
import { CARD_CHROME, CREAM, useFixedStyles, LEXEND } from "@/src/game/ui/system/theme";
import type { Theme } from "@/src/game/ui/system/theme";
import { useScreenInsets } from '../../hooks/use-safe-insets';


//  bar's outline shared with assemble collar and the chevron so the three read as one continuous edge.
//  Taken from the catalogue cards, so the room's chrome and the build screen's tiles share a material.
const BAR_STROKE = CARD_CHROME.borderColor;
const BAR_STROKE_WIDTH = CARD_CHROME.borderWidth;
const BAR_FILL = '#FBFAF3';
const BAR_HEIGHT = 58;

const BAR_SHADOW = CARD_CHROME;

// animation on shrink down
const BAR_LAYOUT= LinearTransition.duration(220);
const BAR_ITEM_ENTERING = FadeIn.duration(160);
const BAR_ITEM_EXITING = FadeOut.duration(120);


const BAR_ICON_SIZE = 34;
const SHOP_ICON_SIZE = 42;
const VISIT_FRIENDS_ICON_SIZE = 40;
const ASSEMBLE_SPREAD = 12;
const BAR_GAP= 30 - ASSEMBLE_SPREAD / 2;
const YOU_ICON_SIZE= 34;
const SHOP_ICON_NUDGE_X = -4;
const ICON_SLOT = 38;
const ASSEMBLE_LIFT = 22;

const ASSEMBLE_COLLAR_SIZE = 68;
const ASSEMBLE_BUTTON_SIZE = 55;
const ASSEMBLE_ICON_SIZE = 76;
const ASSEMBLE_ICON_NUDGE_Y = -7;
const ASSEMBLE_CENTRE_OPEN = -ASSEMBLE_LIFT + ASSEMBLE_BUTTON_SIZE / 2;
const ASSEMBLE_CENTRE_CLOSED = ASSEMBLE_BUTTON_SIZE / 2;
const BAR_LABEL_LINE_HEIGHT = 13;
const BAR_LABEL_GAP= 2;
const ASSEMBLE_LABEL_TOP = BAR_LABEL_GAP + (ICON_SLOT - (ASSEMBLE_BUTTON_SIZE - ASSEMBLE_LIFT));
const ASSEMBLE_WRAP_HEIGHT =
  ASSEMBLE_BUTTON_SIZE - ASSEMBLE_LIFT + ASSEMBLE_LABEL_TOP + BAR_LABEL_LINE_HEIGHT;

const ASSEMBLE_COLLAR_ARC = (() => {
  const r = ASSEMBLE_COLLAR_SIZE / 2;
  const barTop = -(BAR_HEIGHT - ASSEMBLE_WRAP_HEIGHT) / 2 + BAR_STROKE_WIDTH / 2;
  const rise = Math.min(ASSEMBLE_CENTRE_OPEN - barTop, r);
  const half = Math.acos(rise / r);
  const dx = r * Math.sin(half);
  const leftX = r - dx;
  const rightX = r + dx;
  const y = r - rise;
  return `M ${leftX} ${y} A ${r} ${r} 0 0 1 ${rightX} ${y}`;
})();

export function RoomBottomBar({
  onOpenShop,
  onOpenInventory,
  onOpenVisit,
}: {
  onOpenShop: () => void;
  onOpenInventory: () => void;
  onOpenVisit: () => void;
}) {
  const s = useFixedStyles(makeStyles);
  // Immersive mode reports 0 insets, so these floors sit UNDER the design's own offsets
  const safe = useScreenInsets();
  const padL = 22 + safe.left;
  // Design spacing only — safe.bottom is already floored, so lowering this cannot push the bar under the gesture pill
  const padBottom = 10 + safe.bottom;
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
              <ChevronIcon size={26} up color={BAR_FILL} outlineColor={BAR_STROKE} outlineWidth={BAR_STROKE_WIDTH} />
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
              <Text style={s.barLabel}>Shop</Text>
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
              <Text style={s.barLabel}>Inventory</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        <Animated.View layout={BAR_LAYOUT} style={s.assembleWrap}>
          {barOpen ? (
            <Svg width={ASSEMBLE_COLLAR_SIZE} height={ASSEMBLE_COLLAR_SIZE} style={s.assembleCollar} pointerEvents="none">
              <Circle
                cx={ASSEMBLE_COLLAR_SIZE / 2}
                cy={ASSEMBLE_COLLAR_SIZE / 2}
                r={ASSEMBLE_COLLAR_SIZE / 2}
                fill={BAR_FILL}
              />
              <Path d={ASSEMBLE_COLLAR_ARC} fill="none" stroke={BAR_STROKE} strokeWidth={BAR_STROKE_WIDTH} />
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
          {barOpen ? <Text style={[s.barLabel, s.assembleLabel]}>Assemble</Text> : null}
        </Animated.View>

        {barOpen ? (
          <Animated.View entering={BAR_ITEM_ENTERING} exiting={BAR_ITEM_EXITING} layout={BAR_LAYOUT}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Visit friends"
              style={s.barItem}
              onPress={onOpenVisit}
            >
              <View style={s.iconSlot}>
                <Image source={VISIT_FRIENDS_ICON} style={s.friendsIcon} resizeMode="contain" />
              </View>
              <Text style={s.barLabel}>Friends</Text>
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
              <Text style={s.barLabel}>You</Text>
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
              <ChevronIcon size={26} up color={BAR_FILL} outlineColor={BAR_STROKE} outlineWidth={BAR_STROKE_WIDTH} />
            </View>
          </Pressable>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
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
  bottomBarWrapClosed: {
    gap: 14,
  },
  chevronLift: {
    zIndex: 2,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: BAR_HEIGHT,
    paddingHorizontal: 24,
    borderRadius: 32,
    backgroundColor: BAR_FILL,
    gap: BAR_GAP,
    ...BAR_SHADOW,
  },
  bottomBarClosed: {
    height: 62,
    paddingHorizontal: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    boxShadow: '0px 0px 0px rgba(0,0,0,0)',
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

  barItem: {
    width: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barLabel: {
    ...LEXEND.medium,
    fontSize: 10.5,
    lineHeight: BAR_LABEL_LINE_HEIGHT,
    color: CREAM.ink,
    marginTop: BAR_LABEL_GAP,
    textAlign: 'center',
  },
  
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
  assembleLabel: {
    marginTop: ASSEMBLE_LABEL_TOP,
  },
  assembleWrap: {
    marginHorizontal: ASSEMBLE_SPREAD,
    alignItems: 'center',
    justifyContent: 'center',
  },
 
  assembleCollar: {
    position: 'absolute',
    alignSelf: 'center',
    top: ASSEMBLE_CENTRE_OPEN - ASSEMBLE_COLLAR_SIZE / 2,
  },
 
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
    backgroundColor: '#E6DCF5',
    borderWidth: 0.6,
    borderColor: '#9C9994',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  assembleButtonClosed: {
    marginTop: 0,
  },
  assembleCollarClosed: {
    position: 'absolute',
    alignSelf: 'center',
    top: ASSEMBLE_CENTRE_CLOSED - ASSEMBLE_COLLAR_SIZE / 2,
    width: ASSEMBLE_COLLAR_SIZE,
    height: ASSEMBLE_COLLAR_SIZE,
    borderRadius: ASSEMBLE_COLLAR_SIZE / 2,
    backgroundColor: BAR_FILL,
    ...BAR_SHADOW,
  },
});
