// App-facing domain types for the data layer — deliberately decoupled from Supabase row shapes (snake_case in src/services) so features never depend on the backend schema.
import type { ActionId, AssemblyMode, FurnitureId } from "@/src/game/core/type";
import type { ProfileId } from "@/src/game/core/profile";

export type UserId = string;

// The open id space of EVERY catalog furniture — buildable (a FurnitureId) or store-only (e.g. "malm-chest").
// Room placements and store/catalog ownership span this; the assembly engine uses the narrower FurnitureId (⊂ CatalogId).
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

// The directly-writable profile fields. Two groups are excluded, for two different reasons.
// Derived / cached aggregates (title, xpIntoLevel, xpForNextLevel, itemsAssembled, likes) are maintained by their own repos.
// coins/xp/level are ECONOMY state and deliberately NOT writable here: they move only through purchase_item and reward_build, which price the transaction server-side from auth.uid(). A client-writable patch would let a modded client mint its own balance, and the DB now revokes those columns to match (migration 20260726040000).
export type ProfilePatch = Partial<
  Pick<Profile, "username" | "avatarMode" | "onboardingCompleted">
>;

// One furniture instance placed in a room. Position is normalized room-space, NOT screen pixels.
export interface PlacedFurniture {
  instanceId: string;
  // A placed piece can be ANY catalog furniture — buildable or store-only — so this is CatalogId, not the narrow FurnitureId.
  furnitureId: CatalogId;
  position: { x: number; y: number };
  // Yaw around the vertical axis, in radians.
  rotation: number;
  scale?: number;
  // The chosen color variant (a colors.id, e.g. "white"). Undefined = the furniture's default variant / no color axis.
  color?: string;
}

// The persisted contents of a room, keyed by its owner. Fetched by ownerId so one RoomScene renders yours (editable) or a friend's (read-only).
export interface RoomLayout {
  ownerId: UserId;
  placements: PlacedFurniture[];
  // ISO-8601 timestamp of the last save.
  updatedAt: string;
}

// A friend edge. Render a friends list by fetching each id's Profile via ProfileRepo.getMany.
export interface Friend {
  userId: UserId;
  since: string;
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
