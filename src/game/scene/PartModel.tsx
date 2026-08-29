// TODO: settle down the part marked as dev
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
import { ActionId, ActionType, Furniture, MaterialParams, PartDef, PartId, Quat, Vec3 } from "@/src/game/core/type";
import {
  ORIENTATION_TOTAL_DEG,
  selectFirstDrop,
  useGameStore,
} from "@/src/game/core/store";
import { styleFor } from "@/src/game/core/presentation/labels";
import { buildPartActions, hintSlotFor, type PartActionIds } from "@/src/game/core/scene/targets";
import type { ClusterDriver, OffsetDriver } from "./offsetDriver";
import { useShaderOverride, useShaderStyle } from "./shaders";
import type { PartMode } from "./useSceneState";

const FIT_GLOW: Record<FitState, [number, number, number]> = {
  // ORANGE while hunting, BLUE once the right socket is close, GREEN the moment it would land.
  idle: [1.0, 0.42, 0.0],
  held: [1.0, 0.42, 0.0],
  approaching: [0.15, 0.5, 0.95],
  nearCorrect: [0.05, 0.8, 0.3],
  nearRotation: [0.95, 0.45, 0.08],
  wrongTarget: [0.85, 0.12, 0.12],
};
/** Static-socket mode: the marker pulsing at every open socket. ORANGE — this is the cue that has to be found. Slightly deeper than FIT_GLOW. */
const GLOW_MARK: [number, number, number] = [0.85, 0.33, 0.0];

/** Turns a fastener makes across one pass of the Spot demo.  */
const DEMO_TURNS = 1.5;
/** How far back the demo starts a STRUCTURAL part. Fasteners use their own baked insert distance. */
const DEMO_BACKOFF_M = 0.14;

function visualCentre(p: PartDef): Vec3 {
  const o = p.visualCenterOffset ?? [0, 0, 0];
  return [
    p.pose.position[0] + o[0],
    p.pose.position[1] + o[1],
    p.pose.position[2] + o[2],
  ];
}

/**
 * Where the Spot demo starts the ghost from.*/
