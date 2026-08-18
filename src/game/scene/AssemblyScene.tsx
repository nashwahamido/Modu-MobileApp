import { useEffect, useMemo } from "react";
import { StyleSheet } from "react-native";
import {
  Camera,
  EnvironmentalLight,
  FilamentView,
  Light,
  useCameraManipulator,
  useFilamentContext,
  useModel,
} from "react-native-filament";
import type { ISharedValue } from "react-native-worklets-core";
import { useGameStore } from "@/src/game/core/store";
import type { PartBox, PartId } from "@/src/game/core/type";
import { CombineCarry, type CarryOffset } from "./CombineCarry";
import { OrbitDrive, type PanOffset, type StickDeflection } from "./OrbitDrive";
import { stageOffsetMap } from "@/src/game/core/model/staging";
import { FOCAL_LENGTH_MM } from "./cameraConfig";
import { CEL_IBL_INTENSITY, getLightRig, IBL_INTENSITY } from "./lighting";
import type { ClusterDriver, DriverRegistry, OffsetDriver } from "./offsetDriver";
import { PartModel } from "./PartModel";
import { buildPushDriverMap } from "./pushOpen";
import { ShadowPlane } from "./ShadowPlane";
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
  const { renderableManager, transformManager } = useFilamentContext();
  const manualTools = useGameStore((s) => s.settings.manualTools);
  const lightingPreset = useGameStore((s) => s.settings.lightingPreset);
  const dark = useGameStore((s) => s.theme) === "dark";
  // The blob shadow only reads correctly on the plain ("clear") backdrop — on the illustrated backdrops it sits on artwork it doesn't belong to.
  const backdrop = useGameStore((s) => s.backdrop);
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

  // Deliberately NOT keyed on onModelReady: the parent passes a fresh inline closure every render, so including it would re-run this whole per-part native-bridge loop on any unrelated parent re-render — the harvest must happen once per model load. model.asset is read from the closure inside, since useModel returns a fresh object identity every render and depending on it would have the same effect.
  useEffect(() => {
    if (model.state !== "loaded" || !furniture) return;
    // Harvest each part's world bounds ONCE — the joint derivation's only input from the renderer. Filament hands back the renderable's OBJECT-space box, so each is pushed through the node's world transform below; the tolerance check that follows is what proves the result really is in the space the derivation assumes, because a box left in the wrong space would shift every anchor by the node's translation and the drag would just feel subtly wrong instead of failing.
    const boxes: Record<PartId, PartBox> = {};
    let mismatches = 0;
    let worst = { partId: "", mm: 0 };
    for (const p of Object.values(furniture.parts)) {
      const entity = model.asset.getFirstEntityByName(p.meshName);
      if (!entity) continue;
      const b = renderableManager.getAxisAlignedBoundingBox(entity);
      // Filament hands back the renderable's box in OBJECT space; every mesh node in these GLBs carries a translation and most carry a rotation, so the box must be pushed through the node's world transform before it means anything to the derivation. All EIGHT corners are swept and re-bounded — transforming only the centre would keep a rotated part's extent wrong, and the extent is what decides whether two parts overlap at all.
      const m = transformManager.getWorldTransform(entity).data;
      const min: [number, number, number] = [Infinity, Infinity, Infinity];
      const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
      for (let c = 0; c < 8; c++) {
        const lx = b.center[0] + (c & 1 ? b.halfExtent[0] : -b.halfExtent[0]);
        const ly = b.center[1] + (c & 2 ? b.halfExtent[1] : -b.halfExtent[1]);
        const lz = b.center[2] + (c & 4 ? b.halfExtent[2] : -b.halfExtent[2]);
        // `data` is filament's mat4f::asArray() — COLUMN-major, so the basis columns are m[0..2]/m[4..6]/m[8..10] and the translation is m[12..14] (matching the wrapper's own `translation` getter, which reads _matrix[3]).
        const w: [number, number, number] = [
          m[0] * lx + m[4] * ly + m[8] * lz + m[12],
          m[1] * lx + m[5] * ly + m[9] * lz + m[13],
          m[2] * lx + m[6] * ly + m[10] * lz + m[14],
        ];
        for (let k = 0; k < 3; k++) {
          if (w[k] < min[k]) min[k] = w[k];
          if (w[k] > max[k]) max[k] = w[k];
        }
      }
      boxes[p.partId] = { min, max };
      const vco = p.visualCenterOffset ?? [0, 0, 0];
      const dx = (min[0] + max[0]) / 2 - (p.pose.position[0] + vco[0]);
      const dy = (min[1] + max[1]) / 2 - (p.pose.position[1] + vco[1]);
      const dz = (min[2] + max[2]) / 2 - (p.pose.position[2] + vco[2]);
      const mm = Math.hypot(dx, dy, dz) * 1000;
      if (mm > 2) {
        mismatches++;
        if (mm > worst.mm) worst = { partId: p.partId, mm };
      }
    }
    // Publishing UNVALIDATED boxes is strictly worse than publishing none: an empty map makes every consumer fall back to the previous visual-centre clamp, which is merely approximate, whereas a box in the wrong space yields a confidently wrong hold point that the drag trusts completely — so the tolerance check is a GATE, not a diagnostic, and one bad part disables the whole feature for the session.
    if (mismatches > 0) {
      if (__DEV__) console.warn(`[jointFrames] ${mismatches}/${Object.keys(boxes).length} part boxes are >2mm from pose+visualCenterOffset (worst: ${worst.partId} at ${worst.mm.toFixed(1)}mm). Publishing NO boxes — the drag falls back to the visual-centre clamp.`);
      useGameStore.getState().setPartBoxes({});
      return;
    }
    useGameStore.getState().setPartBoxes(boxes);
    // model is a fresh object identity every render (useModel returns a new literal once loaded — see PartModel.tsx's modelEqual/useInstanceEntity for the same caveat), so depending on the whole object would re-run this harvest on every render instead of once per load; model.state is the stable signal that actually changes on load/unload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.state, furniture, renderableManager, transformManager]);
  if (!furniture) return null;
  const driveAction = driveActionId
    ? furniture.actions.find((a) => a.actionId === driveActionId) ?? null
    : null;
  const anySeated = Object.values(modes).some(
    (m) => m === "flush" || m === "loose",
  );
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
      {furniture.shadow && anySeated && backdrop === "clear" ? (
        <ShadowPlane source={furniture.shadow} />
      ) : null}
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