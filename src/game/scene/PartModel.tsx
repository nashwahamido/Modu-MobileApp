import { memo, useEffect, useMemo, useState } from "react";
import { useFilamentContext } from "react-native-filament";
import type {
  Entity,
  FilamentModel,
  Float3,
  TransformManager,
} from "react-native-filament";
import { FitState } from "@/src/game/core/geometry/fit";
import { looseDelta, stageDelta } from "@/src/game/core/geometry/staging";
import { stageShiftFor } from "@/src/game/core/model/staging";
import {
  adaptedTravelDir,
  engageAxis,
  pressParkInfo,
  SCREW_SPIN_DEG,
  screwMoverParkOffset,
  screwParkOffset,
  screwSpinInfo,
  slideParkInfo,
} from "@/src/game/core/evaluation/engagement";
import { quatFromAxisAngle, quatMultiply } from "@/src/game/core/geometry/math";
import { ActionId, ActionType, Furniture, PartDef, PartId, Quat, Vec3 } from "@/src/game/core/type";
import {
  ORIENTATION_TOTAL_DEG,
  selectFirstDrop,
  useGameStore,
} from "@/src/game/core/store";
import { buildPartActions, hintSlotFor, type PartActionIds } from "@/src/game/core/scene/targets";
import type { ClusterDriver, OffsetDriver } from "./offsetDriver";
import { useShaderOverride, useShaderStyle } from "./shaders";
import type { PartMode } from "./useSceneState";

const FIT_GLOW: Record<FitState, [number, number, number]> = {
  idle: [1.0, 0.42, 0.0],
  held: [1.0, 0.42, 0.0],
  approaching: [0.15, 0.5, 0.95],
  nearCorrect: [0.05, 0.8, 0.3],
  nearRotation: [0.95, 0.45, 0.08],
  wrongTarget: [0.85, 0.12, 0.12],
};
const GLOW_MARK: [number, number, number] = [0.85, 0.33, 0.0];

const DEMO_TURNS = 1.5;
const DEMO_BACKOFF_M = 0.14;

function visualCentre(p: PartDef): Vec3 {
  const o = p.visualCenterOffset ?? [0, 0, 0];
  return [
    p.pose.position[0] + o[0],
    p.pose.position[1] + o[1],
    p.pose.position[2] + o[2],
  ];
}

function demoApproach(
  def: PartDef,
  furniture: Furniture | null,
  done: Set<ActionId>,
  placedIds: ReadonlySet<string>,
): Vec3 {
  const parts = furniture?.parts ?? {};
  const baked = looseDelta(def, engageAxis(def, done));
  if (baked[0] || baked[1] || baked[2]) return baked;
  if (def.placeDir) {
    const d = (furniture ? adaptedTravelDir(furniture, def, done) : null) ?? def.placeDir;
    const back = def.parkBackoff ?? DEMO_BACKOFF_M;
    return [-d[0] * back, -d[1] * back, -d[2] * back];
  }
  const centre = visualCentre(def);
  const structural = [
    ...(def.pressJoins ?? []),
    ...(def.slideJoins ?? []),
    ...(def.attached ?? []),
  ];
  const joinIds = structural.length ? structural : [...(def.screwJoins ?? [])];
  const pool = joinIds.length
    ? joinIds.map((id) => parts[id]).filter(Boolean)
    : Object.values(parts).filter((p) => p.type !== "fastener" && placedIds.has(p.partId));
  let best: Vec3 | null = null;
  let bestDist = Infinity;
  for (const other of pool) {
    if (other.partId === def.partId) continue;
    const c = visualCentre(other);
    const dx = centre[0] - c[0];
    const dy = centre[1] - c[1];
    const dz = centre[2] - c[2];
    const dist = Math.hypot(dx, dy, dz);
    if (dist > 1e-4 && dist < bestDist) {
      bestDist = dist;
      best = [dx, dy, dz];
    }
  }
  if (best) {
    const k = DEMO_BACKOFF_M / bestDist;
    return [best[0] * k, best[1] * k, best[2] * k];
  }
  return [0, DEMO_BACKOFF_M, 0];
}

const EPSILON = 1e-6;

// the zero emissive every part restores to after a hint glow
const NO_EMISSIVE: [number, number, number] = [0, 0, 0];

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
  transformManager.setEntityRotation(
    entity,
    axisAngle.angleRad,
    axisAngle.axis,
    false,
  );
  transformManager.setEntityPosition(entity, pos, true);
}

