import { useStyles } from "@/src/game/ui/system/theme";
import { StyleSheet, Pressable, Text } from "react-native";
import { actionCluster } from "@/src/game/core/evaluation/clusters";
import { engageAxis } from "@/src/game/core/evaluation/engagement";
import { targetPositionForAction } from "@/src/game/core/scene/targets";
import { HOVER_LIFT_M, looseDelta, spawnDelta } from "@/src/game/core/geometry/staging";
import { TIGHTEN_TOTAL_DEG, useGameStore } from "@/src/game/core/store";
import { animateDriver, OffsetDriver } from "@/src/game/scene/offsetDriver";
import type { Theme } from "@/src/game/ui/system/theme";

interface Props {
  heldDriver: OffsetDriver;
  sinkDriver: OffsetDriver;
}

/** DEV-only: performs the next assembly action through the real store/scene pipeline (pickup → glide → snap, or tighten). Lets the whole game be stepped through on an emulator where touch-gesture injection is flaky; also doubles as a demo mode. Ported from the on-release engine; `snapPart` → game's `placePart`, and the done set is passed to game's targetPositionForAction. Parts that need a follow-up (screw park / slide-press drive) complete on the NEXT press, since their tighten/drive is a separate available action. */
export function DevAutoStep({ heldDriver, sinkDriver }: Props) {
  const styles = useStyles(makeStyles);
  const heldActionId = useGameStore((s) => s.heldActionId);

  const step = () => {
    const store = useGameStore.getState();
    const furniture = store.furniture;
    if (!furniture || store.heldActionId) return;
    // Auto drives only the FOCUSED cluster: available() lets cluster-less actions (combineClusters, finishing beats) through no matter what is focused, and stepping those would assemble work that isn't the section on screen. With a focus set, auto goes quiet once that cluster is done rather than running ahead.
    const legal = store.available();
    const action = store.activeCluster
      ? legal.find((a) => actionCluster(furniture, a) === store.activeCluster)
      : legal[0];
    if (!action) return;
    const done = new Set(store.completed);

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
          const ld = looseDelta(part, engageAxis(part, new Set(useGameStore.getState().completed)));
          const p = Math.min(1, applied / TIGHTEN_TOTAL_DEG);
          sinkDriver.set([ld[0] * (1 - p), ld[1] * (1 - p), ld[2] * (1 - p)]);
        }
        if (applied >= TIGHTEN_TOTAL_DEG) clearInterval(tick);
      }, 60);
    } else {
      // reorient / combineClusters / drives — force-complete for the dev stepper.
      store.completeAction(action.actionId);
    }
  };

  if (!__DEV__) return null;
  return (
    <Pressable
      style={[styles.btn, !!heldActionId && styles.btnBusy]}
      onPress={step}
    >
      <Text style={styles.text}>▶ auto</Text>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  btn: {
    // Flows inside play.tsx's bottom-right togglesRow (her placement).
    backgroundColor: t.scrim,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    justifyContent: "center",
  },
  btnBusy: { opacity: 0.4 },
  text: { color: t.onAccent, fontSize: 13, fontWeight: "700" },
  });
