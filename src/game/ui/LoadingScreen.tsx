// The one loading look in the app: mascot/initial ring + name line + creep/jump bar, with an error state. Every wait — onboarding gate, catalogue, assembly loader — renders THIS; nothing else owns loading style or the progress cadence.
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Animated, Image, StyleSheet, Text, View } from "react-native";
import { useGameStore } from "@/src/game/core/store";
import { ProgressBar } from "@/src/game/ui/Button";
import { Theme, useStyles } from "@/src/game/ui/theme";
import { advance, type Milestone } from "./loadingProgress";

const mascotImage = require("../../assets/images/mascot/mascot.png");

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
  const styles = useStyles(makeStyles);
  const fontScale = useGameStore((s) => s.settings.fontScale);
  const [fraction, setFraction] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;
  const finishing = useRef(false);
  const error = errorMessage != null;

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
      <View style={styles.avatar}>
        {avatar === "mascot" ? (
          <Image source={mascotImage} style={styles.mascot} />
        ) : (
          <Text style={styles.avatarText}>{avatar.initial}</Text>
        )}
      </View>
      <Text style={[styles.label, { fontSize: 16 * fontScale }]}>{error ? errorMessage : label}</Text>
      {error ? (
        actions ? <View style={styles.actions}>{actions}</View> : null
      ) : (
        <ProgressBar value={fraction} total={1} style={styles.bar} />
      )}
    </Animated.View>
  );
}

const makeStyles = (t: Theme) => {
  const centred = {
    backgroundColor: t.bg,
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
  } as const;
  return StyleSheet.create({
    root: { flex: 1, ...centred },
    overlayRoot: {
      ...StyleSheet.absoluteFillObject,
      ...centred,
      // Being the LAST child is not enough to cover the HUD: on Android an elevated view draws above later siblings regardless of tree order, so the cluster chooser (elevation 20) and every ELEVATION.card panel punched through. zIndex covers iOS/web ordering, elevation covers Android, and 100 sits far above the highest value any HUD element uses.
      zIndex: 100,
      elevation: 100,
    },
    avatar: {
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
    avatarText: { color: t.text, fontSize: 28, fontWeight: "700" },
    mascot: { width: 56, height: 56, borderRadius: 28 },
    label: { color: t.textDim, fontWeight: "600" },
    bar: { width: "60%", maxWidth: 420 },
    actions: { flexDirection: "row", gap: 12, marginTop: 6 },
  });
};
