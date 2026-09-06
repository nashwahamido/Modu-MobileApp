import { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { FitState } from "@/src/game/core/geometry/fit";
import { screwSpinInfo } from "@/src/game/core/evaluation/engagement";
import { playSfx } from "@/src/game/audio/sfx";
import { useGameStore } from "@/src/game/core/store";
import { Theme, useFixedStyles, useTheme } from "@/src/game/ui/system/theme";

const FIT_DONE = "#8FA876"; // Drop it! — the part is home
const FIT_ALMOST = "#BACCA8"; // Almost — a lighter shade of done: nearly there
const FIT_CLOSE = "#A9BFD9"; // Getting close — a step further out
const FIT_HUNT = "#DF9B66"; // Still hunting — a softened take on the sockets' orange: present enough to register, not as loud as the scene cue

const AIM_CUE_SFX_COOLDOWN_MS = 2_000;

const lookFor = (t: Theme): Record<FitState, { color: string; label: string } | null> => ({
  idle: null,
  held: { color: FIT_HUNT, label: "Find the spot" },
  approaching: { color: FIT_CLOSE, label: "Getting close" },
  nearCorrect: { color: FIT_DONE, label: "Drop it!" },
  nearRotation: { color: FIT_ALMOST, label: "Almost — drop to settle" },
  wrongTarget: { color: t.danger, label: "Belongs elsewhere" },
});

export function FitChip() {
  const styles = useFixedStyles(makeStyles);
  const t = useTheme();
  const fitState = useGameStore((s) => s.fitState);
  const aimBlocked = useGameStore((s) => s.aimBlocked);
  const soundOn = useGameStore((s) => s.settings.soundEffects);
  const orientationActionId = useGameStore((s) => s.orientationActionId);
  const driveKind = useGameStore((s) => s.driveKind);
  const driveActionId = useGameStore((s) => s.driveActionId);
  const furniture = useGameStore((s) => s.furniture);
  const completed = useGameStore((s) => s.completed);
  const heldBlocked = useGameStore(
    (s) => !!s.heldActionId && !s.available().some((a) => a.actionId === s.heldActionId),
  );

  let look = lookFor(t)[fitState];
  let aimCue = false;
  if (fitState === "held" && aimBlocked) {
    look = { color: FIT_HUNT, label: "Try turning the camera" };
    aimCue = true;
  }
  if (driveKind === "slide") {
    aimCue = false;
    look = { color: t.success, label: "Slide it into the groove" };
  } else if (driveKind === "press") {
    aimCue = false;
    const tool = furniture?.actions.find((a) => a.actionId === driveActionId)?.tool;
    const struck = tool === "mallet" || tool === "hammer";
    look = {
      color: t.success,
      label: struck ? "Tap it in with the mallet" : "Press it into place",
    };
  } else if (orientationActionId) {
    aimCue = false;
    const action = furniture?.actions.find((a) => a.actionId === orientationActionId);
    const screwing =
      !!furniture &&
      !!action?.partId &&
      !!screwSpinInfo(furniture, action, new Set(completed));
    look = screwing
      ? { color: t.success, label: "Turn to screw it in" }
      : { color: t.accent, label: "Turn to line it up" };
  }

  const cueShowing = aimCue && !heldBlocked;
  const lastCueSoundAt = useRef(0);
  useEffect(() => {
    if (!cueShowing || !soundOn) return;
    const now = Date.now();
    if (now - lastCueSoundAt.current < AIM_CUE_SFX_COOLDOWN_MS) return;
    lastCueSoundAt.current = now;
    playSfx("error");
  }, [cueShowing, soundOn]);

  if (!look) return null;
  if (heldBlocked) return null;
  return (
    <View
      style={[styles.chip, { backgroundColor: look.color }]}
      pointerEvents="none"
    >
      <Text style={styles.text}>{look.label}</Text>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    chip: {
      position: "absolute",
      top: 68,
      alignSelf: "center",
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 14,
    },
    text: { color: t.text, fontWeight: "700", fontSize: 13 },
  });