interface Props {
  def: PartDef;
  mode: PartMode;
  model: FilamentModel;
  heldDriver: OffsetDriver;
  sinkDriver: OffsetDriver;
  clusterDriver: ClusterDriver;
  pushDriver?: ClusterDriver;
  slideDriver?: ClusterDriver;
  stageOffset?: Vec3;
  tightening?: boolean;
  inserting?: boolean;
  heldActionType?: ActionType;
  heldBlocked?: boolean;
}

function useInstanceEntity(
  model: FilamentModel,
  meshName: string,
  instanceIndex: number,
) {
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

function useMarkerGlow(
  entity: ReturnType<typeof useInstanceEntity>,
  renderableManager: ReturnType<typeof useFilamentContext>["renderableManager"],
  color: [number, number, number] | null,
  pulse: boolean,
  restore: [number, number, number],
): void {
  useEffect(() => {
    if (!entity) return;
    const primitives = renderableManager.getPrimitiveCount(entity);
    const setEmissive = (rgb: [number, number, number]) => {
      for (let i = 0; i < primitives; i++) {
        const mi = renderableManager.getMaterialInstanceAt(entity, i);
        try {
          mi.setFloat3Parameter("emissiveFactor", rgb);
        } catch {}
      }
    };
    if (!color) {
      setEmissive(restore);
      return;
    }
    if (!pulse) {
      setEmissive(color);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const t0 = Date.now();
    const tick = () => {
      const k = 0.5 + 0.5 * Math.sin(((Date.now() - t0) / 1000) * 2.6);
      const s = 0.25 + 0.75 * k;
      setEmissive([color[0] * s, color[1] * s, color[2] * s]);
      timer = setTimeout(tick, 70);
    };
    tick();
    return () => clearTimeout(timer);
  }, [entity, renderableManager, color, pulse, restore]);
}

export type GhostPose = "target" | "loose" | "drop" | "stageOut";

export const ghostPoseFor = (heldType?: ActionType): GhostPose =>
  heldType === "insertFastener"
    ? "loose"
    : heldType === "placeFastener"
      ? "drop"
      : heldType === "stagePart"
        ? "stageOut"
        : "target";

function Ghost({
  model,
  def,
  at,
  fixedFitState,
  glowOverride,
  pulse = false,
  dim = false,
  travel = false,
}: {
  model: FilamentModel;
  def: PartDef;
  at: GhostPose;
  fixedFitState?: FitState;
  glowOverride?: [number, number, number];
  pulse?: boolean;
  dim?: boolean;
  travel?: boolean;
}) {
  const { renderableManager, transformManager, scene } = useFilamentContext();
  const storeFitState = useGameStore((s) => s.fitState);
  const completed = useGameStore((s) => s.completed);
  const orientationActionId = useGameStore((s) => s.orientationActionId);
  const driveActionId = useGameStore((s) => s.driveActionId);
  const fitState = fixedFitState ?? storeFitState;
  const entity = useInstanceEntity(model, def.meshName, 1);
  const [travelT, setTravelT] = useState(0);
  useEffect(() => {
    if (!travel) {
      setTravelT(0);
      return;
    }
    const CYCLE_MS = 1000;
    const TRIPS = 2;
    const MOVING = 0.75;
    const t0 = Date.now();
    const id = setInterval(() => {
      const e = Date.now() - t0;
      if (e >= CYCLE_MS * TRIPS) {
        setTravelT(0);
        clearInterval(id);
        return;
      }
      const p = (e % CYCLE_MS) / CYCLE_MS;
      const k = p < MOVING ? 1 - p / MOVING : 0;
      setTravelT(k * k);
    }, 33);
    return () => clearInterval(id);
  }, [travel]);
  const snapActionId = useMemo(() => {
    const f = useGameStore.getState().furniture;
    return (
      f?.actions.find((a) => a.type === "placePart" && a.partId === def.partId)
        ?.actionId ?? null
    );
  }, [def.partId]);
  const driving =
    snapActionId != null &&
    (orientationActionId === snapActionId || driveActionId === snapActionId);
  const subtle = dim || driving;

  useEffect(() => {
    if (!entity) return;
    scene.addEntity(entity);
    return () => scene.removeEntity(entity);
  }, [entity, scene]);

  useEffect(() => {
    if (!entity) return;
    const done = new Set(completed);
    let offset: readonly number[] = [0, 0, 0];
    const parts = useGameStore.getState().furniture?.parts;
    const shift = parts ? stageShiftFor(def, parts) : undefined;
    if (at === "loose" || at === "drop" || at === "stageOut") {
      const base =
        at === "loose"
          ? looseDelta(def, engageAxis(def, done))
          : at === "drop"
            ? stageDelta(def)
            : ([0, 0, 0] as Vec3);
      offset = shift ? [base[0] + shift[0], base[1] + shift[1], base[2] + shift[2]] : base;
    } else {
      const f = useGameStore.getState().furniture;
      const snap = f?.actions.find(
        (a) => a.type === "placePart" && a.partId === def.partId,
      );
      if (f && snap) {
        offset = driving
          ? [0, 0, 0]
          : (screwParkOffset(f, snap, done) ??
            pressParkInfo(f, snap, done)?.offset ??
            slideParkInfo(f, snap, done)?.offset ??
            offset);
      }
    }
    if (travel) {
      const f = useGameStore.getState().furniture;
      const placedIds = new Set<string>();
      for (const a of f?.actions ?? []) {
        if (a.type === "placePart" && a.partId && done.has(a.actionId)) placedIds.add(a.partId);
      }
      const base = demoApproach(def, f ?? null, done, placedIds);
      offset = [base[0] * travelT, base[1] * travelT, base[2] * travelT];
    }
    let rotation = def.pose.rotation;
    if (travel && def.type === "fastener") {
      const axis = engageAxis(def, done);
      rotation = quatMultiply(
        quatFromAxisAngle(axis, (1 - travelT) * DEMO_TURNS * Math.PI * 2),
        def.pose.rotation,
      );
    }
    placeEntity(
      transformManager,
      entity,
      [
        def.pose.position[0] + offset[0],
        def.pose.position[1] + offset[1],
        def.pose.position[2] + offset[2],
      ],
      rotation,
    );
  }, [entity, transformManager, def, at, completed, driving, travel, travelT]);

  useEffect(() => {
    if (!entity) return;
    const glow = glowOverride ?? FIT_GLOW[fitState];
    const primitives = renderableManager.getPrimitiveCount(entity);
    const setEmissive = (rgb: [number, number, number]) => {
      for (let i = 0; i < primitives; i++) {
        const mi = renderableManager.getMaterialInstanceAt(entity, i);
        try {
          mi.setFloat3Parameter("emissiveFactor", rgb);
        } catch {}
      }
    };
    for (let i = 0; i < primitives; i++) {
      const mi = renderableManager.getMaterialInstanceAt(entity, i);
      try {
        if (subtle) mi.setTransparencyMode("twoPassesOneSide");
        mi.changeAlpha(subtle ? 0.5 : 1);
      } catch {}
    }
    for (let i = 0; i < primitives; i++) {
      const mi = renderableManager.getMaterialInstanceAt(entity, i);
      try {
        mi.setFloat4Parameter("baseColorFactor", [glow[0], glow[1], glow[2], 1]);
      } catch {}
    }
    if (!pulse || fitState === "nearCorrect") {
      setEmissive(glow);
      return;
    }
    const deep = fitState === "held" || fitState === "idle";
    let timer: ReturnType<typeof setTimeout>;
    const t0 = Date.now();
    const tick = () => {
      const k = 0.5 + 0.5 * Math.sin(((Date.now() - t0) / 1000) * (deep ? 3.4 : 2.6));
      const s = deep ? 0.3 + 1.05 * k : 0.25 + 0.75 * k;
      setEmissive([glow[0] * s, glow[1] * s, glow[2] * s]);
      timer = setTimeout(tick, 70);
    };
    tick();
    return () => clearTimeout(timer);
  }, [entity, renderableManager, fitState, glowOverride, pulse, subtle]);

  return null;
}

function SocketHintGhost({
  model,
  def,
  partActions,
  heldType,
}: {
  model: FilamentModel;
  def: PartDef;
  partActions: Record<PartId, PartActionIds>;
  heldType?: ActionType;
}) {
  const matchedActionId = useGameStore((s) => s.matchedActionId);
  const hintPartId = useGameStore((s) => s.hintPartId);
  const firstDrop = useGameStore(selectFirstDrop);
  const driveActionId = useGameStore((s) => s.driveActionId);
  const orientationActionId = useGameStore((s) => s.orientationActionId);
  const actionId = hintSlotFor(partActions[def.partId] ?? {}, heldType);
  const pose = ghostPoseFor(heldType);
  const isMatched = !!actionId && matchedActionId === actionId;
  const parked =
    !!actionId && (driveActionId === actionId || orientationActionId === actionId);
  if (hintPartId === def.partId && actionId && !parked) {
    return <Ghost model={model} def={def} at="target" glowOverride={GLOW_MARK} travel />;
  }
  if (firstDrop || !actionId || parked) return null;
  if (!isMatched) {
    if (def.type !== "fastener") return null;
    return (
      <Ghost
        model={model}
        def={def}
        at={pose}
        glowOverride={GLOW_MARK}
        pulse
      />
    );
  }
  return <Ghost model={model} def={def} at={pose} pulse />;
}

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
  const { transformManager, scene } = useFilamentContext();
  const entity = useInstanceEntity(model, def.meshName, 0);
  const shaderStyle = useShaderStyle();

  useEffect(() => {
    if (!entity) return;
    scene.addEntity(entity);
    return () => scene.removeEntity(entity);
  }, [entity, scene]);

  useEffect(() => {
    if (!entity) return;
    driver.attach(
      transformManager,
      entity,
      [initial[0], initial[1], initial[2]],
      {
        position: [
          def.pose.position[0],
          def.pose.position[1],
          def.pose.position[2],
        ],
        rotation,
      },
    );
    return () => driver.detach();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  useShaderOverride(entity, def, shaderStyle);

  return null;
}

function ClusterDrivenEntity({
  model,
  def,
  driver,
  base = [0, 0, 0],
  hidden = false,
}: {
  model: FilamentModel;
  def: PartDef;
  driver: ClusterDriver;
  base?: readonly number[];
  hidden?: boolean;
}) {
  const { transformManager, scene } = useFilamentContext();
  const entity = useInstanceEntity(model, def.meshName, 0);
  const shaderStyle = useShaderStyle();

  useEffect(() => {
    if (!entity) return;
    if (hidden) {
      scene.removeEntity(entity);
      return;
    }
    scene.addEntity(entity);
    return () => scene.removeEntity(entity);
  }, [entity, scene, hidden]);

  useEffect(() => {
    if (!entity) return;
    return driver.register(transformManager, entity, {
      position: [
        def.pose.position[0] + base[0],
        def.pose.position[1] + base[1],
        def.pose.position[2] + base[2],
      ],
      rotation: def.pose.rotation,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, transformManager, driver, base[0], base[1], base[2]]);

  useShaderOverride(entity, def, shaderStyle);

  return null;
}

function StaticEntity({
  model,
  def,
  offset,
  rotation,
}: {
  model: FilamentModel;
  def: PartDef;
  offset: Vec3;
  rotation?: Quat;
}) {
  const { transformManager, renderableManager, scene } = useFilamentContext();
  const entity = useInstanceEntity(model, def.meshName, 0);
  const shaderStyle = useShaderStyle();
  const hintPartId = useGameStore((s) => s.hintPartId);
  const hintParts = useGameStore((s) => s.hintParts);
  const marked = hintPartId === def.partId || hintParts.includes(def.partId);

  useEffect(() => {
    if (!entity) return;
    scene.addEntity(entity);
    return () => scene.removeEntity(entity);
  }, [entity, scene]);

  const offsetKey = `${offset[0]},${offset[1]},${offset[2]}`;
  const rotationKey = rotation ? rotation.join(",") : "";
  useEffect(() => {
    if (!entity) return;
    placeEntity(
      transformManager,
      entity,
      [
        def.pose.position[0] + offset[0],
        def.pose.position[1] + offset[1],
        def.pose.position[2] + offset[2],
      ],
      rotation ?? def.pose.rotation,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, transformManager, def, offsetKey, rotationKey]);

  useShaderOverride(entity, def, shaderStyle);

  useMarkerGlow(entity, renderableManager, marked ? GLOW_MARK : null, marked, NO_EMISSIVE);

  return null;
}

function HiddenEntity({ model, def }: { model: FilamentModel; def: PartDef }) {
  const { scene } = useFilamentContext();
  const entity = useInstanceEntity(model, def.meshName, 0);
  useEffect(() => {
    if (!entity) return;
    scene.removeEntity(entity);
  }, [entity, scene]);
  return null;
}

function PartModelImpl({
  def,
  mode,
  model,
  heldDriver,
  sinkDriver,
  clusterDriver,
  pushDriver,
  slideDriver,
  stageOffset,
  tightening,
  inserting,
  heldActionType,
  heldBlocked,
}: Props) {
  const partActions = useMemo(() => {
    const store = useGameStore.getState();
    return store.furniture ? buildPartActions(store.furniture.actions) : {};
  }, []);
  const completed = useGameStore((s) => s.completed);
  const signedLooseDelta = () =>
    looseDelta(def, engageAxis(def, new Set(completed)));
  const stagedOwnDelta = (): Vec3 => {
    if (!def.insertStage) return [0, 0, 0];
    const acts = partActions[def.partId] ?? {};
    const inserted = acts.insert ? new Set(completed).has(acts.insert) : false;
    return inserted ? signedLooseDelta() : stageDelta(def);
  };
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
    if (!spin || spin.mover !== def.partId || spin.mover === a.partId)
      return undefined;
    const p = Math.min(1, orientationDeg / ORIENTATION_TOTAL_DEG);
    const rad = (SCREW_SPIN_DEG * (1 - p) * Math.PI) / 180;
    const back = screwMoverParkOffset(f, a, done) ?? [0, 0, 0];
    return {
      rotation: quatMultiply(
        quatFromAxisAngle(spin.axis, rad),
        def.pose.rotation,
      ),
      offset: [back[0] * (1 - p), back[1] * (1 - p), back[2] * (1 - p)] as Vec3,
    };
  })();

  if (model.state !== "loaded") return null;

  switch (mode) {
    case "hidden":
      return (
        <HiddenEntity key={`${def.partId}-hidden`} model={model} def={def} />
      );
    case "flush":
      return pushDriver && !flushScrew ? (
        <ClusterDrivenEntity
          key={`${def.partId}-flush-push`}
          model={model}
          def={def}
          driver={pushDriver}
        />
      ) : (
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
        <ClusterDrivenEntity
          key={`${def.partId}-combining`}
          model={model}
          def={def}
          driver={clusterDriver}
        />
      );
    case "staged": {
      const carrier = stageOffset ?? [0, 0, 0];
      const own = stagedOwnDelta();
      const s = stageDelta(def);
      return inserting ? (
        <>
          <DrivenEntity
            key={`${def.partId}-insertpress`}
            model={model}
            def={def}
            driver={sinkDriver}
            initial={[carrier[0] + s[0], carrier[1] + s[1], carrier[2] + s[2]]}
          />
          <Ghost model={model} def={def} at="loose" dim />
        </>
      ) : (
        <StaticEntity
          key={`${def.partId}-staged`}
          model={model}
          def={def}
          offset={[carrier[0] + own[0], carrier[1] + own[1], carrier[2] + own[2]]}
        />
      );
    }
    case "riding":
      return slideDriver ? (
        <ClusterDrivenEntity
          key={`${def.partId}-riding`}
          model={model}
          def={def}
          driver={slideDriver}
          base={stagedOwnDelta()}
        />
      ) : (
        <StaticEntity
          key={`${def.partId}-riding-static`}
          model={model}
          def={def}
          offset={stagedOwnDelta()}
        />
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
        <StaticEntity
          key={`${def.partId}-loose`}
          model={model}
          def={def}
          offset={signedLooseDelta()}
        />
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
          {heldBlocked ? null : (
            <SocketHintGhost
              model={model}
              def={def}
              partActions={partActions}
              heldType={heldActionType}
            />
          )}
        </>
      );
    case "socket_hint":
      return (
        <>
          <HiddenEntity
            key={`${def.partId}-hint-hidden`}
            model={model}
            def={def}
          />
          <SocketHintGhost
            model={model}
            def={def}
            partActions={partActions}
            heldType={heldActionType}
          />
        </>
      );
  }
}

const modelEqual = (a: FilamentModel, b: FilamentModel) =>
  a === b ||
  (a.state === b.state &&
    (a as { asset?: unknown }).asset === (b as { asset?: unknown }).asset);

export const PartModel = memo(
  PartModelImpl,
  (p, n) =>
    p.def === n.def &&
    p.mode === n.mode &&
    modelEqual(p.model, n.model) &&
    p.heldDriver === n.heldDriver &&
    p.sinkDriver === n.sinkDriver &&
    p.clusterDriver === n.clusterDriver &&
    p.pushDriver === n.pushDriver &&
    p.slideDriver === n.slideDriver &&
    p.tightening === n.tightening &&
    p.inserting === n.inserting &&
    p.heldActionType === n.heldActionType &&
    p.heldBlocked === n.heldBlocked,
);