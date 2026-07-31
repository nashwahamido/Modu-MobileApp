import { Theme, useStyles } from "@/src/game/ui/theme";
import { GrainOverlay } from "@/src/game/ui/Button";
import { useEffect, useRef, type ReactNode } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import {
  GestureDetector,
  GestureType,
  ScrollView,
} from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { AssemblyAction, GroupId, ThumbMap } from "@/src/game/core/type";
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
  /** Card to flash after a ? hint that says "take out X" — scrolled into view first if the list has it clipped. */
  highlightGroup?: GroupId | null;
  /** Bumped per ? press so the same group can flash again. */
  highlightPulse?: number;
}

/** Inventory column (right edge): everything the current stage uses, grouped with remaining counts. Long-press an enabled card to take one in hand and drag it into the scene; locked cards are waiting on other steps. */
export function PartsTray({ items, gestureFor, header, thumbs, highlightGroup, highlightPulse }: Props) {
  const styles = useStyles(makeStyles);
  const theme = useColorScheme() === "dark" ? "dark" : "light";
  const scrollRef = useRef<ScrollView>(null);
  // Card positions within the list content, the current scroll offset, and the viewport height — enough to know when a card is clipped.
  const cardLayouts = useRef<Record<string, { y: number; h: number }>>({});
  const scrollY = useRef(0);
  const viewportH = useRef(0);
  const flash = useSharedValue(0);

  useEffect(() => {
    if (!highlightGroup) return;
    const box = cardLayouts.current[highlightGroup];
    if (box) {
      const top = scrollY.current;
      const bottom = top + viewportH.current;
      // Only move the list when the card is actually clipped — an in-view card just flashes in place.
      if (box.y < top || box.y + box.h > bottom) {
        scrollRef.current?.scrollTo({ y: Math.max(0, box.y - 8), animated: true });
      }
    }
    // Three gentle accent pulses — enough to draw the eye without strobing.
    flash.value = 0;
    flash.value = withRepeat(
      withSequence(withTiming(1, { duration: 240 }), withTiming(0, { duration: 240 })),
      3,
    );
  }, [highlightGroup, highlightPulse, flash]);

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.5 }));

  if (items.length === 0 && !header) return null;
  return (
    <View style={styles.column} pointerEvents="box-none">
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        onLayout={(e) => (viewportH.current = e.nativeEvent.layout.height)}
        onScroll={(e) => (scrollY.current = e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        {header}
        {items.map((item) => {
          const thumb = thumbs ? thumbFor(thumbs, item.group, theme) : undefined;
          const card = (
            <View
              key={item.group}
              style={[styles.card, !item.enabled && styles.cardDisabled]}
              onLayout={(e) => {
                cardLayouts.current[item.group] = {
                  y: e.nativeEvent.layout.y,
                  h: e.nativeEvent.layout.height,
                };
              }}
            >
              <GrainOverlay radius={12} />
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
              {item.group === highlightGroup ? (
                <Animated.View pointerEvents="none" style={[styles.flashOverlay, flashStyle]} />
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
    right: 14,
    top: 70,
    bottom: 70,
    // The Auto-View button's actual width: controlHeightSm padding (SPACE.md each side, 24)
    // + the "Auto-View" label (~62 at 12px bold) ≈ 86. The rail is now one column.
    width: 86,
    gap: 8,
  },
  scroll: { flexShrink: 1 },
  list: { gap: 8, paddingVertical: 4 },
  card: {
    backgroundColor: t.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.border,
    paddingVertical: 6,
    paddingHorizontal: 6,
    alignItems: "center",
    gap: 3,
  },
  cardDisabled: { opacity: 0.35 },
  thumb: { width: 36, height: 36 },
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
  // The ? hint pulse: the interactive-accent lavender, matching "press this" semantics.
  flashOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: 12, backgroundColor: t.accent },
  });