import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Image, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useGameStore } from "@/src/game/core/store";
import { ProgressBar } from "@/src/game/ui/system/Button";
import { LEXEND, Theme, useFixedStyles, useIsTablet } from "@/src/game/ui/system/theme";
import { advance, type Milestone } from "./loadingProgress";

const clayPattern = require("@/src/assets/ui/landing/clay-pattern.png");
const purpleWaveLeft = require("@/src/assets/ui/landing/purple-wave-left.png");
const purpleWaveRight = require("@/src/assets/ui/landing/purple-wave-right.png");
const wavyLeft2 = require("@/src/assets/ui/landing/wavy-left-2.png");
const wavyRight1 = require("@/src/assets/ui/landing/wavy-right-1.png");
const modumascot = require("@/src/assets/images/mascot/modu-mascot.png");

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
const FLOAT_AMP = 20;
const SINE_STEPS = 24;
const SINE_INPUT = Array.from({ length: SINE_STEPS + 1 }, (_, i) => i / SINE_STEPS);
const SINE_OUTPUT = SINE_INPUT.map((p) => Math.sin(p * Math.PI * 2) * FLOAT_AMP);

interface WaveInOptions {
  flipY?: boolean;
  floatMs?: number;
}

function useWaveIn(delay: number, fromX: number, { flipY = false, floatMs = 2600 }: WaveInOptions = {}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const entranceX = useRef(new Animated.Value(fromX)).current;
  const phase = useRef(new Animated.Value(0)).current;
  const floatX = useRef(phase.interpolate({ inputRange: SINE_INPUT, outputRange: SINE_OUTPUT })).current;
  const x = useRef(Animated.add(entranceX, floatX)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(phase, { toValue: 1, duration: floatMs, easing: Easing.linear, useNativeDriver: true })
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

export type LoadingAvatar = "mascot" | { initial: string };

interface Props {
  milestone: Milestone;
  avatar?: LoadingAvatar;
  label?: string;
  errorMessage?: string;
  actions?: ReactNode;
  overlay?: boolean;
  fadeOnComplete?: boolean;
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

  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  useEffect(() => {
    if (error) return;
    const iv = setInterval(() => setFraction((f) => advance(f, TICK_MS, milestone)), TICK_MS);
    return () => clearInterval(iv);
  }, [milestone, error]);

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

const LOADING_BG = "#F3ECE0";

const makeStyles = (t: Theme) => {
  const centred = {
    backgroundColor: LOADING_BG,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 60,
    gap: 10,
  } as const;
  return StyleSheet.create({
    root: { flex: 1, overflow: "hidden", ...centred },
    overlayRoot: {
      ...StyleSheet.absoluteFillObject,
      overflow: "hidden",
      ...centred,
      zIndex: 100,
      elevation: 100,
    },
    clay: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
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
    mascot: { width: 180, height: Math.round(180 * (941 / 915)) },
    mascotTablet: { width: 260, height: Math.round(260 * (941 / 915)) },
    label: { ...LEXEND.semibold, color: t.textDim },
    bar: { width: "60%", maxWidth: 420, height: 14, marginTop: -8 },
    actions: { flexDirection: "row", gap: 12, marginTop: 6 },
  });
};
