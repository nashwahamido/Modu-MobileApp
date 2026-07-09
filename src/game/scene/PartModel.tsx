import { useEffect, useMemo } from "react";
import { useFilamentContext } from "react-native-filament";
import type { Entity, FilamentModel, Float3, TransformManager } from "react-native-filament";
import { FitState } from "@/src/game/core/geometry/fit";
import { looseDelta } from "@/src/game/core/geometry/staging";
import {
  engageAxis,
  SCREW_SPIN_DEG,
  screwMoverParkOffset,
  screwParkOffset,
  screwSpinInfo,
} from "@/src/game/core/evaluation/engagement";
import { quatFromAxisAngle, quatMultiply } from "@/src/game/core/geometry/math";
import { MaterialParams, PartDef, Quat, Vec3 } from "@/src/game/core/type";
import {
  ORIENTATION_TOTAL_DEG,
  selectFirstDrop,
  useGameStore,
} from "@/src/game/core/store";
import { styleFor } from "@/src/game/core/presentation/labels";
import { buildPartActions } from "@/src/game/core/scene/targets";
import type { ClusterDriver, OffsetDriver } from "./offsetDriver";
import type { PartMode } from "./useSceneState";

/**
 * Ghost colors follow the PDD color language; emissive glow is used because
 * the DALFRED materials are opaque near-black glTF — runtime alpha is ignored
 * and base-color tints are swallowed by the dark albedo.
 */
const FIT_GLOW: Record<FitState, [number, number, number]> = {
  idle: [0.08, 0.3, 0.85],
  held: [0.08, 0.3, 0.85],
  nearCorrect: [0.05, 0.8, 0.3],
  nearRotation: [0.95, 0.45, 0.08],
  wrongTarget: [0.85, 0.12, 0.12],
};

const EPSILON = 1e-6;

/**
 * The material override for a part under the active render style (realistic/
 * cartoon), or undefined → no override (the scene leaves the GLB's own materials
 * = the fallback). Looks up the style's RenderStyle, then the override keyed by
 * meshName, then by group.
 */
function usePartMaterial(def: PartDef): MaterialParams | undefined {
  const renderStyle = useGameStore((s) => s.renderStyle);
  const styles = useGameStore((s) => s.furniture?.styles);
  return useMemo(() => {
    const style = styleFor(styles, renderStyle);
    return style?.material?.[def.meshName] ?? style?.material?.[def.group];
  }, [styles, renderStyle, def.meshName, def.group]);
}

/**
 * Apply a theme's material override to a world entity. No params → return early
 * and leave the GLB's baked materials untouched (the fallback). Crude for now:
 * sets the standard glTF material factors; it doesn't cache/restore originals,
 * so switching FROM a themed style back to none won't auto-revert until reload.
 */
function applyThemeMaterial(
  renderableManager: ReturnType<typeof useFilamentContext>["renderableManager"],
  entity: Entity,
  params: MaterialParams | undefined,
) {
  if (!params) return;
  const count = renderableManager.getPrimitiveCount(entity);
  for (let i = 0; i < count; i++) {
    const mi = renderableManager.getMaterialInstanceAt(entity, i);
    try {
      if (params.baseColor) {
        mi.setFloat4Parameter("baseColorFactor", [
          params.baseColor[0],
          params.baseColor[1],
          params.baseColor[2],
          1,
        ]);
      }
      if (params.emissive) {
        mi.setFloat3Parameter("emissiveFactor", [
          params.emissive[0],
          params.emissive[1],
          params.emissive[2],
        ]);
      }
      if (params.metallic != null) mi.setFloatParameter("metallicFactor", params.metallic);
      if (params.roughness != null) mi.setFloatParameter("roughnessFactor", params.roughness);
    } catch {
    }
  }
}

function quatToAxisAngle([x, y, z, w]: Quat) {
  const len = Math.hypot(x, y, z, w) || 1;
  const qx = x / len;
  const qy = y / len;
  const qz = z / len;
  const qw = Math.max(-1, Math.min(1, w / len));
  const angleRad = 2 * Math.acos(qw);
  const s = Math.sqrt(Math.max(0, 1 - qw * qw));
  if (angleRad < EPSILON || s < EPSILON) return null;
  return { angleRad, axis: [qx / s, qy / s, qz / s] as Float3 };
}

