// The data-access seam. Features depend ONLY on these interfaces; swapping the in-memory adapter for a Supabase one is a single change in ./index.
import type { BrandId, FurnitureId } from "@/src/game/core/type";
import type { ItemSource } from "./catalogAssets";
import type { ShopCategory, ShopItem, ShopItemId } from "./shopItems";
import type { BuildSave, CatalogId, Friend, FriendRequest, Profile, ProfilePatch, RoomLayout, UserId } from "./types";

export interface ProfileRepo {
  get(userId: UserId): Promise<Profile | null>;
  // Batch fetch so a friends list renders without N round-trips.
  getMany(userIds: UserId[]): Promise<Profile[]>;
  update(userId: UserId, patch: ProfilePatch): Promise<Profile>;
  // The one way to find a player you are not already connected to. EXACT match: username is unique, so this rides that index and there is no result list to page or cap. Null when nobody has that name.
  findByUsername(username: string): Promise<Profile | null>;
}

export interface RoomLayoutRepo {
  // Returns an empty layout (no placements) when the owner has none yet — never null, so callers don't special-case.
  get(ownerId: UserId): Promise<RoomLayout>;
  save(ownerId: UserId, layout: RoomLayout): Promise<void>;
}

export interface FriendsRepo {
  list(userId: UserId): Promise<Friend[]>;
  // ONE directed edge, and therefore HALF a friendship. Fixtures and dev tooling only: the app creates friendships through FriendRequestsRepo.accept, because RLS forbids a client from writing the other party's edge. Calling this to "add a friend" puts them in your list and leaves you absent from theirs.
  add(userId: UserId, friendId: UserId): Promise<void>;
  remove(userId: UserId, friendId: UserId): Promise<void>;
}

// The consent step in front of FriendsRepo. It exists because a client CANNOT create a mutual friendship: friends holds directed edges and its RLS only permits writing your own outgoing row, so the second edge is written server-side by accept_friend_request (migration 013).
export interface FriendRequestsRepo {
  // Requests addressed to this user — the inbox behind the "Friend requests" tab.
  listIncoming(userId: UserId): Promise<FriendRequest[]>;
  // Requests this user has sent, so a search result reads "Requested" instead of offering to send again.
  listOutgoing(userId: UserId): Promise<FriendRequest[]>;
  // Repeat sends are the same intent as the first and resolve to a single request.
  send(fromId: UserId, toId: UserId): Promise<void>;
  // Writes BOTH friend edges. Throws when no request is pending, because the request IS the consent.
  // recipientId is here for the in-memory adapter, which has no session to read. The Supabase adapter IGNORES it and sends only requesterId: the recipient MUST come from auth.uid() inside the RPC, and a caller-supplied recipient would let anyone befriend two accounts that never agreed.
  accept(recipientId: UserId, requesterId: UserId): Promise<void>;
  // Reject (as recipient) or cancel (as sender) — one row delete under two names.
  withdraw(fromId: UserId, toId: UserId): Promise<void>;
}

export interface BuildProgressRepo {
  // Every in-progress build for a user — powers a "continue building" shelf.
  list(ownerId: UserId): Promise<BuildSave[]>;
  // The save for one furniture, or null if none is in progress.
  get(ownerId: UserId, furnitureId: FurnitureId): Promise<BuildSave | null>;
  save(save: BuildSave): Promise<void>;
  // Abandon: drop the in-progress save without recording a completion.
  clear(ownerId: UserId, furnitureId: FurnitureId): Promise<void>;
  // Finish: record a completed build (backs assembly_count) AND clear its in-progress save.
  complete(ownerId: UserId, furnitureId: FurnitureId): Promise<void>;
  // Grant a finished furniture's reward, exactly once per (owner, furniture). Idempotent: a repeat
  // call is a no-op that returns alreadyRewarded=true. The AMOUNT is server-authoritative (read from
  // item_build) — the caller only supplies the id.
  reward(ownerId: UserId, furnitureId: FurnitureId): Promise<BuildReward>;
  // The configured reward for a furniture (coins + XP), for the completion screen to display the same
  // amount the grant will use. Zero when the item has no reward configured.
  buildReward(furnitureId: FurnitureId): Promise<BuildRewardAmount>;
  // Push a recipe's derived counts to the catalog. The local bundle is the SOURCE — these are computed from the recipe, so the DB copy is a mirror refreshed on load. step_count is load-bearing (the DB reward is step_count × a DB-authored rate); stage and cluster counts are there so the catalog reflects the real recipes for inspection. Fire-and-forget.
  syncCounts(furnitureId: FurnitureId, counts: SyncedCounts): Promise<void>;
  // The furniture this user has finished — the record behind assembly_count.
  listCompleted(ownerId: UserId): Promise<FurnitureId[]>;
  // The same finished furniture, WITH the catalog row that describes it. Same source as listCompleted, joined to the catalog — display text comes from the backend rather than the local recipe bundle, so a rename lands without shipping an app build.
  listCompletedItems(ownerId: UserId): Promise<BuiltItem[]>;
}

// A finished build as the catalog describes it: the "built" half of a player's inventory. No price — built furniture is earned, not bought.
export type BuiltItem = { id: FurnitureId; name: string; category: ShopCategory };

// The counts a recipe derives locally and mirrors into the catalog. Never read back for display — the bundle already knows them, and its copy is always current.
export type SyncedCounts = { stepCount: number; stageCount: number; clusterCount: number };

// The reward a build is worth (what the screen shows and the grant applies).
export type BuildRewardAmount = { coins: number; xp: number };
// The result of granting a finished build's reward. alreadyRewarded=true means the build was
// already rewarded (idempotent no-op); coins/xp are the profile's totals after the grant.
export type BuildReward = { coins: number; xp: number; alreadyRewarded: boolean };

