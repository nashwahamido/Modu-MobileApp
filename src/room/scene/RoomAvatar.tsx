import { useEffect, useMemo, useRef } from "react";
import {
  RenderCallbackContext,
  useAnimator,
  useFilamentContext,
  useModel,
  type Mat4,
} from "react-native-filament";
import { useSharedValue } from "react-native-worklets-core";

import { findPath, inflateBlocked, nearestWalkable } from "../character/navigation";
import { avatarMotionPhase } from "../character/avatarMotion";
import {
  roomAvatarKindForProfile,
  type RoomAvatarKind,
} from "../character/avatarChoice";
import {
  cellKey,
  cellsFor,
  floorCellToRoom,
  roomPointToFloorCell,
  rotatedFootprint,
  type GridPlacement,
} from "../core/grid";
import { fitScale, getRoomItemDef, useRoomCatalogStore } from "../core/placeableItems";
import { usePlacementStore } from "../core/placement";
import { FLOOR_CELLS, ROOM_SHELL, SCENE_SCALE, roomToScene } from "../core/roomShell";
import { useGameStore } from "../../game/core/store";
import { CLEAR_PATH_BED_INSTANCE_ID } from "../character/clearPathBed";

const CAT_FOOTPRINT = { w: 1, d: 1 } as const;

type AvatarConfig = {
  model: number;
  size: { x: number; y: number; z: number };
  animation: {
    walk: number;
    idle: number;
    walkRate?: number;
    walkWindow?: { start: number; end: number };
  };
  specials: readonly { index: number; duration: number }[];
};

const AVATAR_CONFIG: Record<RoomAvatarKind, AvatarConfig> = {
  felix: {
    model: require("../../assets/models/avatars/cute-cat.glb"),
    size: { x: 0.667114, y: 0.979554, z: 0.506043 },
    // Optimized Felix: NlaTrack is idle; NlaTrack.001 is walk.
    // NlaTrack.001 is a 15.625s performance containing turns, not a clean walk
    // loop. This measured sub-window has active legs, quiet torso motion and
    // closely matching endpoints, so only it repeats while navigation moves.
    animation: {
      walk: 1,
      idle: 0,
      walkRate: 1.6,
      walkWindow: { start: 9.417, end: 10.167 },
    },
    specials: [],
  },
  sparky: {
    model: require("../../assets/models/avatars/sparky.glb"),
    size: { x: 0.679871, y: 0.980042, z: 0.516876 },
    // Optimized Sparky: the long NlaTrack is idle; NlaTrack.002 is the
    // symmetric, seamless leg-driven walk cycle.
    animation: { walk: 2, idle: 0 },
    // Arm-led, seamless clips. They play only as complete one-shot actions
    // while Sparky is safely stopped.
    specials: [
      { index: 1, duration: 2.083 },
      { index: 3, duration: 3.208 },
    ],
  },
  lumi: {
    model: require("../../assets/models/avatars/lumi.glb"),
    size: { x: 0.719726, y: 0.979431, z: 0.636903 },
    // Lumi's export orders these differently from Sparky: NlaTrack has the
    // alternating thigh/calf cycle, while NlaTrack.002 is nearly motionless.
    // The long middle action remains unscheduled until its gesture is reviewed.
    animation: { walk: 0, idle: 2 },
    specials: [],
  },
};

// This GLB's authored forward axis already matches the yaw convention below:
// yaw 0 walks toward +Z. Adding PI made the cat face away from every target and
// therefore appear to moonwalk along an otherwise-correct path.
const MODEL_FORWARD_OFFSET = 0;
const WALK_SPEED = 0.55;
const TURN_SPEED = 7;
const ARRIVAL_EPSILON = 0.025;
const ANIMATION_CROSS_FADE_SECONDS = 0.18;
const FLOOR_CLEARANCE_METRES = 0.005;
const SPECIAL_ACTION_CHANCE = 0.35;

