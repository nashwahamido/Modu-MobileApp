// The one loading look in the app: mascot/initial ring + name line + creep/jump bar, with an error state. Every wait — onboarding gate, catalogue, assembly loader — renders THIS; nothing else owns loading style or the progress cadence.
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Image, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useGameStore } from "@/src/game/core/store";
import { ProgressBar } from "@/src/game/ui/system/Button";
import { LEXEND, Theme, useFixedStyles, useIsTablet } from "@/src/game/ui/system/theme";
import { advance, type Milestone } from "./loadingProgress";

const clayPattern = require("@/src/assets/ui/landing/clay-pattern.png");
const purpleWaveLeft = require("@/src/assets/ui/landing/Purple wave_left.png");
const purpleWaveRight = require("@/src/assets/ui/landing/Purple wave_right.png");
const wavyLeft2 = require("@/src/assets/ui/landing/wavy-left-2.png");
const wavyRight1 = require("@/src/assets/ui/landing/wavy-right-1.png");
const modumascot = require("@/src/assets/images/mascot/modu-mascot.png");

/** Native pixel dims (for aspect-correct sizing) and the width each layer occupies, as a fraction
 *  of screen width. The purple wash sits behind and reads bigger than the shape on top of it. */
const WAVE_ASSETS = {
  purpleLeft: { w: 2024, h: 2544, frac: 0.3 },
  purpleRight: { w: 746, h: 939, frac: 0.26 },
  left: { w: 1216, h: 1436, frac: 0.21 },
  right: { w: 960, h: 1173, frac: 0.2 },
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

const WAVE_STAGGER = 90;
const WAVE_MS = 500;
/** Idle drift once a layer has settled: half-amplitude in px and one leg's duration. Each caller
 *  passes its own `floatMs` so the four layers drift out of phase instead of in lockstep — that's
 *  the whole "asynchronous" look, not a randomised value (which would differ every reload). */
const FLOAT_AMP = 20;

interface WaveInOptions {
  /** Mirrors the art vertically (the purple-wave source art is authored bottom-up) — folded into
   *  the same transform array as the animated translateX, since RN style merging replaces a later
   *  `transform` array wholesale rather than combining it with an earlier one. */
  flipY?: boolean;
  /** One leg of the idle float loop's duration, once the entrance settles. Vary this per layer. */
  floatMs?: number;
}

/** One wave layer's entrance: fades and slides in from `fromX` px off its resting position,
 *  starting `delay` ms after mount, while a SEPARATE value idly ping-pongs a few px side to side
 *  the whole time (added to the entrance offset, not sequenced after it) — so the float is already
 *  moving by the time the slide-in settles instead of visibly kicking off late. Two legs, not
 *  three, and `quad` rather than `sin`: fewer JS-thread handoffs between legs and a gentler
 *  ease-in reads as smoother than the more pronounced slow-start `sin` gave. */
function useWaveIn(delay: number, fromX: number, { flipY = false, floatMs = 2600 }: WaveInOptions = {}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const entranceX = useRef(new Animated.Value(fromX)).current;
  const floatX = useRef(new Animated.Value(0)).current;
  const x = useRef(Animated.add(entranceX, floatX)).current;
  useEffect(() => {
    const ease = Easing.inOut(Easing.quad);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatX, { toValue: FLOAT_AMP, duration: floatMs, easing: ease, useNativeDriver: true }),
        Animated.timing(floatX, { toValue: -FLOAT_AMP, duration: floatMs, easing: ease, useNativeDriver: true }),
      ])
    );
    loop.start();
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: WAVE_MS, useNativeDriver: true }),
        Animated.timing(entranceX, { toValue: 0, duration: WAVE_MS, useNativeDriver: true }),
      ]).start();
    }, delay);
    return () => {
      clearTimeout(t);
      loop.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { opacity, transform: flipY ? [{ translateX: x }, { scaleY: -1 }] : [{ translateX: x }] };
}

/** Ring content: the onboarding mascot, or a profile initial (the assembly loader's avatar slot). */
export type LoadingAvatar = "mascot" | { initial: string };

interface Props {
  /** Reached load signal (loadingProgress.ts); the parent derives it from whatever it is waiting on. */
  milestone: Milestone;
  avatar?: LoadingAvatar;
  /** Line under the ring while loading. */
  label?: string;
  /** Set to switch to the error state: this message replaces the label, `actions` replaces the bar, and the tick pauses — a moving bar under an error message reads as a lie. */
  errorMessage?: string;
  /** Buttons rendered in a row under the error message. */
  actions?: ReactNode;
  /** Cover the screen this is rendered over (absolute fill, above the HUD) instead of being a screen of its own. */
  overlay?: boolean;
  /** Fade out over FADE_MS once the bar fills, before onComplete — for overlays that sit on top of live content. */
  fadeOnComplete?: boolean;
  /** Fired after the bar reaches 100% and the hold (plus the fade, if any) elapses: navigate, unmount, whatever comes next. */
  onComplete?: () => void;
}

const TICK_MS = 100;
const HOLD_MS = 150;
const FADE_MS = 300;

