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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/src/components/Pressable";

import { avatarHeadForProfile } from "@/src/components/avatarAssets";
import { CompanionPortrait } from "@/src/game/ui/hud/CompanionPortrait";
import { HudGhostLayer, useHudSpots, useLayerOrigin } from "@/src/game/ui/hud/hudSpotlight";
import { useBuildPaused } from "@/src/game/ui/hud/useBuildPaused";
import { useCurrentUserId, useRepos } from "@/src/data";
import { useGameStore } from "@/src/game/core/store";
import { useMirror } from "@/src/game/ui/system/handedness";
import { ELEVATION, RADIUS, SPACE, ThemeScope, TYPE, type Theme, useFixedStyles } from "@/src/game/ui/system/theme";

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

/** How far the ring sits proud of the button on every side. */
const RING_BLEED = 6;

/** How far the halo stands proud of the chip, beyond RING_BLEED. Matches HudGhostRing's HALO. */
const HALO = 5;

/**
 * Shown at most once per app RUN, on top of the once-per-account flag.
 *
 * The profile write is the real memory, but it can fail for reasons the player never sees — an
 * unrun migration, a dropped connection, a column the grant does not cover — and when it does the
 * card comes back on every task they open, which is exactly what it must never do. A module-level
 * latch cannot fix a failed write, but it does contain the damage to one appearance per launch
 * instead of one per build.
 *
 * HOLDS A USER ID, not a boolean. As a bare flag it silenced the coach for whoever signed in NEXT:
 * switching accounts from the dev roster does not restart the app, so a fresh account inherited a
 * latch set by the previous one and never saw the card. Same mistake as the shared storage key
 * below — an "is it shown" answer that forgot to ask "for whom".
 */
let shownThisRunFor: string | null = null;

/**
 * A LOCAL mirror of the profile flag.
 *
 * The profile is still the real memory — it is what makes this once per ACCOUNT rather than once per
 * install. But the write can fail for reasons the player never sees: an unrun migration, a column
 * the grant does not cover, no session. When it does, the coach comes back on every launch, which is
 * exactly the thing it must never do, and the failure is invisible from the outside.
 *
 * So both are written and EITHER suppresses. The worst case flips from "shown forever" to "shown
 * once more on a second device", which is the right way round for a card that teaches one button.
 */
const SEEN_KEY_PREFIX = "modu.map-coach-seen.v1";

/**
 * PER USER, not per device — and that distinction is the whole point of this key.
 *
 * The first version wrote one shared key. It worked exactly once: the account that saw the coach set
 * it, and from then on EVERY account on that device read it back and stayed silent, including brand
 * new ones. A fallback meant to cover a failed database write ended up overriding the rule it was
 * there to protect, and the symptom — "a fresh account never sees it" — pointed at the trigger
 * rather than at the memory.
 *
 * Keyed by user id, it does what it was meant to: a failed profile write still suppresses the coach
 * for THAT player on THIS device, and no one else.
 */
const seenKey = (userId: string) => `${SEEN_KEY_PREFIX}:${userId}`;

/**
 * Forget that the coach was ever shown — BOTH memories, plus the in-run latch.
 *
 * Once-per-account is exactly what was asked for, and it makes the thing untestable: after the first
 * sighting there is no way back short of a new account or clearing app data, so "it did not appear
 * when I skipped the tutorial" and "it already fired for me last week" look identical from the
 * outside. This is the difference between them.
 *
 * Dev-facing only — wired to the GM panel, never to anything a player can reach.
 */
export async function resetMapCoachSeen(
  profiles?: { update: (id: string, patch: { mapCoachSeen: boolean }) => Promise<unknown> },
  userId?: string,
) {
  shownThisRunFor = null;
  if (userId) await AsyncStorage.removeItem(seenKey(userId)).catch(() => undefined);
  // The shared key the first version wrote. Removed too, so a device that ran that build is not left
  // permanently silent for every account on it.
  await AsyncStorage.removeItem(SEEN_KEY_PREFIX).catch(() => undefined);
  // The repo is PASSED IN rather than imported: it is chosen by a hook (useRepos), and reaching for
  // a module-level instance here would pick the wrong adapter in a build that swaps them.
  if (profiles && userId) {
    await profiles
      .update(userId, { mapCoachSeen: false })
      .catch((err: unknown) =>
        console.warn("[map coach] could not clear the profile flag", err),
      );
  }
}

/**
 * The highlight on the Map chip.
 *
 * Its own component because it must live INSIDE HudGhostLayer to read that layer's measured origin,
 * and a hook cannot be called conditionally in the parent's tree.
 */
