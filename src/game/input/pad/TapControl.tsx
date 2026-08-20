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
  /** Drives the part's loose offset toward flush as it's tapped in. */
  sinkDriver: OffsetDriver;
}

/** Strike control: tap the target repeatedly; each hit drives the part one step toward flush (heavy haptic per hit). Counterpart of TightenControl's circular gesture for struck fasteners — reached via tool "mallet" OR motion "strike", so a bare-hand tap-in (BEKVÄM's wood dowel) lands here too and shows a hand instead of the mallet. Motion "press" is the ONE-shot variant: a single press seats it (EKET's rear cam locks + pins, already resting flush via insertProud 0). */
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
      // signed axis, not baked engageDir — in the reverse path (later endpoint placed first) the fastener sinks in from the opposite side
      const ld = looseDelta(part, engageAxis(part, new Set(store.completed)));
      sinkDriver.set([ld[0] * (1 - p), ld[1] * (1 - p), ld[2] * (1 - p)]);
    }
  };

  const hits = Math.min(taps, Math.round(deg / degPerTap));

  return (
    <View style={m(styles.wrap)} pointerEvents="box-none">
      <PressPad icon={struck ? "🔨" : HAND_ICON} resetKey={action.actionId} onPress={press} />
      {/* hintInk: this control's caption is dark where its siblings' are cream. Kept as it was — see PressPad */}
      <Text style={[styles.hint, styles.hintInk]}>
        {single ? "Press it home" : `Tap to drive it in · ${hits}/${taps}`}
      </Text>
    </View>
  );
}