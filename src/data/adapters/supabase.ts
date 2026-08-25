// Supabase adapter for the repo seam — the ONE place that maps snake_case rows <-> the camelCase domain types. Everything above the seam (features, the game store) is unchanged when this replaces the in-memory adapter.
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/src/config/supabase";
import type { AssemblyMode, BrandId, FurnitureId } from "@/src/game/core/type";
import type { BuildProgressRepo, BuildRewardRow, CatalogRepo, FriendRequestsRepo, FriendsRepo, ItemVariant, PlaceableRoomRowInput, ProfileRepo, Repos, RoomLayoutRepo, RoomLikesRepo, StoreRepo, VariantsRepo, WorkshopDraftRow } from "../core/repos";
import { toBuildRewardAmount, toPlaceableRoomRow, workshopDraftsToItemVariants, workshopModelDraftsToPlaceableRoomRows } from "../core/repos";
import type { BuildSave, FriendRequest, Profile, ProfilePatch, RoomLayout } from "../core/types";
import { ROOM_LAYOUT_VERSION } from "../core/types";
import { toShopItem, workshopDraftsToShopItems, type ShopCategory, type ShopItem, type ShopItemRow, type WorkshopDraftShopRow } from "../shop/items";
import { workshopDraftsDevGateOpen } from "../catalog/workshopDraftsGate";
import type { AvatarRef } from "../player/avatars";
import { idForMode, modeForId } from "../player/avatars";
import type { LevelRow } from "../player/levels";
import { levelSpan, titleForLevel } from "../player/levels";
import { migrateRoomPlacements, readRoomFinishes } from "../room/layoutMigrate";

// Whether THIS build may merge workshop_drafts (status='testing') into the live catalogue/shop — see workshopDraftsGate.ts for why this is a plain expression rather than an import of devAccounts.ts's own DEV_ACCOUNTS_ENABLED (the same condition, verbatim). Evaluated once at module load, same as every other __DEV__ read in this codebase — a build's dev-ness cannot change at runtime.
const WORKSHOP_DRAFTS_MERGE_ENABLED = workshopDraftsDevGateOpen(__DEV__, process.env.EXPO_PUBLIC_DATA_BACKEND, process.env.EXPO_PUBLIC_SHOWCASE);

// Throw on any Postgrest error so callers get a real failure instead of a silent null.
function check(error: PostgrestError | null): void {
  if (error) throw error;
}

// Reference tables (levels, avatars) are small and rarely change — fetch each once per session and resolve client-side.
type Refs = { levels: LevelRow[]; avatars: AvatarRef[] };

// Caches the PROMISE, so concurrent callers share one round trip — but drops it again if that promise rejects. Without the reset a single transient failure (a blip, or a fetch that raced ahead of the session) would be cached as a permanently-rejected promise: getRefs() feeds every profile read, so the HUD, store, inventory and profile screen would all stay broken until the app was restarted.
function cachedOnce<T>(load: () => Promise<T>): () => Promise<T> {
  let cache: Promise<T> | null = null;
  return () => {
    if (!cache) {
      cache = load().catch((err) => {
        cache = null;
        throw err;
      });
    }
    return cache;
  };
}

const getLevels = cachedOnce(async (): Promise<LevelRow[]> => {
  const { data, error } = await supabase.from("levels").select("level, xp_required, title");
  check(error);
  return (data as { level: number; xp_required: number; title: string | null }[]).map((r) => ({
    level: r.level,
    xpRequired: r.xp_required,
    title: r.title,
  }));
});

const getAvatars = cachedOnce(async (): Promise<AvatarRef[]> => {
  const { data, error } = await supabase.from("avatars").select("id, mode");
  check(error);
  return (data as { id: number; mode: string }[]).map((r) => ({ id: r.id, mode: r.mode as AvatarRef["mode"] }));
});

async function getRefs(): Promise<Refs> {
  const [levels, avatars] = await Promise.all([getLevels(), getAvatars()]);
  return { levels, avatars };
}

