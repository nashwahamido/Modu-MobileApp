// app-facing domain types, decoupled from the snake_case rows so features never depend on the schema
import type { ActionId, AssemblyMode, FurnitureId } from "@/src/game/core/type";
import type { ProfileId } from "@/src/game/core/profile";

export type UserId = string;

export type CatalogId = string;

// shown on your own profile page and when visiting a friend's room
export interface Profile {
  userId: UserId;
  username: string | null;
  avatarMode: ProfileId | null;
  level: number;
  coins: number;
  xp: number;
  onboardingCompleted: boolean;
  mapCoachSeen: boolean;
  title: string | null;
  xpIntoLevel: number;
  xpForNextLevel: number | null;
  itemsAssembled: number;
  likes: number;
}

// coins/xp/level are economy state — they move only through purchase_item and reward_build, priced from auth.uid()
export type ProfilePatch = Partial<
  Pick<
    Profile,
    "username" | "avatarMode" | "onboardingCompleted" | "mapCoachSeen"
  >
>;

// the furniture variant (a vase on a cabinet) is reserved, so adding it later is not a migration
export type PlacementSurface =
  | { kind: "floor" }
  // widening to all four walls is additive — layouts saved with only x-min and z-max still parse
  | { kind: "wall"; wall: "x-min" | "x-max" | "z-min" | "z-max" }
  | { kind: "furniture"; hostInstanceId: string; slot: string };

// grid coordinates, not screen or world space, so a layout renders identically on every device
export interface PlacedFurniture {
  instanceId: string;
  // a placed piece can be ANY catalog furniture, buildable or store-only
  furnitureId: CatalogId;
  surface: PlacementSurface;
  // anchor cell on the surface's grid, min-corner convention
  cell: { x: number; y: number };
  // quarter turns; floor items only, wall items face outward
  rotSteps: 0 | 1 | 2 | 3;
  // undefined = the furniture's default variant, or no colour axis at all
  color?: string;
  // undefined means ON, which made the field free to add — only `false` is ever written
  // per instance deliberately: item_lights is keyed by item, and "switch that one off" is the point
  lightOn?: boolean;
}

// bump when cell dimensions or surface semantics change — any other version reads as an EMPTY room
// v2: floor cells quartered from 0.5 m to 0.25 m, so v1 anchors double on read (room/layoutMigrate.ts)
export const ROOM_LAYOUT_VERSION = 2;

// keyed by owner, so one RoomScene renders yours (editable) or a friend's (read-only)
export interface RoomLayout {
  ownerId: UserId;
  version: typeof ROOM_LAYOUT_VERSION;
  placements: PlacedFurniture[];
  // a floor and a wall shop item id — an unset slot means the shell as authored, so no texture work
  // read with readRoomFinishes (room/layoutMigrate.ts); duplicated there, since types.ts imports nothing downstream
  finishes?: { floor?: string; wall?: string };
  updatedAt: string;
}

// a friend edge — render a list by fetching each id's Profile via ProfileRepo.getMany
export interface Friend {
  userId: UserId;
  since: string;
}

// a pending friend request, rendered exactly as Friend is
export interface FriendRequest {
  fromId: UserId;
  toId: UserId;
  // ISO-8601, for ordering and display only — the (fromId, toId) pair is the identity
  createdAt: string;
}

// a resumable in-progress assembly, one per (owner, furniture), cleared on completion or abandon
export interface BuildSave {
  ownerId: UserId;
  furnitureId: FurnitureId;
  // the completed actions — the source of truth for how far the build got
  completed: ActionId[];
  // partial gesture progress, so a half-tightened screw survives a break
  tightenDeg: Record<ActionId, number>;
  orientationDeg: Record<ActionId, number>;
  driveProgress: Record<ActionId, number>;
  mode: AssemblyMode;
  // ISO-8601 timestamp of the last autosave
  updatedAt: string;
}
