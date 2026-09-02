/* eslint-disable @typescript-eslint/no-require-imports */
import type { RoomAvatarKind } from "./avatarChoice";

export type AvatarConfig = {
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

// Animation indexes follow the track order in each GLB export.
export const AVATAR_CONFIG: Record<RoomAvatarKind, AvatarConfig> = {
  felix: {
    model: require("../../assets/models/avatars/cute-cat.glb"),
    size: { x: 0.797974, y: 0.979004, z: 0.697937 },
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
    animation: { walk: 0, idle: 2, idleRate: 0 },
    specials: [
      { index: 1, duration: 2.083 },
      { index: 3, duration: 15.625 },
      { index: 4, duration: 2.208 },
    ],
  },
  lumi: {
    model: require("../../assets/models/avatars/lumi.glb"),
    size: { x: 0.719726, y: 0.979431, z: 0.636903 },
    animation: { walk: 4, idle: 1, idleRate: 0 },
    specials: [
      { index: 0, duration: 2.625 },
      { index: 2, duration: 17.625 },
    ],
  },
  pebble: {
    model: require("../../assets/models/avatars/pebble.glb"),
    size: { x: 0.827881, y: 0.97937, z: 0.674011 },
    animation: { walk: 3, idle: 4, idleRate: 0 },
    specials: [
      { index: 0, duration: 2.625 },
      { index: 1, duration: 2.25 },
      { index: 2, duration: 9.125 },
    ],
  },
};

export const AVATAR_WALK_SPEED = 0.55;
export const AVATAR_TURN_SPEED = 7;
export const AVATAR_ARRIVAL_EPSILON = 0.025;
export const AVATAR_CROSS_FADE_SECONDS = 0.18;
export const AVATAR_FLOOR_CLEARANCE_METRES = 0.005;
