// The category row for the catalogue popups (shop and inventory), mounted on a cream panel
// Tabs come from src/data/shop/items.ts, so adding a category is a one-line change there
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

// One drawing per category, each in a box SOLVED so the six read at the same size.
//
// Equal boxes would not do it: these PNGs fill their canvases very differently (the lamp draws 62 of
// its 172px width, the wallpaper 158 of 200), and `contain` scales the whole canvas, margins included.
// Nor is equal HEIGHT enough on its own — a lamp and a rug are different shapes, and matching their
// heights makes the rug look enormous. So each box is solved from the geometric mean of the drawing's
// width and height (which balances tall against wide), then capped so nothing draws taller than 40pt:
//
//   box = min(38 * max(canvas) / sqrt(drawnW * drawnH), 48 * max(canvas) / drawnH)
//
// Re-solve with that if any of these files is re-exported; the measurements come from each PNG's own
// alpha channel at a threshold, not from its canvas.
// The disc behind the selected tab. The same lavender the room's assemble button wears, so "chosen"
// looks the same wherever it appears.
const ACTIVE_DISC = "#D4CED9";

// How much bigger the icons draw ON A TABLET, over and above the `k` the whole row already scales by.
//
// The row's own scale is solved to make the PANEL span the grid, and it lands modestly (about 1.1);
// the discs grow with it but the artwork inside them ends up looking lost on a screen that size. This
// is the icons alone — the discs, the labels and the panel are untouched by it.
const TABLET_ICON_LIFT = 1.25;

const CATEGORY_ART: Record<
  ShopCategory,
  { src: number; size: number; nudgeY?: number; tabletLift?: number }
> = {
  fur: { src: require("@/src/assets/ui/icons/Furniture.png"), size: 54 },
  wall: { src: require("@/src/assets/ui/icons/Wallpaper.png"), size: 48 },
  // Positive = down. floor.png draws a rug seen from above, whose weight sits high in its own canvas,
  // so it reads as floating when the box is centred on the disc.
  // tabletLift overrides the shared TABLET_ICON_LIFT for this one: the rug is the widest drawing of
  // the six, so the lift that suits the others pushes it out to the disc's edges.
  floor: { src: require("@/src/assets/ui/icons/floor.png"), size: 54, nudgeY: 4, tabletLift: 1.05 },
  // Nudged up from the solved 41: deco.png's drawing is a loose cluster rather than one solid shape,
  // so the mean the formula works from over-reads how much of the box it fills, and it lands small.
  deco: { src: require("@/src/assets/ui/icons/deco.png"), size: 56 },
  win: { src: require("@/src/assets/ui/icons/Window.png"), size: 44 },
  lit: { src: require("@/src/assets/ui/icons/Lighting.png"), size: 59 },
};
// How far the panel runs past the measured tab row, horizontally. Height is NOT set from the
// row: it comes from the asset's own aspect below, or the artwork renders distorted
// Paired with the row's `gap`: the board is measured FROM the row, so widening the gaps would
// widen the board too. Half of any gap increase has to come off here to hold the board still
const BOARD_OVERHANG_X = 21;
// THE BOARD'S OWN GEOMETRY — the asset, its aspect, its stretch, the tablet widen and the span solve —
// lives in components/popupBoard. The friend picker wears the same plank, and a second copy of those
// numbers here would drift differently on every screen shape rather than merely drifting.
//
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
// below the board's own growth: the panel spans the grid, but six discs stretched to that span would
// be buttons rather than tabs, and the labels would out-shout the item names below.
const TAB_FILL = 0.88;
// The phone's own scale for this strip. Under 1 because the tabs were authored against a narrower
// panel than they have now, and the whole row — discs, gaps, labels, and the panel measured from
// them — reads heavy for a header at full size. It is ONE number rather than six edits: everything
// on the tab is drawn through this same k.
const PHONE_TAB_SCALE = 0.9;
// The row at scale 1: six discs, five gaps, and the padding either side. Kept in step with the sheet
// below by hand — it is the one measurement that cannot be taken from a rendered row, since the row's
// width is what this decides.
// The tab's disc — the ring behind an icon, and the highlight behind the selected one. It is ALSO the
// row's natural width, which the panel is measured from, so changing it moves the panel too: the
// natural row below is six of these plus the gaps.
const TAB_DISC = 64;
const TAB_GAP = 36;
const ROW_PADDING_X = 18;
// The label's outline. textShadow was tried first and is not enough here: Android draws it as a soft
// shadow LAYER, which at this size dissolves into the wood instead of edging the letters. So the
// outline is drawn the only way RN text can really do it — the same word repeated behind itself, once
// per direction, in the outline colour.
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
      : PHONE_TAB_SCALE;

  const s = useScaledStyles(makeStyles, k);
  // The icons take the row's scale AND a tablet-only lift; everything else on the tab takes just `k`
  const iconScale = (id: ShopCategory) =>
    tablet ? k * (CATEGORY_ART[id].tabletLift ?? TABLET_ICON_LIFT) : k;
  return (
    <View
      style={[s.header, tablet ? { marginTop: BOARD_DROP * k } : null]}
      onLayout={(e) => setAvailable(e.nativeEvent.layout.width)}
    >
      {/* Absolute and first, so it paints behind the tabs */}
      {row.width > 0
        ? (() => {
            // On a tablet the panel spans the grid outright; on a phone it stays what it always
            // was — the row plus its overhang, which is narrower than the tiles by design.
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
                    // left:50% + half its own width back: centres on the header whatever the
                    // header's own width turns out to be, which flex alone would not guarantee
                    marginLeft: -width / 2,
                    // Centred on the row, since the height is the asset's and not the row's
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
              // So the disc is never the only signal of the active tab
              accessibilityState={{ selected: active }}
              style={s.tab}
              onPress={() => onCategory(id)}
            >
              <View style={s.iconWrap}>
                {/* BEHIND the icon rather than around it. As a background on the wrap it clipped the
                    artwork, which now overflows the disc on a tablet — and the clip cannot simply be
                    dropped, because it is what keeps the corners round on Android. */}
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
              {/* The wrapper carries the pull, so the word and its eight outline copies move together */}
              <View style={tablet ? null : s.labelTight}>
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
      width: TAB_DISC,
      height: TAB_DISC,
      borderRadius: TAB_DISC / 2,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    // Its own view, so the icon above it is not a child of anything clipped. Mounted and unmounted
    // rather than swapped as a background, which also sidesteps the Android bug this style used to
    // guard against: swapping a background on a rounded view redraws it with a square drawable.
    activeDisc: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: TAB_DISC / 2,
      backgroundColor: ACTIVE_DISC,
      overflow: "hidden",
    },
    // The outline is a zero-offset shadow, not a stroke: RN has no text stroke, and an even
    // halo is what reads as one. Keeps the label legible against the wood grain behind it
    label: {
      marginTop: 2,
      ...LEXEND.medium,
      fontSize: 13.5,
      lineHeight: 17,
      color: CREAM.ink,
      textAlign: "center",
    },
    // PHONE ONLY. The artwork sits inside a 64pt disc with room to spare, so the gap between a drawing
    // and its label measures much larger than the 2pt margin suggests. A tablet has the width to carry
    // that air; a phone does not.
    labelTight: {
      marginTop: -8,
    },
    // One of the eight copies behind the word. Absolute, so they stack on the real one without moving it
    labelOutline: {
      position: "absolute",
      left: 0,
      right: 0,
      color: BOARD_LABEL_OUTLINE,
    },
  });
