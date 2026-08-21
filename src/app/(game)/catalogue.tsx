// catalogue for assembly task

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
  Pressable,
  Text,
  useColorScheme,
  View,
} from "react-native";

// type
import { SCREEN_SIDE_MARGIN, SCREEN_VERTICAL_MARGIN, useSafeInsets } from "@/src/hooks/use-safe-insets";
import type { FurnitureMeta, RenderStyleId, ThumbSet } from "@/src/game/core/type";
import { type Milestone } from "@/src/game/ui/loading/loadingProgress";

// data
import { FURNITURE_METAS } from "@/src/game/content/furnitures/furnitures";
import { useCurrentUserId, useRepos } from "@/src/data";
import { useCatalogRow, useCatalogStore } from "@/src/data/catalog/buildStore";
import { useGameStore } from "@/src/game/core/store";
import { useVariantStore } from "@/src/data/catalog/variantStore";
import { brandFor } from "@/src/game/content/brands";
import { SceneBackdrop } from "@/src/game/ui/backdrop/SceneBackdrop";
import { ChevronIcon, ClockIcon } from "@/src/components/Icons";
import { ConfettiRain } from "@/src/game/ui/celebration/Confetti";

// styling
import { ACCENT_LIGHT, RADIUS, SPACE, TYPE, useFixedStyles, FONT } from "@/src/game/ui/system/theme";
import { Button, GrainOverlay } from "@/src/game/ui/system/Button";
import { LoadingScreen } from "@/src/game/ui/loading/LoadingScreen";
import type { Theme } from "@/src/game/ui/system/theme";

// The catalogue's copy is DB-authored.
// needs loading screen
function CatalogueLoading({ onBack }: { onBack: () => void }) {
  const styles = useFixedStyles(makeStyles);
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
  const styles = useFixedStyles(makeStyles);
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
  // Fewest stages first: the catalogue is a difficulty ladder, and a player choosing their first
  // build should meet the shortest one at the top rather than hunting for it. Ties keep their
  // authored order, so the list is stable between renders.
  const items = useMemo(
    () => [...FURNITURE_METAS].sort((a, b) => a.clusterCount - b.clusterCount),
    [],
  );
  const me = useCurrentUserId();
  // Which furniture this player has already finished. Read once per mount rather than per card: the grid renders every meta, so a per-card fetch would be one round trip per tile.
  const [completedIds, setCompletedIds] = useState<ReadonlySet<string>>(new Set());
  // Furniture with a resumable save. complete() DELETES the save as it records the completion, so this and completedIds are disjoint for anything built once and not restarted.
  const [inProgressIds, setInProgressIds] = useState<ReadonlySet<string>>(new Set());
  // How many actions each resumable save has finished. The save already carries the completed list —
  // it is the source of truth for how far a build got — so the card's XP line costs no extra read.
  const [doneSteps, setDoneSteps] = useState<Readonly<Record<string, number>>>({});
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
        setDoneSteps(Object.fromEntries(saves.map((b) => [b.furnitureId, b.completed.length])));
        setRewardXp(Object.fromEntries(rewards));
      })
      // A failed read means every card renders as un-built — the wrong label, but never a wrong action, since all three states lead to the same build screen.
      .catch((err) => console.warn("[catalogue] build progress read failed", err));
    return () => {
      alive = false;
    };
  }, [items, me, repos]);
  // The dropdown stays MOUNTED and animates on a shared value rather than mounting/unmounting with entering/exiting: an exit animation on an unmounting child races the state that removed it, and the closed menu still has to be untouchable and invisible to a screen reader either way.
  // The hanging sign: drops in with a spring bounce on mount, and fades out as soon as the grid
  // scrolls, so it never floats over the cards. It does NOT scroll with the content.
  const signDrop = useSharedValue(-140);
  const scrollY = useSharedValue(0);
  useEffect(() => {
    // Settles with a little overshoot — a sign on ropes should swing before it hangs still.
    signDrop.value = withSpring(0, { damping: 12, stiffness: 110, mass: 0.9 });
  }, [signDrop]);
  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const signStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: signDrop.value }],
    // Gone within the first ~70px of scroll, well before the first card reaches it.
    opacity: interpolate(scrollY.value, [0, 70], [1, 0], Extrapolation.CLAMP),
  }));

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
    // Rendered through SceneBackdrop — the SAME component the assembly screens use. The artwork is
    // the screen ROOT (an ImageBackground), not a sibling <Image absoluteFill> layered behind it.
    // That distinction is exactly what made the tutorial's backdrop read as zoomed-in; see the note
    // at the top of SceneBackdrop.tsx.
    <SceneBackdrop
      source={require("@/src/assets/ui/catalogue-backdrop.jpg")}
      style={styles.root}
    >
      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
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
            <Text style={styles.homeLabel}>Home</Text>
          </Pressable>
          {/* Spacer where the board hangs — the sign itself is pinned to the screen (see boardSign). */}
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
              // In-progress WINS over completed: a rebuild of a finished item is still a build in flight, and offering "Re-assemble" mid-build would read as a restart.
              state={
                inProgressIds.has(m.id)
                  ? "inProgress"
                  : completedIds.has(m.id)
                    ? "done"
                    : "new"
              }
              xp={rewardXp[m.id] ?? 0}
              // Steps finished, not XP: the card turns it into XP against the model's own stepCount,
              // so the two numbers in "120/310" can never come from different denominators.
              doneSteps={doneSteps[m.id] ?? 0}
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
      </Animated.ScrollView>
      {/* Pinned to the SCREEN, not the scroll: the ropes run off the top edge and the sign hangs
          beneath them. It fades on scroll rather than travelling with the grid. */}
      <Animated.View style={[styles.boardSign, signStyle]} pointerEvents="none">
        <Image
          source={require("@/src/assets/ui/board-wooden.png")}
          style={styles.board}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel="Furniture Catalogue"
        />
      </Animated.View>
    </SceneBackdrop>
  );
}

