import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { StyleSheet, Image, Pressable, ScrollView, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { COIN_ICON } from "@/src/components/iconAssets";
import { useGameStore } from "@/src/game/core/store";
import { useFixedStyles, FONT } from "@/src/game/ui/system/theme";
import { useRepos } from "@/src/data";
import { usePlacementStore } from "@/src/room/core/placement";
import { ConfettiRain } from "@/src/game/ui/celebration/Confetti";
import { SCREEN_VERTICAL_MARGIN, useSafeInsets } from "@/src/hooks/use-safe-insets";
import type { Theme } from "@/src/game/ui/system/theme";

/** The banner art's aspect (900x218 after trimming), so the height is derived from the width rather
 *  than being a second number that has to be kept in step with it. */
const RIBBON_W = 200;
const RIBBON_H = Math.round(RIBBON_W * (218 / 900));
const REVEAL_MS = 520;

/** Where each spark sits along the banner and when it fires. The delays are spread across the wipe
 *  so they trail its leading edge rather than all popping at once — the sparkle is meant to look
 *  like a consequence of the reveal, not a separate effect layered over it. */
const SPARKS = [
  { x: 0.14, y: -6, size: 5, delay: 200 },
  { x: 0.3, y: RIBBON_H - 4, size: 4, delay: 300 },
  { x: 0.45, y: -9, size: 6, delay: 380 },
  { x: 0.58, y: RIBBON_H - 2, size: 4, delay: 460 },
  { x: 0.72, y: -5, size: 5, delay: 540 },
  { x: 0.88, y: RIBBON_H - 6, size: 6, delay: 620 },
];
const SPARK_COLORS = ["#F0E6D2", "#E8C878", "#FFFFFF"];

/** A single diamond that pops, drifts up and fades. Rotated so it reads as a glint rather than a dot. */
function Spark({ x, y, size, delay, color }: { x: number; y: number; size: number; delay: number; color: string }) {
  const pop = useSharedValue(0);
  useEffect(() => {
    pop.value = withDelay(
      delay,
      withSequence(withTiming(1, { duration: 200 }), withTiming(0, { duration: 420 })),
    );
  }, [delay, pop]);
  const anim = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [
      { translateY: -9 * pop.value },
      { scale: 0.4 + pop.value * 0.9 },
      { rotate: `${45 + pop.value * 90}deg` },
    ],
  }));
  return (
    <Animated.View
      style={[
        { position: "absolute", left: x, top: y, width: size, height: size, backgroundColor: color },
        anim,
      ]}
    />
  );
}

/** The entrance runs as a SEQUENCE, not a chord: the ribbon opens onto an empty card, then each
 *  piece of the result arrives in the order a player would read it. Every value is the moment that
 *  element starts, so re-timing the whole screen is editing this one block. */
const STAGE = {
  ribbon: 140,
  piece: 780,
  reward: 1010,
  xp: 1190,
  actions: 1380,
  confetti: 1760,
} as const;

/** Deliberately darker than t.scrim. That token is tuned for a sheet you look PAST — this is the end
 *  of a build, and the scene behind it has nothing left to say. */
const SCRIM = "rgba(10,8,9,0.88)";

/** The banner's mauve, reused for the card's rim so the ribbon reads as part of the same object
 *  rather than pinned onto something else. */
const MAUVE = "#A97480";

/** Scales up past its resting size and settles. Used for things that should feel like they LANDED —
 *  the finished piece, and the two things you can do with it. */
