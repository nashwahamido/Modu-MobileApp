// The colour/finish swatch column shown while a piece is being placed — the one place a player chooses which variant of an item goes into the room. Positioned by the placement rail in RoomExperience, which sets it beside the placement bar on the right edge so the ghost, the swatches and the confirm button read as one control.
//
// What it offers comes from item_variants (the DB is the source for which colours exist); what it shows per swatch is that variation's own thumbnail, the SAME picture the Shop and Inventory tiles use. The variation name is captioned as well as pictured: it is the honest label when the artwork is missing. Hidden for anything with fewer than two variations — a one-look item has no choice to make.
import { StyleSheet, Pressable, ScrollView, Text, View } from "react-native";

import { CatalogThumb } from "../../components/CatalogThumb";
import { useItemVariants } from "../../data/catalog/variantStore";
import { RADIUS, SPACE, TYPE, useStyles } from "@/src/game/ui/system/theme";
import { roomItemSource } from "../core/placeableItems";
import { usePlacementStore } from "../core/placement";
import type { Theme } from "@/src/game/ui/system/theme";

interface ColourPickerProps {
  highlighted?: boolean;
  onSelect?: () => void;
}

export function ColourPicker({ highlighted = false, onSelect }: ColourPickerProps) {
  const s = useStyles(makeStyles);
  // Primitive selectors, like the rest of this screen's placement reads: the ghost's object identity changes on every cell it crosses, and the swatch row must not re-render with it.
  const itemId = usePlacementStore((p) => p.activeEdit?.placement.itemId ?? null);
  const selected = usePlacementStore((p) => p.activeEdit?.placement.variation ?? null);
  const setGhostVariation = usePlacementStore((p) => p.setGhostVariation);
  const variants = useItemVariants(itemId);

  if (!itemId || variants.length < 2) return null;

  return (
    <View style={[s.bar, highlighted && s.guideTarget]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.column}>
        {variants.map((variant) => {
          const active = variant.variation === selected;
          return (
            <Pressable
              key={variant.variation ?? "default"}
              accessibilityLabel={`Colour ${variant.variation ?? "default"}`}
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
                {variant.variation ?? "default"}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    // Laid out by the rail, so no position of its own. maxHeight is what makes the list scroll rather than grow past the band the rail was given — the rail has a definite height, so the percentage resolves against it.
    bar: {
      maxHeight: "100%",
      borderRadius: RADIUS.panel,
      backgroundColor: t.surface,
      paddingHorizontal: SPACE.xs,
      paddingVertical: SPACE.xs,
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 8,
    },
    column: { flexDirection: "column", alignItems: "center", gap: SPACE.xs },
    swatch: {
      width: 58,
      paddingVertical: SPACE.xs,
      borderRadius: RADIUS.control,
      borderWidth: 2,
      // Transparent, not absent: the selected border must not change the swatch's size.
      borderColor: "transparent",
      backgroundColor: t.surfaceInset,
      alignItems: "center",
      gap: 2,
    },
    swatchActive: { borderColor: t.accent, backgroundColor: t.surfaceRaised },
    swatchPressed: { transform: [{ scale: 0.94 }] },
    label: { ...TYPE.labelSm, fontSize: 9.5, color: t.textFaint },
    labelActive: { color: t.text },
    guideTarget: {
      borderWidth: 3,
      borderColor: t.accent,
      shadowColor: t.accent,
      shadowOpacity: 0.45,
      shadowRadius: 8,
    },
  });
