// the data-access seam — features depend ONLY on these interfaces, so swapping adapters is one change in ./index
import type { BrandId, FurnitureId } from "@/src/game/core/type";
import type { ItemSource } from "../catalog/assets";
import type { ShopCategory, ShopItem, ShopItemId } from "../shop/items";
import type { BuildSave, CatalogId, Friend, FriendRequest, Profile, ProfilePatch, RoomLayout, UserId } from "./types";

export interface ProfileRepo {
  get(userId: UserId): Promise<Profile | null>;
  // batched, so a friends list renders without N round trips
  getMany(userIds: UserId[]): Promise<Profile[]>;
  update(userId: UserId, patch: ProfilePatch): Promise<Profile>;
  // EXACT match: username is unique, so this rides that index and there is no result list to page
  findByUsername(username: string): Promise<Profile | null>;
}

export interface RoomLayoutRepo {
  // an empty layout when the owner has none yet — never null, so callers do not special-case
  get(ownerId: UserId): Promise<RoomLayout>;
  save(ownerId: UserId, layout: RoomLayout): Promise<void>;
}

export interface FriendsRepo {
  list(userId: UserId): Promise<Friend[]>;
  // ONE directed edge, and therefore HALF a friendship — fixtures and dev tooling only
  // the app befriends through FriendRequestsRepo.accept, since RLS forbids writing the other party's edge
  add(userId: UserId, friendId: UserId): Promise<void>;
  remove(userId: UserId, friendId: UserId): Promise<void>;
}

// the consent step in front of FriendsRepo — a client cannot write both edges, so accept_friend_request does
export interface FriendRequestsRepo {
  // the inbox behind the "Friend requests" tab
  listIncoming(userId: UserId): Promise<FriendRequest[]>;
  // so a search result reads "Requested" rather than offering to send again
  listOutgoing(userId: UserId): Promise<FriendRequest[]>;
  // a repeat send is the same intent as the first and resolves to a single request
  send(fromId: UserId, toId: UserId): Promise<void>;
  // writes BOTH edges, and throws when none is pending, because the request IS the consent
  // recipientId is for the in-memory adapter alone — Supabase takes the recipient from auth.uid() inside the RPC
  accept(recipientId: UserId, requesterId: UserId): Promise<void>;
  // reject (as recipient) or cancel (as sender) — one row delete under two names
  withdraw(fromId: UserId, toId: UserId): Promise<void>;
}

export interface BuildProgressRepo {
  // every in-progress build for a user — powers a "continue building" shelf
  list(ownerId: UserId): Promise<BuildSave[]>;
  get(ownerId: UserId, furnitureId: FurnitureId): Promise<BuildSave | null>;
  save(save: BuildSave): Promise<void>;
  // abandon: drop the in-progress save without recording a completion
  clear(ownerId: UserId, furnitureId: FurnitureId): Promise<void>;
  // finish: record a completed build (which backs assembly_count) AND clear its in-progress save
  complete(ownerId: UserId, furnitureId: FurnitureId): Promise<void>;
  // idempotent, once per (owner, furniture) — the AMOUNT is server-authoritative, the caller supplying only the id
  reward(ownerId: UserId, furnitureId: FurnitureId): Promise<BuildReward>;
  // the configured reward, so the completion screen shows the same amount the grant will use
  buildReward(furnitureId: FurnitureId): Promise<BuildRewardAmount>;
  // push a recipe's derived counts to the catalog — the local bundle is the SOURCE, the DB copy a mirror
  // step_count is load-bearing (reward = step_count × a DB rate); stage/cluster are for inspection. fire-and-forget
  syncCounts(furnitureId: FurnitureId, counts: SyncedCounts): Promise<void>;
  // the furniture this user has finished — the record behind assembly_count
  listCompleted(ownerId: UserId): Promise<FurnitureId[]>;
  // the same list WITH catalog rows, so a rename lands without an app build
  listCompletedItems(ownerId: UserId): Promise<BuiltItem[]>;
}

// the "built" half of a player's inventory. no price — built furniture is earned, not bought
export type BuiltItem = { id: FurnitureId; name: string; category: ShopCategory };

