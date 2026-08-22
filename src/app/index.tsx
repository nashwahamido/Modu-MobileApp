// Home. The workbench palette: a warm near-black, one lavender action, everything else quiet.
//
// The landing plays a fixed, one-shot sequence on mount — never re-triggered, never skippable
// mid-flight, because it is the first thing a player ever sees:
//   1. Cream field + clay grain + the MODU wordmark. Holds still for STILL_MS.
//   2. The wordmark swaps for the mascot (a quick cross-fade/scale, not a cut).
//   3. The two entry buttons rise in.
//   4. The wavy corner accents float in from off-screen, back layer first, both corners in step.
// Every stage is scheduled with withDelay on the UI thread, so the sequence can't stutter or drift
// even if the JS thread is busy — there must be no lag between stages.
import { Link } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo } from "react";
import { Image, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { Button } from "@/src/game/ui/system/Button";
import { useAuth } from "@/src/hooks/useAuth";
import { SESSION_REQUIRED, SIGN_IN_ROUTE } from "@/src/hooks/useSessionGate";
import { CARD_CHROME, SPACE, Theme, useStyles } from "@/src/game/ui/system/theme";
import { useSafeInsets } from "@/src/hooks/use-safe-insets";

// Sampled from the reference mockup, not eyeballed. One-off (the landing predates the theme, and
// doesn't read it — see the note on the wordmark below), so it's named here rather than in `Theme`.
const BG_CREAM = "#F3ECE0";

const clayPattern = require("@/src/assets/ui/landing/clay-pattern.png");
const wordmark = require("@/src/assets/ui/brand/logo-modu.png");
const figure = require("@/src/assets/images/mascot/modu-mascot.png");
const figureShadow = require("@/src/assets/ui/landing/disk.png");
const wavyLeft1 = require("@/src/assets/ui/landing/wavy-left-1.png");
const wavyLeft2 = require("@/src/assets/ui/landing/wavy-left-2.png");
const wavyLeft3 = require("@/src/assets/ui/landing/wavy-left-3.png");
const wavyRight1 = require("@/src/assets/ui/landing/wavy-right-1.png");
const wavyRight2 = require("@/src/assets/ui/landing/wavy-right-2.png");
const wavyRight3 = require("@/src/assets/ui/landing/wavy-right-3.png");
// The traced dashed line in each top corner (their fainter dotted echoes were removed).
const lineLeft1 = require("@/src/assets/ui/landing/line-left-1.png");
const lineRight2 = require("@/src/assets/ui/landing/line-right-2.png");

/** The art's aspect (600x133 after trimming), so the height follows the width instead of being a
 *  second number that has to be kept in step with it. */
const WORDMARK_W = 300;
const WORDMARK_H = Math.round(WORDMARK_W * (133 / 600));
/** Same footprint modu-figure.png held (that asset was 915x941, near-square) — kept as-is when
 *  swapped for modu-mascot.png so the brand box doesn't reflow. `contain` below fits the new
 *  art's own aspect inside this box without distorting it. */
const FIGURE_W = 216;
const FIGURE_H = Math.round(FIGURE_W * (941 / 915));
// disk.png is 748x196, the flattened "ground shadow" ellipse the mascot stands on.
const FIGURE_SHADOW_W = Math.round(FIGURE_W * 1.05);
const FIGURE_SHADOW_H = Math.round(FIGURE_SHADOW_W * (196 / 748));
/** Houses both the wordmark and the figure, centred on the same point, so the swap between them
 *  is a cross-fade in place rather than a layout jump. */
const BRAND_BOX = Math.max(WORDMARK_H, FIGURE_H) + 12;
/** The figure sits dead-centre on screen while the buttons are pinned a fixed distance off the
 *  bottom edge (see `brandBox`/`actions` below) — two independent anchors, not a flex group, so
 *  the pair reads as bottom-heavy rather than centred as a unit. This lifts both by the same
 *  amount so the whole composition's visual centre lands on the screen's centre. */
const GROUP_LIFT = 56;

// ── timeline ─────────────────────────────────────────────────────────────────
const STILL_MS = 1800; // state 1 holds, untouched, for exactly this long
const SWAP_MS = 550; // wordmark → figure cross-fade
const BUTTONS_DELAY = STILL_MS + SWAP_MS;
const BUTTONS_MS = 420;
const WAVE_START = BUTTONS_DELAY + BUTTONS_MS;
const WAVE_STAGGER = 110; // gap between each wave layer's entrance
const WAVE_MS = 640;
const WAVE_EASE = Easing.out(Easing.cubic);

/** width fraction of the screen (native asset dims, fraction of screen width to occupy). Height
 *  is derived from the asset's own aspect ratio in pixels, computed against the actual window —
 *  not a CSS `aspectRatio` on an absolutely positioned node, which some RN/Yoga versions fail to
 *  resolve against a percentage width and simply don't render (that was the last bug: the layers
 *  silently collapsed to zero size instead of distorting). */
const WAVE_ASSETS = {
  rightBack: { w: 960, h: 1173, frac: 0.33 },
  rightFront: { w: 1068, h: 1128, frac: 0.34 },
  rightAccent: { w: 681, h: 858, frac: 0.14 },
  leftBack: { w: 1216, h: 1436, frac: 0.35 },
  leftFront: { w: 972, h: 1192, frac: 0.3 },
  leftAccent: { w: 768, h: 872, frac: 0.23 },
  // The traced corner lines, top-left and top-right.
  lineLeftMain: { w: 2200, h: 1700, frac: 0.57 },
  lineRightMain: { w: 1472, h: 1424, frac: 0.39 },
} as const;

function useWaveSizes() {
  const { width: screenW } = useWindowDimensions();
  return useMemo(() => {
    const out = {} as Record<keyof typeof WAVE_ASSETS, { width: number; height: number }>;
    for (const key in WAVE_ASSETS) {
      const a = WAVE_ASSETS[key as keyof typeof WAVE_ASSETS];
      const width = screenW * a.frac;
      out[key as keyof typeof WAVE_ASSETS] = { width, height: width * (a.h / a.w) };
    }
    return out;
  }, [screenW]);
}

export default function App() {
  const styles = useStyles(makeStyles);
  const safe = useSafeInsets();
  const waveSize = useWaveSizes();
  const { user } = useAuth();
  // useSessionGate would bounce a signed-out Home tap anyway, but only AFTER the room mounts and fires its first query. Pointing the link straight at sign-in means that wasted round-trip never happens.
  const homeRoute = SESSION_REQUIRED && !user ? SIGN_IN_ROUTE : "/room";

  // Stage 1→2: wordmark out, figure in.
  const wordmarkOpacity = useSharedValue(1);
  const wordmarkScale = useSharedValue(1);
  const figureOpacity = useSharedValue(0);
  const figureScale = useSharedValue(0.85);
  // 0 while the wordmark alone is on screen (dead-centre); animates to -GROUP_LIFT alongside the
  // figure swap, since the lift only exists to counterbalance the buttons that appear after it.
  const groupLift = useSharedValue(0);

  // Stage 3: the two entry buttons.
  const actionsOpacity = useSharedValue(0);
  const actionsY = useSharedValue(16);

  // Stage 4: the six wave layers — back-to-front per corner, both corners stepping together.
  const rightBack = useWaveIn(WAVE_START + 0 * WAVE_STAGGER, 90);
  const leftBack = useWaveIn(WAVE_START + 0 * WAVE_STAGGER, -90);
  const rightFront = useWaveIn(WAVE_START + 1 * WAVE_STAGGER, 90);
  const leftFront = useWaveIn(WAVE_START + 1 * WAVE_STAGGER, -90);
  const rightAccent = useWaveIn(WAVE_START + 2 * WAVE_STAGGER, 60);
  const leftAccent = useWaveIn(WAVE_START + 2 * WAVE_STAGGER, -60);
  // The traced lines come in last, one beat after the accents they sit alongside.
  const lineRight = useWaveIn(WAVE_START + 3 * WAVE_STAGGER, 60);
  const lineLeft = useWaveIn(WAVE_START + 3 * WAVE_STAGGER, -60);

  useEffect(() => {
    wordmarkOpacity.value = withDelay(STILL_MS, withTiming(0, { duration: SWAP_MS, easing: WAVE_EASE }));
    wordmarkScale.value = withDelay(STILL_MS, withTiming(0.85, { duration: SWAP_MS, easing: WAVE_EASE }));
    figureOpacity.value = withDelay(STILL_MS, withTiming(1, { duration: SWAP_MS, easing: WAVE_EASE }));
    figureScale.value = withDelay(STILL_MS, withTiming(1, { duration: SWAP_MS, easing: WAVE_EASE }));
    groupLift.value = withDelay(STILL_MS, withTiming(-GROUP_LIFT, { duration: SWAP_MS, easing: WAVE_EASE }));

    actionsOpacity.value = withDelay(BUTTONS_DELAY, withTiming(1, { duration: BUTTONS_MS, easing: WAVE_EASE }));
    actionsY.value = withDelay(BUTTONS_DELAY, withTiming(0, { duration: BUTTONS_MS, easing: WAVE_EASE }));
    // Runs once, on mount, for the whole sequence — never re-armed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const brandBoxStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: groupLift.value }],
  }));
  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmarkOpacity.value,
    transform: [{ scale: wordmarkScale.value }],
  }));
  const figureStyle = useAnimatedStyle(() => ({
    opacity: figureOpacity.value,
    // The fixed +10 (after the scale) settles the mascot's feet a bit further into the shadow
    // disk beneath it, instead of hovering just above it.
    transform: [{ scale: figureScale.value }, { translateY: 10 }],
  }));
  // Fades in with the figure but doesn't share its scale — a ground shadow should stay put
  // while the mascot pops in above it, not grow in lockstep.
  const figureShadowStyle = useAnimatedStyle(() => ({
    opacity: figureOpacity.value,
  }));
  const actionsStyle = useAnimatedStyle(() => ({
    opacity: actionsOpacity.value,
    transform: [{ translateY: actionsY.value }],
  }));

  return (
    <View style={[styles.container, { backgroundColor: BG_CREAM }]}>
      <Image source={clayPattern} style={styles.clay} resizeMode="cover" />

      {/* Right corner, back to front. */}
      <Animated.Image source={wavyRight2} style={[styles.waveRightBack, waveSize.rightBack, rightBack]} resizeMode="contain" />
      <Animated.Image source={wavyRight1} style={[styles.waveRightFront, waveSize.rightFront, rightFront]} resizeMode="contain" />
      <Animated.Image source={wavyRight3} style={[styles.waveRightAccent, waveSize.rightAccent, rightAccent]} resizeMode="contain" />
      <Animated.Image source={lineRight2} style={[styles.lineRightMain, waveSize.lineRightMain, lineRight]} resizeMode="contain" />

      {/* Left corner, back to front. */}
      <Animated.Image source={wavyLeft2} style={[styles.waveLeftBack, waveSize.leftBack, leftBack]} resizeMode="contain" />
      <Animated.Image source={wavyLeft1} style={[styles.waveLeftFront, waveSize.leftFront, leftFront]} resizeMode="contain" />
      <Animated.Image source={wavyLeft3} style={[styles.waveLeftAccent, waveSize.leftAccent, leftAccent]} resizeMode="contain" />
      <Animated.Image source={lineLeft1} style={[styles.lineLeftMain, waveSize.lineLeftMain, lineLeft]} resizeMode="contain" />

      {/* Centred on the full screen, independent of `actions` below — sizing or hiding that row
          must never shift this. That coupling (a flex column centering the pair as a group) was
          the bug: with `actions` reserving height before it faded in, the wordmark sat off-centre. */}
      <Animated.View style={[styles.brandBox, brandBoxStyle]} pointerEvents="none">
        <Animated.Image source={wordmark} style={[styles.wordmark, wordmarkStyle]} resizeMode="contain" />
        <Animated.Image source={figureShadow} style={[styles.figureShadow, figureShadowStyle]} resizeMode="contain" />
        <Animated.Image source={figure} style={[styles.figure, figureStyle]} resizeMode="contain" />
      </Animated.View>

      <Animated.View
        style={[
          styles.actions,
          actionsStyle,
          { bottom: 56 + safe.bottom + 28, left: safe.left, right: safe.right },
        ]}
      >
        <Link href="/auth" asChild>
          {/* The ONE primary action on the screen: first-run onboarding (auth → questionnaire → avatar → home). */}
          <Button label="New User" variant="primary" pill style={styles.actionButton} />
        </Link>
        <Link href={homeRoute} asChild>
          <Button label="Choose Account" variant="primary" pill style={styles.actionButton} />
        </Link>
      </Animated.View>

      {/* DARK icons now: the field is a pale cream, and light status icons on it were invisible. */}
      <StatusBar style="dark" />
    </View>
  );
}

