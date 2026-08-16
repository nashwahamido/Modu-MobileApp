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
  roomAvatarKindForProfile,
  type RoomAvatarKind,
} from "../character/avatarChoice";
import { cellKey, cellsFor, floorCellToRoom, roomPointToFloorCell } from "../core/grid";
import { getRoomItemDef } from "../core/placeableItems";
import { usePlacementStore } from "../core/placement";
import { FLOOR_CELLS, ROOM_SHELL, SCENE_SCALE, roomToScene } from "../core/roomShell";
import { useGameStore } from "../../game/core/store";

const CAT_FOOTPRINT = { w: 1, d: 1 } as const;

const AVATAR_CONFIG = {
  felix: {
    model: require("../../assets/models/avatars/cute-cat.glb"),
    size: { x: 0.667114, y: 0.979554, z: 0.506043 },
    // Optimized Felix: NlaTrack is idle; NlaTrack.001 is walk.
    animation: { walk: 1, idle: 0 },
  },
  sparky: {
    model: require("../../assets/models/avatars/sparky.glb"),
    size: { x: 0.679871, y: 0.980042, z: 0.516876 },
    // Optimized Sparky: the long NlaTrack is idle; NlaTrack.002 is the
    // symmetric, seamless leg-driven walk cycle.
    animation: { walk: 2, idle: 0 },
  },
} as const;

// This GLB's authored forward axis already matches the yaw convention below:
// yaw 0 walks toward +Z. Adding PI made the cat face away from every target and
// therefore appear to moonwalk along an otherwise-correct path.
const MODEL_FORWARD_OFFSET = 0;
const WALK_SPEED = 0.55;
const TURN_SPEED = 7;
const ARRIVAL_EPSILON = 0.025;

type Point = { x: number; z: number };
type Motion = { position: Point; yaw: number; path: Point[]; idleUntil: number };

const shortestAngle = (from: number, to: number): number =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from));

const pointForCell = (cell: { x: number; y: number }): Point => {
  const point = floorCellToRoom(cell, CAT_FOOTPRINT);
  return { x: point.x, z: point.z };
};

export function RoomAvatar() {
  const avatarKind = useGameStore((state) => roomAvatarKindForProfile(state.profile));

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
  const baseTransform = useRef<Mat4 | null>(null);
  const layout = usePlacementStore((state) => state.viewing?.layout ?? state.layout);
  const editing = usePlacementStore((state) => state.activeEdit !== null);

  const blocked = useMemo(() => {
    const occupied = new Set<string>();
    for (const placement of layout) {
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
  }, [bodyRadiusCells, layout]);

  const motion = useRef<Motion>({
    position: pointForCell({ x: 8, y: 8 }),
    yaw: Math.PI,
    path: [],
    idleUntil: 0,
  });

  RenderCallbackContext.useRenderCallback(
    ({ passedSeconds }) => {
      "worklet";
      if (!animator) return;
      animator.applyAnimation(animationIndex.value, passedSeconds);
      animator.updateBoneMatrices();
    },
    [animator, animationIndex],
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

    const choosePath = (): boolean => {
      const currentCell = nearestWalkable(
        roomPointToFloorCell({ ...motion.current.position }),
        blocked,
        bounds,
      );
      if (!currentCell) return false;
      motion.current.position = pointForCell(currentCell);
      const candidates: { x: number; y: number }[] = [];
      for (let x = 0; x < bounds.w; x += 1) for (let y = 0; y < bounds.h; y += 1) {
        if (!blocked.has(cellKey({ x, y }))) candidates.push({ x, y });
      }
      for (let attempt = 0; attempt < Math.min(24, candidates.length); attempt += 1) {
        const target = candidates[Math.floor(Math.random() * candidates.length)];
        const path = findPath(currentCell, target, blocked, bounds);
        if (!path || path.length < 4) continue;
        motion.current.path = path.map(pointForCell);
        setAnimation(config.animation.walk);
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
        .translate([centre.x, centre.y + (config.size.y * SCENE_SCALE) / 2, centre.z]);
      transformManager.setTransform(model.rootEntity, transform);
    };

    const tick = (now: number) => {
      if (stopped) return;
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.05, Math.max(0, (now - previous) / 1_000));
      previous = now;
      const state = motion.current;
      if (editing) {
        setAnimation(config.animation.idle);
        paint();
        return;
      }
      if (state.path.length === 0) {
        setAnimation(config.animation.idle);
        if (now >= state.idleUntil && !choosePath()) state.idleUntil = now + 1_000;
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
          setAnimation(config.animation.idle);
        }
        paint();
        return;
      }
      const targetYaw = Math.atan2(dx, dz);
      state.yaw += shortestAngle(state.yaw, targetYaw) * Math.min(1, TURN_SPEED * dt);
      const step = Math.min(distance, WALK_SPEED * dt);
      state.position = {
        x: state.position.x + (dx / distance) * step,
        z: state.position.z + (dz / distance) * step,
      };
      setAnimation(config.animation.walk);
      paint();
    };

    motion.current.path = [];
    motion.current.idleUntil = performance.now() + 600;
    paint();
    frame = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, [animationIndex, asset, blocked, config, editing, maxExtent, transformManager]);

  return null;
}
