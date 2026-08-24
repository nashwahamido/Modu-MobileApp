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

  // FUMBLING is driven by the count, not by a timer: the fourth miss IS the moment.
  useEffect(() => {
    if (!live || missCount < MISS_LIMIT) return;
    setPrompt("fumbling");
    // Cleared as it is shown, so crossing the threshold again means four MORE misses rather than
    // every subsequent drop re-firing the same card.
    useGameStore.getState().clearMisses();
  }, [live, missCount]);

  // STALLED is the timer. Restarted by anything that means the player is working, touches included.
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

  // NOT LIVE means nothing to watch — the build is paused, or there is nothing to be stuck on.
  if (!live) return null;

  // WAITING, not absent. The touch observer below is the only thing that sees camera-only work:
  // orbiting and pinching never touch the store, so with the component returning null while the
  // 30-second fuse burned, looking round the build did not count as activity and the card arrived
  // mid-orbit offering to skip a step the player was busy working on. The observer layer stays
  // mounted the whole time; only the bubble waits for `prompt`.
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

  // The control the card is talking about, ringed. Which one depends on which prompt is up: the skip
  // for a stalled step, Recenter for a run of misses.
  const ring: HudSpotId = prompt === "fumbling" ? "recenter" : SKIP_SPOT;

  // BESIDE THE BUTTON for the fumbling prompt, centred low for the stalled one.
  //
  // Which SIDE is decided by where the button actually is, not by a handedness flag: Recenter lives
  // in the left-hand column and mirrors to the right one, and reading the measured frame means the
  // card follows it without this file knowing the rule. Whichever half the button is in, the card
  // takes the other — it must never sit off screen or cover the thing it is ringing.
  //
  // THE PORTRAIT IS WHAT LINES UP WITH THE BUTTON, not the card's top edge. `top` used to be the
  // frame's own y less a small rise, which reads as aligned only if the card is about as tall as the
  // button. It is not: three lines of copy plus the Got it button make the row roughly 115pt, and
  // `row` centres its children — so the portrait landed near the MIDDLE of that, a good 45pt below
  // the control it is pointing at, and the card as a whole hung well under it.
  //
  // Anchoring the portrait's centre to the button's centre fixes that without needing to know how
  // tall the card is, which depends on how the copy wraps. `besideRow` switches the row to
  // flex-start so the portrait sits at the row's top edge and the card grows downward from there;
  // the ring is untouched and stays on the button.
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
    // LIGHT, always — the same scope play.tsx gives the map and the celebrations, and IdleCheckIn.
    // "Assemble in Dark Mode" is about the build surface, not the panels floating over it.
    <ThemeScope value="light">
      {/* The layer measures its own window origin so the ring lands on the button whatever the
          window is doing — see HudGhostLayer. */}
      <HudGhostLayer>
        <HudGhostRing id={ring} visible />
      </HudGhostLayer>
      <View
        style={[styles.layer, beside ? styles.anchoredLayer : null]}
        pointerEvents="box-none"
        // Observes touches without taking them, so the build underneath stays live AND camera-only
        // work still counts as activity. Returning false from the capture handler lets the gesture
        // continue to whatever the player actually aimed at.
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
    // LOW on the screen, unlike IdleCheckIn's card at the top. This one talks about the part in the
    // player's hand and the controls along the bottom rail, so it sits near them rather than over the
    // objective bar.
    layer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 58,
      alignItems: "center",
      justifyContent: "flex-end",
      // ABOVE the toggles row, not over it. The row sits at bottom:16 and is 36 tall, so this clears
      // it with room for the ring's bleed — the card must never cover the button it is pointing at.
      paddingBottom: 72,
    },
    // Anchored to a measured frame, so the layer must stop centring its child.
    anchoredLayer: { alignItems: "flex-start", justifyContent: "flex-start", paddingBottom: 0 },
    // Narrower and tighter than the centred card: it is a note pinned to a control, not a panel.
    //
    // flex-start overrides `row`'s centring, which is what lets the anchor above be the PORTRAIT
    // rather than the card. Centred, the portrait floated to the middle of a card several times its
    // height and the alignment with the button was lost.
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