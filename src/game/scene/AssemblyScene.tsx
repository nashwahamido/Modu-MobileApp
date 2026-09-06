import { useEffect, useMemo, useRef } from "react";
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
import { usePrefsStore } from "@/src/game/core/prefsStore";
import type { PartBox, PartId } from "@/src/game/core/type";
import { useThemeId } from "@/src/game/ui/system/theme";
import { CombineCarry, type CarryOffset } from "./CombineCarry";
import { OrbitDrive, type PanOffset, type StickDeflection } from "./OrbitDrive";
import { stageOffsetMap } from "@/src/game/core/model/staging";
import { FOCAL_LENGTH_MM } from "./cameraConfig";
import { CEL_IBL_INTENSITY, getLightRig, IBL_INTENSITY } from "./lighting";
import type { ClusterDriver, DriverRegistry, OffsetDriver } from "./offsetDriver";
import { bakedWorldMatrix, registerLiveBoxReader, worldBoxFromObjectBox } from "./partBoxes";
import { registerPickProber } from "./pickProbe";
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
  pushDrivers: DriverRegistry;
  slideDriver: ClusterDriver;
  carryShared: ISharedValue<CarryOffset>;
  stickShared: ISharedValue<StickDeflection>;
  stickActive: ISharedValue<boolean>;
  panShared: ISharedValue<PanOffset>;
  onModelReady?: () => void;
}

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
  const renderStyle = usePrefsStore((s) => s.renderStyle);
  const model = useModel(
    furniture?.styleModels?.[renderStyle] ?? furniture?.model ?? 0,
    { instanceCount: 2, addToScene: false },
  );
  const { renderableManager, transformManager, view } = useFilamentContext();
  const manualTools = useGameStore((s) => s.settings.manualTools);
  const lightingPreset = useGameStore((s) => s.settings.lightingPreset);
  const dark = useThemeId() === "dark";
  const rig = getLightRig(renderStyle, dark, lightingPreset);

  const celLook = useShaderStyle() !== "off";
  const selectedTool = useGameStore((s) => s.selectedTool);
  const driveActionId = useGameStore((s) => s.driveActionId);

  const { modes, heldAction, activeTighten, activeInsertPress, heldBlocked } = sceneState;
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

  useEffect(() => {
    if (model.state !== "loaded" || !furniture) return;
    const boxes: Record<PartId, PartBox> = {};
    let mismatches = 0;
    let worst = { partId: "", mm: 0 };
    for (const p of Object.values(furniture.parts)) {
      const entity = model.asset.getFirstEntityByName(p.meshName);
      if (!entity) continue;
      const b = renderableManager.getAxisAlignedBoundingBox(entity);
      const { min, max } = worldBoxFromObjectBox(
        b.center,
        b.halfExtent,
        bakedWorldMatrix(p.pose.position, p.pose.rotation),
      );
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
    if (mismatches > 0) {
      if (__DEV__) console.warn(`[jointFrames] ${mismatches}/${Object.keys(boxes).length} part boxes are >2mm from pose+visualCenterOffset (worst: ${worst.partId} at ${worst.mm.toFixed(1)}mm). Publishing NO boxes — the drag falls back to the visual-centre clamp.`);
      useGameStore.getState().setPartBoxes({});
      return;
    }
    useGameStore.getState().setPartBoxes(boxes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.state, furniture, renderableManager]);

  const modesRef = useRef(modes);
  modesRef.current = modes;
  useEffect(() => {
    if (model.state !== "loaded" || !furniture) return;
    const asset = model.asset;
    registerLiveBoxReader((ids) => {
      const out: Record<PartId, PartBox> = {};
      try {
        for (const id of ids) {
          const p = furniture.parts[id];
          if (!p) continue;
          const mode = modesRef.current[id];
          if (!mode || mode === "hidden") continue;
          const entity = asset.getFirstEntityByName(p.meshName);
          if (!entity) continue;
          const b = renderableManager.getAxisAlignedBoundingBox(entity);
          out[id] = worldBoxFromObjectBox(
            b.center,
            b.halfExtent,
            transformManager.getWorldTransform(entity).data,
          );
        }
      } catch {
        registerLiveBoxReader(null);
        return null;
      }
      return out;
    });
    return () => registerLiveBoxReader(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.state, furniture, renderableManager, transformManager]);

  useEffect(() => {
    if (model.state !== "loaded" || !furniture) return;
    const pick = (view as unknown as { pickEntityWithDepth?: (x: number, y: number) => Promise<{ entityId: number; depth: number } | null> }).pickEntityWithDepth;
    if (typeof pick !== "function") {
      if (__DEV__) console.warn("[pickProbe] view.pickEntityWithDepth missing — native patch not built; visibility gate runs box-only.");
      return;
    }
    const asset = model.asset;
    const byEntityId = new Map<number, { partId: PartId; ghost: boolean }>();
    const baseEntities = asset.getInstance().getEntities();
    const ghostEntities = asset.getAssetInstances()[1]?.getEntities() ?? [];
    for (const p of Object.values(furniture.parts)) {
      const named = asset.getFirstEntityByName(p.meshName);
      if (!named) continue;
      byEntityId.set(named.id, { partId: p.partId, ghost: false });
      const idx = baseEntities.findIndex((e) => e.id === named.id);
      const ghost = idx >= 0 ? ghostEntities[idx] : undefined;
      if (ghost) byEntityId.set(ghost.id, { partId: p.partId, ghost: true });
    }
    registerPickProber(async (xDp, yDp) => {
      const hit = await pick.call(view, xDp, yDp);
      if (!hit) return null;
      const owner = byEntityId.get(hit.entityId);
      return { partId: owner?.partId ?? null, ghost: owner?.ghost ?? false, depth: hit.depth };
    });
    return () => registerPickProber(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.state, furniture, view]);
  if (!furniture) return null;
  const driveAction = driveActionId
    ? furniture.actions.find((a) => a.actionId === driveActionId) ?? null
    : null;
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
            heldActionType={heldAction?.type}
            heldBlocked={heldBlocked}
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