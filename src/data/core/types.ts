// App-facing domain types for the data layer — deliberately decoupled from Supabase row shapes (snake_case in src/services) so features never depend on the backend schema.
import type { ActionId, AssemblyMode, FurnitureId } from "@/src/game/core/type";
import type { ProfileId } from "@/src/game/core/profile";

export type UserId = string;

// The open id space of EVERY catalog furniture — buildable (a FurnitureId) or store-only (e.g. "malm-chest"). Room placements and store/catalog ownership span this; the assembly engine uses the narrower FurnitureId (⊂ CatalogId).
export type CatalogId = string;

// A player's profile: shown on your own profile page and when visiting a friend's.
export interface Profile {
  userId: UserId;
  username: string | null;
  // The onboarding helping-mode that also selects the avatar image (see avatar-recommendation).
  avatarMode: ProfileId | null;
  level: number;
  coins: number;
  xp: number;
  onboardingCompleted: boolean;
  // One-off HUD coach: this account has been shown that the Map button leads back to the project map
  // and the catalogue. On the PROFILE rather than in AsyncStorage — the room's coaches are
  // per-install and rerun on a second device, which for "here is where that button is" reads as the
  // app having forgotten the player.
  mapCoachSeen: boolean;
  // A short flavour rank shown under the avatar. DERIVED from level via the levels table (see levels.ts) and filled by the adapter on read — never stored per user.
  title: string | null;
  // How far xp has climbed into the current level. DERIVED from xp via the same levels table, and filled by the adapter on read exactly like title.
  xpIntoLevel: number;
  // The xp span of the current level, or null at the top of the curve — where a progress bar should read as full, not as 0%.
  xpForNextLevel: number | null;
  // Cached aggregate — count of user_build. Change it via builds.complete(), not update().
  itemsAssembled: number;
  // Cached aggregate — count of room_likes. Change it via likes.like()/unlike(), not update().
  likes: number;
}

// The directly-writable profile fields. Two groups are excluded, for two different reasons. Derived / cached aggregates (title, xpIntoLevel, xpForNextLevel, itemsAssembled, likes) are maintained by their own repos. coins/xp/level are ECONOMY state and deliberately NOT writable here: they move only through purchase_item and reward_build, which price the transaction server-side from auth.uid(). A client-writable patch would let a modded client mint its own balance, and the DB now revokes those columns to match (migration 009_grants.sql).
export type ProfilePatch = Partial<
  Pick<Profile, "username" | "avatarMode" | "onboardingCompleted" | "mapCoachSeen">
>;

// Which grid a placement lives on. Walls are named for the PLANE they occupy in the shell (src/room/core/roomShell.ts), not by compass point — these strings persist. The furniture variant (a vase on a cabinet) is reserved so adding it later is not a data migration; nothing builds it yet.
export type PlacementSurface =
  | { kind: "floor" }
  // Widening this to all four walls is additive: every layout saved when only x-min and z-max existed still parses unchanged.
  | { kind: "wall"; wall: "x-min" | "x-max" | "z-min" | "z-max" }
  | { kind: "furniture"; hostInstanceId: string; slot: string };

// One furniture instance placed in a room — GRID coordinates, not screen or world space, so a layout renders identically on every device and survives any camera change.
export interface PlacedFurniture {
  instanceId: string;
  // A placed piece can be ANY catalog furniture — buildable or store-only — so this is CatalogId, not the narrow FurnitureId.
  furnitureId: CatalogId;
  surface: PlacementSurface;
  // Anchor cell on the surface's grid, min-corner convention.
  cell: { x: number; y: number };
  // Quarter turns; floor items only, wall items face outward.
  rotSteps: 0 | 1 | 2 | 3;
  // The chosen color variant (a colors.id, e.g. "white"). Undefined = the furniture's default variant / no color axis.
  color?: string;
  // Whether THIS lamp is switched on, for pieces that emit light (category 'lit'). Undefined means ON, which is what makes the field free to add: every row saved before it existed reads as a lit lamp, which is what those rooms already looked like, so no layout version bump and no migration. Only `false` is ever written — see fromGrid, which omits it otherwise. Per INSTANCE, deliberately: item_lights is keyed by item, so two of the same lamp in one room could never differ, and "switch that one off" is the whole point.
  lightOn?: boolean;
}

// Bump when cell dimensions or surface semantics change; loaders treat any other version as an empty room rather than mis-reading old rows (user_room.placements is unvalidated jsonb). v2 (2026-08-04): floor cells quartered from 0.5 m to 0.25 m — v1 floor anchors double on read (src/data/room/layoutMigrate.ts).
export const ROOM_LAYOUT_VERSION = 2;

// The persisted contents of a room, keyed by its owner. Fetched by ownerId so one RoomScene renders yours (editable) or a friend's (read-only).
export interface RoomLayout {
  ownerId: UserId;
  version: typeof ROOM_LAYOUT_VERSION;
  placements: PlacedFurniture[];
  // The room's chosen surface items — a floor and a wall shop item id. Optional, and an unset slot means the shell AS AUTHORED rather than a default item: a room with no finishes does zero texture work at load and renders byte-identically to before the feature existed. Read with readRoomFinishes (src/data/room/layoutMigrate.ts), which validates shape only. Deliberately duplicates the shape from layoutMigrate.ts: types.ts is upstream and does not import downstream modules.
  finishes?: { floor?: string; wall?: string };
  // ISO-8601 timestamp of the last save.
  updatedAt: string;
}

// A friend edge. Render a friends list by fetching each id's Profile via ProfileRepo.getMany.
export interface Friend {
  userId: UserId;
  since: string;
}

// A pending friend request. Render a list by fetching each id's Profile via ProfileRepo.getMany, exactly as Friend is rendered.
export interface FriendRequest {
  fromId: UserId;
  toId: UserId;
  // ISO-8601. Only for ordering and display; the (fromId, toId) pair is the identity.
  createdAt: string;
}

// A resumable in-progress assembly: which furniture, what's done, and partial in-gesture progress. One per (owner, furniture); cleared when the build completes or is abandoned.
export interface BuildSave {
  ownerId: UserId;
  furnitureId: FurnitureId;
  // The completed actions — the source of truth for how far the build got.
  completed: ActionId[];
  // Partial gesture progress so a half-tightened screw / half-slid drawer survives a break.
  tightenDeg: Record<ActionId, number>;
  orientationDeg: Record<ActionId, number>;
  driveProgress: Record<ActionId, number>;
  mode: AssemblyMode;
  // ISO-8601 timestamp of the last autosave.
  updatedAt: string;
}