function demoApproach(
  def: PartDef,
  furniture: Furniture | null,
  done: Set<ActionId>,
  placedIds: ReadonlySet<string>,
): Vec3 {
  const parts = furniture?.parts ?? {};
  // 1. Fasteners bake their own insertion axis (engageDir), so looseDelta already gives the right back-off and the screw retreats exactly the way it drives in.
  const baked = looseDelta(def, engageAxis(def, done));
  if (baked[0] || baked[1] || baked[2]) return baked;
  // 2. An authored placeDir is the direction the part travels to its seat — ORDER-ADAPTED, never raw: the demo must fly the path the drag will actually take, and the raw value is wrong in every legally reversed order (bottom-first EKET: the back panel's demo would dive INTO the closed bottom while the real gesture comes down through the open top). Same single source as the park and the aim (engagement.adaptedTravelDir); any travel-direction consumer reading part.placeDir raw is a shadow-consumer bug.
  if (def.placeDir) {
    const d = (furniture ? adaptedTravelDir(furniture, def, done) : null) ?? def.placeDir;
    const back = def.parkBackoff ?? DEMO_BACKOFF_M;
    return [-d[0] * back, -d[1] * back, -d[2] * back];
  }
  // 3. Derived. A part comes in from the side away from whatever it would collide with
  const centre = visualCentre(def);
  // STRUCTURAL joins first, and screw joins only if there are none. A screwJoin records what fastens a part, not the path it arrives along, and treating the two alike is what sent DALFRED's pole in from above: it joins the seatPlate ABOVE it (0.154 away) but is screwed to the supportPin BELOW it (0.075 away), so "nearest of all joins" picked the pin and reversed the approach.
  const structural = [
    ...(def.directJoins ?? []),
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
  // 4. Nothing to avoid — the first part of all. Straight down from above, how a top or a seat goes on.
  return [0, DEMO_BACKOFF_M, 0];
}

const EPSILON = 1e-6;

/** The material override for a part under the active render style (realistic/cartoon), or undefined → no override (the scene leaves the GLB's own materials = the fallback). Looks up the style's RenderStyle, then the override keyed by meshName, then by group. */

function usePartMaterial(def: PartDef): MaterialParams | undefined {
  const renderStyle = useGameStore((s) => s.renderStyle);
  const styles = useGameStore((s) => s.furniture?.styles);
  return useMemo(() => {
    const style = styleFor(styles, renderStyle);
    return style?.material?.[def.meshName] ?? style?.material?.[def.group];
  }, [styles, renderStyle, def.meshName, def.group]);
}

/** Apply a theme's material override to a world entity. No params → return early and leave the GLB's baked materials untouched (the fallback). Crude for now: sets the standard glTF material factors; it doesn't cache/restore originals, so switching FROM a themed style back to none won't auto-revert until reload. */
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
      if (params.metallic != null)
        mi.setFloatParameter("metallicFactor", params.metallic);
      if (params.roughness != null)
        mi.setFloatParameter("roughnessFactor", params.roughness);
    } catch {}
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
  /** The combined furniture model, loaded ONCE with instanceCount=2 by the scene: instance 0 is the "world" copy (flush/loose/held parts), instance 1 is a free-floating "ghost" copy reused for socket hints — there's only one mesh per part inside the shared GLB, so showing both the part's home socket AND a held/dragged copy at the same time needs a second instance. */
  model: FilamentModel;
  /** Drives the held part's offset (owned by the drag gesture). */
  heldDriver: OffsetDriver;
  /** Drives the active fastener's sink-to-flush offset (owned by TightenControl). */
  sinkDriver: OffsetDriver;
  /** Drives the whole moving cluster's offset while it's combined in (owned by ClusterTray). */
  clusterDriver: ClusterDriver;
  /** Drives this part's telescoping group during the push-open beat. A flush part with a pushDriver registers against it (offset 0 = identical to static) so the beat can travel the group without remounting anything. */
  pushDriver?: ClusterDriver;
  /** Drives a component's non-lead bodies while the lead is being dragged ("riding" mode), so the whole slide reads as one object in hand. Optional/defensive like pushDriver — falls back to a static pose if not supplied. */
  slideDriver?: ClusterDriver;
  /** World offset this part rests at while its sub-assembly is out ("staged" mode) — the CARRIER's stageOffset, which its hardware shares. */
  stageOffset?: Vec3;
  /** True when this fastener's tighten gesture is active. */
  tightening?: boolean;
  /** True when this 3-phase fastener's insert PRESS gesture is active (stage → loose). */
  inserting?: boolean;
  /** Type of the action currently in hand. The ghost layer resolves both the matchable socket id and the previewed pose from it — see SocketHintGhost. */
  heldActionType?: ActionType;
  /** The held part was grabbed before its step is legal (free mode's grab-anything). No socket ghost then — see SceneState.heldBlocked. */
  heldBlocked?: boolean;
}

/** Resolves a part's entity inside a specific instance of the shared model by node name. */
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

/** Drives a marker glow on an ALREADY-RENDERED entity: steady when `pulse` is false, breathing otherwise, and restores `restore` to every primitive the instant `color` goes null so an unmarked part does not stay frozen at whatever fractional pulse value it last wrote — the marker is a one-shot cue and has to be able to put itself out. Lifted out of Ghost so the same treatment can mark a REAL placed part on instance 0 — Ghost renders from instance 1 and cannot, because a ghost at a placed part's own pose reads as a doubled copy of it. */
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

/** Which pose a ghost previews — one per gesture that can be in hand, because each lands somewhere different:
 *  - `target`  the seat (or the park pose the release will hold, for a part that is driven home after it parks)
 *  - `loose`   an insert's converged pose, proud of the hole or retracted into its carrier
 *  - `drop`    a 3-phase fastener's STAGE pose: fully out of the hole, at its carrier's staging offset
 *  - `stageOut` a staged carrier lifted out of the furniture to its sub-assembly rest pose */
export type GhostPose = "target" | "loose" | "drop" | "stageOut";

