import { Theme, useStyles } from "@/src/game/ui/theme";
import type { ReactNode } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import {
  GestureDetector,
  GestureType,
  ScrollView,
} from "react-native-gesture-handler";
import { AssemblyAction, ThumbMap } from "@/src/game/core/type";
import { thumbFor } from "@/src/game/core/presentation/labels";
import { useColorScheme } from "@/src/hooks/use-color-scheme";
import type { TrayItem } from "../scene/useSceneState";

interface Props {
  items: TrayItem[];
  gestureFor: (action: AssemblyAction) => GestureType;
  /** Optional pinned chip above the list (e.g. the stage-3 base set-aside). */
  header?: ReactNode;
  /** Per-group thumbnails, keyed by group (furniture.thumbs). May be sparse. */
  thumbs?: ThumbMap;
}

/** Inventory column (right edge): everything the current stage uses, grouped with remaining counts. Long-press an enabled card to take one in hand and drag it into the scene; locked cards are waiting on other steps. */
export function PartsTray({ items, gestureFor, header, thumbs }: Props) {
  const styles = useStyles(makeStyles);
  const theme = useColorScheme() === "dark" ? "dark" : "light";
  if (items.length === 0 && !header) return null;
  return (
    <View style={styles.column} pointerEvents="box-none">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {header}
        {items.map((item) => {
          const thumb = thumbs ? thumbFor(thumbs, item.group, theme) : undefined;
          const card = (
            <View
              key={item.group}
              style={[styles.card, !item.enabled && styles.cardDisabled]}
            >
              {thumb ? (
                <Image source={thumb} style={styles.thumb} resizeMode="contain" />
              ) : (
                <View style={styles.thumb} />
              )}
              <Text style={styles.label} numberOfLines={2}>
                {item.label}
              </Text>
              {item.remaining > 1 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>×{item.remaining}</Text>
                </View>
              ) : null}
            </View>
          );
          return item.action ? (
            <GestureDetector
              key={`${item.group}:${item.action.actionId}`}
              gesture={gestureFor(item.action)}
            >
              {card}
            </GestureDetector>
          ) : (
            card
          );
        })}
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  column: {
    position: "absolute",
    right: 10,
    top: 70,
    bottom: 70,
    width: 124,
    gap: 8,
  },
  scroll: { flexShrink: 1 },
  list: { gap: 8, paddingVertical: 4 },
  card: {
    backgroundColor: t.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.border,
    paddingVertical: 7,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 4,
  },
  cardDisabled: { opacity: 0.35 },
  thumb: { width: 44, height: 44 },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: t.text,
    textAlign: "center",
  },
  badge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: t.danger,
    borderRadius: 9,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeText: { color: t.text, fontSize: 11, fontWeight: "700" },
  });