// counts a recipe derives locally and mirrors into the catalog, never read back — the bundle's copy is always current
export type SyncedCounts = { stepCount: number; stageCount: number; clusterCount: number };

// the ITEM a build grants beside its currency (item_build.reward_item_id -> item_buy)
// absent until one is authored, so the screen shows coins and XP alone rather than naming a phantom item
export type RewardItem = { id: ShopItemId; name: string; category: ShopCategory };

// the reward a build is worth — what the screen shows and the grant applies
export type BuildRewardAmount = { coins: number; xp: number; item?: RewardItem };
// the result of granting one — coins/xp are the totals AFTER the grant
// rewardItemId is what landed in the inventory, so the caller can mark it owned without re-reading the owned list
export type BuildReward = { coins: number; xp: number; alreadyRewarded: boolean; rewardItemId?: ShopItemId };

// one item_buy row as the embedded select returns it — only the fields the reward display needs
type RewardItemRow = { id: string; name: string; category_id: string };

// the currency columns are nullable here because a furniture with NO catalog row yields nulls, coalesced to 0 below
export type BuildRewardRow = {
  coin_reward: number | null;
  xp_reward: number | null;
  // OBJECT OR ARRAY, load-bearing: Postgrest returns an embed either way depending on the relationship it infers
  item_buy?: RewardItemRow | RewardItemRow[] | null;
};

// pure for the reason toPlaceableRoomRow is: `item` is optional, so a literal can drop it with no type error
export function toBuildRewardAmount(row: BuildRewardRow): BuildRewardAmount {
  const embed = Array.isArray(row.item_buy) ? row.item_buy[0] : row.item_buy;
  return {
    coins: row.coin_reward ?? 0,
    xp: row.xp_reward ?? 0,
    // spread, not `item: undefined` — a reward with no item must have NO item key, so `"item" in reward` answers no
    ...(embed ? { item: { id: embed.id, name: embed.name, category: embed.category_id as ShopCategory } } : {}),
  };
}

// a buildable furniture's catalogue row — the DB is the SINGLE SOURCE, so editing a row needs no app build
export type BuildCatalogRow = {
  id: FurnitureId;
  name: string;
  brand: BrandId;
  // display copy from furniture_types.name, e.g. "Shelf & Cabinet"
  type: string | null;
  // estimated build minutes — hand-authored curation, never derived
  durationMin: number;
  link?: string;
  // the separate assembly/<id>/ tree; null = no cloud payload. see catalog/assets.ts's assembly*Path family
  assemblyModel: string | null;
  // the rates behind xp_reward = step_count * xp_per_step + xp_bonus, DB-authored so tuning needs no app build
  xpPerStep: number;
  xpBonusOnComplete: number;
};

export interface CatalogRepo {
  // reference data, read once at boot and cached — the in-game screens need a name synchronously mid-build
  listBuilds(): Promise<BuildCatalogRow[]>;
  // only rows with an authored size, so items without one (tutorial, surfaces) are simply absent
  listPlaceables(): Promise<PlaceableRoomRow[]>;
}

// placement metadata in authored metres: world-AABB size at rotSteps 0, plus the lift from origin to base
// the room derives footprint and scale from these, so the DB stores only what a tool measures
export type PlaceableRoomRow = {
  id: CatalogId;
  source: ItemSource;
  // no longer routes placement (mount/onTop/opensWall do) — it now only routes whether a piece EMITS light
  category?: ShopCategory;
  size: { x: number; y: number; z: number };
  baseOffsetY: number;
  // which cells of the w×d footprint are solid — d rows of w 'X'/'.' joined with '/', row 0 the -y edge
  // absent = solid rectangle, true of every convex item
  footprintMask?: string;
  // this item's top is a placement surface — tables and cabinets
  topSurface?: boolean;
  // present only for category 'lit' — absent means it emits nothing, which is every item but a lamp
  // a 'lit' row without it is a seeding mistake (migration 012 has the audit query) and places as ordinary furniture
  // ONE OR TWO ENTRIES, never two of a type: a lamp may carry a point AND a spot, ordered point-then-spot
  lights?: RoomItemLight[];
  // floor and wall are MUTUALLY EXCLUSIVE, so one choice rather than two flags
  // REQUIRED since 024 — briefly nullable under 021, and withdrawing that keeps the surface choice a two-way question
  mount: "floor" | "wall";
  // may stand on a hosting item's TOP, independent of mount — a lamp sits on a desk however that desk is mounted
  onTop?: boolean;
  // cuts a hole in the wall, meaningful only when mount is 'wall' — the DB enforces the pairing
  opensWall?: boolean;
  // what the item RESTS on when it is narrower at the base — overrides `size` for topFootprint and NOTHING else
  // absent = the base is as wide as the item. both axes or neither, per the DB's contact_pair constraint
  contactSize?: { x: number; z: number };
};