export function LoadingScreen({
  milestone,
  avatar = "mascot",
  label = "Loading…",
  errorMessage,
  actions,
  overlay = false,
  fadeOnComplete = false,
  onComplete,
}: Props) {
  const styles = useFixedStyles(makeStyles);
  const isTablet = useIsTablet();
  const fontScale = useGameStore((s) => s.settings.fontScale);
  const [fraction, setFraction] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;
  const finishing = useRef(false);
  const error = errorMessage != null;

  const waveSize = useWaveSizes();
  const purpleRightIn = useWaveIn(0, 90, { flipY: true, floatMs: 1600 });
  const purpleLeftIn = useWaveIn(0, -90, { floatMs: 2000 });
  const right = useWaveIn(WAVE_STAGGER, 90, { floatMs: 1400 });
  const left = useWaveIn(WAVE_STAGGER, -90, { floatMs: 1800 });

  // Held in a ref so an inline arrow from the parent can't restart the hold timer on every re-render.
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  useEffect(() => {
    if (error) return;
    const iv = setInterval(() => setFraction((f) => advance(f, TICK_MS, milestone)), TICK_MS);
    return () => clearInterval(iv);
  }, [milestone, error]);

  // The final beat: bar at 100% → short hold → (fade) → onComplete. finishing ref guards double-runs when deps churn mid-beat, and re-arms on error so a later successful retry can complete again; an error arriving mid-fade stops the animation and restores full opacity, and the finished:false that stopAnimation produces is what keeps onComplete from firing on an aborted fade.
  useEffect(() => {
    if (error) {
      finishing.current = false;
      opacity.stopAnimation();
      opacity.setValue(1);
      return;
    }
    if (milestone !== 1 || fraction < 1 || finishing.current) return;
    finishing.current = true;
    const hold = setTimeout(() => {
      if (!fadeOnComplete) {
        completeRef.current?.();
        return;
      }
      Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(({ finished }) => {
        if (finished) completeRef.current?.();
      });
    }, HOLD_MS);
    return () => clearTimeout(hold);
  }, [error, milestone, fraction, opacity, fadeOnComplete]);

  return (
    <Animated.View style={[overlay ? styles.overlayRoot : styles.root, { opacity }]}>
      <Image source={clayPattern} style={styles.clay} resizeMode="cover" />

      <Animated.Image
        source={purpleWaveRight}
        style={[styles.waveRight, waveSize.purpleRight, purpleRightIn]}
        resizeMode="contain"
      />
      <Animated.Image source={wavyRight1} style={[styles.waveRight, waveSize.right, right]} resizeMode="contain" />

      <Animated.Image source={purpleWaveLeft} style={[styles.waveLeft, waveSize.purpleLeft, purpleLeftIn]} resizeMode="contain" />
      <Animated.Image source={wavyLeft2} style={[styles.waveLeft, waveSize.left, left]} resizeMode="contain" />

      {avatar === "mascot" ? (
        <Image
          source={modumascot}
          style={[styles.mascot, isTablet && styles.mascotTablet]}
          resizeMode="contain"
        />
      ) : (
        <View style={styles.avatarRing}>
          <Text style={styles.avatarText}>{avatar.initial}</Text>
        </View>
      )}
      {error ? (
        actions ? <View style={styles.actions}>{actions}</View> : null
      ) : (
        <ProgressBar value={fraction} total={1} style={styles.bar} />
      )}
      <Text style={[styles.label, { fontSize: (isTablet ? 20 : 16) * fontScale }]}>{error ? errorMessage : label}</Text>
    </Animated.View>
  );
}

// Matches the landing screen's cream field — not `t.bg`, since this look is meant to read the
// same on every loading screen regardless of theme.
const LOADING_BG = "#F3ECE0";

const makeStyles = (t: Theme) => {
  const centred = {
    backgroundColor: LOADING_BG,
    alignItems: "center",
    justifyContent: "center",
    // Biases the centered content (mascot/bar/label — the wave art is `position: absolute` and
    // sits outside this flex flow, so it's untouched) upward off dead-centre.
    paddingBottom: 60,
    gap: 10,
  } as const;
  return StyleSheet.create({
    root: { flex: 1, overflow: "hidden", ...centred },
    overlayRoot: {
      ...StyleSheet.absoluteFillObject,
      overflow: "hidden",
      ...centred,
      // Being the LAST child is not enough to cover the HUD: on Android an elevated view draws above later siblings regardless of tree order, so the cluster chooser (elevation 20) and every ELEVATION.card panel punched through. zIndex covers iOS/web ordering, elevation covers Android, and 100 sits far above the highest value any HUD element uses.
      zIndex: 100,
      elevation: 100,
    },
    clay: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
    // Negative, not 0: the source art carries transparent padding inside its own canvas, so
    // anchoring flush to 0 left a visible gap before the drawn shape actually reached the
    // corner. `root`/`overlayRoot`'s `overflow: hidden` clips the bled-out edge safely.
    waveRight: { position: "absolute", top: -24, right: -24 },
    waveLeft: { position: "absolute", bottom: -24, left: -24 },
    avatarRing: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: t.surfaceInset,
      borderWidth: 2,
      borderColor: t.accent,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    avatarText: { ...LEXEND.bold, color: t.text, fontSize: 28 },
    // modu-mascot.png is 915x941 — near-square, height follows width off its own aspect.
    mascot: { width: 180, height: Math.round(180 * (941 / 915)) },
    mascotTablet: { width: 260, height: Math.round(260 * (941 / 915)) },
    label: { ...LEXEND.semibold, color: t.textDim },
    // Negative marginTop only — pulls the bar closer to the mascot above it without touching the
    // container's `gap` (which would also close up the label's distance below the bar).
    bar: { width: "60%", maxWidth: 420, height: 14, marginTop: -8 },
    actions: { flexDirection: "row", gap: 12, marginTop: 6 },
  });
};