/** How long the celebration runs when an already-built model is tapped. Matched to the confetti's
 *  own three passes so it clears itself rather than being cut off mid-fall. */
const CELEBRATE_MS = 4200;

/** This screen's backdrop. Deliberately its own pair rather than a shared token: each screen can be
 *  retuned without touching the others. The screen background is a flat cream (#F3ECE0) — what
 *  shows for the frame before the SVG paints. */


/**
 * The stage count as a difficulty band.
 *
 * One stage is a sitting: sage, the app's "complete" green, because it can be finished in one.
 * Two or three is the sand from the avatar screen. Four or more is the clay — a warning about
 * LENGTH, not a wall, so it stays the muted terracotta rather than a true red, which in this
 * palette would read as an error.
 */
function stageBadgeColor(stages: number): string {
  if (stages <= 1) return "#8FA876";
  if (stages <= 2) return "#E8D48C";
  return "#C98B76";
}

/** Trend-arrow art per difficulty band — same thresholds as stageBadgeColor, so the icon and the
 *  badge colour can never disagree. */
function stageTrendArrow(stages: number) {
  if (stages <= 1) return require("@/src/assets/ui/icons/icon-trend-green.png");
  if (stages <= 2) return require("@/src/assets/ui/icons/icon-trend-yellow.png");
  return require("@/src/assets/ui/icons/icon-trend-red.png");
}

/** This screen's shadow, held locally rather than retuning the global ELEVATION scale (which every
 *  other screen shares). Tighter and darker than ELEVATION.card: a smaller radius keeps the edge
 *  legible instead of a soft haze, and the higher opacity holds up over the watercolour backdrop.
 *  SHADOW = chrome (pills, cards); SHADOW_SM = the small action buttons that sit ON a card. */
// RN 0.81 + new architecture supports `boxShadow`, which renders on ANDROID with a real colour and
// alpha — unlike `elevation`, which ignores shadowColor/shadowOpacity and only draws its own soft
// grey ramp. That is why the earlier opacity bumps changed nothing on device. Format is
// "offsetX offsetY blur spread color".
//
// SHADOW = chrome (pills, cards). SHADOW_SM = the small action buttons that sit ON a card.
// Darker: raise the alpha in rgba(). Sharper: lower the blur (the 3rd length).
const SHADOW = {
  boxShadow: "0px 5px 4px rgba(0,0,0,0.22)",
  // iOS fallback for the old architecture; harmless where boxShadow is supported.
  shadowColor: "#000",
  shadowOpacity: 0.45,
  shadowRadius: 2,
  shadowOffset: { width: 0, height: 4 },
  elevation: 6,
} as const;