function placeEntity(
  transformManager: TransformManager,
  entity: Entity,
  position: Vec3,
  rotation: Quat,
) {
  const axisAngle = quatToAxisAngle(rotation);
  const pos: Float3 = [position[0], position[1], position[2]];
  if (!axisAngle) {
    transformManager.setEntityPosition(entity, pos, false);
    return;
  }
  transformManager.setEntityRotation(entity, axisAngle.angleRad, axisAngle.axis, false);
  transformManager.setEntityPosition(entity, pos, true);
}

interface Props {
  def: PartDef;
  mode: PartMode;
  /**
   * The combined furniture model, loaded ONCE with instanceCount=2 by the
   * scene: instance 0 is the "world" copy (flush/loose/held parts), instance
   * 1 is a free-floating "ghost" copy reused for socket hints — there's only
   * one mesh per part inside the shared GLB, so showing both the part's home
   * socket AND a held/dragged copy at the same time needs a second instance.
   */
  model: FilamentModel;
  /** Drives the held part's offset (owned by the drag gesture). */
  heldDriver: OffsetDriver;
  /** Drives the active fastener's sink-to-flush offset (owned by TightenControl). */
  sinkDriver: OffsetDriver;
  /** Drives the whole moving cluster's offset while it's combined in (owned by ClusterTray). */
  clusterDriver: ClusterDriver;
  /** True when this fastener's tighten gesture is active. */
  tightening?: boolean;
  /** Ghost drop target is the loose pose (inserts) instead of the baked pose. */
  ghostAtLoosePose?: boolean;
}

/** Resolves a part's entity inside a specific instance of the shared model by node name. */
function useInstanceEntity(model: FilamentModel, meshName: string, instanceIndex: number) {
  return useMemo(() => {
    if (model.state !== "loaded") return null;
    const base = model.asset.getInstance();
    const named = model.asset.getFirstEntityByName(meshName);
    if (!named) return null;
    if (instanceIndex === 0) return named;
    const baseEntities = base.getEntities();
    const idx = baseEntities.findIndex((e) => e.id === named.id);
    if (idx === -1) return null;
    const instances = model.asset.getAssetInstances();
    const instance = instances[instanceIndex];
    if (!instance) return null;
    return instance.getEntities()[idx] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.state, meshName, instanceIndex]);
}

/**
 * Glowing ghost of a part at its baked (or loose) pose, rendered from the
 * second model instance so it can coexist with the primary copy.
 */
function Ghost({
  model,
  def,
  atLoosePose,
  fixedFitState,
}: {
  model: FilamentModel;
  def: PartDef;
  atLoosePose: boolean;
  fixedFitState?: FitState;
}) {
  const { renderableManager, transformManager, scene } = useFilamentContext();
  const storeFitState = useGameStore((s) => s.fitState);
  const completed = useGameStore((s) => s.completed);
  const fitState = fixedFitState ?? storeFitState;
  const entity = useInstanceEntity(model, def.meshName, 1);

  useEffect(() => {
    if (!entity) return;
    scene.addEntity(entity);
    return () => scene.removeEntity(entity);
  }, [entity, scene]);

  useEffect(() => {
    if (!entity) return;
    const done = new Set(completed);
    let offset: readonly number[] = [0, 0, 0];
    if (atLoosePose) {
      offset = looseDelta(def, engageAxis(def, done));
    } else {
      const f = useGameStore.getState().furniture;
      const snap = f?.actions.find(
        (a) => a.type === "placePart" && a.partId === def.partId,
      );
      if (f && snap) offset = screwParkOffset(f, snap, done) ?? offset;
    }
    placeEntity(
      transformManager,
      entity,
      [def.pose.position[0] + offset[0], def.pose.position[1] + offset[1], def.pose.position[2] + offset[2]],
      def.pose.rotation,
    );
  }, [entity, transformManager, def, atLoosePose, completed]);

  useEffect(() => {
    if (!entity) return;
    const glow = FIT_GLOW[fitState];
    const primitives = renderableManager.getPrimitiveCount(entity);
    for (let i = 0; i < primitives; i++) {
      const mi = renderableManager.getMaterialInstanceAt(entity, i);
      try {
        mi.setFloat3Parameter("emissiveFactor", glow);
      } catch {
      }
    }
  }, [entity, renderableManager, fitState]);

  return null;
}

