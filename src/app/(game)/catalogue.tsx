import { useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet,
  Image,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { Pressable } from "@/src/components/Pressable";

import { SCREEN_SIDE_MARGIN, SCREEN_VERTICAL_MARGIN, useSafeInsets } from "@/src/hooks/use-safe-insets";
import type { FurnitureMeta, RenderStyleId, ThumbSet } from "@/src/game/core/type";
import { type Milestone } from "@/src/game/ui/loading/loadingProgress";

import { FURNITURE_METAS } from "@/src/game/content/furnitures/furnitures";
import { useCurrentUserId, useRepos } from "@/src/data";
import { useCatalogRow, useCatalogStore } from "@/src/data/catalog/buildStore";
import { useGameStore } from "@/src/game/core/store";
import { usePrefsStore } from "@/src/game/core/prefsStore";
import { useVariantStore } from "@/src/data/catalog/variantStore";
import { brandFor } from "@/src/game/content/brands";
import { SceneBackdrop } from "@/src/game/ui/backdrop/SceneBackdrop";
import { ChevronIcon, ClockIcon } from "@/src/components/Icons";
import { ConfettiRain } from "@/src/game/ui/celebration/Confetti";

import { ACCENT_LIGHT, RADIUS, SPACE, TYPE, useFixedStyles, FONT } from "@/src/game/ui/system/theme";
import { Button, GrainOverlay } from "@/src/game/ui/system/Button";
import { LoadingScreen } from "@/src/game/ui/loading/LoadingScreen";
import type { Theme } from "@/src/game/ui/system/theme";

function CatalogueLoading({ onBack }: { onBack: () => void }) {
  const styles = useFixedStyles(makeStyles);
  const status = useCatalogStore((s) => s.status);
  const milestone: Milestone = status === "empty" ? 0.35 : 1;

  return (
    <View style={styles.loadingWrap}>
      <LoadingScreen milestone={milestone} />
      <View style={styles.loadingBack}>
        <Button label="‹ Room" onPress={onBack} />
      </View>
    </View>
  );
}

export default function CatalogueScreen() {
  const styles = useFixedStyles(makeStyles);
  const router = useRouter();
  const safe = useSafeInsets();
  const rows = useCatalogStore((st) => st.rows);
  const [category, setCategory] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of Object.values(rows)) if (r.type) set.add(r.type);
    return [...set].sort();
  }, [rows]);
  const scheme = useColorScheme();
  const repos = useRepos();
  const status = useCatalogStore((s) => s.status);
  const items = useMemo(
    () => [...FURNITURE_METAS].sort((a, b) => a.clusterCount - b.clusterCount),
    [],
  );
  const me = useCurrentUserId();
  const [completedIds, setCompletedIds] = useState<ReadonlySet<string>>(new Set());
  const [inProgressIds, setInProgressIds] = useState<ReadonlySet<string>>(new Set());
  const [doneSteps, setDoneSteps] = useState<Readonly<Record<string, number>>>({});
  const [rewardXp, setRewardXp] = useState<Readonly<Record<string, number>>>({});
  useEffect(() => {
    let alive = true;
    Promise.all([
      repos.builds.listCompleted(me),
      repos.builds.list(me),
      Promise.all(items.map((m) => repos.builds.buildReward(m.id).then((r) => [m.id, r.xp] as const).catch(() => [m.id, 0] as const))),
    ])
      .then(([ids, saves, rewards]) => {
        if (!alive) return;
        setCompletedIds(new Set(ids));
        setInProgressIds(new Set(saves.map((b) => b.furnitureId)));
        setDoneSteps(Object.fromEntries(saves.map((b) => [b.furnitureId, b.completed.length])));
        setRewardXp(Object.fromEntries(rewards));
      })
      .catch((err) => console.warn("[catalogue] build progress read failed", err));
    return () => {
      alive = false;
    };
  }, [items, me, repos]);
  const signDrop = useSharedValue(-140);
  const scrollY = useSharedValue(0);
  useEffect(() => {
    signDrop.value = withSpring(0, {
      damping: 12,
      stiffness: 110,
      mass: 0.9,
    });
  }, [signDrop]);
  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const signStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: signDrop.value }],
    opacity: interpolate(scrollY.value, [0, 70], [1, 0], Extrapolation.CLAMP),
  }));

  const menuOpen = useSharedValue(0);
  useEffect(() => {
    menuOpen.value = withTiming(pickerOpen ? 1 : 0, { duration: 170 });
  }, [menuOpen, pickerOpen]);
  const menuStyle = useAnimatedStyle(() => ({
    opacity: menuOpen.value,
    transform: [{ translateY: -8 + menuOpen.value * 8 }],
  }));
  const menuChevron = useAnimatedStyle(() => ({
    transform: [{ rotate: `${menuOpen.value * 180}deg` }],
  }));

  if (status === "empty")
    return <CatalogueLoading onBack={() => router.back()} />;

  if (status === "error") {
    return (
      <LoadingScreen
        milestone={0.35}
        errorMessage="Couldn't load the catalogue."
        actions={
          <>
            <Button
              label="Try again"
              onPress={() => void useCatalogStore.getState().refresh(repos)}
            />
            <Button label="‹ Room" onPress={() => router.back()} />
          </>
        }
      />
    );
  }

  return (
    <SceneBackdrop
      source={require("@/src/assets/ui/catalogue-backdrop.jpg")}
      style={styles.root}
    >
      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={[
          styles.content,
          {
            paddingLeft: SPACE.xl + Math.max(safe.raw.left, SCREEN_SIDE_MARGIN),
            paddingRight: SPACE.xl + Math.max(safe.raw.right, SCREEN_SIDE_MARGIN),
            paddingTop: SPACE.xl + Math.max(safe.raw.top, SCREEN_VERTICAL_MARGIN),
          },
        ]}
      >
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.homeBtn, pressed && styles.pressedSurface]}
            onPress={() => router.dismissTo("/room")}
            accessibilityRole="button"
            accessibilityLabel="Back to your room"
            hitSlop={8}
          >
            <Image
              source={require("@/src/assets/ui/icons/icon-home.png")}
              style={styles.homeIcon}
              resizeMode="contain"
            />
            <Text style={styles.homeLabel}>Home</Text>
          </Pressable>
          <View style={styles.headerSpacer} />
          <View style={styles.pickerWrap}>
            <Pressable
              style={({ pressed }) => [styles.picker, pressed && styles.pressedSurface]}
              onPress={() => setPickerOpen((o) => !o)}
              accessibilityRole="button"
              accessibilityLabel="Filter by category"
            >
              <Text style={styles.pickerText}>{category ?? "All categories"}</Text>
              <Animated.View style={menuChevron}>
                <ChevronIcon size={22} color={INK} />
              </Animated.View>
            </Pressable>
            <Animated.View
              style={[styles.pickerMenu, menuStyle]}
              pointerEvents={pickerOpen ? "auto" : "none"}
              accessibilityElementsHidden={!pickerOpen}
              importantForAccessibility={pickerOpen ? "auto" : "no-hide-descendants"}
            >
              {[null, ...categories].map((c) => (
                <Pressable
                  key={c ?? "all"}
                  style={({ pressed }) => [
                    styles.pickerItem,
                    c === category && styles.pickerItemSelected,
                    pressed && styles.pressedSurface,
                  ]}
                  onPress={() => {
                    setCategory(c);
                    setPickerOpen(false);
                  }}
                >
                  <Text style={[styles.pickerItemText, c === category && styles.pickerItemActive]}>
                    {c ?? "All categories"}
                  </Text>
                </Pressable>
              ))}
            </Animated.View>
          </View>
        </View>
        <View style={styles.grid}>
          {items
            .filter((m) => !category || rows[m.id]?.type === category)
            .map((m) => (
            <FurnitureCard
              key={m.id}
              meta={m}
              dark={scheme === "dark"}
              state={
                inProgressIds.has(m.id)
                  ? "inProgress"
                  : completedIds.has(m.id)
                    ? "done"
                    : "new"
              }
              xp={rewardXp[m.id] ?? 0}
              doneSteps={doneSteps[m.id] ?? 0}
              selected={selectedId === m.id}
              onSelect={() => setSelectedId((cur) => (cur === m.id ? null : m.id))}
              onStart={(variation) =>
                router.push({
                  pathname: "/play",
                  params: variation
                    ? {
                        id: m.id,
                        variation,
                      }
                    : { id: m.id },
                })
              }
            />
          ))}
        </View>
      </Animated.ScrollView>
      <Animated.View style={[styles.boardSign, signStyle]} pointerEvents="none">
        <View style={styles.headerShadow}>
          <View style={styles.headerPanel}>
            <Image
              source={require("@/src/assets/ui/cream-header.png")}
              style={StyleSheet.absoluteFill}
              resizeMode="stretch"
            />
            <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit>
              Furniture Catalogue
            </Text>
          </View>
        </View>
      </Animated.View>
    </SceneBackdrop>
  );
}