// --- profiles ---------------------------------------------------------------

type ProfileRow = {
  user_id: string;
  username: string | null;
  avatar_id: number | null;
  level: number | null;
  coin: number | null;
  xp: number | null;
  onboarding_completed: boolean | null;
  map_coach_seen: boolean | null;
  assembly_count: number | null;
  like_count: number | null;
};

// title and the xp span are both derived from the levels table; avatarMode is resolved from avatar_id — all via the refs passed in.
function rowToProfile(r: ProfileRow, refs: Refs): Profile {
  const level = r.level ?? 1;
  const xp = r.xp ?? 0;
  const span = levelSpan(level, xp, refs.levels);
  return {
    userId: r.user_id,
    username: r.username,
    avatarMode: modeForId(r.avatar_id, refs.avatars),
    level,
    coins: r.coin ?? 0,
    xp,
    onboardingCompleted: r.onboarding_completed ?? false,
    // Absent until migration 025 has run — read as "not seen", which shows the coach once rather
    // than suppressing it forever on a database that has not caught up yet.
    mapCoachSeen: r.map_coach_seen ?? false,
    title: titleForLevel(level, refs.levels),
    xpIntoLevel: span.xpIntoLevel,
    xpForNextLevel: span.xpForNextLevel,
    itemsAssembled: r.assembly_count ?? 0,
    likes: r.like_count ?? 0,
  };
}

// Only the patched keys are sent, mapped to their columns. title is derived (not writable); avatarMode maps to the avatar_id FK. coin/xp/level are absent BY DESIGN — see ProfilePatch. They are economy state and move only through the RPCs; the DB revokes UPDATE on those columns, so adding them back here would fail at the API anyway.
function profilePatchToRow(patch: ProfilePatch, avatars: AvatarRef[]): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if ("username" in patch) row.username = patch.username;
  if ("avatarMode" in patch) row.avatar_id = idForMode(patch.avatarMode ?? null, avatars);
  if ("onboardingCompleted" in patch) row.onboarding_completed = patch.onboardingCompleted;
  if ("mapCoachSeen" in patch) row.map_coach_seen = patch.mapCoachSeen;
  return row;
}

const profileRepo: ProfileRepo = {
  async get(userId) {
    const refs = await getRefs();
    const { data, error } = await supabase.from("user_profile").select("*").eq("user_id", userId).maybeSingle();
    check(error);
    return data ? rowToProfile(data as ProfileRow, refs) : null;
  },
  async getMany(userIds) {
    if (userIds.length === 0) return [];
    const refs = await getRefs();
    const { data, error } = await supabase.from("user_profile").select("*").in("user_id", userIds);
    check(error);
    return (data as ProfileRow[]).map((r) => rowToProfile(r, refs));
  },
  async findByUsername(username) {
    const refs = await getRefs();
    // maybeSingle, not single: "no such player" is an ordinary outcome of a search and must not throw. user_profile_username_key guarantees at most one row.
    const { data, error } = await supabase.from("user_profile").select("*").eq("username", username).maybeSingle();
    check(error);
    return data ? rowToProfile(data as ProfileRow, refs) : null;
  },
  async update(userId, patch) {
    const refs = await getRefs();
    const { data, error } = await supabase
      .from("user_profile")
      .update(profilePatchToRow(patch, refs.avatars))
      .eq("user_id", userId)
      .select("*")
      .single();
    check(error);
    return rowToProfile(data as ProfileRow, refs);
  },
};

// --- catalog ----------------------------------------------------------------

