import { StyleSheet, View } from "react-native";
import { looseDelta } from "@/src/game/core/geometry/staging";
import { engageAxis } from "@/src/game/core/evaluation/engagement";
import { quatFromAxisAngle, quatMultiply } from "@/src/game/core/geometry/math";
import { AssemblyAction } from "@/src/game/core/type";
import { TIGHTEN_TOTAL_DEG, useGameStore } from "@/src/game/core/store";
import { Dial, useDialTurn } from "@/src/game/input/dial/DialGauge";
import type { OffsetDriver } from "../../scene/offsetDriver";

interface Props {
  action: AssemblyAction;
  /** Drives the fastener's loose offset toward flush as it tightens. */
  sinkDriver: OffsetDriver;
}

/**
 * Circular tighten gesture: drag clockwise; rotation accumulates with haptic ticks per
 * quarter-turn until the fastener sits flush (2 full turns).
 *
 * The gauge itself and the turn gesture are shared with the other three dial controls — see ./DialGauge.
 */
export function TightenControl({ action, sinkDriver }: Props) {
  const deg = useGameStore((s) => s.tightenDeg[action.actionId] ?? 0);

  const pan = useDialTurn({
    resetKey: action.actionId,
    tickDeg: 90,
    onTurn: (d) => {
      const store = useGameStore.getState();
      store.addTightenDeg(action.actionId, d);
      const total = store.tightenDeg[action.actionId] ?? 0;
      const p = Math.min(1, total / TIGHTEN_TOTAL_DEG);
      const part = action.partId ? store.furniture?.parts[action.partId] : undefined;
      // A STRUCTURAL part's tighten turns an invisible screw INTO it (EKET suspension bracket) — the part itself neither sinks nor spins; its engageDir exists only to orient the tool (ToolModel).
      if (part && part.type === "fastener") {
        const axis = engageAxis(part, new Set(store.completed));
        const ld = looseDelta(part, axis);
        sinkDriver.set([ld[0] * (1 - p), ld[1] * (1 - p), ld[2] * (1 - p)]);
        const rad = ((TIGHTEN_TOTAL_DEG * (1 - p)) * Math.PI) / 180;
        sinkDriver.setRotation(quatMultiply(quatFromAxisAngle(axis, rad), part.pose.rotation));
      }
      return total;
    },
  });

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Dial progress={Math.min(1, deg / TIGHTEN_TOTAL_DEG)} gesture={pan} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: 220,
    bottom: 120,
    alignItems: "center",
  },
});
