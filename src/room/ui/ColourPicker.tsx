// The colour/finish swatch column shown while a piece is being placed — the one place a player chooses which variant of an item goes into the room. Positioned by the placement rail in RoomExperience, which sets it beside the placement bar on the right edge so the ghost, the swatches and the confirm button read as one control.
//
// What it offers comes from item_variants (the DB is the source for which colours exist); what it shows per swatch is that variation's own thumbnail, the SAME picture the Shop and Inventory tiles use. The variation name is captioned as well as pictured: it is the honest label when the artwork is missing. Hidden for anything with fewer than two variations — a one-look item has no choice to make.
import { StyleSheet, ScrollView, Text, View } from "react-native";
import { Pressable } from "@/src/components/Pressable";

import { CatalogThumb } from "../../components/CatalogThumb";
import { useItemVariants } from "../../data/catalog/variantStore";
import { variationLabel } from "../../data/catalog/variantLabel";
import { CARD_CHROME, CREAM, LEXEND, SPACE, useFixedStyles } from "@/src/game/ui/system/theme";
import { roomItemSource } from "../core/placeableItems";
import { usePlacementStore } from "../core/placement";
import type { Theme } from "@/src/game/ui/system/theme";

interface ColourPickerProps {
  highlighted?: boolean;
  onSelect?: () => void;
}

export function ColourPicker({ highlighted = false, onSelect }: ColourPickerProps) {
  const s = useFixedStyles(makeStyles);
  // Primitive selectors, like the rest of this screen's placement reads: the ghost's object identity changes on every cell it crosses, and the swatch row must not re-render with it.
  const itemId = usePlacementStore((p) => p.activeEdit?.placement.itemId ?? null);
  const selected = usePlacementStore((p) => p.activeEdit?.placement.variation ?? null);
  const setGhostVariation = usePlacementStore((p) => p.setGhostVariation);
  const variants = useItemVariants(itemId);

  if (!itemId || variants.length < 2) return null;

  return (
    <View style={[s.bar, highlighted && s.guideTarget]}>
      {/* The SCROLLER is what clips, and it clips SQUARE. The swatches match the bar's inner radius,
          but a ScrollView's own bounds are a rectangle, so the first and last swatch were squared off
          exactly where the bar's corner curves away. Rounding the scroller makes the clip follow the
          bar. Safe to do here where it was not on the bar itself: the ScrollView carries no shadow to
          lose. */}
      <ScrollView
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.column}
      >
        {variants.map((variant) => {
          const active = variant.variation === selected;
          return (
            <Pressable
              key={variant.variation ?? "default"}
              accessibilityLabel={`Colour ${variationLabel(variant.variation)}`}
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [s.swatch, active && s.swatchActive, pressed && s.swatchPressed]}
              onPress={() => {
                setGhostVariation(variant.variation);
                onSelect?.();
              }}
            >
              <CatalogThumb
                source={roomItemSource(itemId)}
                itemId={itemId}
                variation={variant.variation}
                size={38}
              />
              <Text style={[s.label, active && s.labelActive]} numberOfLines={1}>
                {variationLabel(variant.variation)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// The same three tokens the placement bar uses, so the two columns are one control
const PICKER_FILL = "#FBFAF3";
const PICKER_WELL = "#EFE9E0";
const PICKER_ACTIVE = "#8D7BA8";

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    // Laid out by the rail, so no position of its own. maxHeight is what makes the list scroll rather than grow past the band the rail was given — the rail has a definite height, so the percentage resolves against it.
    bar: {
      maxHeight: "100%",
      borderRadius: 22,
      // Matched to the placement bar beside it — same cream, same shadow, no outline
      backgroundColor: PICKER_FILL,
      paddingHorizontal: SPACE.xs,
      paddingVertical: SPACE.xs,
      ...CARD_CHROME,
      borderWidth: 0,
    },
    // The bar's INNER radius, the same number the swatches use — the two curves have to agree or one
    // of them shows through the other.
    //
    // flexGrow: 0 OVERRIDES ReactNative's own ScrollView default, which is flexGrow: 1, and it is what
    // makes this column as tall as its swatches instead of as tall as the band the rail hands it. The
    // bug it fixes only appeared on TABLETS, which is what made it look device-specific when nothing
    // here branches on the device: a phone's band is barely taller than four swatches, so maxHeight
    // clamped the growth away and the column looked right by accident. A tablet's band is some 600pt,
    // and the same growth drew a cream column down most of the screen with the swatches parked at the
    // top of it.
    //
    // flexShrink stays 1 — that is the half of the default that IS wanted. Together they mean: hug the
    // content, until the content is taller than the band, then clamp to the band and scroll.
    scroll: { borderRadius: 22 - SPACE.xs, flexGrow: 0, flexShrink: 1 },
    column: { flexDirection: "column", alignItems: "center", gap: SPACE.xs },
    swatch: {
      width: 58,
      paddingVertical: SPACE.xs,
      // THE BAR'S INNER RADIUS, not RADIUS.control. A rounded box inside a rounded box has to match
      // `outer - padding` or its corners cut outside the parent's curve: at 14 against the bar's 22
      // minus 4 of padding, the top and bottom swatches showed square shoulders poking past the rail.
      // Nothing here can be clipped away instead — `overflow: hidden` on the bar would take
      // CARD_CHROME's shadow with it on Android.
      borderRadius: 22 - SPACE.xs,
      borderWidth: 2,
      // Transparent, not absent: the selected border must not change the swatch's size.
      borderColor: "transparent",
      backgroundColor: PICKER_WELL,
      alignItems: "center",
      gap: 2,
    },
    // The lavender the room already uses for a chosen thing — the shop's locked star and the assemble disc
    swatchActive: { borderColor: PICKER_ACTIVE, backgroundColor: PICKER_WELL },
    swatchPressed: { transform: [{ scale: 0.94 }] },
    label: { ...LEXEND.semibold, fontSize: 9.5, color: CREAM.ink, opacity: 0.55 },
    labelActive: { opacity: 1 },
    guideTarget: {
      borderWidth: 3,
      borderColor: t.accent,
      shadowColor: t.accent,
      shadowOpacity: 0.45,
      shadowRadius: 8,
    },
  });