const CELEBRATE_MS = 4200;

function stageBadgeColor(stages: number): string {
  if (stages <= 1) return "#8FA876";
  if (stages <= 2) return "#E8D48C";
  return "#C98B76";
}

function stageTrendArrow(stages: number) {
  if (stages <= 1) return require("@/src/assets/ui/icons/icon-trend-green.png");
  if (stages <= 2) return require("@/src/assets/ui/icons/icon-trend-yellow.png");
  return require("@/src/assets/ui/icons/icon-trend-red.png");
}

const SHADOW = {
  boxShadow: "0px 5px 4px rgba(0,0,0,0.22)",
  shadowColor: "#000",
  shadowOpacity: 0.45,
  shadowRadius: 2,
  shadowOffset: {
    width: 0,
    height: 4,
  },
  elevation: 6,
} as const;

const SHADOW_SM = {
  boxShadow: "0px 3px 3px rgba(0,0,0,0.40)",
  shadowColor: "#000",
  shadowOpacity: 0.8,
  shadowRadius: 1.5,
  shadowOffset: {
    width: 0,
    height: 2,
  },
  elevation: 4,
} as const;

const THUMB_INSET = "#CFCAC2";

const INK = "#231F20";

const HEADER_W = 288;
const HEADER_H = 65;

const HEADER_CREAM = "#F3ECE0";

