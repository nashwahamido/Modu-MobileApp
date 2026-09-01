import {
  useEffect,
  useRef,
  useState } from "react";
import { Animated,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Pressable } from "@/src/components/Pressable";

import { avatarHeadForProfile } from "@/src/components/avatarAssets";
import { SHOWCASE_ENABLED } from "@/src/dev/showcase";
import { availableInMode } from "@/src/game/core/evaluation/availability";
import { useGameStore } from "@/src/game/core/store";
import { CompanionPortrait } from "@/src/game/ui/hud/CompanionPortrait";
import { HudGhostLayer, HudGhostRing, useHudSpots, type HudSpotId } from "@/src/game/ui/hud/hudSpotlight";
import { useBuildPaused } from "@/src/game/ui/hud/useBuildPaused";
import { ELEVATION, RADIUS, SPACE, ThemeScope, TYPE, type Theme, useFixedStyles } from "@/src/game/ui/system/theme";

const STUCK_MS = 30_000;

const MISS_LIMIT = 4;

const LINGER_MS = 12_000;

const BESIDE_GAP = 14;

const BESIDE_PORTRAIT = 44;

const CARD_CREAM = "#FBF8F3";
const CARD_INK = "#231F20";

const SKIP_CONTROL = __DEV__ || SHOWCASE_ENABLED ? "Auto" : "Spot";

const SKIP_SPOT: HudSpotId = __DEV__ || SHOWCASE_ENABLED ? "auto" : "spot";

type Prompt = "stalled" | "fumbling";

export function StuckCoach() {
  const styles = useFixedStyles(makeStyles);
  const profile = useGameStore((s) => s.profile);
  const furniture = useGameStore((s) => s.furniture);
  const focus = useGameStore((s) => s.settings.focusMode);

  const heldActionId = useGameStore((s) => s.heldActionId);
  const driveActionId = useGameStore((s) => s.driveActionId);
  const orientationActionId = useGameStore((s) => s.orientationActionId);
  const activeCluster = useGameStore((s) => s.activeCluster);
  const hintPulse = useGameStore((s) => s.hintPulse);
  const missCount = useGameStore((s) => s.missCount);

  const recenterFrame = useHudSpots((sp) => sp.frames.recenter);
  const { width: screenW } = useWindowDimensions();

  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const activityTick = useGameStore((s) => s.activityTick);
  const fade = useRef(new Animated.Value(0)).current;

  const paused = useBuildPaused();
  const completed = useGameStore((s) => s.completed);
  const mode = useGameStore((s) => s.mode);

  const somethingToDo =
    !!furniture &&
    availableInMode(furniture, new Set(completed), mode, activeCluster).length > 0;

  const live =
    !!furniture && !paused && !focus && completed.length > 0 && somethingToDo;

  useEffect(() => {
    if (!live || missCount < MISS_LIMIT) return;
    setPrompt("fumbling");
    useGameStore.getState().clearMisses();
  }, [live, missCount]);

  useEffect(() => {
    if (!live || prompt) return;
    const timer = setTimeout(() => setPrompt("stalled"), STUCK_MS);
    return () => clearTimeout(timer);
  }, [
    live,
    prompt,
    completed.length,
    heldActionId,
    driveActionId,
    orientationActionId,
    activeCluster,
    hintPulse,
    activityTick,
  ]);

  useEffect(() => {
    if (!prompt) return;
    Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    const timer = setTimeout(() => setPrompt(null), LINGER_MS);
    return () => {
      clearTimeout(timer);
      fade.setValue(0);
    };
  }, [prompt, fade]);

  if (!live) return null;

  if (!prompt) {
    return (
      <View
        style={styles.layer}
        pointerEvents="box-none"
      />
    );
  }

  const message =
    prompt === "fumbling"
      ? `Tricky one. Press "Recenter" to bring the build back into view.`
      : `Stuck? Press "${SKIP_CONTROL}" to skip this step.`;

  const ring: HudSpotId = prompt === "fumbling" ? "recenter" : SKIP_SPOT;

  const beside =
    prompt === "fumbling" && recenterFrame
      ? {
          top:
            recenterFrame.y + recenterFrame.height / 2 - BESIDE_PORTRAIT / 2,
          ...(recenterFrame.x < screenW / 2
            ? { left: recenterFrame.x + recenterFrame.width + BESIDE_GAP }
            : { right: screenW - recenterFrame.x + BESIDE_GAP }),
        }
      : null;

  return (
    <ThemeScope value="light">
      <HudGhostLayer>
        <HudGhostRing id={ring} visible />
      </HudGhostLayer>
      <View
        style={[styles.layer, beside ? styles.anchoredLayer : null]}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[styles.row, beside ? [styles.besideRow, beside] : null, { opacity: fade }]}
        >
          <CompanionPortrait
            source={avatarHeadForProfile(profile)}
            size={beside ? BESIDE_PORTRAIT : 64}
          />
          <View style={styles.copy}>
            <Text style={[styles.message, beside ? styles.besideMessage : null]}>{message}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Got it"
              hitSlop={10}
              onPress={() => setPrompt(null)}
              style={({ pressed }) => [styles.dismiss, pressed && styles.dismissPressed]}
            >
              <Text style={styles.dismissText}>Got it</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </ThemeScope>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    layer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 58,
      alignItems: "center",
      justifyContent: "flex-end",
      paddingBottom: 72,
    },
    anchoredLayer: { alignItems: "flex-start", justifyContent: "flex-start", paddingBottom: 0 },
    besideRow: { position: "absolute", maxWidth: 250, gap: 8, alignItems: "flex-start" },
    besideMessage: { fontSize: 13, lineHeight: 18 },
    row: {
      maxWidth: 440,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    copy: {
      flexShrink: 1,
      minWidth: 0,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 16,
      backgroundColor: CARD_CREAM,
      ...ELEVATION.card,
    },
    message: { ...TYPE.body, color: CARD_INK },
    dismiss: {
      alignSelf: "flex-end",
      marginTop: SPACE.sm,
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.sm,
      borderRadius: RADIUS.pill,
      backgroundColor: t.accent,
    },
    dismissPressed: { backgroundColor: t.accentPressed },
    dismissText: { ...TYPE.label, color: t.onAccent },
  });