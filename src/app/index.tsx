// Home. The workbench palette: a warm near-black, one lavender action, everything else quiet. animations css for landing come from here
import { Link, router } from "expo-router";
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
import { CARD_CHROME, SPACE, Theme, useIsTablet, useStyles, useUiScale } from "@/src/game/ui/system/theme";
import { useSafeInsets } from "@/src/hooks/use-safe-insets";


const BG_CREAM = "#F3ECE0";

/** The player's own room — what "Home" means once there is somebody to be home as. */
const HOME_ROUTE = "/room" as const;

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
const lineLeft1 = require("@/src/assets/ui/landing/line-left-1.png");
const lineRight2 = require("@/src/assets/ui/landing/line-right-2.png");


const WORDMARK_W = 300;
const WORDMARK_H = Math.round(WORDMARK_W * (133 / 600));
const FIGURE_W = 216;
const FIGURE_H = Math.round(FIGURE_W * (941 / 915));
// disk.png 
const FIGURE_SHADOW_W = Math.round(FIGURE_W * 1.05);
const FIGURE_SHADOW_H = Math.round(FIGURE_SHADOW_W * (196 / 748));
/** Phone only. Nudges the mascot and its ground shadow right of the wordmark's own centre line —
 *  the wordmark itself (swapped out before this shows) stays centred, and tablet is untouched. */
const FIGURE_X_SHIFT = 12;
const BRAND_BOX = Math.max(WORDMARK_H, FIGURE_H) + 12;
const GROUP_LIFT = 56;
const ACTIONS_BOTTOM_GAP = 56 + 28;

/** Phone only. Base offset is `2*GROUP_LIFT - SIZE.controlHeight` — the distance that puts the
 *  mascot's own centre exactly halfway between the screen's top edge and the top of this row (see
 *  `groupLift` below). `PHONE_ACTIONS_LIFT` pulls the row up from there, closer under the mascot. */
const PHONE_ACTIONS_LIFT = 14;
/** Phone only. Raises the mascot+disk group AND the button row together by this much, on top of
 *  everything above — so the whole composition sits higher on screen while the gap between them
 *  (already tuned via `PHONE_ACTIONS_LIFT`) stays the same. */
const PHONE_GROUP_RAISE = 20;
const PHONE_ACTIONS_BOTTOM_GAP = 2 * GROUP_LIFT - 44 + PHONE_ACTIONS_LIFT + PHONE_GROUP_RAISE;

/** Galaxy S22 Ultra (167.3 x 77.9mm) has an unusually long ~19.3:9 aspect ratio that this
 *  fixed-px layout doesn't otherwise account for — on it the buttons crept up far enough to clip
 *  the mascot/disk. Matched by aspect ratio (survives the device's own display-resolution/screen-
 *  zoom setting, since those scale width and height together, unlike a raw dp width/height match)
 *  rather than a hardcoded size, so it still catches the device regardless of display settings. */
const S22_ULTRA_ASPECT = 167.3 / 77.9;
const S22_ULTRA_ASPECT_TOLERANCE = 0.015;
const S22_ULTRA_EXTRA_DROP = 24;

const TABLET_ACTIONS_LIFT = 46;

const STILL_MS = 1800;
const SWAP_MS = 550;
const BUTTONS_DELAY = STILL_MS + SWAP_MS;
const BUTTONS_MS = 420;
const WAVE_START = BUTTONS_DELAY + BUTTONS_MS;
const WAVE_STAGGER = 110;
const WAVE_MS = 640;
const WAVE_EASE = Easing.out(Easing.cubic);
const TRACE_MS = 1100;