type Point = { x: number; z: number };
type Motion = {
  position: Point;
  yaw: number;
  path: Point[];
  idleUntil: number;
  special: { index: number; until: number } | null;
  specialEligible: boolean;
};

const shortestAngle = (from: number, to: number): number =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from));

const pointForCell = (cell: { x: number; y: number }): Point => {
  const point = floorCellToRoom(cell, CAT_FOOTPRINT);
  return { x: point.x, z: point.z };
};

export function RoomAvatar() {
  const profile = useGameStore((state) => state.profile);
  const avatarKind = roomAvatarKindForProfile(profile);
  const viewing = usePlacementStore((state) => state.viewing !== null);
  const clearPathBed = usePlacementStore((state) => {
    const edited = state.activeEdit;
    if (
      edited?.reserved &&
      edited.placement.instanceId === CLEAR_PATH_BED_INSTANCE_ID
    ) {
      return edited.placement;
    }
    return state.reserved.find(
      (placement) => placement.instanceId === CLEAR_PATH_BED_INSTANCE_ID,
    );
  });

  // Pebble is a Clear Path room fixture, not a roaming avatar. It is mounted
  // only after its non-persisted bed has found a legal corner, and never follows
  // the player into a friend's room.
  if (profile === "clearPath") {
    return !viewing && clearPathBed ? (
      <PebbleBedAvatar key={clearPathBed.instanceId} bed={clearPathBed} />
    ) : null;
  }

  // A recommendation change must create fresh native model/animator state rather
  // than asking one Filament wrapper to change the asset underneath itself.
  return <WalkingRoomAvatar key={avatarKind} avatarKind={avatarKind} />;
}

const PEBBLE_MODEL = require("../../assets/models/avatars/pebble.glb");
const PEBBLE_SIZE = { x: 0.76812, y: 0.97937, z: 0.63098 } as const;
// The bed's measured height includes its headboard, so the mattress cannot be
// derived from size.y / 2. These two values are visual seating policy for this
// exact bed/avatar pair: Pebble sinks slightly into the mattress so its tail's
// large bounds do not hold the body visibly in the air.
const PEBBLE_MATTRESS_HEIGHT_RATIO = 0.34;
const PEBBLE_MAX_MATTRESS_HEIGHT = 0.4;
const PEBBLE_BED_SINK = 0.14;

function PebbleBedAvatar({ bed }: { bed: GridPlacement }) {
  const item = useRoomCatalogStore((state) => state.items[bed.itemId] ?? null);
  const model = useModel(PEBBLE_MODEL);
  const asset = model.state === "loaded" ? model.asset : null;
  const animator = useAnimator(asset ?? undefined);
  const { transformManager } = useFilamentContext();
  const baseTransform = useRef<Mat4 | null>(null);

  RenderCallbackContext.useRenderCallback(
    () => {
      "worklet";
      if (!animator) return;
      // Freeze on the authored first frame. Applying a fixed time keeps the
      // intended posed skeleton without playing the arm-heavy clip, which read
      // as twitching while the character was meant to be resting.
      animator.applyAnimation(0, 0);
      animator.updateBoneMatrices();
    },
    [animator],
  );

  useEffect(() => {
    if (!asset || model.state !== "loaded" || !item) return;
    transformManager.transformToUnitCube(model.rootEntity, model.boundingBox);
    baseTransform.current = transformManager.getTransform(model.rootEntity);

    const footprint = rotatedFootprint(item.def.footprint, bed.rotSteps);
    const roomCentre = floorCellToRoom(bed.cell, footprint);
    const centre = roomToScene(roomCentre);
    const maxExtent = Math.max(PEBBLE_SIZE.x, PEBBLE_SIZE.y, PEBBLE_SIZE.z);
    const unitScale = 2 / maxExtent;
    const bedScale = fitScale(item);
    const mattressY =
      Math.min(PEBBLE_MAX_MATTRESS_HEIGHT, item.size.y * PEBBLE_MATTRESS_HEIGHT_RATIO) *
      bedScale;
    const bedYaw = (bed.rotSteps * Math.PI) / 2;
    // Keep Pebble centred on the mattress, but turn its head and feet through
    // 180 degrees relative to the previous pose. Position and height stay fixed.
    const pebbleYaw = bedYaw;
    const transform = baseTransform.current
      .scaling([SCENE_SCALE / unitScale, SCENE_SCALE / unitScale, SCENE_SCALE / unitScale])
      .rotate(pebbleYaw, [0, 1, 0])
      .rotate(-Math.PI / 2, [1, 0, 0])
      .translate([
        centre.x,
        centre.y +
          (mattressY + PEBBLE_SIZE.z / 2 - PEBBLE_BED_SINK) * SCENE_SCALE,
        centre.z,
      ]);
    transformManager.setTransform(model.rootEntity, transform);
  }, [asset, bed.cell, bed.rotSteps, item, model, transformManager]);

  return null;
}

