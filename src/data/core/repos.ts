// The data-access seam. Features depend ONLY on these interfaces; swapping the in-memory adapter for a Supabase one is a single change in ./index.
import type { BrandId, FurnitureId } from "@/src/game/core/type";
import type { ItemSource } from "../catalog/assets";
import type { ShopCategory, ShopItem, ShopItemId } from "../shop/items";
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
  // Writes BOTH friend edges. Throws when no request is pending, because the request IS the consent. recipientId is here for the in-memory adapter, which has no session to read. The Supabase adapter IGNORES it and sends only requesterId: the recipient MUST come from auth.uid() inside the RPC, and a caller-supplied recipient would let anyone befriend two accounts that never agreed.
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
  // Grant a finished furniture's reward, exactly once per (owner, furniture). Idempotent: a repeat call is a no-op that returns alreadyRewarded=true. The AMOUNT is server-authoritative (read from item_build) — the caller only supplies the id.
  reward(ownerId: UserId, furnitureId: FurnitureId): Promise<BuildReward>;
  // The configured reward for a furniture (coins + XP), for the completion screen to display the same amount the grant will use. Zero when the item has no reward configured.
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
// The result of granting a finished build's reward. alreadyRewarded=true means the build was already rewarded (idempotent no-op); coins/xp are the profile's totals after the grant.
export type BuildReward = { coins: number; xp: number; alreadyRewarded: boolean };

// A buildable furniture's catalogue row. The DB is the SINGLE SOURCE for all of it — the bundle keeps only what it must (the thumbnail asset, and the counts it derives from the recipe), so editing a row here changes the catalogue without an app build.
export type BuildCatalogRow = {
  id: FurnitureId;
  name: string;
  brand: BrandId;
  // Display copy from furniture_types.name, e.g. "Shelf & Cabinet". Null when the row has no type set.
  type: string | null;
  // Estimated build minutes — hand-authored curation, never derived, so the client only ever reads it.
  durationMin: number;
  link?: string;
  // The separate assembly/<id>/ tree (item_build.assembly_model); null = this furniture has no cloud build payload, only a bundled one (or none at all). See src/data/catalog/assets.ts's assembly*Path family.
  assemblyModel: string | null;
  // The reward rates behind xp_reward = step_count * xp_per_step + xp_bonus (item_build, migration 003). DB-authored so tuning a reward never needs an app build; the bundled furniture's own constants are the offline fallback for a row that hasn't loaded yet.
  xpPerStep: number;
  xpBonusOnComplete: number;
};

export interface CatalogRepo {
  // Every buildable furniture, reference data identical for all players. Read once at boot and cached — the in-game screens need a name synchronously mid-build and cannot await a round trip.
  listBuilds(): Promise<BuildCatalogRow[]>;
  // Every item the room can place, from placeable_items — only rows with an authored size; items without one (tutorial, surfaces) are simply absent. Reference data, cached like the above.
  listPlaceables(): Promise<PlaceableRoomRow[]>;
}

