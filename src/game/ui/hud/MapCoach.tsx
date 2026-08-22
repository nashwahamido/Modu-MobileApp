// "You can press here to go back to the project map and the catalogue."
//
// ONCE PER ACCOUNT, on the first assembly task the player opens. The tutorial has its own route and
// deliberately renders no Map button — the map is for choosing which stage of a build to work on and
// the tutorial IS the stage — so a player arriving here has never seen it. This is the one place it
// gets introduced, and after that it is furniture.
//
// PER ACCOUNT, NOT PER INSTALL. The room's coaches use AsyncStorage keys (RoomExperience's
// modu.room-edit-guide-seen.v1 and friends), which rerun on a second device. Being taught the same
// button again on the tablet reads as the app not remembering you, so this one rides on the profile
// — see migration 025 and Profile.mapCoachSeen.
//
// WRITE FIRST, THEN SHOW. The flag is saved the moment the coach appears rather than when it is
// dismissed. A player who backgrounds the app or force-quits mid-coach has still SEEN it, and the
// alternative failure is worse: a card that comes back every launch until it happens to be tapped.
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { avatarHeadForProfile } from "@/src/components/avatarAssets";
import { CompanionPortrait } from "@/src/game/ui/hud/CompanionPortrait";
import { useCurrentUserId, useRepos } from "@/src/data";
import { buildMapVisible } from "@/src/game/core/evaluation/clusters";
import { useGameStore } from "@/src/game/core/store";
import { useMirror } from "@/src/game/ui/system/handedness";
import { ELEVATION, RADIUS, SIZE, SPACE, ThemeScope, TYPE, type Theme, useFixedStyles } from "@/src/game/ui/system/theme";

/** Long enough for the build to have drawn and the player to have looked at it, short enough that
 *  the card is part of arriving rather than an interruption partway into the first step. */
const APPEAR_DELAY_MS = 1_400;

/** Smaller than the tutorial's 88. This card sits in the top-right rail beside the Map button rather
 *  than in open canvas, and a full-size portrait there crowds the parts tray below it. */
const PORTRAIT = 64;

/** The project map's own panel colour and ink (ClusterFocusControl's PANEL_CREAM / INK).
 *
 *  COPIED, and knowingly: pulling them across would mean exporting from a 1000-line file this card
 *  has no other reason to touch. They want a token in theme.ts — several screens already write
 *  #FBF8F3 by hand — but that is a wider change than this card should make. If the map's cream ever
 *  moves, this moves with it. */
const MAP_CREAM = "#FBF8F3";
const MAP_INK = "#231F20";

/** The Map button's own slot and size (ClusterFocusControl's `mapSlot` / `mapButton`), so the ring
 *  below lands exactly on it. Copied for the same reason as the colours above — they want to be
 *  exported from there, and this card is not the change that should do it. */
const MAP_SLOT = { right: 14, top: 8 };
const MAP_BUTTON_W = 86;
/** How far the ring sits proud of the button on every side. */
const RING_BLEED = 6;

/**
 * Shown at most once per app RUN, on top of the once-per-account flag.
 *
 * The profile write is the real memory, but it can fail for reasons the player never sees — an
 * unrun migration, a dropped connection, a column the grant does not cover — and when it does the
 * card comes back on every task they open, which is exactly what it must never do. A module-level
 * latch cannot fix a failed write, but it does contain the damage to one appearance per launch
 * instead of one per build.
 */
let shownThisRun = false;

