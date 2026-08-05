import { StyleSheet, Text, View } from "react-native";
import { useGameStore } from "@/src/game/core/store";
import { AssemblyAction } from "@/src/game/core/type";
import type { ParkInfo } from "@/src/game/core/evaluation/engagement";
import { Dial, useDialTurn } from "@/src/game/input/dial/DialGauge";
import type { ClusterDriver } from "../../scene/offsetDriver";

/** Dial degrees for the full drive — 720 = two turns, so the parked cluster's pre-spin orientation is visually identical to its baked one (2 whole revolutions) and the drive can start without an orientation pop. */
const SCREW_TOTAL_DEG = 720;

interface Props {
  action: AssemblyAction;
  /** The combining cluster's shared driver — spun about the travel axis and sunk toward the seat as the rotation accrues. */
  driver: ClusterDriver;
  /** Park staging (clusterParkInfo): the backed-off offset the cluster starts from and the travel axis it screws along. */
  park: ParkInfo;
}

/** Screw drive for a threaded cluster combine (DALFRED's seat threading onto its base): the parked cluster is spun home with the same clockwise dial as a fastener tighten — each degree of dial travel sinks it along the park axis while the WHOLE cluster turns about that axis, and at two full turns the placement commits through the store's normal drive completion. */
export function ScrewControl({ action, driver, park }: Props) {
  const progress = useGameStore((s) => s.driveProgress[action.actionId] ?? 0);

  const pan = useDialTurn({
    resetKey: action.actionId,
    tickDeg: 90,
    onTurn: (d) => {
      const store = useGameStore.getState();
      const before = store.driveProgress[action.actionId] ?? 0;
      store.advanceDrive(action.actionId, d / SCREW_TOTAL_DEG);
      const p = Math.min(1, before + d / SCREW_TOTAL_DEG);
      // remaining spin unwinds to exactly 0 at flush, so the seated pose is bit-identical to baked; flip the sign here if the on-device turn direction reads wrong
      const rad = ((SCREW_TOTAL_DEG * (1 - p)) * Math.PI) / 180;
      driver.setSpin(
        [park.offset[0] * (1 - p), park.offset[1] * (1 - p), park.offset[2] * (1 - p)],
        park.axis,
        rad,
      );
      // Ticks count in dial degrees, so the shared hook sees the same scale a tighten does
      return p * SCREW_TOTAL_DEG;
    },
  });

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Dial progress={progress} gesture={pan} />
      <Text style={styles.hint}>Screw it in · {Math.round(progress * 100)}%</Text>
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
  hint: { fontSize: 12, color: "#6b6257", fontWeight: "700" },
});