// A buildable furniture's catalogue row. The DB is the SINGLE SOURCE for all of it — the bundle keeps only
// what it must (the thumbnail asset, and the counts it derives from the recipe), so editing a row here
// changes the catalogue without an app build.
export type BuildCatalogRow = {
  id: FurnitureId;
  name: string;
  brand: BrandId;
  // Display copy from furniture_types.name, e.g. "Shelf & Cabinet". Null when the row has no type set.
  type: string | null;
  // Estimated build minutes — hand-authored curation, never derived, so the client only ever reads it.
  durationMin: number;
  link?: string;
};

export interface CatalogRepo {
  // Every buildable furniture, reference data identical for all players. Read once at boot and cached — the
  // in-game screens need a name synchronously mid-build and cannot await a round trip.
  listBuilds(): Promise<BuildCatalogRow[]>;
  // Every item the room can place, from placeable_items — only rows with an authored size; items
  // without one (tutorial, surfaces) are simply absent. Reference data, cached like the above.
  listPlaceables(): Promise<PlaceableRoomRow[]>;
}

// One placeable_items row's room-placement metadata: the item's measured world-AABB size in authored meters (x = width, z = depth at rotSteps 0) and the lift from its origin to its base. The room derives footprint and scale from these — the DB stores only what a tool measures. category routes the SURFACE: 'window' rows place on walls (hole footprint derived from size on the fine wall grid); everything else stands on the floor. Rows cached before this field existed may lack it — consumers treat a missing category as a floor item.
export type PlaceableRoomRow = {
  id: CatalogId;
  source: ItemSource;
  category?: ShopCategory;
  size: { x: number; y: number; z: number };
  baseOffsetY: number;
  /** Which cells of the derived w×d footprint are solid — d rows of w 'X'/'.' chars joined with '/', at rotSteps 0, row 0 the -y edge (placeable_items.footprint_mask, migration 015). Absent = solid rectangle, true of every convex item. */
  footprintMask?: string;
  /** Present only for category 'lit' (Lighting) — one item_lights row, joined in by the placeable_items view. Absent means the item emits nothing, which is every item but a lamp. A 'lit' row without this is a seeding mistake (see the audit query in migration 012), and the room degrades to placing it as ordinary furniture. */
  light?: RoomItemLight;
};

// A lamp's light, as authored in item_lights. `lumens` is calibrated by eye, NOT physical — Filament scales by camera exposure and react-native-filament does not bridge setExposure, so no derived value predicts on-screen brightness. `reachMetres` is in authored metres; the renderer scales it into scene units. `coneDeg` is set for 'spot' and absent for 'point'.
export type RoomItemLight = {
  type: "point" | "spot";
  lumens: number;
  kelvin: number;
  reachMetres: number;
  coneDeg?: number;
  /** Where the bulb sits inside the piece, in authored metres from its BASE — not from the model's own origin, since the room places furniture by its base. So `bulb.y` reads as plain height up the lamp whatever the GLB was authored around. */
  bulb: { x: number; y: number; z: number };
  /** Aim, for a spot. Absent for a point, which has no direction at all. Degrees, in the piece's own space at rotSteps 0 — see src/room/core/lightAim.ts and the convention block in migration 014, which is the contract with the workshop portal. */
  aim?: { pitchDeg: number; yawDeg: number };
};

// One row of item_variants: an item's colour/finish axis. `variation` is the free-form per-item key
// that IS the storage path segment (white, oak, black, ...); null = the item has a single model, at
// the 'default' segment. Asset paths are derived from it, never stored — see catalogAssets.ts.
export type ItemVariant = {
  itemId: CatalogId;
  variation: string | null;
  isDefault: boolean;
};

export interface VariantsRepo {
  // The WHOLE variant table in one round trip: it is reference data, a couple of rows per item, and
  // every consumer (a tile, a placement swatch row) needs it synchronously — so it is cached client-side
  // rather than queried per item. See variantStore.ts.
  list(): Promise<ItemVariant[]>;
}

export interface RoomLikesRepo {
  // Like / unlike a room. The owner's user_profile.likes is a cache kept in sync by these.
  like(roomOwnerId: UserId, likerId: UserId): Promise<void>;
  unlike(roomOwnerId: UserId, likerId: UserId): Promise<void>;
  hasLiked(roomOwnerId: UserId, likerId: UserId): Promise<boolean>;
  count(roomOwnerId: UserId): Promise<number>;
}

// The outcome of a purchase attempt. insufficient_coins / already_owned are expected
// domain results (returned, not thrown) so the UI can show them without a try/catch.
export type PurchaseOutcome =
  | { ok: true; coinsRemaining: number }
  | { ok: false; reason: "insufficient_coins" | "already_owned" | "level_locked" };

export interface StoreRepo {
  // The purchasable catalog — reference data, the same for everyone.
  listItems(): Promise<ShopItem[]>;
  // The item ids this user already owns (their inventory).
  listOwned(userId: UserId): Promise<ShopItemId[]>;
  // Spend coins to buy an item. Atomic: checks balance + ownership, deducts coins, grants the item.
  purchase(userId: UserId, itemId: ShopItemId): Promise<PurchaseOutcome>;
}

// The bundle every feature reaches through. One object, swappable behind ./index.
export interface Repos {
  catalog: CatalogRepo;
  profiles: ProfileRepo;
  rooms: RoomLayoutRepo;
  friends: FriendsRepo;
  friendRequests: FriendRequestsRepo;
  builds: BuildProgressRepo;
  likes: RoomLikesRepo;
  store: StoreRepo;
  variants: VariantsRepo;
}
