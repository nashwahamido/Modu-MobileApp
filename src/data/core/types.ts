// app-facing domain types, decoupled from the snake_case row shapes so features never depend on the backend schema
import type { ActionId, AssemblyMode, FurnitureId } from "@/src/game/core/type";
import type { ProfileId } from "@/src/game/core/profile";

export type UserId = string;

// EVERY catalog furniture — buildable or store-only. the assembly engine uses the narrower FurnitureId (⊂ CatalogId)
export type CatalogId = string;

// shown on your own profile page and when visiting a friend's
export interface Profile {
  userId: UserId;
  username: string | null;
  // the onboarding helping-mode that also selects the avatar image
  avatarMode: ProfileId | null;
  level: number;
  coins: number;
  xp: number;
  onboardingCompleted: boolean;
  // one-off HUD coach: this account has been shown that the Map button leads back to the map and catalogue
  // on the PROFILE, not AsyncStorage — a per-install flag reruns on a second device and reads as having forgotten them
  mapCoachSeen: boolean;
  // a short flavour rank under the avatar — DERIVED from level via the levels table, filled on read, never stored
  title: string | null;
  // how far xp has climbed into the current level — derived and filled on read exactly like title
  xpIntoLevel: number;
  // the xp span of the current level, or null at the top of the curve, where a bar should read full rather than 0%
  xpForNextLevel: number | null;
  // cached aggregate — count of user_build. move it via builds.complete(), not update()
  itemsAssembled: number;
  // cached aggregate — count of room_likes. move it via likes.like()/unlike(), not update()
  likes: number;
}

// the derived aggregates are maintained by their own repos, and coins/xp/level are ECONOMY state
// economy moves only through purchase_item and reward_build, priced from auth.uid() — the DB revokes those columns
export type ProfilePatch = Partial<
  Pick<Profile, "username" | "avatarMode" | "onboardingCompleted" | "mapCoachSeen">
>;

// walls are named for the PLANE they occupy, not by compass point — these strings persist
// the furniture variant (a vase on a cabinet) is reserved so adding it later is not a data migration
export type PlacementSurface =
  | { kind: "floor" }
  // widening to all four walls is additive: layouts saved when only x-min and z-max existed still parse unchanged
  | { kind: "wall"; wall: "x-min" | "x-max" | "z-min" | "z-max" }
  | { kind: "furniture"; hostInstanceId: string; slot: string };

// GRID coordinates, not screen or world space, so a layout renders identically on every device and survives the camera
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
  // undefined means ON, which is what made the field free to add — rooms saved before it read as lit, only `false` is written
  // per INSTANCE deliberately: item_lights is keyed by item, and "switch that one off" is the whole point
  lightOn?: boolean;
}

// bump when cell dimensions or surface semantics change — any other version reads as an EMPTY room
// v2 (2026-08-04): floor cells quartered from 0.5 m to 0.25 m, so v1 anchors double on read (room/layoutMigrate.ts)
export const ROOM_LAYOUT_VERSION = 2;

// keyed by owner, so one RoomScene renders yours (editable) or a friend's (read-only)
export interface RoomLayout {
  ownerId: UserId;
  version: typeof ROOM_LAYOUT_VERSION;
  placements: PlacedFurniture[];
  // a floor and a wall shop item id — an unset slot means the shell AS AUTHORED, so no finishes does zero texture work
  // read with readRoomFinishes (room/layoutMigrate.ts); the shape is duplicated there since types.ts imports nothing downstream
  finishes?: { floor?: string; wall?: string };
  // ISO-8601 timestamp of the last save
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

// a resumable in-progress assembly, one per (owner, furniture), cleared when the build completes or is abandoned
export interface BuildSave {
  ownerId: UserId;
  furnitureId: FurnitureId;
  // the completed actions — the source of truth for how far the build got
  completed: ActionId[];
  // partial gesture progress, so a half-tightened screw or half-slid drawer survives a break
  tightenDeg: Record<ActionId, number>;
  orientationDeg: Record<ActionId, number>;
  driveProgress: Record<ActionId, number>;
  mode: AssemblyMode;
  // ISO-8601 timestamp of the last autosave
  updatedAt: string;
}
