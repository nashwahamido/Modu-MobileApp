// catalogue for assembly task

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet,
  Image,
  Pressable,
  ScrollView,
  Text,
  useColorScheme,
  View,
} from "react-native";

// type
import { SCREEN_SIDE_MARGIN, SCREEN_VERTICAL_MARGIN, useSafeInsets } from "@/src/hooks/use-safe-insets";
import type { FurnitureMeta, ThumbSet } from "@/src/game/core/type";
import { type Milestone } from "@/src/game/ui/loading/loadingProgress";

// data
import { FURNITURE_METAS } from "@/src/game/content/furnitures/furnitures";
import { useCurrentUserId, useRepos } from "@/src/data";
import { useCatalogRow, useCatalogStore } from "@/src/data/catalog/buildStore";
import { useVariantStore } from "@/src/data/catalog/variantStore";
import { brandFor } from "@/src/game/content/brands";
import { ChevronIcon, ClockIcon, StagesIcon } from "@/src/components/Icons";
import { ConfettiRain } from "@/src/game/ui/celebration/Confetti";

// styling
import { ACCENT_LIGHT, RADIUS, SPACE, TYPE, ELEVATION, useStyles, FONT } from "@/src/game/ui/system/theme";
import { Button, GrainOverlay } from "@/src/game/ui/system/Button";
import { LoadingScreen } from "@/src/game/ui/loading/LoadingScreen";
import type { Theme } from "@/src/game/ui/system/theme";