const catalogRepo: CatalogRepo = {
  async listBuilds() {
    // furniture_types is embedded rather than joined client-side: the type's DISPLAY NAME is the thing shown, and one round trip keeps the boot path short.
    const { data, error } = await supabase
      .from("item_build")
      .select("id, name, brand_id, link, duration_min, assembly_model, xp_per_step, xp_bonus, furniture_types(name)");
    check(error);
    type Embedded = { name: string };
    type Row = {
      id: string;
      name: string;
      brand_id: string | null;
      link: string | null;
      duration_min: number | null;
      assembly_model: string | null;
      xp_per_step: number | null;
      xp_bonus: number | null;
      furniture_types: Embedded | Embedded[] | null;
    };
    return ((data ?? []) as unknown as Row[]).map((r) => {
      const type = Array.isArray(r.furniture_types) ? r.furniture_types[0] : r.furniture_types;
      return {
        id: r.id as FurnitureId,
        name: r.name,
        // brand_id is a free FK to brands; anything unrecognised falls back to "Others" rather than rendering a blank chip.
        brand: (r.brand_id === "IKEA" ? "IKEA" : "Others") as BrandId,
        type: type?.name ?? null,
        durationMin: r.duration_min ?? 0,
        assemblyModel: r.assembly_model,
        xpPerStep: r.xp_per_step ?? 0,
        xpBonusOnComplete: r.xp_bonus ?? 0,
        ...(r.link ? { link: r.link } : {}),
      };
    });
  },

  async listPlaceables() {
    // The union view spans both item tables; a null size means "no room model authored", so those rows are filtered server-side — the room never sees an item it could not place. category_id still rides along (toPlaceableRoomRow reads it for emitsLight), but mount/on_top/opens_wall — not category — now route placement (migration 021).
    //
    // `*`, NOT an explicit column list, for exactly the reason getShopItems documents below and paid for twice: naming a column the live schema does not have yet fails the WHOLE fetch with a Postgrest 42703, and this query IS the room's catalogue — so the room goes completely empty rather than merely missing a feature. That made every schema-adding change a hard ordering dependency where the code could not ship before the migration, and this query kept the trap after the shop query escaped it: it named mount/on_top/opens_wall the moment they were written, which broke the app against a live database that had not run 021 yet. With `*`, a column that has not arrived is simply absent from the row and toPlaceableRoomRow already reads absent as unset, so code and schema become deployable in either order. The view is fetched once per session, so the few unused columns cost nothing.
    const { data, error } = await supabase
      .from("placeable_items")
      .select("*")
      .not("size_x", "is", null);
    check(error);
    // The mapping itself lives in toPlaceableRoomRow (core/repos.ts), pure and unit-tested — see repos.test.ts for exactly the regression this split guards against (mount/onTop/opensWall silently dropped from a hand-written object literal, the same failure mode toShopItem's own header comment documents for `granted`).
    const live = ((data ?? []) as PlaceableRoomRowInput[]).map(toPlaceableRoomRow);

    // DEV BUILDS ONLY: a testing-status workshop_drafts row is an upload the portal has not published yet — the whole point of this merge is letting it be looked at in the room BEFORE publishing, which is the irreversible step. Appended AFTER the live rows so a draft never shadows a published item sharing its id (the collision publish_workshop_draft itself refuses at publish time). Release and showcase builds return exactly `live`, computed by exactly the query above — this merge never runs for them, not even as a query that comes back empty, so the release path is byte-for-byte what it was before this merge existed.
    if (!WORKSHOP_DRAFTS_MERGE_ENABLED) return live;
    try {
      // `*` for the same reason as the query above: a workshop_drafts column this code does not know about yet must not fail the whole fetch. Every status='testing' row is fetched in one query — model AND surface — and workshopModelDraftsToPlaceableRoomRows (core/repos.ts) is what filters down to model drafts, on the DB-guaranteed fact that a surface draft's size is null, rather than trusting category_id here.
      const { data: draftRows, error: draftError } = await supabase.from("workshop_drafts").select("*").eq("status", "testing");
      if (draftError) throw draftError;
      return [...live, ...workshopModelDraftsToPlaceableRoomRows((draftRows ?? []) as WorkshopDraftRow[])];
    } catch (err) {
      // A dev convenience is never worth an empty room — warn and hand back the live rows exactly as a build with the gate closed would.
      console.warn("[catalog] workshop_drafts merge failed; the room will not show testing uploads this session", err);
      return live;
    }
  },
};

