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
import {
  avatarMotionPhase,
  chooseDistinctSpecialAction,
  POST_PATH_STANDING_MS,
  shouldPlaySpecialAction,
} from "../character/avatarMotion";
import {
  roomAvatarKindForProfile,
  type RoomAvatarKind,
} from "../character/avatarChoice";
import {
  cellKey,
  cellsFor,
  floorCellToRoom,
  roomPointToFloorCell,
} from "../core/grid";
import { getRoomItemDef } from "../core/placeableItems";
import { usePlacementStore } from "../core/placement";
import { FLOOR_CELLS, ROOM_SHELL, SCENE_SCALE, roomToScene } from "../core/roomShell";
import { useGameStore } from "../../game/core/store";

const CAT_FOOTPRINT = { w: 1, d: 1 } as const;

type AvatarConfig = {
  model: number;
  size: { x: number; y: number; z: number };
  animation: {
    walk: number;
    idle: number;
    idleRate?: number;
    walkRate?: number;
    walkWindow?: { start: number; end: number };
  };
  specials: readonly { index: number; duration: number }[];
};

const AVATAR_CONFIG: Record<RoomAvatarKind, AvatarConfig> = {
  felix: {
    model: require("../../assets/models/avatars/cute-cat.glb"),
    size: { x: 0.797974, y: 0.979004, z: 0.697937 },
    // The refreshed export includes a clean, symmetric walk loop as
    // NlaTrack.003, replacing the old measured sub-window workaround. Freeze
    // the first frame of NlaTrack for a stable standing pose.
    animation: { walk: 3, idle: 0, idleRate: 0 },
    specials: [
      { index: 1, duration: 2.25 },
      { index: 2, duration: 3.708 },
      { index: 4, duration: 15.375 },
    ],
  },
  sparky: {
    model: require("../../assets/models/avatars/sparky.glb"),
    size: { x: 0.679871, y: 0.980042, z: 0.516876 },
    // The refreshed export preserves the previously verified walk cycle as
    // NlaTrack (index 0). Freeze the first frame of the arm-led long clip for
    // a stable standing pose instead of letting an idle performance twitch.
    animation: { walk: 0, idle: 2, idleRate: 0 },
    // Complete one-shot actions. Unified scheduling keeps them out of walking,
    // turning and furniture-edit states and prevents immediate repetition.
    specials: [
      { index: 1, duration: 2.083 },
      { index: 3, duration: 15.625 },
      { index: 4, duration: 2.208 },
    ],
  },
  lumi: {
    model: require("../../assets/models/avatars/lumi.glb"),
    size: { x: 0.719726, y: 0.979431, z: 0.636903 },
    // This Lumi export contains five clips. NlaTrack.004 is the symmetric,
    // alternating leg cycle used for navigation. A frozen first frame of the
    // arm-led NlaTrack.001 provides a stable standing pose between routes.
    animation: { walk: 4, idle: 1, idleRate: 0 },
    specials: [
      { index: 0, duration: 2.625 },
      { index: 2, duration: 17.625 },
    ],
  },
  pebble: {
    model: require("../../assets/models/avatars/pebble.glb"),
    size: { x: 0.827881, y: 0.97937, z: 0.674011 },
    // NlaTrack.003 is the short, leg-led locomotion cycle. Keep the long,
    // subtle NlaTrack.004 on its first frame while standing; the remaining
    // clips are complete one-shot actions governed by the shared scheduler.
    animation: { walk: 3, idle: 4, idleRate: 0 },
    specials: [
      { index: 0, duration: 2.625 },
      { index: 1, duration: 2.25 },
      { index: 2, duration: 9.125 },
    ],
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
const HIDDEN_SCENE_Y = -10;

type Point = { x: number; z: number };
type Motion = {
  position: Point;
  yaw: number;
  path: Point[];
  idleUntil: number;
  special: { index: number; until: number } | null;
  specialEligible: boolean;
  lastSpecialIndex: number | null;
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

  // A recommendation change must create fresh native model/animator state rather
  // than asking one Filament wrapper to change the asset underneath itself.
  return <WalkingRoomAvatar key={avatarKind} avatarKind={avatarKind} />;
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
    lastSpecialIndex: null,
  });
  const walkAnimationIndex = config.animation.walk;
  const walkPlaybackRate = config.animation.walkRate ?? 1;
  const idleAnimationIndex = config.animation.idle;
  const idlePlaybackRate = config.animation.idleRate ?? 1;
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
        requested === walkAnimationIndex
          ? walkPlaybackRate
          : requested === idleAnimationIndex
            ? idlePlaybackRate
            : 1;
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
      idleAnimationIndex,
      idlePlaybackRate,
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

    const recoverFromCollision = (
      now: number,
    ): "clear" | "recovered" | "unavailable" => {
      const currentCell = roomPointToFloorCell({ ...motion.current.position });
      if (!blocked.has(cellKey(currentCell))) return "clear";
      const safeCell = nearestWalkable(currentCell, blocked, bounds);
      motion.current.path = [];
      motion.current.special = null;
      motion.current.specialEligible = false;
      motion.current.idleUntil = now + 500;
      if (!safeCell) return "unavailable";
      motion.current.position = pointForCell(safeCell);
      return "recovered";
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

    const paint = (visible = true) => {
      const state = motion.current;
      const centre = roomToScene({ x: state.position.x, y: ROOM_SHELL.floor.y, z: state.position.z });
      const transform = baseTransform.current!
        .scaling([SCENE_SCALE / unitScale, SCENE_SCALE / unitScale, SCENE_SCALE / unitScale])
        .rotate(state.yaw + MODEL_FORWARD_OFFSET, [0, 1, 0])
        .translate([
          centre.x,
          visible
            ? centre.y + ((config.size.y / 2) + FLOOR_CLEARANCE_METRES) * SCENE_SCALE
            : HIDDEN_SCENE_Y,
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
      const recovery = recoverFromCollision(now);
      if (recovery === "unavailable") {
        setAnimation(config.animation.idle);
        paint(false);
        return;
      }
      if (editing) {
        state.special = null;
        state.specialEligible = false;
        setAnimation(config.animation.idle);
        paint();
        return;
      }
      if (recovery === "recovered") {
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
            if (shouldPlaySpecialAction()) {
              const action = chooseDistinctSpecialAction(
                config.specials,
                state.lastSpecialIndex,
              );
              if (action) {
                state.lastSpecialIndex = action.index;
                state.special = { index: action.index, until: now + action.duration * 1_000 };
                setAnimation(action.index);
                paint();
                return;
              }
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
          state.idleUntil = now + POST_PATH_STANDING_MS;
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
    const initialRecovery = recoverFromCollision(now);
    if (motion.current.idleUntil === 0) {
      motion.current.idleUntil = now + POST_PATH_STANDING_MS;
    }
    paint(initialRecovery !== "unavailable");
    frame = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, [animationIndex, asset, blocked, config, editing, maxExtent, transformManager]);

  return null;
}