// One placeable_items row's room-placement metadata: the item's measured world-AABB size in authored meters (x = width, z = depth at rotSteps 0) and the lift from its origin to its base. The room derives footprint and scale from these — the DB stores only what a tool measures. category no longer routes placement (see mount/onTop/opensWall below, migration 021) — it now only routes whether a piece EMITS light (category 'lit'). Rows cached before category existed may lack it entirely; that is unrelated to placement and only affects the emitsLight check.
export type PlaceableRoomRow = {
  id: CatalogId;
  source: ItemSource;
  category?: ShopCategory;
  size: { x: number; y: number; z: number };
  baseOffsetY: number;
  /** Which cells of the derived w×d footprint are solid — d rows of w 'X'/'.' chars joined with '/', at rotSteps 0, row 0 the -y edge (placeable_items.footprint_mask, migration 015). Absent = solid rectangle, true of every convex item. */
  footprintMask?: string;
  /** This item's top is a placement surface (placeable_items.top_surface, migration 016) — tables and cabinets. Absent/false = nothing stands on it. */
  topSurface?: boolean;
  /** Present only for category 'lit' (Lighting) — one item_lights row, joined in by the placeable_items view. Absent means the item emits nothing, which is every item but a lamp. A 'lit' row without this is a seeding mistake (see the audit query in migration 012), and the room degrades to placing it as ordinary furniture. */
  light?: RoomItemLight;
  /** Where this item mounts — floor and wall are MUTUALLY EXCLUSIVE, so this is one choice rather than two flags (placeable_items.mount). REQUIRED since migration 024: it was briefly nullable under 021 to allow a "tops only" item, and withdrawing that is what keeps the room's surface choice a complete two-way question. `onTop` below only ever ADDS a surface to this one, never replaces it. */
  mount: "floor" | "wall";
  /** May stand on a hosting item's TOP, independent of mount — a lamp sits on a desk whether that desk stands on the floor or hangs on the wall, because either way it is placed on the desk's OWN top grid, not on this item's own mount (placeable_items.on_top, migration 021). Absent/false = nothing stands on it there. */
  onTop?: boolean;
  /** Cuts a hole in the wall it mounts to — meaningful only when mount is 'wall'; the DB enforces that pairing with `not opens_wall or mount = 'wall'` (placeable_items.opens_wall, migration 021). Absent/false = hangs on the wall surface and leaves it intact (a frame), or is not wall-mounted at all. */
  opensWall?: boolean;
  /** What this item actually RESTS on, in authored metres, when it is narrower at the base than at its widest point (placeable_items.contact_size_x/z, migration 023). Overrides `size` when deriving topFootprint and nothing else — the item still draws at `size`, and its floor footprint is unaffected. Absent = the base is as wide as the item, which is true of most things; the portal only writes a value when the narrower extent actually costs fewer top cells. Both axes or neither, guaranteed by the DB's contact_pair constraint. */
  contactSize?: { x: number; z: number };
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

// One placeable_items row exactly as Postgrest hands it back — the snake_case shape the view's select() names. Loose on purpose (mirrors ShopItemRow in shop/items.ts): a column the live schema does not have yet is simply absent rather than fatal.
export type PlaceableRoomRowInput = {
  id: string;
  source: ItemSource;
  category_id: string;
  size_x: number;
  size_y: number;
  size_z: number;
  base_offset_y: number;
  light_type: "point" | "spot" | null;
  light_lumens: number | null;
  light_kelvin: number | null;
  light_reach_m: number | null;
  light_cone_deg: number | null;
  light_bulb_x: number | null;
  light_bulb_y: number | null;
  light_bulb_z: number | null;
  light_aim_pitch_deg: number | null;
  light_aim_yaw_deg: number | null;
  footprint_mask: string | null;
  top_surface: boolean | null;
  // OPTIONAL on purpose, and the `?` is load-bearing rather than defensive typing: listPlaceables selects `*`, so a database that has not applied migration 021 simply returns rows without these keys. Declaring them required would let the mapper narrow the absent case to `never` and silently drop the fallback that keeps such a database working — which is the whole reason the select is `*` in the first place.
  mount?: "floor" | "wall" | null;
  on_top?: boolean | null;
  opens_wall?: boolean | null;
  contact_size_x?: number | null;
  contact_size_z?: number | null;
};

// Row -> PlaceableRoomRow. Extracted out of the Supabase adapter and made pure so it can be tested without a live client — the same reason toShopItem (shop/items.ts) exists as a free function rather than living inline inside listItems(). That mapper once silently dropped `granted` for the whole life of migration 018 because the column was selected and the type declared the field, yet nothing carried it through by hand; the in-memory adapter got it right, so the whole suite stayed green while the Supabase path was broken. mount/onTop/opensWall are exactly that same shape of risk — three columns a hand-written object literal can drop with no type error, since every one of them is optional on PlaceableRoomRow — so this mapper gets the same treatment: pulled out, and pinned by a test on this side of the adapter boundary.
export function toPlaceableRoomRow(r: PlaceableRoomRowInput): PlaceableRoomRow {
  return {
    id: r.id,
    source: r.source,
    category: r.category_id as PlaceableRoomRow["category"],
    size: { x: r.size_x, y: r.size_y, z: r.size_z },
    baseOffsetY: r.base_offset_y,
    // Null for everything but a lamp — the view LEFT JOINs item_lights. The required columns are NOT NULL in that table, so light_type carrying a value means the rest do too. bulb_* are NOT NULL with a 0 default, hence the ?? 0: a row written before migration 014 reads as a bulb at the piece's own origin, which is wrong but harmless, rather than as NaN.
    light:
      r.light_type != null
        ? {
            type: r.light_type,
            lumens: r.light_lumens as number,
            kelvin: r.light_kelvin as number,
            reachMetres: r.light_reach_m as number,
            coneDeg: r.light_cone_deg ?? undefined,
            bulb: { x: r.light_bulb_x ?? 0, y: r.light_bulb_y ?? 0, z: r.light_bulb_z ?? 0 },
            // Both angles or neither — item_lights constrains them together, so a half-set pair means a hand-edited row and is treated as no aim rather than as half an aim.
            aim:
              r.light_aim_pitch_deg != null && r.light_aim_yaw_deg != null
                ? { pitchDeg: r.light_aim_pitch_deg, yawDeg: r.light_aim_yaw_deg }
                : undefined,
          }
        : undefined,
    ...(r.footprint_mask ? { footprintMask: r.footprint_mask } : {}),
    ...(r.top_surface ? { topSurface: true } : {}),
    // Null and absent now mean the SAME thing — "this row predates a migration" — and both fall back to the pre-021 rule the category used to carry. Under 021 they were opposite (a deliberate null meant tops-only) and had to be told apart with `in` rather than `??`; migration 024 made the column NOT NULL, so a null can only come from a database that has not caught up, exactly like an absent column from the `*` select. Collapsing them is what that migration earns.
    mount: r.mount ?? (r.category_id === "win" ? "wall" : "floor"),
    onTop: r.on_top === true,
    opensWall: "opens_wall" in r ? r.opens_wall === true : r.category_id === "win",
    // Both axes or neither — the DB's contact_pair constraint guarantees it, and this reads BOTH before accepting either so a hand-edited half-pair degrades to "no contact size" rather than to a zero-width footprint. Absent columns (pre-023) read as undefined and take the same branch, which is the correct pre-023 behaviour: topFootprint falls back to `size`, exactly as it always did.
    ...(r.contact_size_x != null && r.contact_size_z != null
      ? { contactSize: { x: r.contact_size_x, z: r.contact_size_z } }
      : {}),
  };
}

// One workshop_drafts row (status='testing'), as Postgrest hands it back for the dev-only merge into the room's placeable catalogue — see listPlaceables in adapters/supabase.ts, and workshopDraftsDevGateOpen (catalog/workshopDraftsGate.ts) for the gate that decides whether this merge runs at all. Deliberately NOT PlaceableRoomRowInput, even though the two tables share most column names verbatim (id/category_id/size_x.../footprint_mask/top_surface/mount/on_top/opens_wall — 011_workshop.sql, 019_workshop_kinds.sql, 022_workshop_placement.sql): the one real difference is `light`, which the portal writes as ONE jsonb object matching its own LightPayload form, where placeable_items' view has already flattened item_lights into ten separate light_* columns. workshopDraftToPlaceableRoomRow's whole job below is undoing that one difference before handing off to toPlaceableRoomRow, which already owns every other mapping rule (mount/onTop/opensWall fallbacks, footprint mask sanitising is the room's job not this one's, etc.) — re-deriving that logic here a second time is exactly the kind of drift toShopItem's own header comment warns about.
export type WorkshopDraftRow = {
  id: string;
  category_id: string;
  // NULL on a surface draft (floor/wall) — workshop_drafts_kind_shape (019_workshop_kinds.sql) guarantees all three are null together on a surface row and all three are present together on a model row. This is the fact workshopModelDraftsToPlaceableRoomRows filters on.
  size_x: number | null;
  size_y: number | null;
  size_z: number | null;
  base_offset_y: number;
  footprint_mask: string | null;
  top_surface: boolean | null;
  mount: "floor" | "wall" | null;
  on_top: boolean | null;
  opens_wall: boolean | null;
  light: {
    type: "point" | "spot";
    lumens: number;
    kelvin: number;
    reach_m: number;
    cone_deg?: number | null;
    bulb_x?: number | null;
    bulb_y?: number | null;
    bulb_z?: number | null;
    aim_pitch_deg?: number | null;
    aim_yaw_deg?: number | null;
  } | null;
};

// A MODEL draft (size present) -> PlaceableRoomRow, source "workshop". Flattens the one jsonb `light` field into the ten light_* columns toPlaceableRoomRow already knows how to read, then delegates to it entirely — see the WorkshopDraftRow comment above for why that split exists rather than re-deriving toPlaceableRoomRow's own mapping rules here.
export function workshopDraftToPlaceableRoomRow(r: WorkshopDraftRow): PlaceableRoomRow {
  return toPlaceableRoomRow({
    id: r.id,
    source: "workshop",
    category_id: r.category_id,
    // Cast, not coalesced: callers are expected to have already filtered to model rows (workshopModelDraftsToPlaceableRoomRows does, below) where these three are guaranteed non-null together.
    size_x: r.size_x as number,
    size_y: r.size_y as number,
    size_z: r.size_z as number,
    base_offset_y: r.base_offset_y,
    light_type: r.light?.type ?? null,
    light_lumens: r.light?.lumens ?? null,
    light_kelvin: r.light?.kelvin ?? null,
    light_reach_m: r.light?.reach_m ?? null,
    light_cone_deg: r.light?.cone_deg ?? null,
    light_bulb_x: r.light?.bulb_x ?? null,
    light_bulb_y: r.light?.bulb_y ?? null,
    light_bulb_z: r.light?.bulb_z ?? null,
    light_aim_pitch_deg: r.light?.aim_pitch_deg ?? null,
    light_aim_yaw_deg: r.light?.aim_yaw_deg ?? null,
    footprint_mask: r.footprint_mask,
    top_surface: r.top_surface,
    mount: r.mount,
    on_top: r.on_top,
    opens_wall: r.opens_wall,
  });
}

// listPlaceables fetches every status='testing' workshop_drafts row in one query and hands the whole batch here, rather than filtering server-side by category_id — the model/surface split is a fact the DB GUARANTEES about the row's SHAPE (workshop_drafts_kind_shape: a surface draft's size is null, full stop), and re-deriving it from category_id membership in ('floor','wall') here would mean trusting a second, driftable copy of that list instead of the one thing the constraint actually promises. A surface draft is silently excluded, not warned about — it has no size to place by, and it reaches the player through the shop catalogue instead (workshopDraftsToShopItems, shop/items.ts, which maps model and surface drafts alike), so that is its ordinary, expected shape.
export function workshopModelDraftsToPlaceableRoomRows(rows: WorkshopDraftRow[]): PlaceableRoomRow[] {
  return rows.filter((r) => r.size_x != null).map(workshopDraftToPlaceableRoomRow);
}

// One row of item_variants: an item's colour/finish axis. `variation` is the free-form per-item key that IS the storage path segment (white, oak, black, ...); null = the item has a single model, at the 'default' segment. Asset paths are derived from it, never stored — see catalogAssets.ts.
export type ItemVariant = {
  itemId: CatalogId;
  variation: string | null;
  isDefault: boolean;
};

export interface VariantsRepo {
  // The WHOLE variant table in one round trip: it is reference data, a couple of rows per item, and every consumer (a tile, a placement swatch row) needs it synchronously — so it is cached client-side rather than queried per item. See variantStore.ts.
  list(): Promise<ItemVariant[]>;
}

export interface RoomLikesRepo {
  // Like / unlike a room. The owner's user_profile.likes is a cache kept in sync by these.
  like(roomOwnerId: UserId, likerId: UserId): Promise<void>;
  unlike(roomOwnerId: UserId, likerId: UserId): Promise<void>;
  hasLiked(roomOwnerId: UserId, likerId: UserId): Promise<boolean>;
  count(roomOwnerId: UserId): Promise<number>;
}

// The outcome of a purchase attempt. insufficient_coins / already_owned are expected domain results (returned, not thrown) so the UI can show them without a try/catch.
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
