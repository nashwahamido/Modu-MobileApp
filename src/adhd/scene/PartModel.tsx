import { useEffect, useMemo } from "react";
import {
  FilamentModel,
  useFilamentContext,
} from "react-native-filament";
import { looseDelta } from "@/src/adhd/core/geometry/staging";
import { PartDef, Vec3 } from "@/src/adhd/core/type";
import { useGameStore } from "@/src/adhd/core/store";
import { buildPartActions } from "@/src/adhd/core/assembly/targets";
import type { OffsetDriver } from "./offsetDriver";
import type { PartMode } from "./useSceneState";

/**
 * Ghost tint colors. The LACK parts have a light/white albedo, so an emissive
 * glow alone washes out to white — the base color must be tinted to read as a
 * clear marker. Emissive is layered on top for a soft glow/pulse.
 */
const GLOW_MARK: [number, number, number] = [0.16, 0.62, 0.3]; // green — target marker (pulses)
const GLOW_NEAR: [number, number, number] = [0.12, 0.4, 0.92]; // blue — part is getting close
const GLOW_PLACE: [number, number, number] = [0.16, 0.85, 0.36]; // bright green — in the right place

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
  /** True when this fastener's tighten gesture is active. */
  tightening?: boolean;
  /** Ghost drop target is the loose pose (inserts) instead of the baked pose. */
  ghostAtLoosePose?: boolean;
}