const SHADOW_SM = {
  boxShadow: "0px 3px 3px rgba(0,0,0,0.40)",
  shadowColor: "#000",
  shadowOpacity: 0.8,
  shadowRadius: 1.5,
  shadowOffset: { width: 0, height: 2 },
  elevation: 4,
} as const;

/** The thumbnail groove. A SOLID mid grey rather than a translucent brown wash: the card beneath is
 *  cream, so a low-alpha inset just tinted the cream and left a white finish with nothing to sit
 *  against. Light enough to stay a recess rather than a grey panel — a white finish separates from
 *  it without the tile reading as dark. */
const THUMB_INSET = "#CFCAC2";

/** The single text colour for this screen (wireframe ink). */
const INK = "#231F20";

/** The finish carousel: how long a table sits still, and how long the slide to the next one takes.
 *  Together they set the loop's pace — four cells at 1.75s each is a ~7s cycle, slow enough to read
 *  as a showcase running in the background rather than something demanding attention. */
/**
 * What each carousel finish means to the BUILD.
 *
 * The assembly screen has exactly one lever for how a model looks — `renderStyle` — and it drives
 * either a whole-model swap (cozy / cartoon ship their own GLB) or a material pass (illustrated is
 * the wood-grain shader, shown as "Wooden" in settings). The DB's variations are a different axis:
 * they dress the FINISHED piece in the room, and the build screen does not read them at all, which
 * is why white and black land on the plain model here rather than silently doing nothing.
 */
const FINISH_STYLE: Record<string, RenderStyleId> = {
  cozy: "cozy",
  cartoon: "cartoon",
  wooden: "illustrated",
  white: "realistic",
  black: "realistic",
};

const FINISH_HOLD_MS = 1100;
const FINISH_SLIDE_MS = 650;

/** The carousel cell, matched to thumbWrap — the track translates by whole multiples of this. */
const THUMB_CELL = 118;

/** Where the player stands on one furniture. Drives the pill's label and whether the reward has been earned yet. */
type CardState = "new" | "inProgress" | "done";

