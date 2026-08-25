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
  const { renderableManager, transformManager, view } = useFilamentContext();
  const manualTools = useGameStore((s) => s.settings.manualTools);
  const lightingPreset = useGameStore((s) => s.settings.lightingPreset);
  // The SCOPED theme, not the app's: this scene renders under the assembly's ThemeScope, so
  // "Assemble in Dark Mode" reaches the light rig the same way it reaches the chrome. Read from
  // s.theme it would never darken at all, now that dark is a build setting rather than an app one —
  // the HUD would go dark around a scene that stayed lit.
  const dark = useThemeId() === "dark";
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
    // Harvest each part's world bounds ONCE — the joint derivation's only input from the renderer. Filament hands back the renderable's OBJECT-space box, and each is pushed through the part's BAKED pose (partBoxes.bakedWorldMatrix), NOT the transform manager's current matrix: child effects run before parent effects, so on a resumed build PartModel has already written drive parks and staging offsets by the time this reads, and reading those live poses tripped the 2mm gate below — one loose fastener disabled every box for the session (`boxes=0 reach=0.000`, seats falling back to mid-shaft visual centres). The harvest is a snapshot of the ASSEMBLED furniture by contract, so the assembled pose is the right transform even when the renderer is drawing something else; the tolerance check that follows keeps its real job, proving the OBJECT-space box and parts.gen still agree after a re-export.
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
    // Publishing UNVALIDATED boxes is strictly worse than publishing none: an empty map makes every consumer fall back to the previous visual-centre clamp, which is merely approximate, whereas a box in the wrong space yields a confidently wrong hold point that the drag trusts completely — so the tolerance check is a GATE, not a diagnostic, and one bad part disables the whole feature for the session.
    if (mismatches > 0) {
      if (__DEV__) console.warn(`[jointFrames] ${mismatches}/${Object.keys(boxes).length} part boxes are >2mm from pose+visualCenterOffset (worst: ${worst.partId} at ${worst.mm.toFixed(1)}mm). Publishing NO boxes — the drag falls back to the visual-centre clamp.`);
      useGameStore.getState().setPartBoxes({});
      return;
    }
    useGameStore.getState().setPartBoxes(boxes);
    // model is a fresh object identity every render (useModel returns a new literal once loaded — see PartModel.tsx's modelEqual/useInstanceEntity for the same caveat), so depending on the whole object would re-run this harvest on every render instead of once per load; model.state is the stable signal that actually changes on load/unload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.state, furniture, renderableManager]);

  // Modes decide what is on SCREEN and they change with every store tick, so the reader below reads them through a ref — re-registering the closure on each mode change would churn a native-bridge callback for a value only read at pickup.
  const modesRef = useRef(modes);
  modesRef.current = modes;
  // The harvest above is a snapshot of the ASSEMBLED furniture — right for joint frames, which are baked-pose geometry by definition, and wrong for anything asking what stands between the camera and a socket. This publishes the second answer: the same sweep, re-run on demand against whatever transform the render thread last wrote. PartModel drives instance 0 through this very entity (useInstanceEntity returns the asset's own entity for index 0), so a staged carrier or a cluster parked off-screen for the combine reads at the offset it is actually drawn at. A "hidden" part is skipped outright rather than boxed: its entity is out of the scene while its transform still says baked, which is the phantom this whole reader exists to kill. On demand rather than per frame because the answers are world-space part poses, which camera motion never changes (the drag reads the eye fresh every frame and tests sightlines against these boxes) — the poses themselves shift only on the rare mid-drag events the caller's own refresh throttle covers (usePartDrag re-reads every OCCLUDER_REFRESH_MS: a second finger toggling cluster focus, a prior part's commit animation still easing home).
  useEffect(() => {
    if (model.state !== "loaded" || !furniture) return;
    const asset = model.asset;
    registerLiveBoxReader((ids) => {
      const out: Record<PartId, PartBox> = {};
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
      return out;
    });
    return () => registerLiveBoxReader(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.state, furniture, renderableManager, transformManager]);

  // Renderer-truth pick for the visibility gate's second opinion (input/drag/pickConfirm). The entity→part map is built once per load: instance 0 is the world copy, instance 1 the ghost copy (same index order — see PartModel.useInstanceEntity), and the confirmer needs to tell them apart because a ghost is never an occluder. pickEntityWithDepth only exists on the PATCHED native module (patches/react-native-filament+1.11.0.patch); on an unpatched build the guard leaves the prober unregistered and every box verdict simply stands — the gate degrades to exactly its pre-confirmer behaviour.
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
            heldActionType={heldAction?.type}
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