/** Resolves a part's entity inside a specific instance of the shared model by node name. */
function useInstanceEntity(model: FilamentModel, meshName: string, instanceIndex: number) {
  return useMemo(() => {
    if (model.state !== "loaded") return null;
    // `getFirstEntityByName` resolves a node name within instance 0's
    // hierarchy. For an instanced asset, every instance's entity list is
    // built in the same node order, so the same positional index in another
    // instance's entity list is that instance's copy of the same node.
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
 * Adds this part's inverted-hull outline to the scene alongside the part.
 *
 * The GLB carries a `<meshName>__outline` child node under each part: a copy of
 * the mesh, slightly inflated with reversed winding and a flat dark unlit
 * material. As a CHILD it inherits the part's transform automatically (incl.
 * the OffsetDriver animation on held parts), so we only need to add/remove its
 * entity from the scene — never position it. Resolved on instance 0 only, so
 * ghosts (instance 1) get no outline.
 */
function useOutlineHull(model: FilamentModel, meshName: string) {
  const { scene } = useFilamentContext();
  const hull = useInstanceEntity(model, `${meshName}__outline`, 0);
  useEffect(() => {
    if (!hull) return;
    scene.addEntity(hull);
    return () => scene.removeEntity(hull);
  }, [hull, scene]);
}

/**
 * Glowing ghost of a part at its baked (or loose) pose, rendered from the
 * second model instance so it can coexist with the primary copy.
 */
function Ghost({
  model,
  def,
  atLoosePose,
  glow,
  pulse,
}: {
  model: FilamentModel;
  def: PartDef;
  atLoosePose: boolean;
  glow: [number, number, number];
  pulse: boolean;
}) {
  const { renderableManager, transformManager, scene } = useFilamentContext();
  const worldShift = useGameStore((s) => s.worldShift);
  const entity = useInstanceEntity(model, def.meshName, 1);

  useEffect(() => {
    if (!entity) return;
    scene.addEntity(entity);
    return () => scene.removeEntity(entity);
  }, [entity, scene]);

  useEffect(() => {
    if (!entity) return;
    const offset = atLoosePose ? looseDelta(def) : [0, 0, 0];
    transformManager.setEntityPosition(
      entity,
      [
        def.pose.position[0] + offset[0] + worldShift[0],
        def.pose.position[1] + offset[1] + worldShift[1],
        def.pose.position[2] + offset[2] + worldShift[2],
      ],
      false,
    );
  }, [entity, transformManager, def, atLoosePose, worldShift]);

  useEffect(() => {
    if (!entity) return;
    const primitives = renderableManager.getPrimitiveCount(entity);
    const setBase = (rgb: [number, number, number]) => {
      for (let i = 0; i < primitives; i++) {
        const mi = renderableManager.getMaterialInstanceAt(entity, i);
        try {
          mi.setFloat4Parameter("baseColorFactor", [rgb[0], rgb[1], rgb[2], 1]);
        } catch {
          // material without a base-color factor — leave it
        }
      }
    };
    const setEmissive = (rgb: [number, number, number]) => {
      for (let i = 0; i < primitives; i++) {
        const mi = renderableManager.getMaterialInstanceAt(entity, i);
        try {
          mi.setFloat3Parameter("emissiveFactor", rgb);
        } catch {
          // material variant without emissive — leave it
        }
      }
    };
    // Tint the albedo so it reads as a colored marker on the white parts.
    setBase(glow);
    if (!pulse) {
      setEmissive([glow[0] * 0.45, glow[1] * 0.45, glow[2] * 0.45]);
      return;
    }
    // Gentle breathing pulse on the emissive glow for the green markers.
    let timer: ReturnType<typeof setTimeout>;
    const t0 = Date.now();
    const tick = () => {
      const k = 0.5 + 0.5 * Math.sin(((Date.now() - t0) / 1000) * 2.6);
      const s = 0.15 + 0.5 * k;
      setEmissive([glow[0] * s, glow[1] * s, glow[2] * s]);
      timer = setTimeout(tick, 70);
    };
    tick();
    return () => clearTimeout(timer);
  }, [entity, renderableManager, glow, pulse]);

  return null;
}

/**
 * Ghost rendered at one of the open socket positions while the player is
 * holding a same-group part. Turns green/orange only when it is the nearest
 * matched socket; otherwise stays at the idle discovery blue.
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
  const fitState = useGameStore((s) => s.fitState);
  // Match against whichever action type this part uses: snap for structural
  // parts (legs), insert for fasteners.
  const actionId = partActions[def.partId]?.snap ?? partActions[def.partId]?.insert;
  const isMatched = !!actionId && matchedActionId === actionId;

  // Visual language:
  //  - every open socket gets a dim green PULSING marker (where it goes),
  //  - the nearest socket turns steady BLUE once the part is getting close,
  //  - then steady bright GREEN when it's in the right place.
  let glow: [number, number, number] = GLOW_MARK;
  let pulse = true;
  if (isMatched && (fitState === "nearCorrect" || fitState === "nearRotation")) {
    glow = GLOW_PLACE;
    pulse = false;
  } else if (isMatched && fitState === "approaching") {
    glow = GLOW_NEAR;
    pulse = false;
  }

  return (
    <Ghost
      model={model}
      def={def}
      atLoosePose={atLoosePose}
      glow={glow}
      pulse={pulse}
    />
  );
}

/** A part whose offset is animated imperatively via an OffsetDriver, using the primary (instance 0) entity. */
function DrivenEntity({
  model,
  def,
  driver,
  initial,
}: {
  model: FilamentModel;
  def: PartDef;
  driver: OffsetDriver;
  initial: Vec3;
}) {
  const { transformManager, scene } = useFilamentContext();
  const entity = useInstanceEntity(model, def.meshName, 0);
  useOutlineHull(model, def.meshName);

  useEffect(() => {
    if (!entity) return;
    scene.addEntity(entity);
    return () => scene.removeEntity(entity);
  }, [entity, scene]);

  useEffect(() => {
    if (!entity) return;
    // World shift (table-top origin) baked into the base; the driver delta
    // rides on top. Read at attach time — a held part is only mounted after
    // the shift is set, so it won't change underneath us.
    const ws = useGameStore.getState().worldShift;
    transformManager.setEntityPosition(
      entity,
      [
        def.pose.position[0] + ws[0],
        def.pose.position[1] + ws[1],
        def.pose.position[2] + ws[2],
      ],
      false,
    );
    driver.attach(transformManager, entity, [initial[0], initial[1], initial[2]]);
    return () => driver.detach();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  return null;
}

/** A part shown at a fixed (non-driven) offset from its baked pose, e.g. flush or loose-but-untouched. */
function StaticEntity({
  model,
  def,
  offset,
}: {
  model: FilamentModel;
  def: PartDef;
  offset: Vec3;
}) {
  const { transformManager, scene } = useFilamentContext();
  const entity = useInstanceEntity(model, def.meshName, 0);
  const worldShift = useGameStore((s) => s.worldShift);
  useOutlineHull(model, def.meshName);

  useEffect(() => {
    if (!entity) return;
    scene.addEntity(entity);
    return () => scene.removeEntity(entity);
  }, [entity, scene]);

  useEffect(() => {
    if (!entity) return;
    const ws = worldShift;
    transformManager.setEntityPosition(
      entity,
      [
        def.pose.position[0] + offset[0] + ws[0],
        def.pose.position[1] + offset[1] + ws[1],
        def.pose.position[2] + offset[2] + ws[2],
      ],
      false,
    );
  }, [entity, transformManager, def, offset, worldShift]);

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
  tightening,
  ghostAtLoosePose,
}: Props) {
  const partActions = useMemo(() => {
    const store = useGameStore.getState();
    return store.furniture ? buildPartActions(store.furniture.actions) : {};
  }, []);

  if (model.state !== "loaded") return null;

  switch (mode) {
    case "hidden":
      return <HiddenEntity key={`${def.partId}-hidden`} model={model} def={def} />;
    case "flush":
      return (
        <StaticEntity key={`${def.partId}-flush`} model={model} def={def} offset={[0, 0, 0]} />
      );
    case "loose":
      return tightening ? (
        <DrivenEntity
          key={`${def.partId}-sink`}
          model={model}
          def={def}
          driver={sinkDriver}
          initial={looseDelta(def)}
        />
      ) : (
        <StaticEntity key={`${def.partId}-loose`} model={model} def={def} offset={looseDelta(def)} />
      );
    case "held":
      // DrivenEntity moves under the finger; SocketHintGhost (instance 1)
      // marks where the part will land. For snap parts atLoosePose=false
      // (baked position); for fastener inserts atLoosePose=true (slightly
      // offset loose position).
      return (
        <>
          <DrivenEntity
            key={`${def.partId}-held`}
            model={model}
            def={def}
            driver={heldDriver}
            initial={heldDriver.value}
          />
          {/* place-on-drop parts (the flat table top) skip the socket-hint
              ghost: it sits at the same pose as the held copy and the two
              large coplanar surfaces z-fight into a shimmer. */}
          {!def.placeOnDrop && (
            <SocketHintGhost
              model={model}
              def={def}
              partActions={partActions}
              atLoosePose={ghostAtLoosePose ?? false}
            />
          )}
        </>
      );
    case "socket_hint": {
      // Glowing outline at this socket position (instance 1, so the primary
      // copy stays hidden via HiddenEntity rendered by the caller's "hidden"
      // branch for this same part id — see AssemblyScene mapping). Insert
      // parts appear at their loose pose; snap parts at the baked pose.
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