// --- rooms ------------------------------------------------------------------

// The jsonb column carries a versioned envelope: { version, placements }. Legacy rows hold a bare array from the pre-grid model — those coordinates are meaningless on the grid, so any shape other than the current envelope reads as an empty room rather than a mis-placed one. The version history spans 1 (half-metre cells) and 2 (quarter-metre).
type RoomEnvelope = { version: number; placements: RoomLayout["placements"]; finishes?: RoomLayout["finishes"] };
type RoomRow = { owner_id: string; placements: RoomEnvelope | unknown[]; updated_at: string };

const roomRepo: RoomLayoutRepo = {
  async get(ownerId) {
    const { data, error } = await supabase.from("user_room").select("*").eq("owner_id", ownerId).maybeSingle();
    check(error);
    if (!data) return { ownerId, version: ROOM_LAYOUT_VERSION, placements: [], updatedAt: new Date().toISOString() };
    const row = data as RoomRow;
    // migrateRoomPlacements and readRoomFinishes together own the whole envelope policy: migrateRoomPlacements handles placements (v1 floor anchors double onto the quarter grid, v2 verbatim, anything else — legacy bare arrays, malformed rows, unknown versions — an empty room), while readRoomFinishes reads the sibling `finishes` field off the same unvalidated jsonb, shape-checked only, degrading to the authored look on anything malformed or absent.
    return { ownerId: row.owner_id, version: ROOM_LAYOUT_VERSION, placements: migrateRoomPlacements(row.placements), finishes: readRoomFinishes(row.placements), updatedAt: row.updated_at };
  },
  async save(ownerId, layout) {
    const { error } = await supabase.from("user_room").upsert({
      owner_id: ownerId,
      // finishes is omitted entirely (not written as {}) when there are none, so a room that never touches the feature serialises exactly as it did before this field existed.
      placements: {
        version: ROOM_LAYOUT_VERSION,
        placements: layout.placements,
        ...(layout.finishes && Object.keys(layout.finishes).length > 0 ? { finishes: layout.finishes } : {}),
      } satisfies RoomEnvelope,
      updated_at: new Date().toISOString(),
    });
    check(error);
  },
};

// --- friends ----------------------------------------------------------------

type FriendRow = { friend_id: string; since: string };

const friendsRepo: FriendsRepo = {
  async list(userId) {
    const { data, error } = await supabase.from("friends").select("friend_id, since").eq("user_id", userId);
    check(error);
    return (data as FriendRow[]).map((r) => ({ userId: r.friend_id, since: r.since }));
  },
  async add(userId, friendId) {
    const { error } = await supabase.from("friends").insert({ user_id: userId, friend_id: friendId });
    check(error);
  },
  async remove(userId, friendId) {
    const { error } = await supabase.from("friends").delete().eq("user_id", userId).eq("friend_id", friendId);
    check(error);
  },
};

// --- friend requests --------------------------------------------------------

type FriendRequestRow = { from_id: string; to_id: string; created_at: string };

const toRequest = (r: FriendRequestRow): FriendRequest => ({ fromId: r.from_id, toId: r.to_id, createdAt: r.created_at });

