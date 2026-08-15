// The category row for the catalogue popups (shop and inventory), mounted on a wooden board
// Tabs come from src/data/shop/items.ts, so adding a category is a one-line change there
import { useState } from "react";
import { StyleSheet, Image, Pressable, Text, View } from "react-native";

import { IconPlaceholder } from "@/src/components/IconPlaceholder";
import { CATEGORY_LABELS, SHOP_CATEGORY_TABS } from "@/src/data";
import type { ShopCategory } from "@/src/data";
import { CREAM, LEXEND, useFixedStyles } from "@/src/game/ui/system/theme";
import type { Theme } from "@/src/game/ui/system/theme";

const BOARD = require("@/src/assets/ui/wooden-board-screws.png");
// How far the board runs past the measured tab row, horizontally. Height is NOT set from the
// row: it comes from the asset's own aspect below, or the plank renders distorted
// Paired with the row's `gap`: the board is measured FROM the row, so widening the gaps would
// widen the board too. Half of any gap increase has to come off here to hold the board still
const BOARD_OVERHANG_X = 21;
// The PNG's real proportions (4589x688). Height follows width by this, so the wood is never
// squashed or stretched. Re-measure if the artwork is re-exported
const BOARD_ASPECT = 4589 / 688;

export function CategoryBoardTabs({
  category,
  onCategory,
}: {
  category: ShopCategory;
  onCategory: (next: ShopCategory) => void;
}) {
  const s = useFixedStyles(makeStyles);
  // Measured, not inferred from flex: the board is sized in px from the row it sits behind, so
  // it can only ever be as big as the tabs and never stretches to the panel
  const [row, setRow] = useState({ width: 0, height: 0 });
  return (
    <View style={s.header}>
      {/* Absolute and first, so it paints behind the tabs */}
      {row.width > 0
        ? (() => {
            const width = row.width + BOARD_OVERHANG_X * 2;
            const height = width / BOARD_ASPECT;
            return (
              <Image
                source={BOARD}
                style={[
                  s.board,
                  {
                    // left:50% + half its own width back: centres on the header whatever the
                    // header's own width turns out to be, which flex alone would not guarantee
                    marginLeft: -width / 2,
                    // Centred on the row, since the height is the asset's and not the row's
                    top: (row.height - height) / 2,
                    width,
                    height,
                  },
                ]}
                resizeMode="contain"
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
              // So the disc is never the only signal of the active tab
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
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    // Height comes from the row, so the board's top offset lines up with it
    // zIndex, or the grid below (a later sibling) paints over the board's overhang
    header: {
      zIndex: 2,
      alignItems: "center",
    },
    // Size comes from the measured row above; only position lives here
    board: {
      position: "absolute",
      left: "50%",
    },
    // alignSelf, so the row hugs its tabs rather than filling the panel — that measured width
    // is what the board is drawn from
    row: {
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: 36,
      paddingHorizontal: 18,
    },
    // flexShrink:0, or a cramped row squeezes the tabs and distorts the disc below
    tab: {
      alignItems: "center",
      flexShrink: 0,
    },
    // Transparent until selected: the disc IS the selection
    iconWrap: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    // Repeats the radius: on Android, swapping in a background can otherwise redraw the view
    // with a square drawable and lose the base style's rounding
    iconWrapActive: {
      backgroundColor: CREAM.card,
      borderRadius: 24,
      overflow: "hidden",
    },
    // The outline is a zero-offset shadow, not a stroke: RN has no text stroke, and an even
    // halo is what reads as one. Keeps the label legible against the wood grain behind it
    label: {
      marginTop: 2,
      ...LEXEND.bold,
      fontSize: 12,
      lineHeight: 16,
      color: CREAM.ink,
      textAlign: "center",
      textShadowColor: "#FAF7F2",
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 3,
    },
  });