const WAVE_ASSETS = {
  rightBack: {
    w: 960,
    h: 1173,
    frac: 0.33,
  },
  rightFront: {
    w: 1068,
    h: 1128,
    frac: 0.34,
  },
  rightAccent: {
    w: 681,
    h: 858,
    frac: 0.14,
  },
  leftBack: {
    w: 1216,
    h: 1436,
    frac: 0.35,
  },
  leftFront: {
    w: 972,
    h: 1192,
    frac: 0.3,
  },
  leftAccent: {
    w: 768,
    h: 872,
    frac: 0.23,
  },
  // The traced corner lines, top-left and top-right.
  lineLeftMain: {
    w: 2200,
    h: 1700,
    frac: 0.57,
  },
  lineRightMain: {
    w: 1472,
    h: 1424,
    frac: 0.39,
  },
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
  const k = useUiScale();
  const isTablet = useIsTablet();
  // For Home. `loading` matters as much as `user`: on a cold start the session resolves a beat after
  // the first paint, so a tap during that window would read a null user and send a signed-in player
  // to the picker. Waiting is the honest answer — see onHome.
  const { user, loading } = useAuth();
  const { width: winW, height: winH } = useWindowDimensions();
  const isS22UltraLike =
    !isTablet &&
    Math.abs(Math.max(winW, winH) / Math.min(winW, winH) - S22_ULTRA_ASPECT) < S22_ULTRA_ASPECT_TOLERANCE;
  const wordmarkOpacity = useSharedValue(1);
  const wordmarkScale = useSharedValue(1);
  const figureOpacity = useSharedValue(0);
  const figureScale = useSharedValue(0.85);
  const groupLift = useSharedValue(0);

  const actionsOpacity = useSharedValue(0);
  const actionsY = useSharedValue(16);

  const rightBack = useWaveIn(WAVE_START + 0 * WAVE_STAGGER, 90);
  const leftBack = useWaveIn(WAVE_START + 0 * WAVE_STAGGER, -90);
  const rightFront = useWaveIn(WAVE_START + 1 * WAVE_STAGGER, 90);
  const leftFront = useWaveIn(WAVE_START + 1 * WAVE_STAGGER, -90);
  const rightAccent = useWaveIn(WAVE_START + 2 * WAVE_STAGGER, 60);
  const leftAccent = useWaveIn(WAVE_START + 2 * WAVE_STAGGER, -60);

  const rightTraceProgress = useTraceProgress(STILL_MS);
  const leftTraceProgress = useTraceProgress(STILL_MS);

  useEffect(() => {
    wordmarkOpacity.value = withDelay(STILL_MS, withTiming(0, { duration: SWAP_MS, easing: WAVE_EASE }));
    wordmarkScale.value = withDelay(STILL_MS, withTiming(0.85, { duration: SWAP_MS, easing: WAVE_EASE }));
    figureOpacity.value = withDelay(STILL_MS, withTiming(1, { duration: SWAP_MS, easing: WAVE_EASE }));
    figureScale.value = withDelay(STILL_MS, withTiming(1, { duration: SWAP_MS, easing: WAVE_EASE }));
    groupLift.value = withDelay(
      STILL_MS,
      withTiming(-(GROUP_LIFT * k + (isTablet ? 0 : PHONE_GROUP_RAISE)), { duration: SWAP_MS, easing: WAVE_EASE })
    );

    actionsOpacity.value = withDelay(BUTTONS_DELAY, withTiming(1, { duration: BUTTONS_MS, easing: WAVE_EASE }));
    actionsY.value = withDelay(BUTTONS_DELAY, withTiming(0, { duration: BUTTONS_MS, easing: WAVE_EASE }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const brandBoxStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: groupLift.value }],
  }));
  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmarkOpacity.value,
    transform: [{ scale: wordmarkScale.value }],
  }));
  const figureXShift = isTablet ? 0 : FIGURE_X_SHIFT;
  const figureStyle = useAnimatedStyle(() => ({
    opacity: figureOpacity.value,
    transform: [{ scale: figureScale.value }, { translateY: 10 }, { translateX: figureXShift }],
  }));
  const figureShadowStyle = useAnimatedStyle(() => ({
    opacity: figureOpacity.value,
    transform: [{ translateX: figureXShift }],
  }));
  // HOME GOES HOME, or to the picker if there is nobody to go home as.
  //
  // The room is a protected route, so navigating there signed-out does not fail quietly — the
  // session gate bounces it straight back to /auth. That would work, in the sense that the player
  // ends up in the right place, but it would flash the room's loading state on the way and read as
  // the app changing its mind. Deciding here means one navigation either way.
  //
  // A tap while the session is still resolving does nothing rather than guessing. That window is a
  // few hundred milliseconds at most, and guessing wrong sends someone who IS signed in to a login
  // screen — the more annoying of the two failures by far.
  //
  // On the in-memory backend there is no session to have: SESSION_REQUIRED is false, every screen
  // runs as the demo user, and Home should just go home.
  const onHome = () => {
    if (SESSION_REQUIRED && loading) return;
    router.push(!SESSION_REQUIRED || user ? HOME_ROUTE : SIGN_IN_ROUTE);
  };

  const actionsStyle = useAnimatedStyle(() => ({
    opacity: actionsOpacity.value,
    transform: [{ translateY: actionsY.value }],
  }));
  const leftTraceStyle = useAnimatedStyle(() => {
    const p = leftTraceProgress.value;
    return {
      width: p * waveSize.lineLeftMain.width,
      height: p * waveSize.lineLeftMain.height,
      opacity: Math.min(1, p / 0.1),
    };
  });
  const rightTraceStyle = useAnimatedStyle(() => {
    const p = rightTraceProgress.value;
    return {
      width: p * waveSize.lineRightMain.width,
      height: p * waveSize.lineRightMain.height,
      opacity: Math.min(1, p / 0.1),
    };
  });

  return (
    <View style={[styles.container, { backgroundColor: BG_CREAM }]}>
      <Image source={clayPattern} style={styles.clay} resizeMode="cover" />

      <Animated.Image source={wavyRight2} style={[styles.waveRightBack, waveSize.rightBack, rightBack]} resizeMode="contain" />
      <Animated.Image source={wavyRight1} style={[styles.waveRightFront, waveSize.rightFront, rightFront]} resizeMode="contain" />
      <Animated.Image source={wavyRight3} style={[styles.waveRightAccent, waveSize.rightAccent, rightAccent]} resizeMode="contain" />
      <View
        style={[styles.lineRightMain, waveSize.lineRightMain, isTablet && styles.lineRightMainTablet, styles.traceClip]}
        pointerEvents="none"
      >
        <Animated.View style={[styles.traceGrowTopRight, styles.traceClip, rightTraceStyle]}>
          <Image
            source={lineRight2}
            style={[waveSize.lineRightMain, styles.traceArtTopRight]}
            resizeMode="contain"
          />
        </Animated.View>
      </View>

      <Animated.Image source={wavyLeft2} style={[styles.waveLeftBack, waveSize.leftBack, leftBack]} resizeMode="contain" />
      <Animated.Image source={wavyLeft1} style={[styles.waveLeftFront, waveSize.leftFront, leftFront]} resizeMode="contain" />
      <Animated.Image source={wavyLeft3} style={[styles.waveLeftAccent, waveSize.leftAccent, leftAccent]} resizeMode="contain" />
      <View style={[styles.lineLeftMain, waveSize.lineLeftMain, styles.traceClip]} pointerEvents="none">
        <Animated.View style={[styles.traceGrowBottomLeft, styles.traceClip, leftTraceStyle]}>
          <Image
            source={lineLeft1}
            style={[waveSize.lineLeftMain, styles.traceArtBottomLeft]}
            resizeMode="contain"
          />
        </Animated.View>
      </View>

      <Animated.View style={[styles.brandBox, brandBoxStyle]} pointerEvents="none">
        <Animated.Image source={wordmark} style={[styles.wordmark, wordmarkStyle]} resizeMode="contain" />
        <Animated.Image source={figureShadow} style={[styles.figureShadow, figureShadowStyle]} resizeMode="contain" />
        <Animated.Image source={figure} style={[styles.figure, figureStyle]} resizeMode="contain" />
      </Animated.View>

      <Animated.View
        style={[
          styles.actions,
          actionsStyle,
          {
            bottom: isTablet
              ? ACTIONS_BOTTOM_GAP * k + TABLET_ACTIONS_LIFT * k + safe.bottom
              : PHONE_ACTIONS_BOTTOM_GAP + safe.bottom - (isS22UltraLike ? S22_ULTRA_EXTRA_DROP : 0),
            left: safe.left,
            right: safe.right,
          },
        ]}
      >
        <Link href={SIGN_IN_ROUTE} asChild>
          <Button
            label="Choose Account"
            variant="primary"
            pill
            style={{ ...styles.actionButton, ...(isTablet ? styles.actionButtonTablet : null) }}
            labelStyle={isTablet && styles.actionLabelTablet}
          />
        </Link>
        {/* push, not replace — the picker adds a Back that returns here, and that only works if this
            screen is still on the stack under it. */}
        <Button
          label="Home"
          variant="primary"
          pill
          onPress={onHome}
          style={{ ...styles.actionButton, ...(isTablet ? styles.actionButtonTablet : null) }}
          labelStyle={isTablet && styles.actionLabelTablet}
        />
      </Animated.View>

      {/* D */}
      <StatusBar style="dark" />
    </View>
  );
}