/** The pose the action IN HAND is aiming at. Mirrors targets.targetPositionForAction, whose result is the drop target for the same gesture — the two must agree or the ghost marks a spot the release does not use. */
export const ghostPoseFor = (heldType?: ActionType): GhostPose =>
  heldType === "insertFastener"
    ? "loose"
    : heldType === "placeFastener"
      ? "drop"
      : heldType === "stagePart"
        ? "stageOut"
        : "target";

/** Glowing ghost of a part at the pose the current gesture will produce, rendered from the second model instance so it can coexist with the primary copy. */
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
  /** Fixed marker color instead of the fitState-driven glow (static-socket ghosts). Also tints the albedo so markers read on light-colored parts. */
  glowOverride?: [number, number, number];
  /** Gentle breathing pulse on the emissive glow (static-socket markers). */
  pulse?: boolean;
  /** Subtle goal ghost: rendered at 50% opacity (MaterialInstance.changeAlpha) so the REAL part stays readable as it converges into the ghost. Glow stays at full strength. */
  dim?: boolean;
  /** Spot's demo: run the ghost IN along its own approach axis a couple of times instead of parking
   *  it at the seat. Shows the MOVE, not just the destination — which for a screw is the whole
   *  instruction, since where it goes is obvious and which way it drives is not. */
  travel?: boolean;
}) {
  const { renderableManager, transformManager, scene } = useFilamentContext();
  const storeFitState = useGameStore((s) => s.fitState);
  const completed = useGameStore((s) => s.completed);
  // The ghost previews the pose the CURRENT interaction will produce, so once this part's place action is parked and being driven home (orientation twist, press taps, slide) the ghost switches from the park pose to the FINAL pose.
  const orientationActionId = useGameStore((s) => s.orientationActionId);
  const driveActionId = useGameStore((s) => s.driveActionId);
  const fitState = fixedFitState ?? storeFitState;
  const entity = useInstanceEntity(model, def.meshName, 1);
  // 1 = backed off along the approach axis, 0 = seated. Stepped from a timer rather than Reanimated because the ghost's pose is written imperatively through the transform manager, which lives on the JS side — there is no style here to animate.
  const [travelT, setTravelT] = useState(0);
  useEffect(() => {
    if (!travel) {
      setTravelT(0);
      return;
    }
    const CYCLE_MS = 1000;
    const TRIPS = 2;
    // The last quarter of each cycle rests at the seat, so the part is SEEN arriving rather than snapping straight back out for the next pass.
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
      // Squared: fast off the mark, settling into the socket.
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
  /** This part's place action is parked and being driven home right now. */
  const driving =
    snapActionId != null &&
    (orientationActionId === snapActionId || driveActionId === snapActionId);
  /** Goal ghosts (driving phases, tighten) are shrunk + dimmed so the real part stays readable as it converges into them. */
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
    // A part whose sub-assembly is currently OUT of the furniture must preview where it will really go — the dowel in the rod's end, out on the canvas — not the socket the rod will eventually occupy. Same shift the drop target uses (core/scene/targets.ts), from the same function, so the ghost and the target cannot disagree. `stageOut` is the carrier's OWN take-out: the shift IS the whole target there, since the sub-assembly is lifted straight off its seat.
    const parts = useGameStore.getState().furniture?.parts;
    const shift = parts ? stageShiftFor(def, parts) : undefined;
    if (at === "loose" || at === "drop" || at === "stageOut") {
      // loose: the insert's converged pose. drop: the 3-phase STAGE pose, fully out of the hole. stageOut: no delta of its own — the carrier just moves to its rest pose.
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
        // Approach: ghost at the pose the release will park at (screw back-off, press/slide park). Driving home: ghost at the final pose (offset 0).
        offset = driving
          ? [0, 0, 0]
          : (screwParkOffset(f, snap, done) ??
            pressParkInfo(f, snap, done)?.offset ??
            slideParkInfo(f, snap, done)?.offset ??
            offset);
      }
    }
    // The demo overrides whatever pose the normal ghost would take: back off along the SAME axis the loose pose uses, scaled by travelT, so the path it flies is the path the player must drag.
    if (travel) {
      const f = useGameStore.getState().furniture;
      // What is already standing, so the ghost can come in from the side that is clear.
      const placedIds = new Set<string>();
      for (const a of f?.actions ?? []) {
        if (a.type === "placePart" && a.partId && done.has(a.actionId)) placedIds.add(a.partId);
      }
      const base = demoApproach(def, f ?? null, done, placedIds);
      offset = [base[0] * travelT, base[1] * travelT, base[2] * travelT];
    }
    // A screw does not glide in — it TURNS as it goes, and that turn is the part of the gesture a player cannot guess from a straight-line preview. Structural parts get no spin, because they genuinely do not rotate on the way in and a spinning leg would be a lie about the move.
    let rotation = def.pose.rotation;
    if (travel && def.type === "fastener") {
      const axis = engageAxis(def, done);
      // Same composition order the tighten driver uses, so the demo turns the way the real gesture turns rather than mirroring it.
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
    // Goal ghosts (driving phases, tighten) render half-transparent so the real part stays readable as it converges into them; glow stays full strength.
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
        // Tint the albedo to the SAME colour as the emissive, always — not just for static markers. Tinting is what makes a ghost read on light-albedo parts (LACK), where emissive alone washes out; and because the tint persists on the material, writing it only sometimes left an old orange albedo under a new blue emissive, which is why the approach cue pulsed two colours. Clearing it to white instead just bleached the ghost. Matching it to `glow` keeps every state one colour. No-op on near-black materials (DALFRED), which swallow base-colour tints.
        mi.setFloat4Parameter("baseColorFactor", [glow[0], glow[1], glow[2], 1]);
      } catch {}
    }
    // Arrived: hold it STEADY. A socket that stops flashing the instant the part would land is the clearest "yes, here" the scene can give, and it stops the green competing with the orange markers still pulsing elsewhere.
    if (!pulse || fitState === "nearCorrect") {
      setEmissive(glow);
      return;
    }
    // Breathing pulse. Deeper swing the FURTHER out the part is: hunting needs to be found from across the canvas, whereas the blue approach cue is already where the eye is.
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

/** Ghost rendered at one of the open socket positions while the player is holding a same-group part, including the socket for the representative part being held. Structural parts ghost the proximity-matched socket only; fasteners ghost every open socket of the group. */
function SocketHintGhost({
  model,
  def,
  partActions,
  heldType,
}: {
  model: FilamentModel;
  def: PartDef;
  partActions: Record<PartId, PartActionIds>;
  /** Type of the action in hand. Decides BOTH which of this part's action ids the drag can match and which pose the ghost takes — a staged rod's take-out and a 3-phase dowel's drop each have their own id and their own target. */
  heldType?: ActionType;
}) {
  const matchedActionId = useGameStore((s) => s.matchedActionId);
  const hintPartId = useGameStore((s) => s.hintPartId);
  const firstDrop = useGameStore(selectFirstDrop);
  // Parked at its seat: the part is physically AT the socket and only the finishing gesture (screw / orientation twist / slide / press) is left. A ghost at the target pose now sits exactly where the real part already is and reads as a doubled, clashing leg — same reasoning as the tighten phase, which dropped its goal ghost for this exact reason.
  const driveActionId = useGameStore((s) => s.driveActionId);
  const orientationActionId = useGameStore((s) => s.orientationActionId);
  // The id the DRAG can match, chosen by what is in hand (hintSlotFor) — matchedActionId names the action being dragged, so resolving this to the part's `placePart`/`insertFastener` id regardless of the gesture left a staged rod's take-out and a 3-phase dowel's drop permanently unmatched.
  const actionId = hintSlotFor(partActions[def.partId] ?? {}, heldType);
  const pose = ghostPoseFor(heldType);
  const isMatched = !!actionId && matchedActionId === actionId;
  const parked =
    !!actionId && (driveActionId === actionId || orientationActionId === actionId);
  // The ? spotlight, in GLOW_MARK orange — deliberately the dimmer of the two marker colours, so if the player then picks a part up the proximity-matched socket still reads as the brighter of the two. Ahead of the firstDrop guard: the first step is when a hint is most likely to be asked for, and that guard exists to keep ghosts off an empty plane, not to suppress an explicit ask. Spot's ghost. Pose `target` unconditionally — the cue marks the SEAT, never a park or rest pose, and passing the caller's pose through is what previously put a glowing copy of the part off to the side of the assembly. GLOW_MARK rather than FIT_GLOW.idle so that if the player then picks a part up, the proximity-matched socket still reads as the brighter of the two. Ahead of the firstDrop guard: the first step is when a hint is most likely to be asked for.
  if (hintPartId === def.partId && actionId && !parked) {
    return <Ghost model={model} def={def} at="target" glowOverride={GLOW_MARK} travel />;
  }
  if (firstDrop || !actionId || parked) return null;
  // Fasteners: every open socket of the held group shows a dim pulsing marker, and the proximity-matched one switches to the steady fitState-driven colour (blue approaching → green seated) — a field of near-identical holes is a CHOICE, so the player needs to see the whole field. Structural parts: only the matched socket is ghosted, because a translucent copy of every open panel buries the assembly. `def` is same-group as the held part (see deriveSceneState), so its own type is the held part's type in both the held and socket_hint cases.
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

  useEffect(() => {
    if (entity) applyThemeMaterial(renderableManager, entity, material);
  }, [entity, renderableManager, material]);

  // Declared AFTER the theme-material effect so the shader swap wins.
  useShaderOverride(entity, def, shaderStyle, material);

  return null;
}

/** A part whose offset is driven together with its whole cluster (the combine lower). `base` is a fixed per-part delta from the baked pose that the cluster offset rides ON TOP of — a fitted dowel carried on a staged rod keeps its own retract (looseDelta) so it stays pressed-into-the-rod during the carry instead of snapping to its drawn-out pose. */
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
  /** Keep the entity registered but OUT of the scene — a pre-mounted combine cluster waiting for its card to be dragged. Toggling membership is cheap; remounting the whole entity mid-gesture is not. */
  hidden?: boolean;
}) {
  const { transformManager, renderableManager, scene } = useFilamentContext();
  const entity = useInstanceEntity(model, def.meshName, 0);
  const material = usePartMaterial(def);
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

  useEffect(() => {
    if (entity) applyThemeMaterial(renderableManager, entity, material);
  }, [entity, renderableManager, material]);

  // Declared AFTER the theme-material effect so the shader swap wins.
  useShaderOverride(entity, def, shaderStyle, material);

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
  const shaderStyle = useShaderStyle();
  // A placed part is MARKED, never ghosted: Spot's tighten target and the "?" scene highlights are both already sitting at their pose, and a ghost on top of them reads as a doubled copy (see the note in SocketHintGhost).
  const hintPartId = useGameStore((s) => s.hintPartId);
  const hintParts = useGameStore((s) => s.hintParts);
  const marked = hintPartId === def.partId || hintParts.includes(def.partId);
  // What an unmarked part's emissive is reset TO: the theme's own emissive when the material params define one, else forced to unlit black. That fallback is NOT what applyThemeMaterial does — it skips emissiveFactor entirely when params define none, leaving whatever the GLB baked — so a part shipping a non-zero baked emissive would be darkened by the restore rather than returned to it. Nothing in the codebase currently sets MaterialParams.emissive, so black is the only baseline in practice; revisit here if a furniture GLB ever bakes one. Memoized by material identity (usePartMaterial is itself memoized) so an unmarked part's restore write doesn't refire this effect every render.
  const restoreEmissive = useMemo<[number, number, number]>(() => {
    const e = material?.emissive;
    return e ? [e[0], e[1], e[2]] : [0, 0, 0];
  }, [material]);

  useEffect(() => {
    if (!entity) return;
    scene.addEntity(entity);
    return () => scene.removeEntity(entity);
  }, [entity, scene]);

  // Keyed by VALUE, not array identity — callers build the offset/rotation arrays fresh every render (looseDelta, flushScrew), and re-placing all ~100 static parts natively on every scene re-render is exactly the churn that stutters a drag.
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

  useEffect(() => {
    if (entity) applyThemeMaterial(renderableManager, entity, material);
  }, [entity, renderableManager, material]);

  // Declared AFTER the theme-material effect so the shader swap wins.
  useShaderOverride(entity, def, shaderStyle, material);

  // The marker does NOT survive useShaderOverride's material-instance swaps because it is declared after it — useShaderOverride can replace the material instance itself via setMaterialInstanceAt on a later async commit, and effect declaration order only sequences effects within a single commit, not across commits. What actually keeps the marker visible is that its pulse re-fetches getMaterialInstanceAt and rewrites emissiveFactor every 70ms, so any instance swap gets patched over within a tick.
  useMarkerGlow(entity, renderableManager, marked ? GLOW_MARK : null, marked, restoreEmissive);

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
  // A 3-phase fastener's own offset while it rests staged out: STAGE (fully out) until it is pressed in, then LOOSE (the retract). Added to the CARRIER's stageOffset by the "staged" case. [0,0,0] for ordinary staged hardware.
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
      // A telescoping-group member registers with its push driver (offset 0 renders exactly like static); the transient screw-spin pose keeps the static path since it needs its own offset/rotation.
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
      // CARRY: the parts stay IN the scene for the whole combine stage and CombineCarry's render loop parks them off-screen until the card is dragged, then carries them — toggling scene membership at drag start (the old `activeCombining` gate) burst-mounted the cluster mid-gesture and stalled the JS thread. DRIVE (parkDrive running): the whole cluster rides the same ClusterDriver home — the runners stay put during a combine; they only telescope in the test beats. No Ghost here: the baked-pose duplicate read as the assembly coming apart mid-drag.
      return (
        <ClusterDrivenEntity
          key={`${def.partId}-combining`}
          model={model}
          def={def}
          driver={clusterDriver}
        />
      );
    case "staged": {
      // Resting out in front of the furniture as part of a sub-assembly: the carrier the player took out, or a piece of hardware already pressed into it. Both sit at the CARRIER's stageOffset. A 3-phase fastener ALSO carries its own stage/loose delta on top (dropped-but-not-pressed sits at STAGE; pressed-in sits at LOOSE).
      const carrier = stageOffset ?? [0, 0, 0];
      const own = stagedOwnDelta();
      const s = stageDelta(def);
      // Active insert PRESS: drive the sink from stage → loose (InsertPressControl sets carrier + lerp(stage, loose)); it starts at carrier + stage.
      return inserting ? (
        <>
          <DrivenEntity
            key={`${def.partId}-insertpress`}
            model={model}
            def={def}
            driver={sinkDriver}
            initial={[carrier[0] + s[0], carrier[1] + s[1], carrier[2] + s[2]]}
          />
          {/* Goal ghost at the LOOSE pose the press converges into. */}
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
      // Sibling body of a held component lead, OR a fitted fastener carried on a staged carrier: tracks the lead's live drag offset via slideDriver so the whole thing reads as one solid object. A fitted dowel keeps its own retract (stagedOwnDelta = looseDelta) as the base so it stays pressed-into-the-rod during the carry instead of snapping to its drawn-out pose. No driver supplied → fall back to the static baked pose (defensive, matches the "flush"/pushDriver pattern).
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
        // No goal ghost while tightening — the flush-pose preview just distracts from the gesture (user, 2026-07-20). Only the real sinking part renders.
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
      // Same held type as the held part's own ghost: a socket hint is only ever raised for a part in the HELD part's group (deriveSceneState), so it is aiming at the same kind of target by the same gesture.
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

/** useModel may hand back a fresh state object per render; two models are the same for rendering purposes when they're in the same load state holding the same asset. */
const modelEqual = (a: FilamentModel, b: FilamentModel) =>
  a === b ||
  (a.state === b.state &&
    (a as { asset?: unknown }).asset === (b as { asset?: unknown }).asset);

/** Memoized: AssemblyScene re-renders all ~100 PartModels on every drag-time store flip (matched socket, fit state), but only parts whose mode/flags actually changed need to re-render — the rest would just re-run their hooks and effects for nothing, and that churn on the JS thread is what stutters the drag gesture. */
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