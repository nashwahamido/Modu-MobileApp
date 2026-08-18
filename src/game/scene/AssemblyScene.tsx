import { useEffect, useMemo } from "react";
import { StyleSheet } from "react-native";
import {
  Camera,
  EnvironmentalLight,
  FilamentView,
  Light,
  useCameraManipulator,
  useModel,
} from "react-native-filament";
import type { ISharedValue } from "react-native-worklets-core";
import { useGameStore } from "@/src/game/core/store";
import type { PartId } from "@/src/game/core/type";
import { CombineCarry, type CarryOffset } from "./CombineCarry";
import { OrbitDrive, type PanOffset, type StickDeflection } from "./OrbitDrive";
import { stageOffsetMap } from "@/src/game/core/model/staging";
import { FOCAL_LENGTH_MM } from "./cameraConfig";
import { CEL_IBL_INTENSITY, getLightRig, IBL_INTENSITY } from "./lighting";
import type { ClusterDriver, DriverRegistry, OffsetDriver } from "./offsetDriver";
import { PartModel } from "./PartModel";
import { buildPushDriverMap } from "./pushOpen";
import { ToolModel } from "./ToolModel";
import { SceneState } from "./useSceneState";
import { ShaderAssetsProvider, useShaderStyle } from "./shaders";


export type OrbitManipulator = ReturnType<typeof useCameraManipulator>;

interface Props {
  cameraManipulator: OrbitManipulator;
  sceneState: SceneState;
  heldDriver: OffsetDriver;
  sinkDriver: OffsetDriver;
  clusterDriver: ClusterDriver;
  /** Telescoping-group drivers for the push-open beat (shared with BeatControl). */
  pushDrivers: DriverRegistry;
  /** Drives a component's non-lead bodies while the lead is held/dragged ("riding" mode). */
  slideDriver: ClusterDriver;
  /** Combine carry offset, applied on the render thread (CombineCarry). */
  carryShared: ISharedValue<CarryOffset>;
  /** Joystick deflection, integrated into the camera on the render thread (OrbitDrive). */
  stickShared: ISharedValue<StickDeflection>;
  /** Whether a stick grab session is open — gates OrbitDrive. */
  stickActive: ISharedValue<boolean>;
  /** Two-finger pan, applied to the finished lookAt pair on the render thread. */
  panShared: ISharedValue<PanOffset>;
  /** Fired when the shared GLB reports parsed ("loaded") — the play screen's loading overlay keys its last milestone off this. Re-fires on remounts (style switch, retry); the listener must be idempotent. */
  onModelReady?: () => void;
}

/** The 3D workbench: camera, lights, and every part rendered by its game-state mode. */
export function AssemblyScene({
  cameraManipulator,
  sceneState,
  heldDriver,
  sinkDriver,
  clusterDriver,
  pushDrivers,
  slideDriver,
  carryShared,
  stickShared,
  stickActive,
  panShared,
  onModelReady,
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

  /**
   * A cel look must be lit by ONE light.
   *
   * The custom surface shader runs once per light and the results are SUMMED, so
   * banding the key, the fill and the rim gives three staggered ramps from three
   * directions that add back up to a smooth gradient — the banding cancels itself
   * out, and the combined 169 000 lux blows the exposure badly enough to wash the
   * ink contours away with it. Drop the fill and the rim; the IBL (lowered to
   * CEL_IBL_INTENSITY) is the only fill a cel look wants.
   */
  const celLook = useShaderStyle() !== "off";
  const selectedTool = useGameStore((s) => s.selectedTool);
  const driveActionId = useGameStore((s) => s.driveActionId);


  const { modes, heldAction, activeTighten, activeInsertPress } = sceneState;
  const pushMap = useMemo(
    () =>
      furniture?.pushOpen
        ? buildPushDriverMap(furniture.pushOpen, pushDrivers)
        : {},
    [furniture, pushDrivers],
  );
  const stageOffsets = useMemo(
    () => (furniture ? stageOffsetMap(furniture.parts) : {}),
    [furniture],
  );
  useEffect(() => {
    if (model.state === "loaded") onModelReady?.();
  }, [model.state, onModelReady]);
  if (!furniture) return null;
  const driveAction = driveActionId
    ? furniture.actions.find((a) => a.actionId === driveActionId) ?? null
    : null;
  // "hand" is always equipped: hand steps run without a toolbar pick even in manual mode.
  const toolEquipped = (tool?: string | null) =>
    !manualTools || !tool || tool === "hand" || selectedTool === tool;

  return (
    <FilamentView style={styles.filament}>
      <Camera
        cameraManipulator={cameraManipulator}
        focalLengthInMillimeters={FOCAL_LENGTH_MM}
      />
      <EnvironmentalLight
        source={{ uri: "RNF_default_env_ibl.ktx" }}
        intensity={celLook ? CEL_IBL_INTENSITY : IBL_INTENSITY}
      />
      <Light
        type="directional"
        colorKelvin={rig.key.colorKelvin}
        intensity={rig.key.intensity}
        direction={rig.key.direction}
        castShadows
      />
      {celLook ? null : (
        <>
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
        </>
      )}
      {/* The blob shadow is retired: with the "clear" backdrop now a flat warm beige rather than the
          theme surface, the baked shadow read as a grey stain under the model instead of grounding
          it. No backdrop shows it any more — the model sits on the colour, unanchored on purpose. */}
      <CombineCarry model={model} carryShared={carryShared} />
      <OrbitDrive
        manipulator={cameraManipulator}
        stickShared={stickShared}
        active={stickActive}
        panShared={panShared}
      />
      <ShaderAssetsProvider>
        {(Object.keys(furniture.parts) as PartId[]).map((id) => (
          <PartModel
            key={id}
            def={furniture.parts[id]}
            mode={modes[id] ?? "hidden"}
            model={model}
            heldDriver={heldDriver}
            sinkDriver={sinkDriver}
            clusterDriver={clusterDriver}
            pushDriver={pushMap[id]}
            slideDriver={slideDriver}
            stageOffset={stageOffsets[id]}
            tightening={activeTighten?.partId === id}
            inserting={activeInsertPress?.partId === id}
            ghostAtLoosePose={heldAction?.type === "insertFastener"}
          />
        ))}
      </ShaderAssetsProvider>
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