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
import { useGameStore } from "@/src/game/core/store";
import { useMirror } from "@/src/game/ui/system/handedness";
import { ELEVATION, RADIUS, SPACE, TYPE, type Theme, useFixedStyles } from "@/src/game/ui/system/theme";

/** Long enough for the build to have drawn and the player to have looked at it, short enough that
 *  the card is part of arriving rather than an interruption partway into the first step. */
const APPEAR_DELAY_MS = 1_400;

/** Smaller than the tutorial's 88. This card sits in the top-right rail beside the Map button rather
 *  than in open canvas, and a full-size portrait there crowds the parts tray below it. */
const PORTRAIT = 64;

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
  const mapOpen = useGameStore((s) => s.mapOpen);
  const mode = useGameStore((s) => s.mode);
  const heldActionId = useGameStore((s) => s.heldActionId);

  const [visible, setVisible] = useState(false);
  const decided = useRef(false);
  const fade = useRef(new Animated.Value(0)).current;

  // The Map button is hidden in focus mode and in strict, so the coach must be too — pointing at a
  // control that is not on screen is worse than never mentioning it.
  const mapButtonShowing = !focus && mode !== "strict" && !!furniture;

  useEffect(() => {
    // ONE DECISION PER MOUNT. Without this guard the effect re-runs on every store change and asks
    // the profile again each time, which both hammers the repo and can race its own write.
    if (decided.current || !mapButtonShowing || mapOpen || heldActionId) return;
    decided.current = true;

    let alive = true;
    void repos.profiles
      .get(me)
      .then((row) => {
        if (!alive || !row || row.mapCoachSeen) return;
        // Saved on APPEAR, not on dismiss — see the header. A failure here is logged and otherwise
        // ignored: the player still gets the coach, and the worst case is seeing it once more.
        void repos.profiles
          .update(me, { mapCoachSeen: true })
          .catch((err) => console.warn("[map coach] could not save seen state", err));
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
  }, [repos, me, mapButtonShowing, mapOpen, heldActionId]);

  useEffect(() => {
    if (!visible) return;
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [visible, fade]);

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
    if (visible && mapOpen) dismiss();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapOpen, visible]);

  if (!visible || !mapButtonShowing) return null;

  return (
    <View style={styles.layer} pointerEvents="box-none">
      {/* THE TUTORIAL'S SHAPE: the companion's head is a tile BESIDE the bubble, not an avatar inside
          it. The row is transparent; `copy` is the only surface. */}
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
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    layer: { ...StyleSheet.absoluteFillObject, zIndex: 55 },
    // Tucked under the Map button's own slot (ClusterFocusControl.mapSlot: right 14, top 8) and
    // inset from the right edge so the card sits beside the parts tray rather than over it. The
    // whole block mirrors with the rail in left-hand mode.
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
      borderWidth: 3,
      // The app's one interactive accent, matching the check-in card. Not gold: in this palette
      // gold means EARNED, and being shown a control is not a reward.
      borderColor: t.accent,
      backgroundColor: t.surface,
      ...ELEVATION.card,
    },
    message: { ...TYPE.body, color: t.text },
    dismiss: {
      alignSelf: "flex-start",
      marginTop: SPACE.sm,
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.sm,
      borderRadius: RADIUS.pill,
      backgroundColor: t.surfaceRaised,
    },
    dismissPressed: { backgroundColor: t.border },
    dismissText: { ...TYPE.label, color: t.text },
  });