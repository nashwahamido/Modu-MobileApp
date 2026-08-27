import { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { FitState } from "@/src/game/core/geometry/fit";
import { screwSpinInfo } from "@/src/game/core/evaluation/engagement";
import { playSfx } from "@/src/game/audio/sfx";
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

/** The shortest gap between two error cues for the facing gate.
 *
 *  `aimBlocked` is recomputed every drag frame and flips the moment the aim crosses the gate, so a
 *  sound on every rising edge would machine-gun while the player sweeps the camera past a socket —
 *  the exact motion the cue is asking for. This makes it a nudge rather than an alarm: the chip
 *  itself still appears and disappears with no delay at all, because the WORDS are cheap to repeat
 *  and the sound is not. */
const AIM_CUE_SFX_COOLDOWN_MS = 2_000;

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
  const aimBlocked = useGameStore((s) => s.aimBlocked);
  // For the camera cue's sound only. The same `soundEffects` switch useAssemblySfx gates every other
  // effect on — a cue that ignored it would be the one sound in the build a player cannot turn off.
  const soundOn = useGameStore((s) => s.settings.soundEffects);
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
  // Facing gate feedback: the aim is on a socket the camera cannot see the contact side of. Coaching the camera turn out loud is half the feature — the gate alone reads as "snapping is broken" (the off-frame gate shipped silent and did exactly that).
  //
  // FIT_HUNT, not FIT_CLOSE. This is the only entry in the set that is not a progress reading —
  // every other colour here says how near the part is to its socket, and blue in that scale means
  // "getting close, keep coming". Saying that while the drop is GATED told the player the opposite
  // of the truth: they read encouragement, kept pushing, and the part would not seat. Orange is the
  // same "still hunting" the chip already uses for a part with nowhere to go yet, which is what this
  // is — there is a socket, but not one that can be reached from here.
  //
  // Two moves, two labels: a socket hidden behind the model is a TURN, a socket that has fallen off
  // the viewport edge is a ZOOM OUT. The advice has to name the right one — "turn the camera" while
  // every socket sits outside the frame sends the player sweeping the model past an edge they cannot
  // see over, and the gesture they need is the one they were not told to make.
  let aimCue = false;
  if (fitState === "held" && aimBlocked) {
    look = {
      color: FIT_HUNT,
      label: aimBlocked === "zoom" ? "Try zooming out" : "Try turning the camera",
    };
    aimCue = true;
  }
  // The branches below are STATES, not verdicts on a drag — a slide, a press, a screw. Each replaces
  // the chip wholesale, so each also clears the cue: the sound belongs to the camera message, and
  // firing it under a chip that now says "Turn to screw it in" would be a correction for something
  // the player is not doing.
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

  // THE SAME SOUND A BLOCKED PICK-UP MAKES. Both are the build saying "not like that" — one about
  // the part, one about the angle — so the player learns one cue instead of two. Rising edge only,
  // behind the cooldown above.
  //
  // `heldBlocked` withholds the whole chip, so it withholds the sound too: a part with no legal step
  // is the error toast's business, and two corrections for one mistake is one too many.
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