const friendRequestsRepo: FriendRequestsRepo = {
  async listIncoming(userId) {
    // Explicit order, newest first: without it Postgres is free to return rows in any order it likes, which can change between two loads on identical data, unlike the in-memory adapter, whose plain array filter is deterministic by construction.
    const { data, error } = await supabase.from("friend_requests").select("from_id, to_id, created_at").eq("to_id", userId).order("created_at", { ascending: false });
    check(error);
    return (data as FriendRequestRow[]).map(toRequest);
  },
  async listOutgoing(userId) {
    // Same reasoning as listIncoming above: an explicit order keeps this deterministic and in step with the in-memory adapter.
    const { data, error } = await supabase.from("friend_requests").select("from_id, to_id, created_at").eq("from_id", userId).order("created_at", { ascending: false });
    check(error);
    return (data as FriendRequestRow[]).map(toRequest);
  },
  async send(fromId, toId) {
    // (from_id, to_id) is the primary key, so a repeat send collides; ignoreDuplicates turns that into the no-op the UI expects rather than an error the player would see.
    const { error } = await supabase.from("friend_requests").upsert({ from_id: fromId, to_id: toId }, { ignoreDuplicates: true });
    check(error);
  },
  async accept(_recipientId, requesterId) {
    // recipientId is deliberately UNUSED here. The RPC reads the recipient from auth.uid(); passing one would mean a caller could name someone else and befriend two accounts that never consented.
    const { error } = await supabase.rpc("accept_friend_request", { requester: requesterId });
    check(error);
  },
  async withdraw(fromId, toId) {
    const { error } = await supabase.from("friend_requests").delete().eq("from_id", fromId).eq("to_id", toId);
    check(error);
  },
};

// --- builds -----------------------------------------------------------------

type BuildRow = {
  builder_id: string;
  furniture_id: string;
  completed: BuildSave["completed"];
  tighten_deg: BuildSave["tightenDeg"];
  orientation_deg: BuildSave["orientationDeg"];
  drive_progress: BuildSave["driveProgress"];
  mode: string;
  updated_at: string;
};

function rowToBuild(r: BuildRow): BuildSave {
  return {
    ownerId: r.builder_id,
    furnitureId: r.furniture_id as BuildSave["furnitureId"],
    completed: r.completed ?? [],
    tightenDeg: r.tighten_deg ?? {},
    orientationDeg: r.orientation_deg ?? {},
    driveProgress: r.drive_progress ?? {},
    mode: (r.mode as AssemblyMode) ?? "free",
    updatedAt: r.updated_at,
  };
}

