import type { ReactNode } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import {
  GestureDetector,
  GestureType,
  ScrollView,
} from "react-native-gesture-handler";
import { AssemblyAction } from "@/src/adhd/core/type";
import type { TrayItem } from "../scene/useSceneState";

interface Props {
  items: TrayItem[];
  gestureFor: (action: AssemblyAction) => GestureType;
  /** Optional pinned chip above the list (e.g. the stage-3 base set-aside). */
  header?: ReactNode;
  /** Per-group thumbnail, keyed by group (furniture.thumbs). May be sparse. */
  thumbs?: Record<string, number>;
  /** Dark-mode theming (matches the rest of the HUD). */
  dark?: boolean;
}

/**
 * Inventory column (right edge): everything the current stage uses, grouped
 * with remaining counts. Long-press an enabled card to take one in hand and
 * drag it into the scene; locked cards are waiting on other steps.
 */
export function PartsTray({ items, gestureFor, header, thumbs, dark }: Props) {
  if (items.length === 0 && !header) return null;
  return (
    <View style={styles.column} pointerEvents="box-none">
      {header}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {items.map((item) => {
          const thumb = thumbs?.[item.group];
          const card = (
            <View
              key={item.group}
              style={[styles.card, dark && styles.cardDark, !item.enabled && styles.cardDisabled]}
            >
              {thumb ? (
                <Image source={thumb} style={styles.thumb} resizeMode="contain" />
              ) : (
                <View style={styles.thumb} />
              )}
              <Text style={[styles.label, dark && styles.labelDark]} numberOfLines={2}>
                {item.label}
              </Text>
              {item.remaining > 1 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>×{item.remaining}</Text>
                </View>
              ) : null}
            </View>
          );
          // The detector must stay mounted even while the card is disabled:
          // pickup flips `enabled` false mid-touch, and unmounting the
          // detector then would destroy the active pan (frozen held part,
          // no finalize). Pickability is enforced inside the gesture.
          return item.action ? (
            <GestureDetector key={item.group} gesture={gestureFor(item.action)}>
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

const styles = StyleSheet.create({
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
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(60,50,40,0.15)",
    paddingVertical: 7,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 4,
  },
  cardDisabled: { opacity: 0.35 },
  cardDark: {
    backgroundColor: "rgba(22,30,44,0.86)",
    borderColor: "rgba(255,255,255,0.18)",
  },
  labelDark: { color: "#eef1f6" },
  thumb: { width: 44, height: 44 },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: "#2e2a24",
    textAlign: "center",
  },
  badge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "#c06c84",
    borderRadius: 9,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
});