import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
// The catalogue's copy is DB-authored.
// needs loading screen
function CatalogueLoading({ onBack }: { onBack: () => void }) {
  const styles = useStyles(makeStyles);
  const status = useCatalogStore((s) => s.status);
  // 0.35 from the first frame: the fetch is already in flight, so the bar opens in creep rather than a stall.
  const milestone: Milestone = status === "empty" ? 0.35 : 1;

  // Err overlaid.
  // TO-BE-FIXED:refresh() reports "error" only when it has NOTHING cached to fall back on, so a first-ever launch whose fetch never resolves sits at "empty" indefinitely; without this the player is stuck on a creeping bar with no route back to the room.
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
  const styles = useStyles(makeStyles);
  const router = useRouter();
  const safe = useSafeInsets();
  // The catalogue rows carry the display copy; the bundle only knows ids and counts. Reading the whole map here (not per-card) is what lets the category filter exist at all.
  const rows = useCatalogStore((st) => st.rows);
  const [category, setCategory] = useState<string | null>(null);
  // One selection for the whole grid, held here rather than per card so opening a second card closes the first.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Every distinct furniture_types.name in the catalogue, in stable alphabetical order.
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of Object.values(rows)) if (r.type) set.add(r.type);
    return [...set].sort();
  }, [rows]);
  const scheme = useColorScheme();
  const repos = useRepos();
  const status = useCatalogStore((s) => s.status);
  // Every entry in the catalog
  const items = FURNITURE_METAS;
  const me = useCurrentUserId();
  // Which furniture this player has already finished. Read once per mount rather than per card: the grid renders every meta, so a per-card fetch would be one round trip per tile.
  const [completedIds, setCompletedIds] = useState<ReadonlySet<string>>(new Set());
  // Furniture with a resumable save. complete() DELETES the save as it records the completion, so this and completedIds are disjoint for anything built once and not restarted.
  const [inProgressIds, setInProgressIds] = useState<ReadonlySet<string>>(new Set());
  // The XP each furniture pays out. buildReward is per-furniture, so this is one read per tile — fine at four items, wrong at twenty. The fix then is an xp column on BuildCatalogRow, which arrives with the rest of the row in a single fetch.
  const [rewardXp, setRewardXp] = useState<Readonly<Record<string, number>>>({});
  useEffect(() => {
    let alive = true;
    Promise.all([
      repos.builds.listCompleted(me),
      repos.builds.list(me),
      Promise.all(items.map((m) => repos.builds.buildReward(m.id).then((r) => [m.id, r.xp] as const))),
    ])
      .then(([ids, saves, rewards]) => {
        if (!alive) return;
        setCompletedIds(new Set(ids));
        setInProgressIds(new Set(saves.map((b) => b.furnitureId)));
        setRewardXp(Object.fromEntries(rewards));
      })
      // A failed read means every card renders as un-built — the wrong label, but never a wrong action, since all three states lead to the same build screen.
      .catch((err) => console.warn("[catalogue] build progress read failed", err));
    return () => {
      alive = false;
    };
  }, [items, me, repos]);
  // The dropdown stays MOUNTED and animates on a shared value rather than mounting/unmounting with entering/exiting: an exit animation on an unmounting child races the state that removed it, and the closed menu still has to be untouchable and invisible to a screen reader either way.
  const menuOpen = useSharedValue(0);
  useEffect(() => {
    menuOpen.value = withTiming(pickerOpen ? 1 : 0, { duration: 170 });
  }, [menuOpen, pickerOpen]);
  const menuStyle = useAnimatedStyle(() => ({
    opacity: menuOpen.value,
    // Drops the last few pixels into place instead of appearing — the motion is what says "this came from the pill".
    transform: [{ translateY: -8 + menuOpen.value * 8 }],
  }));
  const menuChevron = useAnimatedStyle(() => ({
    transform: [{ rotate: `${menuOpen.value * 180}deg` }],
  }));

  // Hold the grid until the catalogue is in memory: the bundle knows the artwork and the counts, but not a single word of copy.
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
    <View style={styles.root}>
      {/* Diagonal, so neither end of the ramp sits flat behind a whole row of cards. */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="catalogueBg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={BG_FROM} />
            <Stop offset="1" stopColor={BG_TO} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#catalogueBg)" />
      </Svg>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingLeft: SPACE.xl + Math.max(safe.raw.left, SCREEN_SIDE_MARGIN), paddingRight: SPACE.xl + Math.max(safe.raw.right, SCREEN_SIDE_MARGIN), paddingTop: SPACE.xl + Math.max(safe.raw.top, SCREEN_VERTICAL_MARGIN) },
        ]}
      >
        <View style={styles.header}>
          {/* Home, not "back": the room IS the hub, and the player may have arrived here from anywhere. */}
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
          </Pressable>
          <Text style={styles.title}>Pick a Model to Assemble</Text>
          <View style={styles.headerSpacer} />
          {/* Category filter. The list hangs off this pill so it can't push the grid down. */}
          <View style={styles.pickerWrap}>
            <Pressable
              style={({ pressed }) => [styles.picker, pressed && styles.pressedSurface]}
              onPress={() => setPickerOpen((o) => !o)}
              accessibilityRole="button"
              accessibilityLabel="Filter by category"
            >
              <Text style={styles.pickerText}>{category ?? "All categories"}</Text>
              {/* Rotates rather than swapping glyph: the turn is the same 170ms as the menu, so one gesture reads as one movement. */}
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
              // In-progress WINS over completed: a rebuild of a finished item is still a build in flight, and offering "assemble again" mid-build would read as a restart. It also keeps the earned XP hidden until the run it belongs to is over.
              state={
                inProgressIds.has(m.id)
                  ? "inProgress"
                  : completedIds.has(m.id)
                    ? "done"
                    : "new"
              }
              xp={rewardXp[m.id] ?? 0}
              selected={selectedId === m.id}
              onSelect={() => setSelectedId((cur) => (cur === m.id ? null : m.id))}
              // Straight to the build. The experience/profile is set by onboarding (and adjustable in Settings) — not a per-item chooser. The finish rides along as a param. play.tsx does not read it yet — the assembly model is still the one baked GLB — so this is the tile half of the feature only.
              onStart={(variation) =>
                router.push({
                  pathname: "/play",
                  params: variation ? { id: m.id, variation } : { id: m.id },
                })
              }
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/** How long the celebration runs when an already-built model is tapped. Matched to the confetti's
 *  own three passes so it clears itself rather than being cut off mid-fall. */
const CELEBRATE_MS = 4200;

/** This screen's backdrop. Deliberately its own pair rather than a shared token: each screen can be
 *  retuned without touching the others. Keep root.backgroundColor equal to BG_FROM — that is what
 *  shows for the frame before the SVG paints. */
const BG_FROM = ACCENT_LIGHT;
const BG_TO = "#A9BFD9";

/** The single text colour for this screen (wireframe ink). */
const INK = "#231F20";

/** The finish carousel: how long a table sits still, and how long the slide to the next one takes.
 *  Together they set the loop's pace — four cells at 1.75s each is a ~7s cycle, slow enough to read
 *  as a showcase running in the background rather than something demanding attention. */