const PILL_LABEL: Record<CardState, string> = {
  new: "Start ›",
  inProgress: "Continue ›",
  done: "Re-assemble ›",
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
  doneSteps,
  selected,
  onSelect,
  onStart,
}: {
  meta: FurnitureMeta;
  dark: boolean;
  state: CardState;
  xp: number;
  /** Actions finished on the resumable save, or 0. Steps rather than XP — see the call site. */
  doneSteps: number;
  selected: boolean;
  onSelect: () => void;
  onStart: (variation: string | null) => void;
}) {
  const styles = useFixedStyles(makeStyles);
  // What the XP row's first number says, per state:
  //   new         0        nothing started
  //   inProgress  a share  steps finished against this model's own stepCount
  //   done        the lot  a finished build has been paid in full
  //
  // `done` is asserted rather than derived: complete() DELETES the save as it records the
  // completion, so a finished furniture has no `completed` list left to count and deriving it would
  // read 0 on exactly the card that has earned everything.
  const earnedXp =
    state === "done"
      ? xp
      : state === "inProgress" && meta.stepCount > 0
        ? Math.floor((xp * Math.min(doneSteps, meta.stepCount)) / meta.stepCount)
        : 0;
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
  // The DEFAULT finish, kept as the fallback for anything the carousel is showing that a build can't
  // actually be started in.
  const buildFinish = finishes[0] ?? null;
  // The carousel is a SHOWCASE, so it runs on the artwork a build ships, not on item_variants:
  // "cartoon" and "cozy" are finishes the catalogue can display but nobody can buy or build, and
  // gating the reel on the purchasable list meant three of the four models had nothing to show.
  // buildFinish above still comes from the DB list, so what a tap on Start launches is unchanged.
  const reel = useMemo(() => {
    const art = meta.variantThumbnails;
    if (!art) return [] as string[];
    // THE META'S OWN ORDER, untouched. This used to hoist the DB default to the front, which quietly
    // took the choice away from the meta: the pass opens on the reel's LAST entry, so reordering the
    // list moved the opening finish somewhere nobody had asked for (every model opened on whatever
    // happened to trail the default). The meta lists its finishes in the order it wants them shown.
    return Object.keys(art);
  }, [meta.variantThumbnails]);
  // Cells: the alternates in reverse, then the first, then the LAST cell again — so the pass opens and closes on the meta's last-listed finish. That repeat is also what makes a REPLAY seamless: the run ends parked on the last cell, and jumping back to cell 0 to start again lands on an identical image, so the reset is never seen.
  const track = useMemo(
    () => (reel.length > 1 ? [...reel.slice(1).reverse(), reel[0], reel[reel.length - 1]] : []),
    [reel],
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
  // WHICH finish is on the tile right now. The carousel is a picker as well as a showcase: a player
  // who taps Start while Cozy is up expects to build the cozy one, so the visible cell has to exist
  // on the JS side, not only on the UI thread. Rounded, because a tap mid-slide should launch the
  // finish it is closest to rather than a half-scrolled neither.
  const [shownIndex, setShownIndex] = useState(0);
  useAnimatedReaction(
    () => Math.round(slide.value),
    (cell, prev) => {
      if (cell !== prev) runOnJS(setShownIndex)(cell);
    },
    [],
  );
  const shownFinish = track.length ? track[Math.min(shownIndex, track.length - 1)] : null;

  /**
   * Start the build in the finish the tile is SHOWING.
   *
   * The carousel mixes two different things, and they launch differently:
   *   - a DB VARIATION (wooden / white / black) is the build's own artwork — it travels as the
   *     `variation` route param, exactly as the default did.
   *   - a RENDER STYLE (cozy / cartoon) is a whole-model look owned by settings, not by the route,
   *     so it is applied to the store before navigating.
   * Anything the carousel can show but a build can't honour falls back to the default variation,
   * so Start never launches something that doesn't exist.
   */
  const startShown = () => {
    const shown = shownFinish;
    // ALWAYS set it, including for the plain finishes: renderStyle is session state, so a player who
    // built the cozy LACK and then starts the white one would otherwise get cozy again.
    useGameStore.getState().setRenderStyle(shown ? FINISH_STYLE[shown] ?? "realistic" : "realistic");
    // The variation still travels with the route: the build ignores it today, but it is the piece's
    // finish once it reaches the room, and dropping it here would lose the player's choice there.
    onStart(shown && finishes.includes(shown) ? shown : buildFinish);
  };

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
            {/* ONE LINE, shrunk to fit. The longest names in the catalogue sit right on the wrap
                boundary, so they flipped between one and two lines on the smallest width change —
                and a card whose title took two lines pushed its whole copy block a line lower than
                the card beside it.

                numberOfLines={2} was the reason the shrink never helped: adjustsFontSizeToFit only
                shrinks as far as it needs to fit the lines it is ALLOWED, so with two available it
                wrapped at full size rather than reducing. Capping at one is what makes the scale do
                the work.

                The floor is 0.75 rather than 0.85 for the same reason — at 0.85 a name that does
                not fit has nowhere left to go and gets truncated with an ellipsis, which is worse
                than a slightly smaller title. 17pt down to ~13pt is still comfortably readable. */}
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
          {/* Stages and time only — part count is build detail the player does not choose on.
              The stage count is the closest thing this app has to a difficulty rating, so it is
              coloured like one: the number is the fact, and the colour is what it MEANS. */}
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
          {/* ALWAYS, as earned-of-total. It used to appear only once a build was finished, which made
              the XP line itself the reward announcement — so an unstarted card said nothing about
              what it was worth, and a card mid-build hid the progress the player had just made.
              Reading "0/310" before, "120/310" during and "310/310" after turns the same row into
              the answer to "what do I get" and "how far am I", from one number.

              The middle number is derived from STEPS rather than tracked as XP, so it is always a
              share of this model's own reward and cannot drift from the total beside it. Rounded
              down: a build one step in should not read as though it has banked more than it has. */}
          {xp > 0 ? (
            <View style={styles.statRow}>
              <Image
                source={require("@/src/assets/ui/icons/icon-xp.png")}
                style={styles.xpIcon}
                resizeMode="contain"
              />
              <Text style={styles.statText}>
                {earnedXp}/{xp} XP
              </Text>
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
    // Screen palette, per the wireframe. Held here rather than in theme.ts so the rest of the app keeps its own tokens until these are promoted deliberately. INK is every text on the screen — one colour, no dimmed secondary tier, so the hierarchy comes from size/weight.
    root: { flex: 1, backgroundColor: "#F3ECE0" },
    loadingWrap: { flex: 1 },
    // Matches the grid header's inset so the button doesn't jump when the catalogue lands.
    loadingBack: { position: "absolute", top: 56, left: SPACE.xl },
    content: { padding: SPACE.xl, paddingTop: 56 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.md,
      // Bottom room so the first cards clear the pinned sign while the page is at rest.
      marginBottom: 40,
      // The dropdown hangs out of this row; without this its menu is clipped by the ScrollView.
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
    homeIcon: { width: 26, height: 26 },
    homeLabel: { ...TYPE.label, fontWeight: "600", color: INK },
    // The board sits BETWEEN the two pills and takes the middle. overflow hidden + the image's
    // negative marginTop is what clips the rope-tops, so they read as running off the screen edge.
    headerSpacer: { flex: 1 },
    // The sign hangs from the top of the SCREEN. Centered across the full width; pinned so the grid
    // scrolls underneath and the sign fades out instead of following it.
    boardSign: {
      position: "absolute",
      top: 0,
      // The extra right inset pushes the centred sign slightly LEFT of true centre. Increase it to
      // shift further left; drop it back to 0 to re-centre.
      left: 0,
      right: 28,
      alignItems: "center",
      zIndex: 5,
    },
    // 2.77:1 art. The negative marginTop cancels the transparent cap above the ropes in the PNG, so
    // the rope-tops meet the screen edge. Tune height to resize; width follows the aspect ratio.
    board: { width: "100%", maxWidth: 360, height: 140, aspectRatio: 1109 / 401, marginTop: -44 },
    trendArrow: { width: 24, height: 24 },
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
      ...SHADOW,
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
      ...SHADOW,
    },
    pickerItem: { paddingVertical: SPACE.sm, paddingHorizontal: SPACE.lg },
    // The current filter, marked on the row rather than by the label alone — weight is easy to miss at this size.
    pickerItemSelected: { backgroundColor: t.surfaceRaised },
    pickerItemText: { ...TYPE.body, color: INK },
    pickerItemActive: { color: INK, fontFamily: FONT, fontWeight: "700" },
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
      ...SHADOW,
    },
    cardPressed: { backgroundColor: t.surfaceRaised },
    burstClip: { ...StyleSheet.absoluteFillObject, borderRadius: RADIUS.panel, overflow: "hidden" },
    // The colour comes from PILL_STYLE at the call site, so the outline and the button always agree about which state the card is in — one signal in two places, never two signals.
    // The selected outline is 3pt where the resting one is a hairline, so selecting a card USED TO
    // narrow its content box by ~4pt. Every card shifted a little; BEKVÄM's title sits right at the
    // wrap boundary, so those few points tipped it onto a second line and shoved the stage pill,
    // duration and logo down with it. Giving the padding back keeps the inner width identical in
    // both states, so nothing reflows on selection.
    cardSelected: {
      borderWidth: 3,
      padding: SPACE.lg - (3 - StyleSheet.hairlineWidth * 2),
    },
    cardBody: { flexDirection: "row", gap: SPACE.md },
    thumbWrap: {
      width: 118,
      height: 118,
      borderRadius: RADIUS.control,
      // Inset, like every other groove in the palette — the thumbnail sits IN the card. Held LOCALLY
      // and darker than t.surfaceInset (0.10): these tiles carry white and pale-wood furniture, and
      // at the theme's value a white LACK dissolved into its own groove. Every other inset in the
      // app sits behind text or controls, which is why the token stays where it is.
      backgroundColor: THUMB_INSET,
      alignItems: "center",
      justifyContent: "center",
      // The carousel is wider than the frame; without this the off-screen cells spill over the card.
      overflow: "hidden",
    },
    thumbTrack: { position: "absolute", left: 0, top: 0, bottom: 0, flexDirection: "row" },
    thumbCell: { width: THUMB_CELL, alignItems: "center", justifyContent: "center" },
    thumb: { width: "82%", height: "82%" },
    stageBadge: {
      paddingHorizontal: SPACE.sm,
      paddingVertical: 2,
      borderRadius: RADIUS.pill,
    },
    // INK on every band: all three colours are light enough to carry it (7.5:1 or better), and one
    // text colour keeps the badges reading as one set rather than three separate marks.
    stageBadgeText: { ...TYPE.labelSm, color: INK },
    // Matches the trend arrow/ClockIcon so the three stat rows share one optical size.
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
      ...SHADOW_SM,
    },
    // A dim rather than a colour: the resting fill is per state, so one pressed tint can't serve all three.
    startBtnPressed: { opacity: 0.78 },
    startText: { ...TYPE.label },
  });