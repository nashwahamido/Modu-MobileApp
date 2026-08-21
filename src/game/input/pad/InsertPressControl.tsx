import { looseDelta, stageDelta } from "@/src/game/core/geometry/staging";
import { Text, View } from "react-native";
import { engageAxis } from "@/src/game/core/evaluation/engagement";
import { stageShiftFor } from "@/src/game/core/model/staging";
import { AssemblyAction } from "@/src/game/core/type";
import { MALLET_TAPS, TIGHTEN_TOTAL_DEG, useGameStore } from "@/src/game/core/store";
import { PressPad, pressPadStyles as styles, HAND_ICON } from "@/src/game/input/pad/PressPad";
import type { OffsetDriver } from "../../scene/offsetDriver";
import { useMirror } from "@/src/game/ui/system/handedness";

const DEG_PER_TAP = TIGHTEN_TOTAL_DEG / MALLET_TAPS;

interface Props {
  action: AssemblyAction;
  /** Drives the fastener's offset from STAGE toward LOOSE as it is pressed in. Shared with the tighten (they are never active at the same time). */
  sinkDriver: OffsetDriver;
}

/** Insert-press control for 3-phase fasteners (part.insertStage set): tap the pad to PRESS the fastener from its STAGE pose (fully outside the hole) into the LOOSE pose (partly in). Sibling of TapControl — that drives loose→flush on the tighten; this drives stage→loose on the insert. Each tap eases the sink offset from stage to loose; at full taps `addTightenDeg` commits the insertFastener. The carrier's staging offset is folded in so a dowel pressed into a still-staged rod stays with the rod. */
export function InsertPressControl({ action, sinkDriver }: Props) {
  const m = useMirror();
  const deg = useGameStore((s) => s.tightenDeg[action.actionId] ?? 0);

  const press = () => {
    const store = useGameStore.getState();
    store.addTightenDeg(action.actionId, DEG_PER_TAP);
    const total = store.tightenDeg[action.actionId] ?? 0;
    const p = Math.min(1, total / TIGHTEN_TOTAL_DEG);
    const part = action.partId ? store.furniture?.parts[action.partId] : undefined;
    const parts = store.furniture?.parts;
    if (part && parts) {
      const carrier = stageShiftFor(part, parts) ?? [0, 0, 0];
      const s = stageDelta(part);
      // signed axis for parity with TapControl/TightenControl; retract dowels ignore it by design (looseDelta uses their baked engageDir)
      const l = looseDelta(part, engageAxis(part, new Set(store.completed)));
      // lerp stage → loose, plus the carrier's staging offset (the rod is still out during the press)
      sinkDriver.set([
        carrier[0] + s[0] * (1 - p) + l[0] * p,
        carrier[1] + s[1] * (1 - p) + l[1] * p,
        carrier[2] + s[2] * (1 - p) + l[2] * p,
      ]);
    }
  };

  const presses = Math.min(MALLET_TAPS, Math.round(deg / DEG_PER_TAP));

  return (
    <View style={m(styles.wrap)} pointerEvents="box-none">
      <PressPad icon={HAND_ICON} resetKey={action.actionId} onPress={press} />
      <Text style={styles.hint}>
        Press to fit it in · {presses}/{MALLET_TAPS}
      </Text>
    </View>
  );
}