// ONE of a lamp's lights, as authored in one item_lights row
// `lumens` is calibrated by eye, NOT physical — Filament scales by exposure, which RNF does not bridge
// `reachMetres` is authored metres the renderer scales; `coneDeg` is set for 'spot' and absent for 'point'
export type RoomItemLight = {
  type: "point" | "spot";
  lumens: number;
  kelvin: number;
  reachMetres: number;
  coneDeg?: number;
  // metres from the piece's BASE, not the model origin, so `bulb.y` reads as plain height up the lamp
  bulb: { x: number; y: number; z: number };
  // aim for a spot, absent for a point — degrees in the piece's own space at rotSteps 0, see room/core/lightAim.ts
  aim?: { pitchDeg: number; yawDeg: number };
};

// one light in the SNAKE_CASE shape the database uses — item_lights column-for-column
// ONE TYPE FOR TWO PLACES: since 026 placeable_items.lights and workshop_drafts.lights share this element shape
// so a renamed key is a type error on both sides rather than a silently absent field
// every field but `type` is nullable, matching what the DB PERMITS — toRoomItemLight drops what it cannot use
export type LightRow = {
  type: "point" | "spot";
  lumens?: number | null;
  kelvin?: number | null;
  reach_m?: number | null;
  cone_deg?: number | null;
  bulb_x?: number | null;
  bulb_y?: number | null;
  bulb_z?: number | null;
  aim_pitch_deg?: number | null;
  aim_yaw_deg?: number | null;
};

// null when the row cannot describe a light at all — not defensive padding
// the catalog is a network fetch behind a cache, so a row can arrive hand-edited, half-migrated, or portal-newer
// Filament takes a NaN intensity literally with no error to catch — only a lamp that silently blacks out its piece
function toRoomItemLight(row: LightRow): RoomItemLight | null {
  if (row.type !== "point" && row.type !== "spot") return null;
  const lumens = row.lumens;
  const kelvin = row.kelvin;
  const reachMetres = row.reach_m;
  if (typeof lumens !== "number" || typeof kelvin !== "number" || typeof reachMetres !== "number") return null;
  if (!Number.isFinite(lumens) || !Number.isFinite(kelvin) || !Number.isFinite(reachMetres)) return null;
  return {
    type: row.type,
    lumens,
    kelvin,
    reachMetres,
    coneDeg: row.cone_deg ?? undefined,
    // bulb_* are NOT NULL with a 0 default — a pre-014 row reads as a bulb at the origin rather than as NaN
    bulb: { x: row.bulb_x ?? 0, y: row.bulb_y ?? 0, z: row.bulb_z ?? 0 },
    // both angles or neither: a half-set pair means a hand-edited row and reads as no aim rather than half an aim
    aim:
      row.aim_pitch_deg != null && row.aim_yaw_deg != null
        ? { pitchDeg: row.aim_pitch_deg, yawDeg: row.aim_yaw_deg }
        : undefined,
  };
}

// `lights` wins when present; the flat light_* columns are the fallback for a database that has not applied 026
// never MERGED — a row carrying both is post-026, where the flat columns are a projection OF the array
function lightsFrom(r: PlaceableRoomRowInput): RoomItemLight[] | undefined {
  const rows: LightRow[] =
    r.lights != null && Array.isArray(r.lights)
      ? r.lights
      : r.light_type != null
        ? [{
            type: r.light_type,
            lumens: r.light_lumens,
            kelvin: r.light_kelvin,
            reach_m: r.light_reach_m,
            cone_deg: r.light_cone_deg,
            bulb_x: r.light_bulb_x,
            bulb_y: r.light_bulb_y,
            bulb_z: r.light_bulb_z,
            aim_pitch_deg: r.light_aim_pitch_deg,
            aim_yaw_deg: r.light_aim_yaw_deg,
          }]
        : [];
  const mapped = rows.map(toRoomItemLight).filter((l): l is RoomItemLight => l !== null);
  // undefined not [] for "no lights", so `lights != null` stays the one test for "does this emit"
  return mapped.length > 0 ? mapped : undefined;
}