function PopIn({ delay, style, children }: { delay: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const on = useSharedValue(0);
  useEffect(() => {
    on.value = withDelay(delay, withSpring(1, { damping: 11, stiffness: 170, mass: 0.7 }));
  }, [delay, on]);
  const anim = useAnimatedStyle(() => ({
    // Faster than the scale so it is never seen at its smallest.
    opacity: Math.min(1, on.value * 3),
    transform: [{ scale: 0.7 + on.value * 0.3 }],
  }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/** Enters from the right. Used for the two reward panels, which read as arriving into the column. */
function SlideIn({ delay, style, children }: { delay: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const on = useSharedValue(0);
  useEffect(() => {
    on.value = withDelay(delay, withTiming(1, { duration: 330, easing: Easing.out(Easing.cubic) }));
  }, [delay, on]);
  const anim = useAnimatedStyle(() => ({
    opacity: on.value,
    transform: [{ translateX: 38 * (1 - on.value) }],
  }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/**
 * The completion banner, straddling the card's top edge.
 *
 * It WIPES in left to right: a clip whose width animates from zero, with the art held at full width
 * inside it so nothing squeezes as the clip opens. Sparks trail the opening edge. A reveal reads as
 * the banner being unfurled, which a drop or a fade does not.
 */
function CompletedRibbon({ label }: { label: string }) {
  const styles = useFixedStyles(makeStyles);
  const reveal = useSharedValue(0);
  useEffect(() => {
    reveal.value = withDelay(STAGE.ribbon, withTiming(1, { duration: REVEAL_MS, easing: Easing.out(Easing.cubic) }));
  }, [reveal]);
  const clip = useAnimatedStyle(() => ({ width: RIBBON_W * reveal.value }));
  return (
    <View style={styles.ribbonWrap} pointerEvents="none">
      <Animated.View style={[styles.ribbonClip, clip]}>
        <View style={styles.ribbonInner}>
          <Image
            source={require("@/src/assets/ui/ribbon-completed.png")}
            style={styles.ribbonImg}
            resizeMode="contain"
          />
          <Text style={styles.ribbonText}>{label}</Text>
        </View>
      </Animated.View>
      {SPARKS.map((sp, i) => (
        <Spark
          key={i}
          x={sp.x * RIBBON_W}
          y={sp.y}
          size={sp.size}
          delay={sp.delay}
          color={SPARK_COLORS[i % SPARK_COLORS.length]}
        />
      ))}
    </View>
  );
}

/**
 * The finished-build screen.
 * The coins and XP shown are the catalog's configured reward (item_build) — the same source the
 * grant uses — so the display can't drift from what's awarded. The "succulent plant" reward is from
 * the wireframe and has nothing behind it yet — no item model.
 * Both action buttons go to the inventory: the built piece appears there now, and placement is not
 * wired yet, so "place in the room now!" has nothing to place. They stay separate buttons so the
 * placement route can be restored to the first one without touching the layout.
 */
export function BuildComplete() {
  const styles = useFixedStyles(makeStyles);
  const router = useRouter();
  const repos = useRepos();
  const furniture = useGameStore((s) => s.furniture);
  const completed = useGameStore((s) => s.completed);
  const dismissed = useGameStore((s) => s.doneDismissed);
  const confirmed = useGameStore((s) => s.completeConfirmed);
  const [reward, setReward] = useState({ coins: 0, xp: 0 });
  const safe = useSafeInsets();

  const furnitureId = furniture?.meta.id ?? null;
  useEffect(() => {
    if (!furnitureId) return;
    let alive = true;
    repos.builds
      .buildReward(furnitureId)
      .then((r) => alive && setReward(r))
      // Showing zero beats an uncaught rejection — the grant is server-side regardless. Matches BuildMap.
      .catch((err) => console.warn("[BuildComplete] reward lookup failed", err));
    return () => {
      alive = false;
    };
  }, [furnitureId, repos]);

  if (!furniture) return null;
  const total = furniture.actions.length;
  const isDone = total > 0 && completed.length >= total;
  // Wait for the player to tap "Complete" — until then the FinishBuildButton is showing and they can still orbit the finished model.
  if (!isDone || dismissed || !confirmed) return null;

  const { coins, xp } = reward;
  // One navigation, because the inventory is a POPUP inside the room now rather than a route: the room opens it from ?open=inventory (see RoomExperience). Replacing play rather than pushing is still what drops the finished build off the back stack, and the room remount is still what makes the new piece show up in it.
  const goToInventory = () => {
    router.replace({ pathname: "/room", params: { open: "inventory" } });
  };
  // Straight into the room with the ghost already in hand; falls back to the inventory for the rare furniture with no room model (the tutorial).
  const placeInRoom = () => {
    if (!furnitureId || !usePlacementStore.getState().startPlacing(furnitureId, { firstPlacementGuide: true })) {
      goToInventory();
      return;
    }
    router.replace("/room");
  };

  return (
    <View
      style={[
        styles.scrim,
        // The card can fill the screen on a short landscape window, so the scrim carries the safe margins rather than the card — nothing inside it can then reach a rounded corner or a notch.
        {
          paddingTop: Math.max(safe.raw.top, SCREEN_VERTICAL_MARGIN),
          paddingBottom: Math.max(safe.raw.bottom, SCREEN_VERTICAL_MARGIN),
        },
      ]}
    >
      <View style={styles.stack}>
        <CompletedRibbon label="Completed!" />
      <View style={styles.card}>
        {/* Restart, not undo: this drops the whole build and hands the parts back. reset() clears
            the steps but NOT the two completion flags, so both are cleared here — otherwise
            finishing a second time would skip the Complete button and slam this screen back up. */}
        <Pressable
          style={styles.redoBtn}
          onPress={() => {
            useGameStore.getState().setCompleteConfirmed(false);
            useGameStore.getState().setDoneDismissed(false);
            useGameStore.getState().reset();
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Redo the assembly from the start"
        >
          <Image
            source={require("@/src/assets/ui/icons/icon-redo.png")}
            style={styles.redoIcon}
            resizeMode="contain"
          />
        </Pressable>

        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.mainRow}>
            {/* The finished piece — the reason the screen exists, so it gets the whole left half. */}
            <PopIn delay={STAGE.piece} style={styles.pieceWrap}>
              <Image
                source={furniture.meta.thumbnail.light}
                style={styles.previewImg}
                resizeMode="contain"
              />
            </PopIn>

            <View style={styles.panels}>
              <SlideIn delay={STAGE.reward} style={styles.panel}>
                <Text style={styles.panelKicker}>COMPLETION REWARD:</Text>
                <View style={styles.rewardRow}>
                  <View style={styles.rewardItem}>
                    <Image
                      source={COIN_ICON}
                      style={styles.rewardIcon}
                      resizeMode="contain"
                    />
                    <Text style={styles.rewardText}>+ {coins} coins</Text>
                  </View>
                  <View style={styles.rewardItem}>
                    {/* Still nothing behind this reward — no item model — but the art is real now. */}
                    <Image
                      source={require("@/src/assets/ui/icons/icon-plant.png")}
                      style={styles.rewardIcon}
                      resizeMode="contain"
                    />
                    <Text style={styles.rewardText}>succulent plant</Text>
                  </View>
                </View>
              </SlideIn>

              <SlideIn delay={STAGE.xp} style={styles.panel}>
                <Text style={styles.panelKicker}>TOTAL EXPERIENCE GAINED</Text>
                <View style={styles.xpRow}>
                  <Text style={styles.xpText}>+{xp}</Text>
                  <Image
                    source={require("@/src/assets/ui/icons/icon-xp.png")}
                    style={styles.xpIcon}
                    resizeMode="contain"
                  />
                </View>
              </SlideIn>

              {/* Under the XP rather than across the card's foot: they are what you do with the
                  reward, and putting them in this column is what lets it stay narrow. */}
              <PopIn delay={STAGE.actions} style={styles.actionsRow}>
                <Pressable
                  style={styles.action}
                  onPress={placeInRoom}
                  accessibilityLabel="Place it in the room"
                >
                  <Image
                    source={require("@/src/assets/ui/icons/icon-home.png")}
                    style={styles.actionIcon}
                    resizeMode="contain"
                  />
                  <Text style={styles.actionText}>Place in Room</Text>
                </Pressable>
                <Pressable
                  style={styles.action}
                  onPress={goToInventory}
                  accessibilityLabel="Store it in your inventory"
                >
                  <Image
                    source={require("@/src/assets/ui/icons/icon-inventory.png")}
                    style={styles.actionIcon}
                    resizeMode="contain"
                  />
                  <Text style={styles.actionText}>Store in Inventory</Text>
                </Pressable>
              </PopIn>
            </View>
          </View>
        </ScrollView>
      </View>
      </View>
      <ConfettiRain delay={STAGE.confetti} />
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    scrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: SCRIM,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 12,
      zIndex: 45,
    },
    // The ribbon is a SIBLING of the card, pulled down over it by a negative margin, rather than an absolutely-positioned child: Android clips children that overflow their parent's bounds, and half this banner sits above the card's top edge.
    stack: { width: "100%", maxWidth: 520, maxHeight: "96%", alignItems: "center" },
    // Width-bounded so the clip can grow from the left edge; sparks sit absolutely inside it.
    ribbonWrap: { width: RIBBON_W, height: RIBBON_H, marginBottom: -RIBBON_H * 0.42, zIndex: 2 },
    ribbonClip: { height: RIBBON_H, overflow: "hidden" },
    // Full width inside the clip: without this the art and the label would squeeze as the clip opens instead of being uncovered by it.
    ribbonInner: { width: RIBBON_W, height: RIBBON_H, alignItems: "center", justifyContent: "center" },
    ribbonImg: { width: RIBBON_W, height: RIBBON_H },
    ribbonText: {
      position: "absolute",
      // Centred on the BODY, which occupies the top 73% of the art — the tails and folds hang lower and would drag the label down with them if it were centred on the whole image.
      top: RIBBON_H * 0.36 - 9,
      fontFamily: FONT,
      fontSize: 14,
      fontWeight: "800",
      color: "#FFFFFF",
      textAlign: "center",
    },
    // Same shell as the build map: literal cream, purple rim.
    card: {
      width: "100%",
      maxWidth: 520,
      backgroundColor: "#E3DACD",
      borderRadius: 22,
      borderWidth: 3,
      borderColor: MAUVE,
      // Room for the ribbon's body to sit over the top edge without covering the undo/redo row.
      paddingTop: 26,
      paddingBottom: 12,
      paddingHorizontal: 18,
    },

    redoBtn: {
      position: "absolute",
      // Higher on the card: at 24 it sat level with the title block rather than up in the corner
      // where a secondary control belongs.
      top: 12,
      left: 14,
      width: 30,
      height: 30,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 3,
    },
    redoIcon: { width: 24, height: 24 },

    body: { paddingBottom: 2 },

    mainRow: { flexDirection: "row", gap: 16, alignItems: "center" },
    // No panel and no well: the finished piece sits on the card itself, so nothing frames it but the card.
    pieceWrap: { flex: 1.25, height: 196, alignItems: "center", justifyContent: "center" },
    previewImg: { width: "100%", height: "100%" },

    // maxWidth, not just flex: the panels hold two short lines of text and a couple of icons, and letting them grow with the card only pushes their own content further apart.
    panels: { flex: 1, maxWidth: 208, gap: 8 },
    panel: {
      backgroundColor: t.surface,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: t.border,
      paddingVertical: 10,
      paddingHorizontal: 12,
      alignItems: "center",
    },
    panelKicker: {
      fontFamily: FONT, fontSize: 9.5,
      fontWeight: "800",
      letterSpacing: 0.5,
      color: t.textDim,
      marginBottom: 8,
    },
    rewardRow: { flexDirection: "row", gap: 18 },
    rewardItem: { alignItems: "center", gap: 4, maxWidth: 84 },
    // One size for both rewards: they sit side by side, so a coin drawn larger than the plant would read as worth more.
    rewardIcon: { width: 26, height: 26 },
    rewardText: {
      fontFamily: FONT, fontSize: 10,
      fontWeight: "700",
      color: t.text,
      textAlign: "center",
    },
    xpRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    xpText: { fontFamily: FONT, fontSize: 17, fontWeight: "800", color: t.text },
    xpIcon: { width: 18, height: 18 },

    actionsRow: { flexDirection: "row", justifyContent: "space-around", gap: 12, marginTop: 2 },
    action: { alignItems: "center", gap: 3, flex: 1, maxWidth: 108 },
  actionIcon: { width: 30, height: 30, marginBottom: 2 },
    actionText: {
      fontFamily: FONT, fontSize: 11,
      fontWeight: "700",
      color: t.text,
      textAlign: "center",
    },
  });