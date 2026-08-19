// The category row for the catalogue popups (shop and inventory), mounted on a wooden board
// Tabs come from src/data/shop/items.ts, so adding a category is a one-line change there
import { useState } from "react";
import { StyleSheet, Image, Pressable, Text, View, useWindowDimensions } from "react-native";

import { IconPlaceholder } from "@/src/components/IconPlaceholder";
import { GRID_EDGE } from "@/src/components/popupInsets";
import { CATEGORY_LABELS, SHOP_CATEGORY_TABS } from "@/src/data";
import type { ShopCategory } from "@/src/data";
import { CREAM, LEXEND, useScaledStyles } from "@/src/game/ui/system/theme";
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

// THE TABLET FILL.
//
// The board is measured FROM the tab row, so the only way to make it span the panel is to make the row
// itself wider — bigger discs, bigger type, wider gaps. That is what this solves for: the row's natural
// width at phone size against the width the header actually has, so the board reaches end to end on any
// tablet rather than sitting as a short plank in the middle of a wide panel.
//
// PHONES ARE EXCLUDED, and not because the arithmetic would fail: a phone's panel is ALSO wider than
// the row (about 1.5x), so this would scale a layout that is already correct and was signed off as is.
const TABLET_MIN_SHORT_DP = 600;
// Past this the discs stop reading as a row of tabs and start reading as buttons
const MAX_TAB_SCALE = 1.45;
// How big the TABS get on a tablet, now that the board's width no longer comes from them. Held well
// below the board's own growth: the plank spans the grid, but six discs stretched to that span would
// be buttons rather than tabs, and the labels would out-shout the item names below.
const TAB_FILL = 0.88;
// How far the board hangs below the panel's top edge, ON TABLETS ONLY. The panel's own paddingTop is
// authored for a phone, where it is most of the panel's height; on a tablet the same 18pt leaves the
// plank pinned to the border with the grid stranded below it. Scaled, so it grows with the board.
const BOARD_DROP = 16;
// The row at scale 1: six discs, five gaps, and the padding either side. Kept in step with the sheet
// below by hand — it is the one measurement that cannot be taken from a rendered row, since the row's
// width is what this decides.
const TAB_DISC = 48;
const TAB_GAP = 36;
const ROW_PADDING_X = 18;
// The label's outline. textShadow was tried first and is not enough here: Android draws it as a soft
// shadow LAYER, which at this size dissolves into the wood instead of edging the letters. So the
// outline is drawn the only way RN text can really do it — the same word repeated behind itself, once
// per direction, in the outline colour.
const OUTLINE_COLOUR = "#FAF7F2";
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
  // Measured, not inferred from flex: the board is sized in px from the row it sits behind, so
  // it can only ever be as big as the tabs and never stretches to the panel
  const [row, setRow] = useState({ width: 0, height: 0 });
  // The width the row is allowed to grow into. Measured on the header, because the panel's own width
  // varies with the device's safe area and is not knowable from here.
  const [available, setAvailable] = useState(0);
  const { width: screenW, height: screenH } = useWindowDimensions();

  const naturalRow =
    SHOP_CATEGORY_TABS.length * TAB_DISC +
    (SHOP_CATEGORY_TABS.length - 1) * TAB_GAP +
    ROW_PADDING_X * 2;
  const tablet = Math.min(screenW, screenH) >= TABLET_MIN_SHORT_DP;
  // Solved against the BOARD's width, not the row's. The board is row * k + overhang * 2 * k — the
  // overhang scales too — so the divisor has to include it. Subtracting an unscaled overhang from the
  // available width instead is what made the plank overshoot the panel by its own margin.
  // THE BOARD'S WIDTH AND THE TABS' SIZE ARE NOW SEPARATE, and that is the whole point of this block.
  // The board used to be measured from the row, so the only way to widen the plank was to inflate the
  // discs and the labels with it — and the plank's height came along too, since its aspect is fixed.
  // Sizing the two independently is what lets it span the grid without the tabs becoming buttons.
  //
  // The board spans the GRID: from the leftmost tile's left edge to the rightmost tile's right edge.
  // Header and grid sit inside the same panel padding, so the header's width less the grid's own edge
  // padding IS that span.
  const tileSpan = available - GRID_EDGE * 2;
  const k =
    tablet && available > 0
      ? Math.max(
          1,
          Math.min(MAX_TAB_SCALE, (tileSpan * TAB_FILL) / (naturalRow + BOARD_OVERHANG_X * 2)),
        )
      : 1;

  const s = useScaledStyles(makeStyles, k);
  return (
    <View
      style={[s.header, tablet ? { marginTop: BOARD_DROP * k } : null]}
      onLayout={(e) => setAvailable(e.nativeEvent.layout.width)}
    >
      {/* Absolute and first, so it paints behind the tabs */}
      {row.width > 0
        ? (() => {
            // On a tablet the plank spans the grid outright; on a phone it stays what it always
            // was — the row plus its overhang, which is narrower than the tiles by design.
            const width = tablet ? tileSpan : row.width + BOARD_OVERHANG_X * 2 * k;
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
                <IconPlaceholder size={38 * k} />
              </View>
              <View>
                {/* The copies are absolute so they take no space: the real word below sets the box */}
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
    },
    // One of the eight copies behind the word. Absolute, so they stack on the real one without moving it
    labelOutline: {
      position: "absolute",
      left: 0,
      right: 0,
      color: OUTLINE_COLOUR,
    },
  });
