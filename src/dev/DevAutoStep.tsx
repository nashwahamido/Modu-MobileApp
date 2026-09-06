import {
  ELEVATION,
  FONT,
  RADIUS,
  SIZE,
  SPACE,
  useFixedStyles } from "@/src/game/ui/system/theme";
import { StyleSheet,
  Text,
  View,
  Image,
} from "react-native";
import { Pressable } from "@/src/components/Pressable";
import { actionCluster } from "@/src/game/core/evaluation/clusters";
import { engageAxis } from "@/src/game/core/evaluation/engagement";
import { targetPositionForAction } from "@/src/game/core/scene/targets";
import { HOVER_LIFT_M, looseDelta, spawnDelta } from "@/src/game/core/geometry/staging";
import { TIGHTEN_TOTAL_DEG, useGameStore } from "@/src/game/core/store";
import { animateDriver, OffsetDriver } from "@/src/game/scene/offsetDriver";
import { useHudIcon } from "@/src/game/ui/hud/hudIcons";
import type { Theme } from "@/src/game/ui/system/theme";

interface Props {
  heldDriver: OffsetDriver;
  sinkDriver: OffsetDriver;
}

export function DevAutoStep({ heldDriver, sinkDriver }: Props) {
  const styles = useFixedStyles(makeStyles);
  const playIcon = useHudIcon("play");
  const step = () => {
    const store = useGameStore.getState();
    const furniture = store.furniture;
    if (!furniture) return;

    const driveId = store.driveActionId;
    if (driveId) {
      const tick = setInterval(() => {
        const st = useGameStore.getState();
        if (st.driveActionId !== driveId) {
          clearInterval(tick);
          return;
        }
        st.advanceDrive(driveId, 0.08);
      }, 40);
      return;
    }

    if (store.heldActionId) {
      const heldId = store.heldActionId;
      const held = furniture.actions.find((a) => a.actionId === heldId);
      const partId = held?.partId;
      if (partId) {
        const part = furniture.parts[partId];
        const target = targetPositionForAction(
          held,
          furniture.parts,
          new Set(store.completed),
        );
        const dest: [number, number, number] = [
          target[0] - part.pose.position[0],
          target[1] - part.pose.position[1],
          target[2] - part.pose.position[2],
        ];
        useGameStore.getState().setDragFit("nearCorrect", heldId);
        animateDriver(heldDriver, dest, 450, () => {
          const st = useGameStore.getState();
          st.releaseHeld();
          const after = useGameStore.getState();
          if (!after.completed.includes(heldId)) {
            after.completeAction(heldId);
            after.cancelHeld();
          }
        });
      } else {
        store.completeAction(heldId);
      }
      return;
    }
    const legal = store.available();
    const action =
      (store.activeCluster
        ? legal.find((a) => actionCluster(furniture, a) === store.activeCluster)
        : undefined) ?? legal[0];
    if (!action) return;
    const done = new Set(store.completed);
    if (action.tool && action.tool !== "hand") {
      store.setSelectedTool(action.tool);
    }

    if (
      (action.type === "placePart" || action.type === "insertFastener") &&
      action.partId
    ) {
      const part = furniture.parts[action.partId];
      const target = targetPositionForAction(action, furniture.parts, done);
      const planeY = target[1] + HOVER_LIFT_M;
      const base = spawnDelta(part.pose, planeY);
      heldDriver.set([base[0], base[1], base[2]]);
      store.beginPickup(action.actionId);
      const dest: [number, number, number] = [
        target[0] - part.pose.position[0],
        target[1] - part.pose.position[1],
        target[2] - part.pose.position[2],
      ];
      setTimeout(() => {
        const matchedActionId = useGameStore
          .getState()
          .available()
          .find((a) => a.actionId === action.actionId)
          ? action.actionId
          : null;
        useGameStore.getState().setDragFit("nearCorrect", matchedActionId);
        animateDriver(heldDriver, dest, 600, () => {
          useGameStore.getState().releaseHeld();
        });
      }, 350);
    } else if (action.type === "tightenFastener") {
      let applied = 0;
      const tick = setInterval(() => {
        applied += 80;
        useGameStore.getState().addTightenDeg(action.actionId, 80);
        if (action.partId) {
          const part = furniture.parts[action.partId];
          const ld = looseDelta(
            part,
            engageAxis(part, new Set(useGameStore.getState().completed)),
          );
          const p = Math.min(1, applied / TIGHTEN_TOTAL_DEG);
          sinkDriver.set([ld[0] * (1 - p), ld[1] * (1 - p), ld[2] * (1 - p)]);
        }
        if (applied >= TIGHTEN_TOTAL_DEG) clearInterval(tick);
      }, 60);
    } else if (action.partId && furniture.parts[action.partId]) {
      const part = furniture.parts[action.partId];
      const ld = looseDelta(part, engageAxis(part, done));
      sinkDriver.set([ld[0], ld[1], ld[2]]);
      animateDriver(sinkDriver, [0, 0, 0], 700, () => {
        useGameStore.getState().completeAction(action.actionId);
      });
    } else {
      store.completeAction(action.actionId);
    }
  };

  return (
    <Pressable style={styles.btn} onPress={step}>
      <View style={styles.content}>
        <Image source={playIcon} style={styles.icon} resizeMode="contain" />
        <Text style={styles.text}>auto</Text>
      </View>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  btn: {
    minHeight: SIZE.controlHeightSm,
    paddingHorizontal: SPACE.md,
    justifyContent: "center",
    borderRadius: RADIUS.pill,
    backgroundColor: t.surface,
    ...ELEVATION.card,
  },
  content: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  icon: { width: 16, height: 16 },
  text: { color: t.text, fontFamily: FONT, fontSize: 13, fontWeight: "800" },
  });