const buildRepo: BuildProgressRepo = {
  async list(ownerId) {
    const { data, error } = await supabase.from("user_save").select("*").eq("builder_id", ownerId);
    check(error);
    return (data as BuildRow[]).map(rowToBuild);
  },
  async get(ownerId, furnitureId) {
    const { data, error } = await supabase
      .from("user_save")
      .select("*")
      .eq("builder_id", ownerId)
      .eq("furniture_id", furnitureId)
      .maybeSingle();
    check(error);
    return data ? rowToBuild(data as BuildRow) : null;
  },
  async save(save) {
    const { error } = await supabase.from("user_save").upsert({
      builder_id: save.ownerId,
      furniture_id: save.furnitureId,
      completed: save.completed,
      tighten_deg: save.tightenDeg,
      orientation_deg: save.orientationDeg,
      drive_progress: save.driveProgress,
      mode: save.mode,
      updated_at: new Date().toISOString(),
    });
    check(error);
  },
  async clear(ownerId, furnitureId) {
    const { error } = await supabase.from("user_save").delete().eq("builder_id", ownerId).eq("furniture_id", furnitureId);
    check(error);
  },
  async complete(ownerId, furnitureId) {
    // Record the completion (upsert = idempotent; the trigger bumps assembly_count) then clear the in-progress save.
    const { error: insertError } = await supabase
      .from("user_build")
      .upsert({ builder_id: ownerId, furniture_id: furnitureId }, { onConflict: "builder_id,furniture_id", ignoreDuplicates: true });
    check(insertError);
    const { error: clearError } = await supabase.from("user_save").delete().eq("builder_id", ownerId).eq("furniture_id", furnitureId);
    check(clearError);
  },
  async reward(_ownerId, furnitureId) {
    // Atomic + idempotent + server-authoritative: reward_build reads the amount from item_build, inserts the one-per-build ledger row, bumps the profile, and (since migration 027) grants reward_item_id into user_buy — all as the authenticated caller, in one transaction, so a build cannot pay its coins and lose its item.
    const { data, error } = await supabase.rpc("reward_build", { p_furniture_id: furnitureId });
    check(error);
    const res = data as { ok: boolean; already_rewarded?: boolean; coins?: number; xp?: number; reward_item?: string | null };
    return {
      coins: res.coins ?? 0,
      xp: res.xp ?? 0,
      alreadyRewarded: res.already_rewarded ?? false,
      // The RPC returns null for a furniture that grants no item, and a database that has not applied 027 omits the key entirely — both mean the same thing here, so both collapse to absent rather than to a null the caller would have to test for separately.
      ...(res.reward_item ? { rewardItemId: res.reward_item } : {}),
    };
  },
  async buildReward(furnitureId) {
    // Read-only: the configured reward for the completion screen. Same source the grant uses — including the item, embedded through reward_item_id's foreign key so the name and category arrive in the SAME round trip rather than in a second lookup the screen would have to sequence. Same embedded-select shape listCompletedItems uses.
    const { data, error } = await supabase
      .from("item_build")
      .select("coin_reward, xp_reward, item_buy(id, name, category_id)")
      .eq("id", furnitureId)
      .maybeSingle();
    check(error);
    const row = data as BuildRewardRow | null;
    // A furniture with no catalog row at all reads as zero, which is what reward_build would grant it.
    return row ? toBuildRewardAmount(row) : { coins: 0, xp: 0 };
  },
  async syncCounts(furnitureId, counts) {
    // Push the recipe's derived counts so item_build' generated reward tracks the local model. Only counts cross; the per-step rates stay DB-authored. Best-effort — a failure here just means the catalog keeps its last-synced values.
    const { error } = await supabase.rpc("sync_furniture_counts", {
      p_furniture_id: furnitureId,
      p_step_count: counts.stepCount,
      p_stage_count: counts.stageCount,
      p_cluster_count: counts.clusterCount,
    });
    check(error);
  },
  async listCompletedItems(ownerId) {
    // Embedded select over user_build_furniture_fk — one round trip for the ids AND their catalog rows. A build whose catalog row was deleted yields a null join and is dropped rather than rendering a nameless tile.
    const { data, error } = await supabase
      .from("user_build")
      .select("furniture_id, item_build(name, category_id)")
      .eq("builder_id", ownerId);
    check(error);
    // PostgREST returns a to-one embed as an object, but the client's select-string inference types it as an array — accept either rather than betting on one shape.
    type Embedded = { name: string; category_id: string };
    type Row = { furniture_id: string; item_build: Embedded | Embedded[] | null };
    const rows = (data ?? []) as unknown as Row[];
    return rows.flatMap((r) => {
      const row = Array.isArray(r.item_build) ? r.item_build[0] : r.item_build;
      return row
        ? [{
            id: r.furniture_id as FurnitureId,
            name: row.name,
            category: row.category_id as ShopCategory,
          }]
        : [];
    });
  },
  async listCompleted(ownerId) {
    const { data, error } = await supabase.from("user_build").select("furniture_id").eq("builder_id", ownerId);
    check(error);
    return (data as { furniture_id: string }[]).map((r) => r.furniture_id as FurnitureId);
  },
};

// --- likes ------------------------------------------------------------------

const likesRepo: RoomLikesRepo = {
  async like(roomOwnerId, likerId) {
    // Idempotent — the trigger bumps the owner's cached likes only on a real insert.
    const { error } = await supabase
      .from("room_likes")
      .upsert({ room_owner_id: roomOwnerId, liker_id: likerId }, { onConflict: "room_owner_id,liker_id", ignoreDuplicates: true });
    check(error);
  },
  async unlike(roomOwnerId, likerId) {
    const { error } = await supabase.from("room_likes").delete().eq("room_owner_id", roomOwnerId).eq("liker_id", likerId);
    check(error);
  },
  async hasLiked(roomOwnerId, likerId) {
    const { data, error } = await supabase
      .from("room_likes")
      .select("liker_id")
      .eq("room_owner_id", roomOwnerId)
      .eq("liker_id", likerId)
      .maybeSingle();
    check(error);
    return data !== null;
  },
  async count(roomOwnerId) {
    const { count, error } = await supabase
      .from("room_likes")
      .select("*", { count: "exact", head: true })
      .eq("room_owner_id", roomOwnerId);
    check(error);
    return count ?? 0;
  },
};

