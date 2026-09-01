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

const APPEAR_DELAY_MS = 1_400;

const PORTRAIT = 64;

const MAP_CREAM = "#FBF8F3";
const MAP_INK = "#231F20";

const RING_BLEED = 6;

const HALO = 5;

let shownThisRunFor: string | null = null;

const SEEN_KEY_PREFIX = "modu.map-coach-seen.v1";

const seenKey = (userId: string) => `${SEEN_KEY_PREFIX}:${userId}`;

export async function resetMapCoachSeen(
  profiles?: { update: (id: string, patch: { mapCoachSeen: boolean }) => Promise<unknown> },
  userId?: string,
) {
  shownThisRunFor = null;
  if (userId) await AsyncStorage.removeItem(seenKey(userId)).catch(() => undefined);
  await AsyncStorage.removeItem(SEEN_KEY_PREFIX).catch(() => undefined);
  if (profiles && userId) {
    await profiles
      .update(userId, { mapCoachSeen: false })
      .catch((err: unknown) =>
        console.warn("[map coach] could not clear the profile flag", err),
      );
  }
}

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
  const m = useMirror();
  const repos = useRepos();
  const me = useCurrentUserId();
  const profile = useGameStore((s) => s.profile);
  const furniture = useGameStore((s) => s.furniture);
  const focus = useGameStore((s) => s.settings.focusMode);
  const mode = useGameStore((s) => s.mode);
  const heldActionId = useGameStore((s) => s.heldActionId);
  const mapVisible = useBuildPaused();

  const [visible, setVisible] = useState(false);
  const [armed, setArmed] = useState(false);
  const decided = useRef(false);
  const fade = useRef(new Animated.Value(0)).current;
  const ringWash = useRef(new Animated.Value(0)).current;
  const mapFrame = useHudSpots((h) => h.frames.map);

  const mapButtonShowing = !focus && mode !== "strict" && !!furniture;

  useEffect(() => {
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
        if (!row) {
          decided.current = false;
          return;
        }
        if (row.mapCoachSeen || seenLocally || shownThisRunFor === me) return;
        shownThisRunFor = me;
        setArmed(true);
      })
      .catch((err) => {
        decided.current = false;
        console.warn("[map coach] could not read seen state", err);
      });

    return () => {
      alive = false;
    };
  }, [repos, me, mapButtonShowing, mapVisible, heldActionId]);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setVisible(true), APPEAR_DELAY_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  useEffect(() => {
    if (!visible) return;
    AsyncStorage.setItem(seenKey(me), "1").catch((err) =>
      console.warn("[map coach] could not save seen state locally", err),
    );
    void repos.profiles
      .update(me, { mapCoachSeen: true })
      .catch((err) =>
        console.warn(
          "[map coach] could not save seen state — the coach will reappear next launch. Has migration 025_map_coach_scene.sql run, with its column grant?",
          err,
        ),
      );
  }, [visible, me, repos]);

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

  useEffect(() => {
    if (visible && mapVisible) dismiss();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapVisible, visible]);

  if (!visible || !mapButtonShowing || mapVisible) return null;

  return (
    <ThemeScope value="light">
    <View style={styles.layer} pointerEvents="box-none">
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
    ringBox: {
      position: "absolute",
      borderRadius: RADIUS.pill,
    },
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
    ringWash: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: RADIUS.pill,
      backgroundColor: t.accent,
    },
    row: {
      position: "absolute",
      right: 110,
      top: 14,
      maxWidth: 380,
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
      backgroundColor: MAP_CREAM,
      ...ELEVATION.card,
    },
    message: { ...TYPE.body, color: MAP_INK },
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