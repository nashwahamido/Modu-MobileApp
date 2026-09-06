import { useEffect, useRef } from "react";
import { Text, View } from "react-native";
import { PRESS_TAPS, useGameStore } from "@/src/game/core/store";
import { AssemblyAction, Vec3 } from "@/src/game/core/type";
import type { ParkInfo } from "@/src/game/core/evaluation/engagement";
import { PressPad, pressPadStyles as styles, HAND_ICON } from "@/src/game/input/pad/PressPad";
import type { OffsetDriver } from "../../scene/offsetDriver";
import { useMirror } from "@/src/game/ui/system/handedness";

interface Props {
  action: AssemblyAction;
  // The held part's driver, pushed from its parked offset toward the seat one press at a time.
  driver?: OffsetDriver;
  // The backed-off offset the part parks at; each press eases it toward [0,0,0].
  park?: ParkInfo | null;
}

// Tap the pad repeatedly to DRIVE a fastener-free push-fit part home, one step along its push axis per tap. At progress 1 the placement commits.
// TOOL-AWARE like the tighten split: a striking tool reads as a strike (DALFRED's pole is malleted onto the seat plate), a screwdriver as driving in, no tool as a bare-hand push.
// Structural cousin of TapControl, which tightens a fastener where this seats a part.
export function PressControl({ action, driver, park }: Props) {
  const m = useMirror();
  const progress = useGameStore((s) => s.driveProgress[action.actionId] ?? 0);
  const struck = action.tool === "mallet" || action.tool === "hammer";
  const driven = action.tool === "screwdriver";
  const parked = useRef<Vec3 | null>(null);

  useEffect(() => {
    parked.current = driver ? ([...driver.value] as unknown as Vec3) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action.actionId]);

  const press = () => {
    const store = useGameStore.getState();
    const before = store.driveProgress[action.actionId] ?? 0;
    store.advanceDrive(action.actionId, 1 / PRESS_TAPS);
    const after = Math.min(1, before + 1 / PRESS_TAPS);
    const p0 = parked.current;
    if (driver && park && p0) {
      driver.set([
        park.offset[0] * (1 - after),
        park.offset[1] * (1 - after),
        park.offset[2] * (1 - after),
      ]);
    }
  };

  const presses = Math.min(PRESS_TAPS, Math.round(progress * PRESS_TAPS));

  return (
    <View style={m(styles.wrap)} pointerEvents="box-none">
      <PressPad
        icon={struck ? "🔨" : driven ? "🪛" : HAND_ICON}
        resetKey={action.actionId}
        onPress={press}
      />
      <Text style={styles.hint}>
        {struck ? "Tap to drive it in" : driven ? "Tap to screw it in" : "Press to fit it in"} · {presses}/
        {PRESS_TAPS}
      </Text>
    </View>
  );
}