// one placeable_items row as Postgrest hands it back — loose on purpose, like ShopItemRow
export type PlaceableRoomRowInput = {
  id: string;
  source: ItemSource;
  category_id: string;
  size_x: number;
  size_y: number;
  size_z: number;
  base_offset_y: number;
  // migration 026 — item_lights aggregated into one jsonb array, point-then-spot. THIS is the column to read
  // optional for the load-bearing reason mount/on_top/opens_wall are, below
  lights?: LightRow[] | null;
  // the pre-026 flat projection, read here for the mirror case: a newer build against an unmigrated database
  light_type?: "point" | "spot" | null;
  light_lumens?: number | null;
  light_kelvin?: number | null;
  light_reach_m?: number | null;
  light_cone_deg?: number | null;
  light_bulb_x?: number | null;
  light_bulb_y?: number | null;
  light_bulb_z?: number | null;
  light_aim_pitch_deg?: number | null;
  light_aim_yaw_deg?: number | null;
  footprint_mask: string | null;
  top_surface: boolean | null;
  // the `?` is load-bearing: listPlaceables selects `*`, so a pre-021 database returns rows without these keys
  // declaring them required would narrow the absent case to `never` and silently drop the fallback
  mount?: "floor" | "wall" | null;
  on_top?: boolean | null;
  opens_wall?: boolean | null;
  contact_size_x?: number | null;
  contact_size_z?: number | null;
};

// pure so it can be tested without a live client — the reason toShopItem is a free function too
// that mapper silently dropped `granted` for the whole life of 018 while the suite stayed green
// mount/onTop/opensWall are the same risk — optional fields a literal can drop — so this one is pinned by a test
export function toPlaceableRoomRow(r: PlaceableRoomRowInput): PlaceableRoomRow {
  return {
    id: r.id,
    source: r.source,
    category: r.category_id as PlaceableRoomRow["category"],
    size: { x: r.size_x, y: r.size_y, z: r.size_z },
    baseOffsetY: r.base_offset_y,
    // undefined for everything but a lamp — see lightsFrom for which row shape this reads
    lights: lightsFrom(r),
    ...(r.footprint_mask ? { footprintMask: r.footprint_mask } : {}),
    ...(r.top_surface ? { topSurface: true } : {}),
    // null and absent now mean the SAME thing — this row predates a migration — and both fall back to the category
    // under 021 they were opposites (a deliberate null meant tops-only); 024 made the column NOT NULL
    mount: r.mount ?? (r.category_id === "win" ? "wall" : "floor"),
    onTop: r.on_top === true,
    opensWall: "opens_wall" in r ? r.opens_wall === true : r.category_id === "win",
    // both axes or neither: reading BOTH degrades a hand-edited half-pair to "no contact size", not zero width
    // pre-023 columns read as undefined and take the same branch, so topFootprint falls back to `size` as it always did
    ...(r.contact_size_x != null && r.contact_size_z != null
      ? { contactSize: { x: r.contact_size_x, z: r.contact_size_z } }
      : {}),
  };
}

// one testing draft for the dev-only merge — see listPlaceables (adapters/supabase.ts) and workshopDraftsGate.ts
// deliberately NOT PlaceableRoomRowInput: a draft's size_x/y/z are null on a surface row, where the view's never are
export type WorkshopDraftRow = {
  id: string;
  category_id: string;
  // null on a surface draft — workshop_drafts_kind_shape guarantees all three move together
  size_x: number | null;
  size_y: number | null;
  size_z: number | null;
  base_offset_y: number;
  footprint_mask: string | null;
  top_surface: boolean | null;
  mount: "floor" | "wall" | null;
  on_top: boolean | null;
  opens_wall: boolean | null;
  // migration 026 — the SAME element shape placeable_items.lights carries, which is what lets this pass straight through
  lights?: LightRow[] | null;
  // the pre-026 single-object column, still read when `lights` is absent: the dev merge runs against any database
  light?: LightRow | null;
  // the draft's own colour axis, the same pairs the publish RPC later explodes into item_variants rows
  // optional because the select is `*`; a surface draft carries `[]` by DB constraint
  variants?: { variation: string | null; is_default?: boolean }[] | null;
};

