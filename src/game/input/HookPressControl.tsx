import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { PRESS_TAPS, useGameStore } from "@/src/game/core/store";
import { AssemblyAction, Vec3 } from "@/src/game/core/type";
import type { ParkInfo } from "@/src/game/core/evaluation/engagement";
import { lockShoveWord } from "@/src/game/core/presentation/instructions";
import type { OffsetDriver } from "../scene/offsetDriver";

const SIZE = 120;
const TRACK = 140;

/** Fraction of driveProgress the press leg owns; the lock drag owns the rest. */
const PRESS_PHASE = 0.5;

interface Props {
  action: AssemblyAction;
  /** The held part's driver — pressed to the hooked pose, then shoved along the lock axis to the seat. */
  driver?: OffsetDriver;
  /** Press staging (engagement.pressParkInfo) WITH its `lock` leg — the control decomposes the combined park into the two legs. */
  park?: ParkInfo | null;
}

/** Two-phase keyhole placement (part.lockDir — EKET side↔top): PHASE A is PressControl's pad — each tap shoves the panel along its press axis until the dowels sit in the big keyhole ends (the hooked pose: already at target height, overshot along the slot axis) — then the pad becomes a short SlideControl-style track and PHASE B drags the panel the slot length along lockDir to lock; only that commits. The track lies along the slot's dominant screen sense: vertical for a downward lock, horizontal for the EKET depth shove. One placePart action, one progress scalar: 0..PRESS_PHASE is the press leg, the rest is the lock leg, and the offset is the sum of both legs' remainders so undoing nothing and rebuilding mid-way stays consistent. */
export function HookPressControl({ action, driver, park }: Props) {
  const progress = useGameStore((s) => s.driveProgress[action.actionId] ?? 0);
  const squash = useRef(new Animated.Value(1)).current;
  const last = useRef<number | null>(null);

  useEffect(() => {
    squash.setValue(1);
    last.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action.actionId]);

  const lock = park?.lock ?? null;
  // A horizontal (depth/side) slot drags along screen X; a vertical lock keeps the vertical track, thumb travelling the shove's way (down for the hanging drawer front, up for a bolt-carrier side).
  const vertical = lock ? Math.abs(lock.axis[1]) > 0.7 : false;
  const upward = vertical && (lock?.axis[1] ?? 0) > 0;
  // The press leg alone: the combined park offset minus the hooked (lock) share.
  const pressOffset: Vec3 | null =
    park && lock
      ? [
          park.offset[0] - lock.offset[0],
          park.offset[1] - lock.offset[1],
          park.offset[2] - lock.offset[2],
        ]
      : null;

  const apply = (p: number) => {
    if (!driver || !pressOffset || !lock) return;
    const pA = Math.min(1, p / PRESS_PHASE);
    const pB = Math.max(0, (p - PRESS_PHASE) / (1 - PRESS_PHASE));
    driver.set([
      pressOffset[0] * (1 - pA) + lock.offset[0] * (1 - pB),
      pressOffset[1] * (1 - pA) + lock.offset[1] * (1 - pB),
      pressOffset[2] * (1 - pA) + lock.offset[2] * (1 - pB),
    ]);
  };

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd(() => {
      const store = useGameStore.getState();
      const before = store.driveProgress[action.actionId] ?? 0;
      if (before >= PRESS_PHASE) return;
      // The press leg never spills into the lock leg — the last tap lands exactly on the hooked pose and the drag takes over.
      const delta = Math.min(PRESS_PHASE / PRESS_TAPS, PRESS_PHASE - before);
      store.advanceDrive(action.actionId, delta);
      const after = Math.min(PRESS_PHASE, before + delta);
      apply(after);
      Haptics.impactAsync(
        after >= PRESS_PHASE
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Heavy,
      );
      squash.setValue(0.82);
      Animated.spring(squash, {
        toValue: 1,
        useNativeDriver: true,
        speed: 30,
        bounciness: 14,
      }).start();
    });

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onUpdate((e) => {
      const pos = vertical ? e.y : e.x;
      if (last.current !== null) {
        const d = pos - last.current;
        const raw = ((upward ? -d : d) / TRACK) * (1 - PRESS_PHASE);
        if (raw !== 0) {
          const store = useGameStore.getState();
          const before = store.driveProgress[action.actionId] ?? 0;
          // Scrubbing back never re-opens the press leg — the dowels are already through the big slot ends.
          const delta = Math.max(raw, PRESS_PHASE - before);
          store.advanceDrive(action.actionId, delta);
          const after = Math.min(1, Math.max(PRESS_PHASE, before + delta));
          apply(after);
          if (Math.floor(after * 5) > Math.floor(before * 5)) {
            Haptics.selectionAsync();
          }
        }
      }
      last.current = pos;
    })
    .onEnd(() => {
      last.current = null;
    });

  const hooked = progress >= PRESS_PHASE;
  const presses = Math.min(
    PRESS_TAPS,
    Math.round((Math.min(progress, PRESS_PHASE) / PRESS_PHASE) * PRESS_TAPS),
  );
  const lockFrac = Math.max(0, progress - PRESS_PHASE) / (1 - PRESS_PHASE);
  const word = lock ? lockShoveWord(lock.axis) : "over";

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {!hooked ? (
        <GestureDetector gesture={tap}>
          <Animated.View style={[styles.pad, { transform: [{ scale: squash }] }]}>
            <Text style={styles.icon}>✋</Text>
          </Animated.View>
        </GestureDetector>
      ) : (
        <GestureDetector gesture={pan}>
          <View style={vertical ? styles.trackV : styles.trackH}>
            <View
              style={
                vertical
                  ? [upward ? styles.fillVUp : styles.fillV, { height: TRACK * lockFrac }]
                  : [styles.fillH, { width: TRACK * lockFrac }]
              }
            />
            <View
              style={
                vertical
                  ? [styles.thumbV, { top: (TRACK - 44) * (upward ? 1 - lockFrac : lockFrac) }]
                  : [styles.thumbH, { left: (TRACK - 44) * lockFrac }]
              }
            >
              <Text style={styles.thumbText}>{vertical ? (upward ? "⇡" : "⇣") : "⇢"}</Text>
            </View>
          </View>
        </GestureDetector>
      )}
      <Text style={styles.hint}>
        {!hooked
          ? `Press it onto the pins · ${presses}/${PRESS_TAPS}`
          : `Push it ${word} to lock · ${Math.round(lockFrac * 100)}%`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: 160,
    bottom: 36,
    alignItems: "center",
    gap: 8,
  },
  pad: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 4,
    borderColor: "#37c871",
    backgroundColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  icon: { fontSize: 44 },
  trackV: {
    width: 64,
    height: TRACK,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: "#37c871",
    backgroundColor: "rgba(255,255,255,0.78)",
    overflow: "hidden",
  },
  trackH: {
    width: TRACK,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: "#37c871",
    backgroundColor: "rgba(255,255,255,0.78)",
    overflow: "hidden",
  },
  fillV: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(55, 200, 113, 0.25)",
  },
  fillVUp: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(55, 200, 113, 0.25)",
  },
  fillH: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(55, 200, 113, 0.25)",
  },
  thumbV: {
    position: "absolute",
    left: 6,
    right: 6,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#37c871",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbH: {
    position: "absolute",
    top: 6,
    bottom: 6,
    width: 44,
    borderRadius: 22,
    backgroundColor: "#37c871",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbText: { fontSize: 26, color: "#fff", fontWeight: "800" },
  hint: { fontSize: 12, color: "#6b6257", fontWeight: "600" },
});
