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
  header?: ReactNode;
  thumbs?: ThumbMap;
  highlightGroups?: GroupId[];
  highlightPulse?: number;
  onFirstCardHeight?: (height: number) => void;
}

export function PartsTray({ items, gestureFor, header, thumbs, highlightGroups, highlightPulse, onFirstCardHeight }: Props) {
  const styles = useFixedStyles(makeStyles);
  const m = useMirror();
  const theme = useColorScheme() === "dark" ? "dark" : "light";
  const scrollRef = useRef<ScrollView>(null);
  const flash = useSharedValue(0);

  const highlightKey = (highlightGroups ?? []).join(" ");
  useEffect(() => {
    const groups = highlightGroups ?? [];
    if (!groups.length) return;
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    flash.value = 0;
    flash.value = withRepeat(
      withSequence(withTiming(1, { duration: 240 }), withTiming(0, { duration: 240 })),
      3,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightKey, highlightPulse, flash]);

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.5 }));

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
  flashOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: 12, backgroundColor: t.accent },
  });