// delegates entirely to toPlaceableRoomRow, which owns every mapping rule — re-deriving any of it here is drift
// the one thing done here is folding a pre-026 draft's single `light` into a one-element array
export function workshopDraftToPlaceableRoomRow(r: WorkshopDraftRow): PlaceableRoomRow {
  return toPlaceableRoomRow({
    id: r.id,
    source: "workshop",
    category_id: r.category_id,
    // cast, not coalesced: callers have already filtered to model rows, where these three are non-null together
    size_x: r.size_x as number,
    size_y: r.size_y as number,
    size_z: r.size_z as number,
    base_offset_y: r.base_offset_y,
    lights: r.lights ?? (r.light != null ? [r.light] : null),
    footprint_mask: r.footprint_mask,
    top_surface: r.top_surface,
    mount: r.mount,
    on_top: r.on_top,
    opens_wall: r.opens_wall,
  });
}

// filters on SHAPE rather than category_id: the model/surface split is a fact the DB guarantees about the row
// a surface draft is silently excluded — it has no size to place by, and reaches the player through the shop
export function workshopModelDraftsToPlaceableRoomRows(rows: WorkshopDraftRow[]): PlaceableRoomRow[] {
  return rows.filter((r) => r.size_x != null).map(workshopDraftToPlaceableRoomRow);
}

// an item's colour/finish axis. `variation` IS the storage path segment (white, oak); null = a single model
// asset paths are DERIVED from it, never stored — see catalog/assets.ts
export type ItemVariant = {
  itemId: CatalogId;
  variation: string | null;
  isDefault: boolean;
};

// a testing draft's colour axis — item_variants is written only by publish_workshop_draft, so a draft has no rows
// without this a draft with NAMED variations resolves to the 'default' segment and 404s on default.glb/.png, silently
// mapped rather than fetched because the two carry the same facts in different shapes
// not filtered to model drafts: a surface draft carries an empty array by DB constraint and contributes nothing
export function workshopDraftsToItemVariants(rows: WorkshopDraftRow[]): ItemVariant[] {
  return rows.flatMap((r) =>
    (r.variants ?? []).map((v) => ({
      itemId: r.id,
      variation: v.variation ?? null,
      // coerced: absent on an older row, and variantStore's sort compares Number(isDefault), NaN for undefined
      isDefault: v.is_default === true,
    })),
  );
}

export interface VariantsRepo {
  // the WHOLE table in one round trip — reference data every consumer needs synchronously, so cached client-side
  list(): Promise<ItemVariant[]>;
}

export interface RoomLikesRepo {
  // the owner's user_profile.likes is a cache these keep in sync
  like(roomOwnerId: UserId, likerId: UserId): Promise<void>;
  unlike(roomOwnerId: UserId, likerId: UserId): Promise<void>;
  hasLiked(roomOwnerId: UserId, likerId: UserId): Promise<boolean>;
  count(roomOwnerId: UserId): Promise<number>;
}

// insufficient_coins / already_owned are expected domain results, returned rather than thrown — no try/catch in the UI
export type PurchaseOutcome =
  | { ok: true; coinsRemaining: number }
  | { ok: false; reason: "insufficient_coins" | "already_owned" | "level_locked" };

export interface StoreRepo {
  // the purchasable catalog — reference data, the same for everyone
  listItems(): Promise<ShopItem[]>;
  listOwned(userId: UserId): Promise<ShopItemId[]>;
  // atomic: checks balance and ownership, deducts, grants
  purchase(userId: UserId, itemId: ShopItemId): Promise<PurchaseOutcome>;
}

// the bundle every feature reaches through. one object, swappable behind ./index
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