// --- shop / inventory -------------------------------------------------------

// The purchasable catalog is item_buy — small and unchanging, so fetch it once per session. category_id maps to the app's ShopCategory (fur/deco/wall/floor/win/lit).
// item_surfaces is EMBEDDED rather than fetched separately: it is a satellite table keyed by item_id (migration 017), and one round trip that returns a null for every non-surface row beats a second query plus a client-side join over a catalogue this small. Postgrest returns an embedded to-one relation as an object or null, and older rows written before 017 simply arrive as null — which parseSurfaceSpec already reads as "this item has no surface data" rather than as a failure.
const getShopItems = cachedOnce(async (): Promise<ShopItem[]> => {
  // `*` for item_buy's own columns, NOT an explicit list — naming a column the live schema does not have yet fails the WHOLE fetch with a Postgrest 42703, so the shop and the inventory both go dead until the migration lands. That is a hard ordering dependency between a code deploy and a schema change, and it bit twice during this feature (once on `surface`, once on `granted`) before earning this comment. With `*`, a column that has not arrived is simply absent from the row, every reader below already treats absent as "not set", and the app degrades instead of breaking. item_buy is small and fetched once per session, so the few unused columns cost nothing.
  // The EMBED still has to name its columns — that is a different table, and it is the one place a rename must fail loudly rather than silently return nulls that read as "this item has no surface data".
  const { data, error } = await supabase
    .from("item_buy")
    .select("*, item_surfaces(scale_x, scale_y, offset_x, offset_y, has_normal, has_rough, edge_r, edge_g, edge_b, has_trim, has_trim_normal, has_trim_rough, trim_scale_x, trim_scale_y, trim_offset_x, trim_offset_y)");
  check(error);
  const live = (data as ShopItemRow[]).map(toShopItem);
  return [...live, ...(await getWorkshopDrafts())];
});

// DEV BUILDS ONLY: every testing-status workshop_draft, model and surface alike, as ShopItems. Model drafts are here because the Inventory is the only picker the room has, and it lists what listOwned returns — registering a model draft in listPlaceables gives the room its size and footprint but no way to CHOOSE it, which left uploads visible in the drafts table and absent from the app. Cached once per session, same as getShopItems, which is the only caller. Release and showcase builds skip the query entirely and resolve to [] synchronously — no network cost, no behaviour change from before this merge existed.
const getWorkshopDrafts = cachedOnce(async (): Promise<ShopItem[]> => {
  if (!WORKSHOP_DRAFTS_MERGE_ENABLED) return [];
  try {
    // `*` for the same reason getShopItems' own query is `*`: an unknown column must not fail the fetch.
    const { data, error } = await supabase.from("workshop_drafts").select("*").eq("status", "testing");
    if (error) throw error;
    return workshopDraftsToShopItems((data ?? []) as WorkshopDraftShopRow[]);
  } catch (err) {
    // A dev convenience is never worth taking the shop down — warn and merge nothing.
    console.warn("[shop] workshop_drafts merge failed; testing uploads will not appear this session", err);
    return [];
  }
});