function useWaveIn(delay: number, fromX: number) {
  const opacity = useSharedValue(0);
  const x = useSharedValue(fromX);
  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: WAVE_MS, easing: WAVE_EASE }));
    x.value = withDelay(delay, withTiming(0, { duration: WAVE_MS, easing: WAVE_EASE }));
  }, []);
  return useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: x.value }],
  }));
}

function useTraceProgress(delay: number) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration: TRACE_MS, easing: WAVE_EASE }));
  }, []);
  return progress;
}


const makeStyles = (t: Theme) =>
  StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
  },

  clay: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },

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
  wordmark: {
    position: "absolute",
    width: WORDMARK_W,
    height: WORDMARK_H,
  },
  figure: {
    position: "absolute",
    width: FIGURE_W,
    height: FIGURE_H,
  },

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

  actionButton: {
    width: 172,
    boxShadow: CARD_CHROME.boxShadow,
    shadowColor: CARD_CHROME.shadowColor,
    shadowOpacity: CARD_CHROME.shadowOpacity,
    shadowRadius: CARD_CHROME.shadowRadius,
    shadowOffset: CARD_CHROME.shadowOffset,
    elevation: CARD_CHROME.elevation,
  },

  actionButtonTablet: {
    width: 197,
    minWidth: undefined,
    minHeight: 44,
    paddingHorizontal: SPACE.xl,
  },

  actionLabelTablet: {
    fontSize: 16,
    lineHeight: 18,
    textAlign: "center",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
 
  waveRightBack: {
    position: "absolute",
    top: 0,
    right: 0,
  },
  waveRightFront: {
    position: "absolute",
    top: 0,
    right: 0,
  },
  waveRightAccent: {
    position: "absolute",
    top: 0,
    right: 0,
  },
  waveLeftBack: {
    position: "absolute",
    bottom: 0,
    left: 0,
  },
  waveLeftFront: {
    position: "absolute",
    bottom: 0,
    left: 0,
  },
  waveLeftAccent: {
    position: "absolute",
    bottom: -10,
    left: -7,
  },

  lineRightMain: {
    position: "absolute",
    top: 210,
    right: -50,
  },
  lineLeftMain: {
    position: "absolute",
    top: -130,
    left: -120,
  },
  lineRightMainTablet: {
    top: undefined,
    bottom: -20,
    right: -50,
  },

  traceClip: {
    overflow: "hidden",
  },
  traceGrowBottomLeft: {
    position: "absolute",
    bottom: 0,
    left: 0,
  },
  traceGrowTopRight: {
    position: "absolute",
    top: 0,
    right: 0,
  },
  traceArtTopRight: {
    position: "absolute",
    top: 0,
    right: 0,
  },
  traceArtBottomLeft: {
    position: "absolute",
    bottom: 0,
    left: 0,
  },
  });