function MapRingHighlight({
  frame,
  fade,
  wash,
  styles,
}: {
  frame: { x: number; y: number; width: number; height: number } | undefined;
  fade: Animated.Value;
  wash: Animated.Value;
  styles: ReturnType<typeof makeStyles>;
}) {
  const origin = useLayerOrigin();
  // Nothing until the button has reported where it is — a frameless box would render as a dot in the
  // corner for the frame or two before the measurement lands.
  if (!frame) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ringBox,
        {
          left: frame.x - origin.x - RING_BLEED,
          top: frame.y - origin.y - RING_BLEED,
          width: frame.width + RING_BLEED * 2,
          height: frame.height + RING_BLEED * 2,
          opacity: fade,
        },
      ]}
    >
      {/* THE HALO IS THE ONE THAT READS HERE. The Map chip is LAVENDER — the app's one "you can act
          on this" colour — so an accent wash over its face is accent over accent and nearly
          invisible. The halo sits outside the chip on the teal backdrop, where the accent always
          contrasts. Same two layers as HudGhostRing. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ringHalo,
          { opacity: wash.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ringWash,
          { opacity: wash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.8] }) },
        ]}
      />
    </Animated.View>
  );
}

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
  // Shared with the idle and stuck cards and with the spoken step, so the four cannot disagree about
  // whether the build is in front of the player. Covers the finished build as well as the map.
  const mapVisible = useBuildPaused();

  const [visible, setVisible] = useState(false);
  const decided = useRef(false);
  const fade = useRef(new Animated.Value(0)).current;
  // 0 → 1 across one flash of the accent wash. See HudGhostRing — the same signal, same timing.
  const ringWash = useRef(new Animated.Value(0)).current;
  // Where the Map button actually is, in window coordinates, as it reported itself.
  const mapFrame = useHudSpots((h) => h.frames.map);

  // The Map button is hidden in focus mode and in strict, so the coach must be too — pointing at a
  // control that is not on screen is worse than never mentioning it.
  const mapButtonShowing = !focus && mode !== "strict" && !!furniture;

  useEffect(() => {
    // ONE DECISION PER MOUNT. Without this guard the effect re-runs on every store change and asks
    // the profile again each time, which both hammers the repo and can race its own write.
    if (
      decided.current ||
      shownThisRunFor === me ||
      !mapButtonShowing ||
      mapVisible ||
      heldActionId
    )
      return;
    decided.current = true;

    let alive = true;
    void Promise.all([
      repos.profiles.get(me).catch(() => null),
      AsyncStorage.getItem(seenKey(me)).catch(() => null),
    ])
      .then(([row, seenLocally]) => {
        if (!alive) return;
        // NO ROW YET is not "already seen". A brand new account is created by the loading gate and
        // the read can land before the row is readable — in which case giving up here would be
        // permanent, because `decided` has already been claimed for this mount. Release it instead
        // and let the next store change ask again.
        if (!row) {
          decided.current = false;
          return;
        }
        if (row.mapCoachSeen || seenLocally || shownThisRunFor === me) return;
        shownThisRunFor = me;
        // Written first and unconditionally: this one cannot fail for a schema reason.
        AsyncStorage.setItem(seenKey(me), "1").catch((err) =>
          console.warn("[map coach] could not save seen state locally", err),
        );
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
        // No profile, no network: say nothing THIS time, but let it try again — the same reasoning as
        // the missing row above. A coach that fired on a failed read would appear whenever the player
        // is offline; one that gave up for good would never appear after a single slow request.
        decided.current = false;
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
        Animated.timing(ringWash, { toValue: 1, duration: 240, useNativeDriver: true }),
        Animated.timing(ringWash, { toValue: 0, duration: 240, useNativeDriver: true }),
        Animated.delay(520),
      ]),
    );
    breath.start();
    return () => {
      breath.stop();
      ringWash.setValue(0);
    };
  }, [visible, fade, ringWash]);

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
      {/* THE BUTTON ITSELF, HIGHLIGHTED. A card that says "press here" while pointing at nothing in
          particular leaves the player scanning a HUD full of chips — this is the "here". It uses the
          PARTS TRAY's flash rather than an outline: the tray already washes a card in the accent to
          mean "this one", and a player has met that the first time they pressed Spot. Sits proud of
          the chip on every side and takes no touches, so the button stays pressable through it. */}
      {/* Nothing until the button has reported where it is — a frameless box would render as a dot
          in the corner for the frame or two before the measurement lands. The card still shows; it
          simply has no highlight to point with yet. */}
      {/* THE RING GETS ITS OWN MEASURED LAYER, and this card needs it more than StuckCoach does: this
          component renders INSIDE play.tsx's inset `chrome`, so its own origin is not the window's
          even before Samsung's cutout setting is involved. */}
      <HudGhostLayer>
        <MapRingHighlight frame={mapFrame} fade={fade} wash={ringWash} styles={styles} />
      </HudGhostLayer>
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
    // Sits ON the Map button, not near it. Position comes from the MEASURED frame the button reports
    // (see HudSpotTarget id="map"), because this layer is full-screen while the button's own slot is
    // inside play.tsx's inset chrome — a copied "right: 14" lands somewhere else entirely on a device
    // with a side inset.
    ringBox: {
      position: "absolute",
      borderRadius: RADIUS.pill,
    },
    // Stands proud of the chip on every side, on the backdrop rather than on the button.
    ringHalo: {
      position: "absolute",
      left: -HALO,
      right: -HALO,
      top: -HALO,
      bottom: -HALO,
      borderRadius: RADIUS.pill,
      borderWidth: 3,
      borderColor: t.accent,
    },
    // Matches PartsTray.flashOverlay and HudGhostRing.
    ringWash: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: RADIUS.pill,
      backgroundColor: t.accent,
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