import { StyleSheet, Text, View } from "react-native";
import { FitState } from "@/src/game/core/geometry/fit";
import { screwSpinInfo } from "@/src/game/core/evaluation/engagement";
import { useGameStore } from "@/src/game/core/store";
import { Theme, useFixedStyles, useTheme } from "@/src/game/ui/system/theme";

/** Fit feedback speaks in the palette's own three signals, and adds no fourth colour:
 *    accent  = in progress, keep going
 *    success = this is right, let go
 *    danger  = this is not the place
 *  The LABEL carries the nuance; the colour carries only the verdict. */
// Fit feedback has its OWN three-step scale, distinct from the UI's accent/success tokens: getting close (blue)  →  almost (light green)  →  drop it (green). It reads as a progression toward the goal, which is why it doesn't reuse the interface colours — a chip going blue → green is "you're getting there", not "interactive → done".
const FIT_DONE = "#8FA876"; // Drop it! — the part is home
const FIT_ALMOST = "#BACCA8"; // Almost — a lighter shade of done: nearly there
const FIT_CLOSE = "#A9BFD9"; // Getting close — a step further out
const FIT_HUNT = "#DF9B66"; // Still hunting — a softened take on the sockets' orange: present enough to register, not as loud as the scene cue

const lookFor = (t: Theme): Record<FitState, { color: string; label: string } | null> => ({
  idle: null,
  held: { color: FIT_HUNT, label: "Find the spot" },
  approaching: { color: FIT_CLOSE, label: "Getting close" },
  nearCorrect: { color: FIT_DONE, label: "Drop it!" },
  nearRotation: { color: FIT_ALMOST, label: "Almost — drop to settle" },
  wrongTarget: { color: t.danger, label: "Belongs elsewhere" },
});

/** Color+text fit feedback near the objective bar (in-scene glow comes in M4). */
export function FitChip() {
  const styles = useFixedStyles(makeStyles);
  const t = useTheme();
  const fitState = useGameStore((s) => s.fitState);
  const orientationActionId = useGameStore((s) => s.orientationActionId);
  const driveKind = useGameStore((s) => s.driveKind);
  const driveActionId = useGameStore((s) => s.driveActionId);
  const furniture = useGameStore((s) => s.furniture);
  const completed = useGameStore((s) => s.completed);
  // A blocked part still drags (taking it away was worse than the mistake), but the chip must not
  // coach "Find the spot" for a part that HAS no spot yet — that's two voices disagreeing, with
  // the error toast already saying the true thing. availableForMode is recomputed here rather
  // than read from a snapshot so the chip returns the moment the step becomes legal.
  const heldBlocked = useGameStore(
    (s) => !!s.heldActionId && !s.available().some((a) => a.actionId === s.heldActionId),
  );

  let look = lookFor(t)[fitState];
  if (driveKind === "slide") {
    look = { color: t.success, label: "Slide it into the groove" };
  } else if (driveKind === "press") {
    const tool = furniture?.actions.find((a) => a.actionId === driveActionId)?.tool;
    const struck = tool === "mallet" || tool === "hammer";
    look = {
      color: t.success,
      label: struck ? "Tap it in with the mallet" : "Press it into place",
    };
  } else if (orientationActionId) {
    const action = furniture?.actions.find((a) => a.actionId === orientationActionId);
    const screwing =
      !!furniture &&
      !!action?.partId &&
      !!screwSpinInfo(furniture, action, new Set(completed));
    look = screwing
      ? { color: t.success, label: "Turn to screw it in" }
      : { color: t.accent, label: "Turn to line it up" };
  }

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
    top: 52,
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  text: { color: t.text, fontWeight: "700", fontSize: 13 },
  });