/**
 * Ghost rendered at one of the open socket positions while the player is
 * holding a same-group part. It only appears for the proximity-selected
 * matched socket, including the socket for the representative part being held.
 */
function SocketHintGhost({
  model,
  def,
  partActions,
  atLoosePose = false,
}: {
  model: FilamentModel;
  def: PartDef;
  partActions: Record<string, { snap?: string; insert?: string; tighten?: string }>;
  atLoosePose?: boolean;
}) {
  const matchedActionId = useGameStore((s) => s.matchedActionId);
  const firstDrop = useGameStore(selectFirstDrop);
  const actionId = partActions[def.partId]?.snap ?? partActions[def.partId]?.insert;
  const isMatched = !!actionId && matchedActionId === actionId;
  if (firstDrop || !isMatched) return null;
  return (
    <Ghost
      model={model}
      def={def}
      atLoosePose={atLoosePose}
    />
  );
}

/** A part whose offset is animated imperatively via an OffsetDriver, using the primary (instance 0) entity. */
function DrivenEntity({
  model,
  def,
  driver,
  initial,
  rotation = def.pose.rotation,
}: {
  model: FilamentModel;
  def: PartDef;
  driver: OffsetDriver;
  initial: Vec3;
  rotation?: Quat;
}) {
  const { transformManager, renderableManager, scene } = useFilamentContext();
  const entity = useInstanceEntity(model, def.meshName, 0);
  const material = usePartMaterial(def);

  useEffect(() => {
    if (!entity) return;
    scene.addEntity(entity);
    return () => scene.removeEntity(entity);
  }, [entity, scene]);

  useEffect(() => {
    if (!entity) return;
    driver.attach(transformManager, entity, [initial[0], initial[1], initial[2]], {
      position: [def.pose.position[0], def.pose.position[1], def.pose.position[2]],
      rotation,
    });
    return () => driver.detach();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  useEffect(() => {
    if (entity) applyThemeMaterial(renderableManager, entity, material);
  }, [entity, renderableManager, material]);

  return null;
}

/** A part whose offset is driven together with its whole cluster (the combine lower). */
function ClusterDrivenEntity({
  model,
  def,
  driver,
}: {
  model: FilamentModel;
  def: PartDef;
  driver: ClusterDriver;
}) {
  const { transformManager, renderableManager, scene } = useFilamentContext();
  const entity = useInstanceEntity(model, def.meshName, 0);
  const material = usePartMaterial(def);

  useEffect(() => {
    if (!entity) return;
    scene.addEntity(entity);
    return () => scene.removeEntity(entity);
  }, [entity, scene]);

  useEffect(() => {
    if (!entity) return;
    return driver.register(transformManager, entity, {
      position: [def.pose.position[0], def.pose.position[1], def.pose.position[2]],
      rotation: def.pose.rotation,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, transformManager, driver]);

  useEffect(() => {
    if (entity) applyThemeMaterial(renderableManager, entity, material);
  }, [entity, renderableManager, material]);

  return null;
}

/** A part shown at a fixed (non-driven) offset from its baked pose, e.g. flush or loose-but-untouched. */
function StaticEntity({
  model,
  def,
  offset,
  rotation,
}: {
  model: FilamentModel;
  def: PartDef;
  offset: Vec3;
  /** Optional rotation override (e.g. the placed spinner of a screw joint). */
  rotation?: Quat;
}) {
  const { transformManager, renderableManager, scene } = useFilamentContext();
  const entity = useInstanceEntity(model, def.meshName, 0);
  const material = usePartMaterial(def);

  useEffect(() => {
    if (!entity) return;
    scene.addEntity(entity);
    return () => scene.removeEntity(entity);
  }, [entity, scene]);

  useEffect(() => {
    if (!entity) return;
    placeEntity(
      transformManager,
      entity,
      [def.pose.position[0] + offset[0], def.pose.position[1] + offset[1], def.pose.position[2] + offset[2]],
      rotation ?? def.pose.rotation,
    );
  }, [entity, transformManager, def, offset, rotation]);

  useEffect(() => {
    if (entity) applyThemeMaterial(renderableManager, entity, material);
  }, [entity, renderableManager, material]);

  return null;
}

/** Hides a part's primary entity by removing it from the scene. */
function HiddenEntity({ model, def }: { model: FilamentModel; def: PartDef }) {
  const { scene } = useFilamentContext();
  const entity = useInstanceEntity(model, def.meshName, 0);
  useEffect(() => {
    if (!entity) return;
    scene.removeEntity(entity);
  }, [entity, scene]);
  return null;
}

export function PartModel({
  def,
  mode,
  model,
  heldDriver,
  sinkDriver,
  clusterDriver,
  tightening,
  ghostAtLoosePose,
}: Props) {
  const partActions = useMemo(() => {
    const store = useGameStore.getState();
    return store.furniture ? buildPartActions(store.furniture.actions) : {};
  }, []);
  const completed = useGameStore((s) => s.completed);
  const signedLooseDelta = () => looseDelta(def, engageAxis(def, new Set(completed)));
  const orientationActionId = useGameStore((s) => s.orientationActionId);
  const orientationDeg = useGameStore((s) =>
    s.orientationActionId ? (s.orientationDeg[s.orientationActionId] ?? 0) : 0,
  );
  const flushScrew = (() => {
    if (!orientationActionId || def.type !== "structural") return undefined;
    const f = useGameStore.getState().furniture;
    const a = f?.actions.find((x) => x.actionId === orientationActionId);
    if (!f || !a) return undefined;
    const done = new Set(completed);
    const spin = screwSpinInfo(f, a, done);
    if (!spin || spin.mover !== def.partId || spin.mover === a.partId) return undefined;
    const p = Math.min(1, orientationDeg / ORIENTATION_TOTAL_DEG);
    const rad = ((SCREW_SPIN_DEG * (1 - p)) * Math.PI) / 180;
    const back = screwMoverParkOffset(f, a, done) ?? [0, 0, 0];
    return {
      rotation: quatMultiply(quatFromAxisAngle(spin.axis, rad), def.pose.rotation),
      offset: [
        back[0] * (1 - p),
        back[1] * (1 - p),
        back[2] * (1 - p),
      ] as Vec3,
    };
  })();

  if (model.state !== "loaded") return null;

  switch (mode) {
    case "hidden":
      return <HiddenEntity key={`${def.partId}-hidden`} model={model} def={def} />;
    case "flush":
      return (
        <StaticEntity
          key={`${def.partId}-flush`}
          model={model}
          def={def}
          offset={flushScrew?.offset ?? [0, 0, 0]}
          rotation={flushScrew?.rotation}
        />
      );
    case "combining":
      return (
        <>
          <ClusterDrivenEntity
            key={`${def.partId}-combining`}
            model={model}
            def={def}
            driver={clusterDriver}
          />
          <Ghost model={model} def={def} atLoosePose={false} />
        </>
      );
    case "loose":
      return tightening ? (
        <DrivenEntity
          key={`${def.partId}-sink`}
          model={model}
          def={def}
          driver={sinkDriver}
          initial={signedLooseDelta()}
        />
      ) : (
        <StaticEntity key={`${def.partId}-loose`} model={model} def={def} offset={signedLooseDelta()} />
      );
    case "held":
      return (
        <>
          <DrivenEntity
            key={`${def.partId}-held`}
            model={model}
            def={def}
            driver={heldDriver}
            initial={heldDriver.value}
            rotation={def.pose.rotation}
          />
          <SocketHintGhost
            model={model}
            def={def}
            partActions={partActions}
            atLoosePose={ghostAtLoosePose ?? false}
          />
        </>
      );
    case "socket_hint": {
      const isInsert = !!partActions[def.partId]?.insert;
      return (
        <>
          <HiddenEntity key={`${def.partId}-hint-hidden`} model={model} def={def} />
          <SocketHintGhost model={model} def={def} partActions={partActions} atLoosePose={isInsert} />
        </>
      );
    }
  }
}