const storeRepo: StoreRepo = {
  listItems() {
    return getShopItems();
  },
  // Owned = user_buy rows UNION granted UNION testing workshop drafts. user_buy includes paid purchases and server-side grants (build rewards, plus the starter furniture in migration 028). `granted` marks items every player has without a user_buy row (migration 018: the two default surfaces, which are what "revert the room to how it was designed" applies); the workshop half (dev builds only) marks a testing draft owned regardless of its own `granted` column, so it reaches the inventory and can be applied without needing a real purchase — the whole point of trying it before publish. Unioning granted/draft here rather than materialising a row per player per item keeps ownership a property of the ITEM — N x M rows to express a constant would go stale the first time a signup path forgot to write them, and would need a backfill for everyone who already exists.
  // The granted and draft lists both come off already-cached fetches, so this costs no extra request.
  async listOwned(userId) {
    const { data, error } = await supabase.from("user_buy").select("item_id").eq("owner_id", userId);
    check(error);
    const purchased = (data as { item_id: string }[]).map((r) => r.item_id);
    const granted = (await getShopItems()).filter((i) => i.granted).map((i) => i.id);
    const drafts = (await getWorkshopDrafts()).map((i) => i.id);
    return [...new Set([...purchased, ...granted, ...drafts])];
  },
  async purchase(_userId, itemId) {
    // Atomic in the DB: purchase_item checks balance + ownership + level, deducts coins and grants the item as the authenticated caller (auth.uid()), so _userId is implied — never trusted from the client.
    const { data, error } = await supabase.rpc("purchase_item", { p_item_id: itemId });
    check(error);
    const res = data as { ok: boolean; reason?: string; coins?: number };
    if (res.ok) return { ok: true, coinsRemaining: res.coins ?? 0 };
    // Map the RPC's reason onto the outcomes the UI knows how to show.
    const reason =
      res.reason === "already_owned" ? "already_owned" : res.reason === "level_locked" ? "level_locked" : "insufficient_coins";
    return { ok: false, reason };
  },
};

// --- variants ---------------------------------------------------------------

const variantsRepo: VariantsRepo = {
  async list() {
    // Whole table, no filter: reference data of a few rows per item, cached client-side by variantStore. Ordered so the picker's swatch row is stable across sessions rather than following the DB's whim.
    const { data, error } = await supabase
      .from("item_variants")
      .select("item_id, variation, is_default")
      .order("item_id")
      .order("variation");
    check(error);
    type Row = { item_id: string; variation: string | null; is_default: boolean };
    const live = ((data ?? []) as Row[]).map(
      (r): ItemVariant => ({ itemId: r.item_id, variation: r.variation, isDefault: r.is_default }),
    );

    // DEV BUILDS ONLY, and the same gate the shop and placeable merges use — see workshopDraftsGate.ts for why
    // the three must always move together. item_variants is written only by publish_workshop_draft, so without
    // this a testing draft has no colour axis at all: the empty list resolves to the 'default' path segment and
    // a draft with NAMED variations (white/grey/wooden) 404s on default.glb and default.png, both silently. That
    // made "test it before publishing" impossible for exactly the uploads most worth testing.
    if (!WORKSHOP_DRAFTS_MERGE_ENABLED) return live;
    try {
      // `*` for the same reason every other workshop_drafts query here uses it: an unknown column must not fail
      // the fetch. No .order() — the draft's array is already in the order the portal's variant rows were in,
      // and variantStore sorts the default to the front itself.
      const { data: draftRows, error: draftError } = await supabase
        .from("workshop_drafts")
        .select("*")
        .eq("status", "testing");
      if (draftError) throw draftError;
      return [...live, ...workshopDraftsToItemVariants((draftRows ?? []) as WorkshopDraftRow[])];
    } catch (err) {
      // A dev convenience is never worth taking the picker down — warn and fall back to the published axis only.
      console.warn("[variants] workshop_drafts merge failed; testing uploads will show no colour options", err);
      return live;
    }
  },
};

export function createSupabaseRepos(): Repos {
  return { catalog: catalogRepo, profiles: profileRepo, rooms: roomRepo, friends: friendsRepo, friendRequests: friendRequestsRepo, builds: buildRepo, likes: likesRepo, store: storeRepo, variants: variantsRepo };
}
