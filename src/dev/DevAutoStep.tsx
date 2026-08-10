import { ELEVATION, FONT, RADIUS, SIZE, SPACE, useStyles } from "@/src/game/ui/system/theme";
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
    if (!furniture) return;

    // A PARKED DRIVE — a slide, a screw-down combine — is its own state: parkDrive sets
    // driveActionId and the action stays in available() as a placePart, so auto used to take the
    // pickup branch and call beginPickup on a part already parked mid-drive, which does nothing.
    // Drives advance through advanceDrive, and stepping it rather than jumping to 1 plays the same
    // travel the gesture produces.
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

    // A part in hand used to stop auto dead. Finishing what is already held IS the next step — and
    // it is the state a stuck player is most likely to press this in, since a floating part is
    // exactly when the gesture is not working for them.
    if (store.heldActionId) {
      const heldId = store.heldActionId;
      const held = furniture.actions.find((a) => a.actionId === heldId);
      const partId = held?.partId;
      if (partId) {
        const part = furniture.parts[partId];
        const target = targetPositionForAction(held, furniture.parts, new Set(store.completed));
        const dest: [number, number, number] = [
          target[0] - part.pose.position[0],
          target[1] - part.pose.position[1],
          target[2] - part.pose.position[2],
        ];
        useGameStore.getState().setDragFit("nearCorrect", heldId);
        animateDriver(heldDriver, dest, 450, () => {
          const st = useGameStore.getState();
          st.releaseHeld();
          // releaseHeld runs a FIT CHECK, and some held actions do not satisfy it — the seat slide
          // holds its part through a local progress track and finishes with completeAction, not with
          // a drop. If the release did not take, finish it outright: this is a dev stepper, and
          // "nothing happened" is the one outcome it must not produce.
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
    // Auto drives only the FOCUSED cluster: available() lets cluster-less actions (combineClusters, finishing beats) through no matter what is focused, and stepping those would assemble work that isn't the section on screen. With a focus set, auto goes quiet once that cluster is done rather than running ahead.
    const legal = store.available();
    // Prefer the focused cluster, but never REFUSE because of it. Cluster-less actions (combines,
    // finishing beats) and a focus whose work is already done both left this undefined, and the
    // button silently did nothing — which reads as broken rather than as scoped.
    const action =
      (store.activeCluster
        ? legal.find((a) => actionCluster(furniture, a) === store.activeCluster)
        : undefined) ?? legal[0];
    if (!action) return;
    const done = new Set(store.completed);
    // Equip whatever the step calls for BEFORE driving it. The tool model is rendered from
    // selectedTool, so auto used to sink a screw with no screwdriver anywhere in the scene — the
    // motion happened but nothing said which tool did it, which is the part worth demonstrating.
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
          const ld = looseDelta(part, engageAxis(part, new Set(useGameStore.getState().completed)));
          const p = Math.min(1, applied / TIGHTEN_TOTAL_DEG);
          sinkDriver.set([ld[0] * (1 - p), ld[1] * (1 - p), ld[2] * (1 - p)]);
        }
        if (applied >= TIGHTEN_TOTAL_DEG) clearInterval(tick);
      }, 60);
    } else if (action.partId && furniture.parts[action.partId]) {
      // Drives — a mallet strike, a press, a slide. These used to force-complete, so the part simply
      // appeared home: no travel, no tool, nothing to learn from. Running the sink driver from the
      // parked pose down to zero plays the same motion the real gesture produces, just unattended.
      const part = furniture.parts[action.partId];
      const ld = looseDelta(part, engageAxis(part, done));
      sinkDriver.set([ld[0], ld[1], ld[2]]);
      animateDriver(sinkDriver, [0, 0, 0], 700, () => {
        useGameStore.getState().completeAction(action.actionId);
      });
    } else {
      // reorient / combineClusters — no part to move, so there is nothing to animate.
      store.completeAction(action.actionId);
    }
  };

  if (!__DEV__) return null;
  return (
    <Pressable
      style={styles.btn}
      onPress={step}
    >
      <Text style={styles.text}>▶ auto</Text>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  // Styled as a HUD CHIP, matching Spot and the recenter button beside it. The old dark translucent
  // scrim pill read as disabled next to solid cream neighbours — nothing was wrong with its state,
  // it simply did not look like the other controls on the row.
  btn: {
    minHeight: SIZE.controlHeightSm,
    paddingHorizontal: SPACE.md,
    justifyContent: "center",
    borderRadius: RADIUS.pill,
    backgroundColor: t.surface,
    ...ELEVATION.card,
  },
  text: { color: t.text, fontFamily: FONT, fontSize: 13, fontWeight: "800" },
  });