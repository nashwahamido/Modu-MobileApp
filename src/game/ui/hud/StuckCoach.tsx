// The companion speaking up when a step is going badly — every profile, not just Sparky's.
//
// TWO PROMPTS, ONE CARD, because they are the same interruption for the same reason and only one of
// them can be true at a time. Which one it is decides the copy and nothing else:
//
//   STALLED   — the step has sat untouched for STUCK_MS. Points at the skip.
//   FUMBLING  — the same part has been dropped and missed MISS_LIMIT times in a row. Points at
//               Recenter, because a run of misses on ONE socket usually means the player cannot SEE
//               where the part goes, and re-framing the build is the fix for that.
//
// FUMBLING WINS when both are true. It is the more specific reading of the same silence: someone who
// has missed four times is not idle, they are trying.
//
// Deliberately NOT momentum-only. IdleCheckIn is Sparky's own "are you still here", which is about
// the player having left; this is about the BUILD being stuck, which happens to everyone. The two
// are kept from stacking by IdleCheckIn giving up its card before this one arrives — see the note on
// ASK_VISIBLE_MS there.
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
import { HUD_GHOST_LAYER, HudGhostRing, useHudSpots, type HudSpotId } from "@/src/game/ui/hud/hudSpotlight";
import { useBuildPaused } from "@/src/game/ui/hud/useBuildPaused";
import { ELEVATION, RADIUS, SPACE, ThemeScope, TYPE, type Theme, useFixedStyles } from "@/src/game/ui/system/theme";

/** How long a step sits untouched before the companion offers the way out. */
const STUCK_MS = 30_000;

/**
 * How many misses in a row on the SAME part before Recenter is offered.
 *
 * Four, as asked. Three is inside the range of ordinary fumbling — a long part, an awkward angle, a
 * finger that slipped — and a prompt that arrives there reads as the app watching over the player's
 * shoulder. By the fourth the problem is usually the camera, not the hand.
 */
const MISS_LIMIT = 4;

/** How long the card waits before putting itself away when nothing happens. It is an offer, not a
 *  question, so it should not need dismissing to get on with the build. */
const LINGER_MS = 12_000;

/** The card's floating-panel colours, matching IdleCheckIn and the project map. */
/** How far the beside-a-button card clears the control, and how far it rides above its top edge so
 *  the portrait sits level with a 36pt chip rather than hanging below it. */
const BESIDE_GAP = 14;
const BESIDE_RISE = 10;
/** Smaller than the centred card's 64: this one sits in a rail beside a 36pt button. */
const BESIDE_PORTRAIT = 44;

const CARD_CREAM = "#FBF8F3";
const CARD_INK = "#231F20";

/**
 * Which control the copy names for the SKIP.
 *
 * Auto only exists in dev and showcase builds — DevAutoStep ends with
 * `if (!__DEV__ && !SHOWCASE_ENABLED) return null;` — so naming it in a shipped build would send a
 * stuck player hunting for a button that is not on their screen, which is a worse place to be than
 * stuck. Spot is the release equivalent and renders for everyone: it plays a ghost of the next part
 * travelling into its socket, which is the same "show me" the skip was standing in for.
 */
const SKIP_CONTROL = __DEV__ || SHOWCASE_ENABLED ? "Auto" : "Spot";

/** …and the control the ring goes round, which must be the same one the copy names. */
const SKIP_SPOT: HudSpotId = __DEV__ || SHOWCASE_ENABLED ? "auto" : "spot";

type Prompt = "stalled" | "fumbling";

export function StuckCoach() {
  const styles = useFixedStyles(makeStyles);
  const profile = useGameStore((s) => s.profile);
  const furniture = useGameStore((s) => s.furniture);
  const focus = useGameStore((s) => s.settings.focusMode);

  // The same activity set IdleCheckIn watches. Camera moves are NOT here — orbiting never reaches
  // the store — which is why the layer below also watches raw touches.
  const heldActionId = useGameStore((s) => s.heldActionId);
  const driveActionId = useGameStore((s) => s.driveActionId);
  const orientationActionId = useGameStore((s) => s.orientationActionId);
  const activeCluster = useGameStore((s) => s.activeCluster);
  const hintPulse = useGameStore((s) => s.hintPulse);
  const missCount = useGameStore((s) => s.missCount);
  // The Recenter button's measured frame, so the fumbling card can sit BESIDE it rather than in the
  // middle of the screen. Window coords, which is why this layer is outside `chrome` — see
  // hudSpotlight.
  const recenterFrame = useHudSpots((sp) => sp.frames.recenter);
  const { width: screenW } = useWindowDimensions();

  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [touchTick, setTouchTick] = useState(0);
  const fade = useRef(new Animated.Value(0)).current;

  // PAUSED covers the stage chooser and the one-time intro as well as the Map button — see
  // useBuildPaused. Testing `mapOpen` alone let this fire over the chooser, which is how the map
  // opens on every multi-stage build.
  const paused = useBuildPaused();
  const completed = useGameStore((s) => s.completed);
  const mode = useGameStore((s) => s.mode);

  // IS THERE ANYTHING TO BE STUCK ON? Two cases sent the card up when the answer was no.
  //
  // NOT BEFORE THE FIRST STEP. Arriving at a fresh build and reading the objective for half a minute
  // is not being stuck, it is starting — and "press Spot to skip this step" is a strange first thing
  // to hear from a companion before the player has touched anything. It waits for one completed
  // action, so the offer only ever follows a step they have actually managed.
  //
  // NOT WITH THE STAGE FINISHED. When the last action of a cluster lands there is nothing left to
  // place: the player has to open the map and choose another stage. Offering to skip a step that
  // does not exist, or to recentre a build that is done, points at the wrong thing entirely.
  // `availableInMode` is the same function the HUD uses to decide what the next step IS, so this
  // agrees with the objective bar by construction rather than by a second guess at the rule.
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
    touchTick,
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

  if (!prompt || !live) return null;

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
  const beside =
    prompt === "fumbling" && recenterFrame
      ? recenterFrame.x < screenW / 2
        ? {
            left: recenterFrame.x + recenterFrame.width + BESIDE_GAP,
            top: recenterFrame.y - BESIDE_RISE,
          }
        : {
            right: screenW - recenterFrame.x + BESIDE_GAP,
            top: recenterFrame.y - BESIDE_RISE,
          }
      : null;

  return (
    // LIGHT, always — the same scope play.tsx gives the map and the celebrations, and IdleCheckIn.
    // "Assemble in Dark Mode" is about the build surface, not the panels floating over it.
    <ThemeScope value="light">
      <View style={HUD_GHOST_LAYER} pointerEvents="none">
        <HudGhostRing id={ring} visible />
      </View>
      <View
        style={[styles.layer, beside ? styles.anchoredLayer : null]}
        pointerEvents="box-none"
        // Observes touches without taking them, so the build underneath stays live AND camera-only
        // work still counts as activity. Returning false from the capture handler lets the gesture
        // continue to whatever the player actually aimed at.
        onStartShouldSetResponderCapture={() => {
          setTouchTick((n) => n + 1);
          return false;
        }}
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
    besideRow: { position: "absolute", maxWidth: 250, gap: 8 },
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