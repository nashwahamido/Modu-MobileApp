import { Theme, useFixedStyles } from "@/src/game/ui/system/theme";
import { useMirror } from "@/src/game/ui/system/handedness";
import { GrainOverlay } from "@/src/game/ui/system/Button";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
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
import type { TrayItem } from "../../scene/useSceneState";

interface Props {
  items: TrayItem[];
  gestureFor: (action: AssemblyAction) => GestureType;
  /** Optional pinned chip above the list (e.g. the stage-3 base set-aside). */
  header?: ReactNode;
  /** Per-group thumbnails, keyed by group (furniture.thumbs). May be sparse. */
  thumbs?: ThumbMap;
  /** Cards to flash after a hint. A LIST because "?" highlights every actionable target at once; Spot's single card arrives as a one-element list. These groups also sort to the top of the tray and the list scrolls to show them — see `ordered` and the effect below. */
  highlightGroups?: GroupId[];
  /** Bumped per hint press so the same groups can flash again. */
  highlightPulse?: number;
  /**
   * The measured height of the FIRST card, reported as it lays out.
   *
   * Only the tutorial passes this. Its spotlight has to frame one card, and a card's height is not
   * knowable up front: the label wraps or does not depending on the part's name, so "Table top" is
   * two lines and "Leg" is one — a written-down number is right for one furniture and wrong for the
   * next. Measuring is the only way to be exact, and the card is here rather than where the
   * spotlight is drawn.
   */
  onFirstCardHeight?: (height: number) => void;
}

/** Inventory column (right edge): everything the current stage uses, grouped with remaining counts. Long-press an enabled card to take one in hand and drag it into the scene; locked cards are waiting on other steps. */
export function PartsTray({ items, gestureFor, header, thumbs, highlightGroups, highlightPulse, onFirstCardHeight }: Props) {
  const styles = useFixedStyles(makeStyles);
  // The rail crosses to the other edge in left-hand mode; everything INSIDE a card keeps its own layout.
  const m = useMirror();
  const theme = useColorScheme() === "dark" ? "dark" : "light";
  const scrollRef = useRef<ScrollView>(null);
  const flash = useSharedValue(0);

  // Keyed by VALUE, not array identity: play.tsx rebuilds this list on every render, and re-running the flash on each one would strobe. Same reasoning as the offsetKey/rotationKey pattern in PartModel StaticEntity.
  const highlightKey = (highlightGroups ?? []).join(" ");
  useEffect(() => {
    const groups = highlightGroups ?? [];
    if (!groups.length) return;
    // The highlighted cards are now sorted to the top, so showing them is just showing the top of the list. This replaces the old clipped-card scroll: that logic aimed at ONE card's measured position and deliberately did nothing when several were lit, which left a multi-target hint pointing off-screen.
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    // Three gentle accent pulses — enough to draw the eye without strobing. One shared value drives every highlighted card: one animation, N overlays.
    flash.value = 0;
    flash.value = withRepeat(
      withSequence(withTiming(1, { duration: 240 }), withTiming(0, { duration: 240 })),
      3,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightKey, highlightPulse, flash]);

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.5 }));

  // Highlighted cards sort to the TOP so a "?" press puts its targets under the player's eye instead of somewhere down a scrolled list. Stable within each half: everything keeps its relative order, the highlighted ones simply move ahead — so the tray never reshuffles beyond what the highlight itself justifies.
  const ordered = useMemo(() => {
    if (!highlightGroups?.length) return items;
    const lit = new Set(highlightGroups);
    return [...items].sort((a, b) => Number(lit.has(b.group)) - Number(lit.has(a.group)));
  }, [items, highlightGroups]);

  if (items.length === 0 && !header) return null;
  return (
    <View style={m(styles.column)} pointerEvents="box-none">
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {header}
        {ordered.map((item, index) => {
          const thumb = thumbs ? thumbFor(thumbs, item.group, theme) : undefined;
          const card = (
            <View
              key={item.group}
              style={[styles.card, !item.enabled && styles.cardDisabled]}
              // FIRST CARD ONLY, and only when someone asked. `ordered` sorts highlighted groups to
              // the top, so index 0 is whichever card is currently first in the column — which is
              // exactly the one a spotlight should frame.
              onLayout={
                index === 0 && onFirstCardHeight
                  ? (e) => onFirstCardHeight(e.nativeEvent.layout.height)
                  : undefined
              }
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
              {highlightGroups?.includes(item.group) ? (
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
    // The Auto-View button's actual width: controlHeightSm padding (SPACE.md each side, 24) + the "Auto-View" label (~62 at 12px bold) ≈ 86. The rail is now one column.
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