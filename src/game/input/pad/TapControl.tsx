import { Text, View } from "react-native";
import { looseDelta } from "@/src/game/core/geometry/staging";
import { engageAxis } from "@/src/game/core/evaluation/engagement";
import { AssemblyAction } from "@/src/game/core/type";
import { MALLET_TAPS, TIGHTEN_TOTAL_DEG, useGameStore } from "@/src/game/core/store";
import { playTapSfx } from "@/src/game/audio/useAssemblySfx";
import { PressPad, pressPadStyles as styles, HAND_ICON } from "@/src/game/input/pad/PressPad";
import type { OffsetDriver } from "../../scene/offsetDriver";
import { useMirror } from "@/src/game/ui/system/handedness";

interface Props {
  action: AssemblyAction;
  // Drives the part's loose offset toward flush as it is tapped in.
  sinkDriver: OffsetDriver;
}

// Tap repeatedly; each hit drives the part one step toward flush. The counterpart of TightenControl's circular gesture for struck fasteners.
// Reached via tool "mallet" OR motion "strike", so a bare-hand tap-in lands here too and shows a hand. Motion "press" is the ONE-shot variant, where a single press seats a fastener already resting flush.
export function TapControl({ action, sinkDriver }: Props) {
  const m = useMirror();
  const struck = action.tool === "mallet" || action.tool === "hammer";
  const single = action.motion === "press";
  const taps = single ? 1 : MALLET_TAPS;
  const degPerTap = TIGHTEN_TOTAL_DEG / taps;
  const deg = useGameStore((s) => s.tightenDeg[action.actionId] ?? 0);

  const press = () => {
    const store = useGameStore.getState();
    playTapSfx();
    store.addTightenDeg(action.actionId, degPerTap);
    const total = store.tightenDeg[action.actionId] ?? 0;
    const p = Math.min(1, total / TIGHTEN_TOTAL_DEG);
    const part = action.partId ? store.furniture?.parts[action.partId] : undefined;
    if (part) {
      // signed axis, not baked engageDir: in the reverse path the fastener sinks in from the opposite side
      const ld = looseDelta(part, engageAxis(part, new Set(store.completed)));
      sinkDriver.set([ld[0] * (1 - p), ld[1] * (1 - p), ld[2] * (1 - p)]);
    }
  };

  const hits = Math.min(taps, Math.round(deg / degPerTap));

  return (
    <View style={m(styles.wrap)} pointerEvents="box-none">
      <PressPad icon={struck ? "🔨" : HAND_ICON} resetKey={action.actionId} onPress={press} />
      {/* hintInk is a no-op now — see PressPad */}
      <Text style={[styles.hint, styles.hintInk]}>
        {single ? "Press it home" : `Tap to drive it in · ${hits}/${taps}`}
      </Text>
    </View>
  );
}