export function MapCoach() {
  const styles = useFixedStyles(makeStyles);
  // The card points at the Map button, which sits in the mirrored right-hand rail — so the card has
  // to cross the screen with it. See ui/system/handedness: position mirrors, direction never does.
  const m = useMirror();
  const repos = useRepos();
  const me = useCurrentUserId();
  const profile = useGameStore((s) => s.profile);
  const furniture = useGameStore((s) => s.furniture);
  const focus = useGameStore((s) => s.settings.focusMode);
  const mode = useGameStore((s) => s.mode);
  const heldActionId = useGameStore((s) => s.heldActionId);
  // THE WHOLE MAP RULE, not the `mapOpen` flag. The map arrives three ways and only one of them sets
  // that flag — see buildMapVisible. Watching the flag alone put this card straight over the STAGE
  // CHOOSER, which is how the map opens on every multi-stage build.
  const completed = useGameStore((s) => s.completed);
  const activeCluster = useGameStore((s) => s.activeCluster);
  const mapSeen = useGameStore((s) => s.mapSeen);
  const mapOpen = useGameStore((s) => s.mapOpen);
  const mapVisible = buildMapVisible(furniture, new Set(completed), {
    activeCluster,
    mapSeen,
    mapOpen,
  });

  const [visible, setVisible] = useState(false);
  const decided = useRef(false);
  const fade = useRef(new Animated.Value(0)).current;
  const ringPulse = useRef(new Animated.Value(1)).current;

  // The Map button is hidden in focus mode and in strict, so the coach must be too — pointing at a
  // control that is not on screen is worse than never mentioning it.
  const mapButtonShowing = !focus && mode !== "strict" && !!furniture;

  useEffect(() => {
    // ONE DECISION PER MOUNT. Without this guard the effect re-runs on every store change and asks
    // the profile again each time, which both hammers the repo and can race its own write.
    if (decided.current || shownThisRun || !mapButtonShowing || mapVisible || heldActionId) return;
    decided.current = true;

    let alive = true;
    void repos.profiles
      .get(me)
      .then((row) => {
        if (!alive || !row || row.mapCoachSeen || shownThisRun) return;
        shownThisRun = true;
        // Saved on APPEAR, not on dismiss — see the header. A failure here is logged and otherwise
        // ignored: the player still gets the coach, and the worst case is seeing it once more.
        void repos.profiles
          .update(me, { mapCoachSeen: true })
          // LOUD, because a silent failure here is indistinguishable from the feature working: the
          // card shows, the flag never sticks, and it returns on the next build. The usual cause is
          // migration 025 not having run, or its column grant missing — see 009_grants.sql.
          .catch((err) =>
            console.warn(
              "[map coach] could not save seen state — the coach will reappear next launch. Has migration 025_map_coach_seen.sql run, with its column grant?",
              err,
            ),
          );
        setTimeout(() => {
          if (alive) setVisible(true);
        }, APPEAR_DELAY_MS);
      })
      .catch((err) => {
        // No profile, no network: say nothing. A coach that fires on every failed read would be a
        // card that appears whenever the player is offline.
        console.warn("[map coach] could not read seen state", err);
      });

    return () => {
      alive = false;
    };
  }, [repos, me, mapButtonShowing, mapVisible, heldActionId]);

  useEffect(() => {
    if (!visible) return;
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    const breath = Animated.loop(
      Animated.sequence([
        Animated.timing(ringPulse, { toValue: 1.06, duration: 700, useNativeDriver: true }),
        Animated.timing(ringPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    breath.start();
    return () => {
      breath.stop();
      ringPulse.setValue(1);
    };
  }, [visible, fade, ringPulse]);

  const dismiss = () => {
    Animated.timing(fade, { toValue: 0, duration: 160, useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished) setVisible(false);
      },
    );
  };

  // Opening the map IS the acknowledgement — the player did the thing the card describes, and a card
  // still sitting there afterwards reads as the app not noticing.
  useEffect(() => {
    if (visible && mapVisible) dismiss();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapVisible, visible]);

  // NOT WHILE THE MAP IS ON SCREEN, in any of the three ways it gets there. Dismissing (above) fades
  // the card out, but a fade still DRAWS for its duration — and the map's scrim covers the screen, so
  // those frames land on top of the very panel this card names. Returning null is immediate; the
  // fade still runs underneath, so the card is gone rather than waiting once the map closes.
  if (!visible || !mapButtonShowing || mapVisible) return null;

  return (
    // LIGHT, always — the same scope play.tsx puts the map itself under, and for the same reason.
    // This card is the map's doorbell: it names that panel and wears its colours, so it cannot
    // follow "Assemble in Dark Mode" while the thing it points at does not. Without this the
    // portrait's rim and the copy both resolved dark against a cream card.
    <ThemeScope value="light">
    <View style={styles.layer} pointerEvents="box-none">
      {/* THE TUTORIAL'S SHAPE: the companion's head is a tile BESIDE the bubble, not an avatar inside
          it. The row is transparent; `copy` is the only surface. */}
      {/* THE BUTTON ITSELF, ringed. A card that says "press here" while pointing at nothing in
          particular leaves the player scanning a HUD full of chips — the ring is the "here". It
          pulses with the same breath the tutorial's cards use, sits proud of the chip on every side,
          and takes no touches, so the button underneath stays pressable through it. */}
      <Animated.View
        style={[m(styles.ring), { opacity: fade, transform: [{ scale: ringPulse }] }]}
        pointerEvents="none"
      />
      <Animated.View style={[m(styles.row), { opacity: fade }]}>
        <CompanionPortrait source={avatarHeadForProfile(profile)} size={PORTRAIT} />
        <View style={styles.copy}>
          <Text style={styles.message}>
            You can press here to go back to the project map and the catalogue.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Got it"
            hitSlop={10}
            onPress={dismiss}
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
    layer: { ...StyleSheet.absoluteFillObject, zIndex: 55 },
    // Tucked under the Map button's own slot (ClusterFocusControl.mapSlot: right 14, top 8) and
    // inset from the right edge so the card sits beside the parts tray rather than over it. The
    // whole block mirrors with the rail in left-hand mode.
    // Sits ON the Map button, not near it: same slot, same size, grown by RING_BLEED all round.
    ring: {
      position: "absolute",
      right: MAP_SLOT.right - RING_BLEED,
      top: MAP_SLOT.top - RING_BLEED,
      width: MAP_BUTTON_W + RING_BLEED * 2,
      height: SIZE.controlHeightSm + RING_BLEED * 2,
      borderRadius: RADIUS.pill,
      borderWidth: 3,
      borderColor: t.accent,
    },
    // TRANSPARENT layout row — the portrait tile and the bubble are two surfaces, as the tutorial
    // draws them. The whole block mirrors with the right-hand rail in left-hand mode.
    row: {
      position: "absolute",
      right: 110,
      top: 14,
      maxWidth: 380,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    // Radius 16 and padding 14/12 are the tutorial card's, so the two read as one voice.
    copy: {
      flexShrink: 1,
      minWidth: 0,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 16,
      // NO STROKE, matching the check-in card: fill and shadow carry the separation on their own.
      // The MAP's cream, not the theme surface — this card has to look like the panel it names.
      backgroundColor: MAP_CREAM,
      ...ELEVATION.card,
    },
    message: { ...TYPE.body, color: MAP_INK },
    // RIGHT-ALIGNED and FILLED with the accent, matching the check-in card: it is the only pressable
    // thing here, and lavender is the app's single "you can act on this" colour.
    dismiss: {
      alignSelf: "flex-end",
      marginTop: SPACE.sm,
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.sm,
      borderRadius: RADIUS.pill,
      backgroundColor: t.accent,
    },
    dismissPressed: { backgroundColor: t.accentPressed },
    // onAccent, not the map's ink: the same label colour every filled button in the app uses.
    dismissText: { ...TYPE.label, color: t.onAccent },
  });