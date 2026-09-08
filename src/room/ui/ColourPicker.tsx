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
  const itemId = usePlacementStore((p) => p.activeEdit?.placement.itemId ?? null);
  const selected = usePlacementStore((p) => p.activeEdit?.placement.variation ?? null);
  const setGhostVariation = usePlacementStore((p) => p.setGhostVariation);
  const variants = useItemVariants(itemId);

  if (!itemId || variants.length < 2) return null;

  return (
    <View style={[s.bar, highlighted && s.guideTarget]}>
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

const PICKER_FILL = "#FBFAF3";
const PICKER_WELL = "#EFE9E0";
const PICKER_ACTIVE = "#8D7BA8";

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    bar: {
      maxHeight: "100%",
      borderRadius: 22,
      backgroundColor: PICKER_FILL,
      paddingHorizontal: SPACE.xs,
      paddingVertical: SPACE.xs,
      ...CARD_CHROME,
      borderWidth: 0,
    },
    scroll: {
      borderRadius: 22 - SPACE.xs,
      flexGrow: 0,
      flexShrink: 1,
    },
    column: {
      flexDirection: "column",
      alignItems: "center",
      gap: SPACE.xs,
    },
    swatch: {
      width: 58,
      paddingVertical: SPACE.xs,
      borderRadius: 22 - SPACE.xs,
      borderWidth: 2,
      borderColor: "transparent",
      backgroundColor: PICKER_WELL,
      alignItems: "center",
      gap: 2,
    },
    swatchActive: {
      borderColor: PICKER_ACTIVE,
      backgroundColor: PICKER_WELL,
    },
    swatchPressed: { transform: [{ scale: 0.94 }] },
    label: {
      ...LEXEND.semibold,
      fontSize: 9.5,
      color: CREAM.ink,
      opacity: 0.55,
    },
    labelActive: { opacity: 1 },
    guideTarget: {
      borderWidth: 3,
      borderColor: t.accent,
      shadowColor: t.accent,
      shadowOpacity: 0.45,
      shadowRadius: 8,
    },
  });