function WalkingRoomAvatar({ avatarKind }: { avatarKind: RoomAvatarKind }) {
  const config = AVATAR_CONFIG[avatarKind];
  const maxExtent = Math.max(config.size.x, config.size.y, config.size.z);
  const bodyRadiusCells = Math.ceil((config.size.x / 2) / ROOM_SHELL.cellSize);
  const model = useModel(config.model);
  // useModel returns a fresh wrapper object on React re-renders; the loaded asset
  // has stable identity. Keying the animator to the asset prevents accidentally
  // creating a second native animator when furniture/layout state changes.
  const asset = model.state === "loaded" ? model.asset : null;
  const animator = useAnimator(asset ?? undefined);
  const { transformManager } = useFilamentContext();
  const animationIndex = useSharedValue<number>(config.animation.idle);
  const activeAnimationIndex = useSharedValue(-1);
  const activeAnimationRate = useSharedValue(1);
  const animationStartedAt = useSharedValue(0);
  const previousAnimationIndex = useSharedValue(-1);
  const previousAnimationRate = useSharedValue(1);
  const previousAnimationTime = useSharedValue(0);
  const transitionStartedAt = useSharedValue(0);
  const baseTransform = useRef<Mat4 | null>(null);
  const layout = usePlacementStore((state) => state.viewing?.layout ?? state.layout);
  const activeEdit = usePlacementStore((state) => state.activeEdit);
  const editing = activeEdit !== null;

  const blocked = useMemo(() => {
    const occupied = new Set<string>();
    const placements = activeEdit ? [...layout, activeEdit.placement] : layout;
    for (const placement of placements) {
      if (placement.surface.kind !== "floor") continue;
      const def = getRoomItemDef(placement.itemId);
      if (!def) continue;
      for (const cell of cellsFor(placement, def)) occupied.add(cellKey(cell));
    }
    return inflateBlocked(
      occupied,
      { w: FLOOR_CELLS.w, h: FLOOR_CELLS.d },
      bodyRadiusCells,
    );
  }, [activeEdit, bodyRadiusCells, layout]);

  const motion = useRef<Motion>({
    position: pointForCell({ x: 8, y: 8 }),
    yaw: Math.PI,
    path: [],
    idleUntil: 0,
    special: null,
    specialEligible: true,
  });
  const walkAnimationIndex = config.animation.walk;
  const walkPlaybackRate = config.animation.walkRate ?? 1;
  const walkWindowStart = config.animation.walkWindow?.start ?? 0;
  const walkWindowDuration = config.animation.walkWindow
    ? config.animation.walkWindow.end - config.animation.walkWindow.start
    : 0;

  RenderCallbackContext.useRenderCallback(
    ({ passedSeconds }) => {
      "worklet";
      if (!animator) return;
      const requested = animationIndex.value;
      const requestedRate =
        requested === walkAnimationIndex ? walkPlaybackRate : 1;
      if (activeAnimationIndex.value !== requested) {
        if (activeAnimationIndex.value >= 0) {
          previousAnimationIndex.value = activeAnimationIndex.value;
          previousAnimationRate.value = activeAnimationRate.value;
          const previousElapsed = Math.max(
            0,
            passedSeconds - animationStartedAt.value,
          );
          previousAnimationTime.value =
            activeAnimationIndex.value === walkAnimationIndex &&
            walkWindowDuration > 0
              ? walkWindowStart +
                ((previousElapsed * activeAnimationRate.value) %
                  walkWindowDuration)
              : previousElapsed * activeAnimationRate.value;
        }
        activeAnimationIndex.value = requested;
        activeAnimationRate.value = requestedRate;
        animationStartedAt.value = passedSeconds;
        transitionStartedAt.value = passedSeconds;
      }

      const elapsed = Math.max(0, passedSeconds - animationStartedAt.value);
      const animationTime =
        requested === walkAnimationIndex && walkWindowDuration > 0
          ? walkWindowStart +
            ((elapsed * requestedRate) % walkWindowDuration)
          : elapsed * requestedRate;
      animator.applyAnimation(requested, animationTime);

      if (previousAnimationIndex.value >= 0) {
        const transitionTime = passedSeconds - transitionStartedAt.value;
        if (transitionTime < ANIMATION_CROSS_FADE_SECONDS) {
          const previousTime =
            previousAnimationIndex.value === walkAnimationIndex &&
            walkWindowDuration > 0
              ? walkWindowStart +
                ((previousAnimationTime.value - walkWindowStart +
                  transitionTime * previousAnimationRate.value) %
                  walkWindowDuration)
              : previousAnimationTime.value +
                transitionTime * previousAnimationRate.value;
          animator.applyCrossFade(
            previousAnimationIndex.value,
            previousTime,
            transitionTime / ANIMATION_CROSS_FADE_SECONDS,
          );
        } else {
          previousAnimationIndex.value = -1;
        }
      }
      animator.updateBoneMatrices();
    },
    [
      activeAnimationIndex,
      activeAnimationRate,
      animationIndex,
      animationStartedAt,
      animator,
      previousAnimationIndex,
      previousAnimationRate,
      previousAnimationTime,
      transitionStartedAt,
      walkAnimationIndex,
      walkPlaybackRate,
      walkWindowDuration,
      walkWindowStart,
    ],
  );

  useEffect(() => {
    if (!asset || model.state !== "loaded") return;
    transformManager.transformToUnitCube(model.rootEntity, model.boundingBox);
    baseTransform.current = transformManager.getTransform(model.rootEntity);
  }, [asset, transformManager]);

  useEffect(() => {
    if (model.state !== "loaded" || !baseTransform.current) return;
    let frame = 0;
    let previous = performance.now();
    let stopped = false;
    const bounds = { w: FLOOR_CELLS.w, h: FLOOR_CELLS.d };
    const unitScale = 2 / maxExtent;

    const setAnimation = (index: number) => {
      if (animationIndex.value !== index) animationIndex.value = index;
    };

    const recoverFromCollision = (now: number): boolean => {
      const currentCell = roomPointToFloorCell({ ...motion.current.position });
      if (!blocked.has(cellKey(currentCell))) return false;
      const safeCell = nearestWalkable(currentCell, blocked, bounds);
      motion.current.path = [];
      motion.current.special = null;
      motion.current.specialEligible = false;
      motion.current.idleUntil = now + 500;
      if (safeCell) motion.current.position = pointForCell(safeCell);
      return true;
    };

    const choosePath = (): boolean => {
      const currentCell = nearestWalkable(
        roomPointToFloorCell({ ...motion.current.position }),
        blocked,
        bounds,
      );
      if (!currentCell) return false;
      motion.current.position = pointForCell(currentCell);
      motion.current.special = null;
      motion.current.specialEligible = false;
      const candidates: { x: number; y: number }[] = [];
      for (let x = 0; x < bounds.w; x += 1) for (let y = 0; y < bounds.h; y += 1) {
        if (!blocked.has(cellKey({ x, y }))) candidates.push({ x, y });
      }
      for (let attempt = 0; attempt < Math.min(24, candidates.length); attempt += 1) {
        const target = candidates[Math.floor(Math.random() * candidates.length)];
        const path = findPath(currentCell, target, blocked, bounds);
        if (!path || path.length < 4) continue;
        motion.current.path = path.map(pointForCell);
        return true;
      }
      return false;
    };

    const paint = () => {
      const state = motion.current;
      const centre = roomToScene({ x: state.position.x, y: ROOM_SHELL.floor.y, z: state.position.z });
      const transform = baseTransform.current!
        .scaling([SCENE_SCALE / unitScale, SCENE_SCALE / unitScale, SCENE_SCALE / unitScale])
        .rotate(state.yaw + MODEL_FORWARD_OFFSET, [0, 1, 0])
        .translate([
          centre.x,
          centre.y + ((config.size.y / 2) + FLOOR_CLEARANCE_METRES) * SCENE_SCALE,
          centre.z,
        ]);
      transformManager.setTransform(model.rootEntity, transform);
    };

    const tick = (now: number) => {
      if (stopped) return;
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.05, Math.max(0, (now - previous) / 1_000));
      previous = now;
      const state = motion.current;
      const recovering = recoverFromCollision(now);
      if (editing) {
        state.special = null;
        state.specialEligible = false;
        setAnimation(config.animation.idle);
        paint();
        return;
      }
      if (recovering) {
        setAnimation(config.animation.idle);
        paint();
        return;
      }

      if (state.special) {
        const phase = avatarMotionPhase({
          editing,
          recovering: false,
          hasPath: state.path.length > 0,
          turnError: 0,
          specialActive: now < state.special.until,
        });
        if (phase === "special") {
          setAnimation(state.special.index);
          paint();
          return;
        }
        state.special = null;
        state.idleUntil = now + 350;
      }

      if (state.path.length === 0) {
        setAnimation(config.animation.idle);
        if (now >= state.idleUntil) {
          if (state.specialEligible && config.specials.length > 0) {
            state.specialEligible = false;
            if (Math.random() < SPECIAL_ACTION_CHANCE) {
              const action = config.specials[Math.floor(Math.random() * config.specials.length)];
              state.special = { index: action.index, until: now + action.duration * 1_000 };
              setAnimation(action.index);
              paint();
              return;
            }
          }
          if (!choosePath()) state.idleUntil = now + 1_000;
        }
        paint();
        return;
      }
      const target = state.path[0];
      const dx = target.x - state.position.x;
      const dz = target.z - state.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= ARRIVAL_EPSILON) {
        state.position = target;
        state.path.shift();
        if (state.path.length === 0) {
          state.idleUntil = now + 1_200 + Math.random() * 1_800;
          state.specialEligible = true;
          setAnimation(config.animation.idle);
        }
        paint();
        return;
      }
      const targetYaw = Math.atan2(dx, dz);
      const turnError = shortestAngle(state.yaw, targetYaw);
      const phase = avatarMotionPhase({
        editing,
        recovering: false,
        hasPath: true,
        turnError,
        specialActive: false,
      });
      state.yaw += turnError * Math.min(1, TURN_SPEED * dt);
      if (phase === "turning") {
        setAnimation(config.animation.idle);
        paint();
        return;
      }
      const step = Math.min(distance, WALK_SPEED * dt);
      state.position = {
        x: state.position.x + (dx / distance) * step,
        z: state.position.z + (dz / distance) * step,
      };
      setAnimation(config.animation.walk);
      paint();
    };

    const now = performance.now();
    const pathInvalid = motion.current.path.some((point) =>
      blocked.has(cellKey(roomPointToFloorCell(point))),
    );
    if (pathInvalid) motion.current.path = [];
    recoverFromCollision(now);
    if (motion.current.idleUntil === 0) motion.current.idleUntil = now + 600;
    paint();
    frame = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, [animationIndex, asset, blocked, config, editing, maxExtent, transformManager]);

  return null;
}