const FINISH_HOLD_MS = 1100;
const FINISH_SLIDE_MS = 650;

/** The carousel cell, matched to thumbWrap — the track translates by whole multiples of this. */
const THUMB_CELL = 118;

/** Where the player stands on one furniture. Drives the pill's label and whether the reward has been earned yet. */
type CardState = "new" | "inProgress" | "done";

const PILL_LABEL: Record<CardState, string> = {
  new: "Start ›",
  inProgress: "Continue ›",
  done: "Assemble again ›",
};

/** A colour per state, so the pill says which of the three it is before the label is read.
 *  The label colour is NOT a style choice: white on the blue is 1.88:1, which fails every
 *  threshold there is, so that one takes ink (8.65:1). White clears 3.8:1 on the other two,
 *  over the 3:1 bar for 14px bold — but only at that weight and size. */
const PILL_STYLE: Record<CardState, { bg: string; fg: string }> = {
  new: { bg: ACCENT_LIGHT, fg: "#FFFFFF" },
  inProgress: { bg: "#A9BFD9", fg: INK },
  done: { bg: "#A97480", fg: "#FFFFFF" },
};

function FurnitureCard({
  meta,
  dark,
  state,
  xp,
  selected,
  onSelect,
  onStart,
}: {
  meta: FurnitureMeta;
  dark: boolean;
  state: CardState;
  xp: number;
  selected: boolean;
  onSelect: () => void;
  onStart: (variation: string | null) => void;
}) {
  const styles = useStyles(makeStyles);
  // The finish list comes from item_variants (default first, already sorted by the store) but is narrowed to the finishes this build ships art for — so a variation authored in the DB ahead of its artwork simply doesn't appear, rather than rendering a missing image.
  const variants = useVariantStore((v) => v.byItem[meta.id]);
  const finishes = useMemo(() => {
    const art = meta.variantThumbnails;
    if (!art) return [] as string[];
    return (variants ?? [])
      .map((v) => v.variation)
      .filter((v): v is string => v != null && v in art);
  }, [meta.variantThumbnails, variants]);
  // A first build ARMS before it launches: tapping Start on an unselected card selects it, which runs the finish carousel, and the second tap goes to the build. Only for "new" — Continue and Assemble again are returns to something already under way, and a gate on those is just a tax on a player who has seen the finishes already.
  const armsFirst = state === "new" && !selected;
  // The celebration lives on the CARD, not the screen: it is that model's achievement, and confetti across the whole grid claims it for every tile at once. Keyed by a counter so a second tap restarts the fall rather than being swallowed as "already running".
  const [burst, setBurst] = useState(0);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setBurst(0), CELEBRATE_MS);
    return () => clearTimeout(t);
  }, [burst]);
  // The build always uses the DEFAULT finish — the carousel is a showcase, not a picker, so a tap on Start mid-slide must not launch whatever frame was on screen.
  const buildFinish = finishes[0] ?? null;
  // Cells: the alternates in reverse, then the default, then the FIRST cell again — so the pass opens and closes on the same finish (white for LACK). That repeat is also what makes a REPLAY seamless: the run ends parked on the last cell, and jumping back to cell 0 to start again lands on an identical image, so the reset is never seen.
  const track = useMemo(
    () => (finishes.length > 1 ? [...finishes.slice(1).reverse(), finishes[0], finishes[finishes.length - 1]] : []),
    [finishes],
  );
  // `dark` survives here for the ARTWORK, not the styling: each meta ships a light and a dark thumbnail, and that choice can't come from a colour token.
  const pickThumb = (set: ThumbSet) => (dark ? set.dark : set.light) ?? set.light;
  const thumb = pickThumb(meta.thumbnail);
  // Driven entirely on the UI thread: a JS timer chain would need its own cleanup and would drift against the slide it is supposed to sequence.
  const slide = useSharedValue(0);
  useEffect(() => {
    if (!selected || track.length < 2) {
      // Freeze where it stands. Deselecting mid-pass leaves that finish on the tile rather than rewinding — the showcase is over, and what it last showed is what it settles on.
      cancelAnimation(slide);
      return;
    }
    // Resume, don't restart: the frozen position IS the progress, so the pass picks up from it.
    let from = slide.value;
    if (from >= track.length - 1) {
      // Already finished. Both ends of the track are the same finish, so rewinding to cell 0 is invisible — it reads as the pass simply running again.
      slide.value = 0;
      from = 0;
    }
    const steps = [];
    const next = Math.ceil(from);
    // Frozen MID-slide: finish that leg with only the time it had left, so the resume doesn't jump back to the cell it came from or re-travel ground already covered.
    if (next > from) {
      steps.push(withTiming(next, { duration: FINISH_SLIDE_MS * (next - from) }));
    }
    for (let i = next + 1; i < track.length; i += 1) {
      steps.push(withDelay(FINISH_HOLD_MS, withTiming(i, { duration: FINISH_SLIDE_MS })));
    }
    // One pass, no repeat: it runs to the last cell and stops there.
    slide.value = withSequence(...steps);
    return () => cancelAnimation(slide);
  }, [slide, track.length, selected]);
  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -slide.value * THUMB_CELL }],
  }));
  // Name, brand, type and duration are DB-authored; the bundle only knows the id, the artwork and the counts it derives. Undefined until the catalogue loads.
  const row = useCatalogRow(meta.id);
  const brand = row ? brandFor(row.brand) : null;
  // Lift on select. Small on purpose — at 48% width in a two-column grid, anything past a few percent overlaps the neighbouring card rather than reading as raised.
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
        // Only for something already finished — confetti over a model you have not built would be congratulating you for nothing, and a rebuild in progress has not earned it back yet.
        if (state === "done") setBurst((b) => b + 1);
      }}
      onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
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
            <Text style={styles.name} numberOfLines={2}>{row?.name ?? "…"}</Text>
            {brand ? (
              <Image source={brand.logo} style={styles.brandLogo} resizeMode="contain" />
            ) : null}
          </View>
          {/* Stages and time only — part count is build detail the player does not choose on. */}
          <View style={styles.statRow}>
            <StagesIcon size={22} color={INK} />
            <Text style={styles.statText}>
              {meta.clusterCount} {meta.clusterCount === 1 ? "stage" : "stages"}
            </Text>
          </View>
          {row && row.durationMin > 0 ? (
            <View style={styles.statRow}>
              <ClockIcon size={22} color={INK} />
              <Text style={styles.statText}>{row.durationMin} mins</Text>
            </View>
          ) : null}
          {/* Past tense, and only once built: the reward is granted exactly once per furniture, so a rebuild pays nothing and must not read as if it will. */}
          {state === "done" && xp > 0 ? (
            <View style={styles.statRow}>
              <Image
                source={require("@/src/assets/ui/icons/icon-xp.png")}
                style={styles.xpIcon}
                resizeMode="contain"
              />
              <Text style={styles.statText}>{xp} earned</Text>
            </View>
          ) : null}
        </View>
      </View>
      {/* Clipped to the card's own rounded box, on its own View rather than on the card — overflow
          hidden on the card itself would take the elevation shadow with it. */}
      {burst && box ? (
        <View style={styles.burstClip} pointerEvents="none">
          <ConfettiRain key={burst} delay={0} width={box.w} height={box.h} count={14} size={0.62} />
        </View>
      ) : null}
      {/* Now a real target: the card body selects, this starts. Two jobs, two touch areas — a nested Pressable swallows its own touch, so it never falls through to selection. */}
      <Pressable
        style={({ pressed }) => [styles.startBtn, { backgroundColor: PILL_STYLE[state].bg }, pressed && styles.startBtnPressed]}
        onPress={() => (armsFirst ? onSelect() : onStart(buildFinish))}
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
    // Screen palette, per the wireframe. Held here rather than in theme.ts so the rest of the app keeps its own tokens until these are promoted deliberately. INK is every text on the screen — one colour, no dimmed secondary tier, so the hierarchy comes from size/weight.
    root: { flex: 1, backgroundColor: BG_FROM },
    loadingWrap: { flex: 1 },
    // Matches the grid header's inset so the button doesn't jump when the catalogue lands.
    loadingBack: { position: "absolute", top: 56, left: SPACE.xl },
    content: { padding: SPACE.xl, paddingTop: 56 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.md,
      marginBottom: SPACE.xl,
      // The dropdown hangs out of this row; without this its menu is clipped by the ScrollView.
      zIndex: 10,
    },
    homeBtn: {
      width: 44,
      height: 44,
      borderRadius: RADIUS.control,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#FBF8F3",
      borderWidth: 1,
      borderColor: t.border,
      ...ELEVATION.card,
    },
    homeIcon: { width: 28, height: 28 },
    pressedSurface: { backgroundColor: t.surfaceRaised },
    pickerWrap: { position: "relative", zIndex: 20 },
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
      ...ELEVATION.card,
    },
    pickerText: { ...TYPE.label, color: INK },
    pickerMenu: {
      position: "absolute",
      top: 48,
      right: 0,
      minWidth: 190,
      paddingVertical: SPACE.xs,
      borderRadius: RADIUS.control,
      backgroundColor: "#FBF8F3",
      borderWidth: 1,
      borderColor: t.border,
      ...ELEVATION.card,
    },
    pickerItem: { paddingVertical: SPACE.sm, paddingHorizontal: SPACE.lg },
    // The current filter, marked on the row rather than by the label alone — weight is easy to miss at this size.
    pickerItemSelected: { backgroundColor: t.surfaceRaised },
    pickerItemText: { ...TYPE.body, color: INK },
    pickerItemActive: { color: INK, fontFamily: FONT, fontWeight: "700" },
    headerSpacer: { flex: 1 },
    // Tracked-out slightly: this is a screen label, not a page title competing with the cards. Ink, not cream: cream measures 1.78:1 against the blue end of the gradient, and ink clears both ends (4.29 lavender, 8.65 blue).
    title: { fontFamily: FONT, fontSize: 20, fontWeight: "800", color: INK, letterSpacing: 0.4 },
    subtitle: {
      ...TYPE.body,
      color: INK,
      marginTop: SPACE.xs,
    },
    // space-between with a 48% card is what makes the two columns REACH both edges — a fixed width computed from the padding left dead space on the right whenever the two disagreed.
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      rowGap: SPACE.lg,
    },
    // The wrapper owns the grid width so the scale transform has something to grow INSIDE — scaling a 48% child directly would fight space-between and shift its neighbour.
    cardWrap: { width: "48%" },
    // Android draws by elevation, not source order, so a lifted card needs both to sit above its neighbour.
    cardWrapRaised: { zIndex: 2, elevation: 12 },
    card: {
      width: "100%",
      backgroundColor: "#FBF8F3",
      borderRadius: RADIUS.panel,
      padding: SPACE.lg,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: t.border,
      ...ELEVATION.card,
    },
    cardPressed: { backgroundColor: t.surfaceRaised },
    burstClip: { ...StyleSheet.absoluteFillObject, borderRadius: RADIUS.panel, overflow: "hidden" },
    // The colour comes from PILL_STYLE at the call site, so the outline and the button always agree about which state the card is in — one signal in two places, never two signals.
    cardSelected: { borderWidth: 3 },
    cardBody: { flexDirection: "row", gap: SPACE.md },
    thumbWrap: {
      width: 118,
      height: 118,
      borderRadius: RADIUS.control,
      // Inset, like every other groove in the palette — the thumbnail sits IN the card.
      backgroundColor: t.surfaceInset,
      alignItems: "center",
      justifyContent: "center",
      // The carousel is wider than the frame; without this the off-screen cells spill over the card.
      overflow: "hidden",
    },
    thumbTrack: { position: "absolute", left: 0, top: 0, bottom: 0, flexDirection: "row" },
    thumbCell: { width: THUMB_CELL, alignItems: "center", justifyContent: "center" },
    thumb: { width: "82%", height: "82%" },
    // Matches StagesIcon/ClockIcon so the three stat rows share one optical size.
    xpIcon: { width: 22, height: 22 },
    cardCopy: { flex: 1, gap: SPACE.xs },
    // Centre, not flex-start: the logo now matches the title's cap height, so aligning on the text baseline row is what makes the pair read as one line.
    nameRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
    name: { flex: 1, fontFamily: FONT, fontSize: 17, fontWeight: "700", color: INK },
    brandLogo: { width: 54, height: 24 },
    // the pill reads as a label rather than as a status the player has to act on.
    statRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
    statText: { ...TYPE.body, color: INK },
    startBtn: {
      alignSelf: "flex-end",
      marginTop: SPACE.md,
      paddingHorizontal: SPACE.lg,
      height: 36,
      justifyContent: "center",
      borderRadius: RADIUS.pill,
    },
    // A dim rather than a colour: the resting fill is per state, so one pressed tint can't serve all three.
    startBtnPressed: { opacity: 0.78 },
    startText: { ...TYPE.label },
  });