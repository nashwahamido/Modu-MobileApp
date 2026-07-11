import { StyleSheet } from "react-native";
import {
  Camera,
  EnvironmentalLight,
  FilamentView,
  Light,
  useCameraManipulator,
  useModel,
} from "react-native-filament";
import { useGameStore } from "@/src/game/core/store";
import type { PartId } from "@/src/game/core/type";
import { FOCAL_LENGTH_MM } from "./cameraConfig";
import { getLightRig, IBL_INTENSITY } from "./lighting";
import type { ClusterDriver, OffsetDriver } from "./offsetDriver";
import { PartModel } from "./PartModel";
import { ShadowPlane } from "./ShadowPlane";
import { ToolModel } from "./ToolModel";
import { SceneState } from "./useSceneState";

export type OrbitManipulator = ReturnType<typeof useCameraManipulator>;

interface Props {
  cameraManipulator: OrbitManipulator;
  sceneState: SceneState;
  heldDriver: OffsetDriver;
  sinkDriver: OffsetDriver;
  clusterDriver: ClusterDriver;
}

/** The 3D workbench: camera, lights, and every part rendered by its game-state mode. */
export function AssemblyScene({
  cameraManipulator,
  sceneState,
  heldDriver,
  sinkDriver,
  clusterDriver,
}: Props) {
  const furniture = useGameStore((s) => s.furniture);
  const renderStyle = useGameStore((s) => s.renderStyle);
  const model = useModel(
    furniture?.styleModels?.[renderStyle] ?? furniture?.model ?? 0,
    { instanceCount: 2, addToScene: false },
  );
  const manualTools = useGameStore((s) => s.settings.manualTools);
  const lightingPreset = useGameStore((s) => s.settings.lightingPreset);
  const dark = useGameStore((s) => s.theme) === "dark";
  const rig = getLightRig(renderStyle, dark, lightingPreset);
  const selectedTool = useGameStore((s) => s.selectedTool);
  const driveActionId = useGameStore((s) => s.driveActionId);

  const { modes, heldAction, activeTighten } = sceneState;
  if (!furniture) return null;
  const driveAction = driveActionId
    ? furniture.actions.find((a) => a.actionId === driveActionId) ?? null
    : null;
  const anySeated = Object.values(modes).some(
    (m) => m === "flush" || m === "loose",
  );
  const toolEquipped = (tool?: string | null) =>
    !manualTools || !tool || selectedTool === tool;

  return (
    <FilamentView style={styles.filament}>
      <Camera
        cameraManipulator={cameraManipulator}
        focalLengthInMillimeters={FOCAL_LENGTH_MM}
      />
      <EnvironmentalLight
        source={{ uri: "RNF_default_env_ibl.ktx" }}
        intensity={IBL_INTENSITY}
      />
      <Light
        type="directional"
        colorKelvin={rig.key.colorKelvin}
        intensity={rig.key.intensity}
        direction={rig.key.direction}
        castShadows
      />
      <Light
        type="directional"
        colorKelvin={rig.fill.colorKelvin}
        intensity={rig.fill.intensity}
        direction={rig.fill.direction}
      />
      <Light
        type="directional"
        colorKelvin={rig.rim.colorKelvin}
        intensity={rig.rim.intensity}
        direction={rig.rim.direction}
      />
      {furniture.shadow && anySeated ? (
        <ShadowPlane source={furniture.shadow} />
      ) : null}
      {(Object.keys(furniture.parts) as PartId[]).map((id) => (
        <PartModel
          key={id}
          def={furniture.parts[id]}
          mode={modes[id] ?? "hidden"}
          model={model}
          heldDriver={heldDriver}
          sinkDriver={sinkDriver}
          clusterDriver={clusterDriver}
          tightening={activeTighten?.partId === id}
          ghostAtLoosePose={heldAction?.type === "insertFastener"}
        />
      ))}
      {activeTighten?.tool &&
      activeTighten.partId &&
      toolEquipped(activeTighten.tool) &&
      furniture.tools?.[activeTighten.tool]?.asset ? (
        <ToolModel key={activeTighten.actionId} action={activeTighten} />
      ) : null}
      {driveAction?.tool &&
      driveAction.partId &&
      toolEquipped(driveAction.tool) &&
      furniture.tools?.[driveAction.tool]?.asset ? (
        <ToolModel key={driveAction.actionId} action={driveAction} />
      ) : null}
    </FilamentView>
  );
}

const styles = StyleSheet.create({ filament: { flex: 1 } });