const FINISH_STYLE: Record<string, RenderStyleId> = {
  cozy: "cozy",
  cartoon: "cartoon",
  wooden: "illustrated",
  white: "realistic",
  black: "realistic",
};

const FINISH_HOLD_MS = 1100;
const FINISH_SLIDE_MS = 650;

const THUMB_CELL = 118;

type CardState = "new" | "inProgress" | "done";

const PILL_LABEL: Record<CardState, string> = {
  new: "Start ›",
  inProgress: "Continue ›",
  done: "Re-assemble ›",
};

const PILL_STYLE: Record<CardState, { bg: string; fg: string }> = {
  new: {
    bg: ACCENT_LIGHT,
    fg: "#FFFFFF",
  },
  inProgress: {
    bg: "#A9BFD9",
    fg: INK,
  },
  done: {
    bg: "#A97480",
    fg: "#FFFFFF",
  },
};

function FurnitureCard({
  meta,
  dark,
  state,
  xp,
  doneSteps,
  selected,
  onSelect,
  onStart,
}: {
  meta: FurnitureMeta;
  dark: boolean;
  state: CardState;
  xp: number;
  doneSteps: number;
  selected: boolean;
  onSelect: () => void;
  onStart: (variation: string | null) => void;
}) {
  const styles = useFixedStyles(makeStyles);
  const earnedXp =
    state === "done"
      ? xp
      : state === "inProgress" && meta.stepCount > 0
        ? Math.floor((xp * Math.min(doneSteps, meta.stepCount)) / meta.stepCount)
        : 0;
  const variants = useVariantStore((v) => v.byItem[meta.id]);
  const finishes = useMemo(() => {
    const art = meta.variantThumbnails;
    if (!art) return [] as string[];
    return (variants ?? [])
      .map((v) => v.variation)
      .filter((v): v is string => v != null && v in art);
  }, [meta.variantThumbnails, variants]);
  const armsFirst = state === "new" && !selected;
  const [burst, setBurst] = useState(0);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setBurst(0), CELEBRATE_MS);
    return () => clearTimeout(t);
  }, [burst]);
  const buildFinish = finishes[0] ?? null;
  const reel = useMemo(() => {
    const art = meta.variantThumbnails;
    if (!art) return [] as string[];
    return Object.keys(art);
  }, [meta.variantThumbnails]);
  const track = useMemo(
    () => (reel.length > 1 ? [...reel.slice(1).reverse(), reel[0], reel[reel.length - 1]] : []),
    [reel],
  );
  const pickThumb = (set: ThumbSet) => (dark ? set.dark : set.light) ?? set.light;
  const thumb = pickThumb(meta.thumbnail);
  const slide = useSharedValue(0);
  useEffect(() => {
    if (!selected || track.length < 2) {
      cancelAnimation(slide);
      return;
    }
    let from = slide.value;
    if (from >= track.length - 1) {
      slide.value = 0;
      from = 0;
    }
    const steps = [];
    const next = Math.ceil(from);
    if (next > from) {
      steps.push(withTiming(next, { duration: FINISH_SLIDE_MS * (next - from) }));
    }
    for (let i = next + 1; i < track.length; i += 1) {
      steps.push(withDelay(FINISH_HOLD_MS, withTiming(i, { duration: FINISH_SLIDE_MS })));
    }
    slide.value = withSequence(...steps);
    return () => cancelAnimation(slide);
  }, [slide, track.length, selected]);
  const [shownIndex, setShownIndex] = useState(0);
  useAnimatedReaction(
    () => Math.round(slide.value),
    (cell, prev) => {
      if (cell !== prev) runOnJS(setShownIndex)(cell);
    },
    [],
  );
  const shownFinish = track.length ? track[Math.min(shownIndex, track.length - 1)] : null;

  const startShown = () => {
    const shown = shownFinish;
    usePrefsStore.getState().setRenderStyle(shown ? FINISH_STYLE[shown] ?? "realistic" : "realistic");
    onStart(shown && finishes.includes(shown) ? shown : buildFinish);
  };

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -slide.value * THUMB_CELL }],
  }));
  const row = useCatalogRow(meta.id);
  const brand = row ? brandFor(row.brand) : null;
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withTiming(selected ? 1.04 : 1, { duration: 180 });
  }, [scale, selected]);
  const lift = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[styles.cardWrap, selected && styles.cardWrapRaised, lift]}>
    <Pressable
      style={({ pressed }) => [
        styles.card,
        selected && [styles.cardSelected, { borderColor: PILL_STYLE[state].bg }],
        pressed && styles.cardPressed,
      ]}
      onPress={() => {
        onSelect();
        if (state === "done") setBurst((b) => b + 1);
      }}
      onLayout={(e) =>
        setBox({
          w: e.nativeEvent.layout.width,
          h: e.nativeEvent.layout.height,
        })
      }
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${row?.name ?? meta.id}${selected ? ", selected" : ""}`}
    >
      <View style={styles.cardBody}>
        <View style={styles.thumbWrap}>
          {track.length > 1 ? (
            <Animated.View style={[styles.thumbTrack, trackStyle]}>
              {track.map((f, i) => (
                <View key={`${f}-${i}`} style={styles.thumbCell}>
                  <Image
                    source={pickThumb(meta.variantThumbnails?.[f] ?? meta.thumbnail)}
                    style={styles.thumb}
                    resizeMode="contain"
                  />
                </View>
              ))}
            </Animated.View>
          ) : (
            <Image source={thumb} style={styles.thumb} resizeMode="contain" />
          )}
        </View>
        <View style={styles.cardCopy}>
          <View style={styles.nameRow}>
            <Text
              style={styles.name}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {row?.name ?? "…"}
            </Text>
            {brand ? (
              <Image source={brand.logo} style={styles.brandLogo} resizeMode="contain" />
            ) : null}
          </View>
          <View style={styles.statRow}>
            <Image
              source={stageTrendArrow(meta.clusterCount)}
              style={styles.trendArrow}
              resizeMode="contain"
            />
            <View style={[styles.stageBadge, { backgroundColor: stageBadgeColor(meta.clusterCount) }]}>
              <Text style={styles.stageBadgeText}>
                {meta.clusterCount} {meta.clusterCount === 1 ? "stage" : "stages"}
              </Text>
            </View>
          </View>
          {row && row.durationMin > 0 ? (
            <View style={styles.statRow}>
              <ClockIcon size={22} color={INK} />
              <Text style={styles.statText}>{row.durationMin} mins</Text>
            </View>
          ) : null}
          {xp > 0 ? (
            <View style={styles.statRow}>
              <Image
                source={require("@/src/assets/ui/icons/icon-xp.png")}
                style={styles.xpIcon}
                resizeMode="contain"
              />
              <Text style={styles.statText}>
                {earnedXp}/{xp}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      {burst && box ? (
        <View style={styles.burstClip} pointerEvents="none">
          <ConfettiRain key={burst} delay={0} width={box.w} height={box.h} count={14} size={0.62} />
        </View>
      ) : null}
      <Pressable
        style={({ pressed }) => [
          styles.startBtn,
          { backgroundColor: PILL_STYLE[state].bg },
          pressed && styles.startBtnPressed,
        ]}
        onPress={() => (armsFirst ? onSelect() : startShown())}
        accessibilityRole="button"
        accessibilityLabel={`${PILL_LABEL[state].replace(" ›", "")} ${row?.name ?? meta.id}`}
        accessibilityHint={armsFirst ? "Shows the available finishes. Tap again to start building." : undefined}
      >
        <GrainOverlay radius={RADIUS.pill} />
        <Text style={[styles.startText, { color: PILL_STYLE[state].fg }]}>{PILL_LABEL[state]}</Text>
      </Pressable>
    </Pressable>
    </Animated.View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: "#F3ECE0",
    },
    loadingWrap: { flex: 1 },
    loadingBack: {
      position: "absolute",
      top: 56,
      left: SPACE.xl,
    },
    content: {
      padding: SPACE.xl,
      paddingTop: 56,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.md,
      marginBottom: 40,
      zIndex: 10,
    },
    homeBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.sm,
      height: 44,
      paddingHorizontal: SPACE.md,
      borderRadius: RADIUS.pill,
      backgroundColor: "#FBF8F3",
      borderWidth: 1,
      borderColor: t.border,
      ...SHADOW,
    },
    homeIcon: {
      width: 26,
      height: 26,
    },
    homeLabel: {
      ...TYPE.label,
      fontWeight: "600",
      color: INK,
    },
    headerSpacer: { flex: 1 },
    boardSign: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 28,
      alignItems: "center",
      zIndex: 5,
    },
    headerShadow: {
      width: "100%",
      maxWidth: HEADER_W,
      height: HEADER_H,
      marginTop: 18,
      borderRadius: HEADER_H / 2,
      backgroundColor: HEADER_CREAM,
      ...SHADOW,
    },
    headerPanel: {
      flex: 1,
      borderRadius: HEADER_H / 2,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: {
      ...TYPE.title,
      fontSize: 20,
      color: INK,
      paddingHorizontal: SPACE.lg,
      textAlign: "center",
    },
    trendArrow: {
      width: 24,
      height: 24,
    },
    pressedSurface: { backgroundColor: t.surfaceRaised },
    pickerWrap: {
      position: "relative",
      zIndex: 20,
    },
    picker: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.sm,
      height: 44,
      paddingHorizontal: SPACE.lg,
      borderRadius: RADIUS.pill,
      backgroundColor: "#FBF8F3",
      borderWidth: 1,
      borderColor: t.border,
      ...SHADOW,
    },
    pickerText: {
      ...TYPE.label,
      color: INK,
    },
    pickerMenu: {
      position: "absolute",
      top: 48,
      right: 0,
      minWidth: 190,
      paddingVertical: SPACE.xs,
      paddingHorizontal: SPACE.xs,
      borderRadius: RADIUS.control,
      backgroundColor: "#FBF8F3",
      borderWidth: 1,
      borderColor: t.border,
      ...SHADOW,
    },
    pickerItem: {
      paddingVertical: SPACE.sm,
      paddingHorizontal: SPACE.md,
      borderRadius: RADIUS.control - SPACE.xs,
    },
    pickerItemSelected: { backgroundColor: t.surfaceRaised },
    pickerItemText: {
      ...TYPE.body,
      color: INK,
    },
    pickerItemActive: {
      color: INK,
      fontFamily: FONT,
      fontWeight: "700",
    },
    subtitle: {
      ...TYPE.body,
      color: INK,
      marginTop: SPACE.xs,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      rowGap: SPACE.lg,
    },
    cardWrap: { width: "48%" },
    cardWrapRaised: {
      zIndex: 2,
      elevation: 12,
    },
    card: {
      width: "100%",
      backgroundColor: "#FBF8F3",
      borderRadius: RADIUS.panel,
      padding: SPACE.lg,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: t.border,
      ...SHADOW,
    },
    cardPressed: { backgroundColor: t.surfaceRaised },
    burstClip: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: RADIUS.panel,
      overflow: "hidden",
    },
    cardSelected: {
      borderWidth: 3,
      padding: SPACE.lg - (3 - StyleSheet.hairlineWidth * 2),
    },
    cardBody: {
      flexDirection: "row",
      gap: SPACE.md,
    },
    thumbWrap: {
      width: 118,
      height: 118,
      borderRadius: RADIUS.control,
      backgroundColor: THUMB_INSET,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    thumbTrack: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      flexDirection: "row",
    },
    thumbCell: {
      width: THUMB_CELL,
      alignItems: "center",
      justifyContent: "center",
    },
    thumb: {
      width: "82%",
      height: "82%",
    },
    stageBadge: {
      paddingHorizontal: SPACE.sm,
      paddingVertical: 2,
      borderRadius: RADIUS.pill,
    },
    stageBadgeText: {
      ...TYPE.labelSm,
      color: INK,
    },
    xpIcon: {
      width: 22,
      height: 22,
    },
    cardCopy: {
      flex: 1,
      gap: SPACE.xs,
    },
    nameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.sm,
    },
    name: {
      flex: 1,
      fontFamily: FONT,
      fontSize: 17,
      fontWeight: "700",
      color: INK,
    },
    brandLogo: {
      width: 54,
      height: 24,
    },
    statRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.sm,
    },
    statText: {
      ...TYPE.body,
      color: INK,
    },
    startBtn: {
      alignSelf: "flex-end",
      marginTop: SPACE.md,
      paddingHorizontal: SPACE.lg,
      height: 36,
      justifyContent: "center",
      borderRadius: RADIUS.pill,
      ...SHADOW_SM,
    },
    startBtnPressed: { opacity: 0.78 },
    startText: { ...TYPE.label },
  });