/** One wave layer's entrance: fades and slides in from `fromX` px off its resting position,
 *  starting at `delay` ms after mount. Every layer shares the same duration and easing, so the
 *  only thing that varies between them is when they start — that's what reads as "in sequence". */
function useWaveIn(delay: number, fromX: number) {
  const opacity = useSharedValue(0);
  const x = useSharedValue(fromX);
  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: WAVE_MS, easing: WAVE_EASE }));
    x.value = withDelay(delay, withTiming(0, { duration: WAVE_MS, easing: WAVE_EASE }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: x.value }],
  }));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature required by useStyles
const makeStyles = (t: Theme) =>
  StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
  },
  // The texture's own alpha is already near-invisible (a few percent at most) — it's baked to
  // read as grain on cream, not a layer that needs its own opacity knob.
  clay: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  // Dead-centre on the CONTAINER (the whole screen), via the standard absolute-center trick —
  // not flexbox, and not offset by the safe-area padding `actions` carries below. A negative
  // margin half its own fixed size is exact because the box's size never changes at runtime.
  brandBox: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: Math.max(WORDMARK_W, FIGURE_W),
    height: BRAND_BOX,
    marginLeft: -Math.max(WORDMARK_W, FIGURE_W) / 2,
    marginTop: -BRAND_BOX / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  wordmark: { position: "absolute", width: WORDMARK_W, height: WORDMARK_H },
  figure: { position: "absolute", width: FIGURE_W, height: FIGURE_H },
  // Sits behind the figure (drawn before it above), anchored to the same bottom edge so it reads
  // as ground the mascot is standing on rather than a halo centred on it.
  figureShadow: {
    position: "absolute",
    bottom: 6,
    width: FIGURE_SHADOW_W,
    height: FIGURE_SHADOW_H,
  },
  actions: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACE.lg,
  },
  // Equal, fixed width — sized to comfortably fit "Choose Account" — regardless of label length,
  // so the pair reads as two matched pills, not chips stretched to fill the row.
  // Shadow matched to the room nav rail's white pill (`CARD_CHROME`), not the Button component's
  // own default — the two chrome elements should read as the same weight of "lifted".
  actionButton: {
    width: 172,
    boxShadow: CARD_CHROME.boxShadow,
    shadowColor: CARD_CHROME.shadowColor,
    shadowOpacity: CARD_CHROME.shadowOpacity,
    shadowRadius: CARD_CHROME.shadowRadius,
    shadowOffset: CARD_CHROME.shadowOffset,
    elevation: CARD_CHROME.elevation,
  },
  // Position (anchor corner) only — width/height come from `useWaveSizes`, computed in real
  // pixels against the actual window so the art is never stretched off its native aspect.
  waveRightBack: { position: "absolute", top: 0, right: 0 },
  waveRightFront: { position: "absolute", top: 0, right: 0 },
  waveRightAccent: { position: "absolute", top: 0, right: 0 },
  waveLeftBack: { position: "absolute", bottom: 0, left: 0 },
  waveLeftFront: { position: "absolute", bottom: 0, left: 0 },
  waveLeftAccent: { position: "absolute", bottom: -10, left: -7 },
  // The traced lines, top corners.
  lineRightMain: { position: "absolute", top: 210, right: -50 },
  lineLeftMain: { position: "absolute", top: -130, left: -120},
  });
