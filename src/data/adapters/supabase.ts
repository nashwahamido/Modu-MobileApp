// Supabase adapter for the repo seam — the ONE place that maps snake_case rows <-> the camelCase domain types. Everything above the seam (features, the game store) is unchanged when this replaces the in-memory adapter.
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/src/config/supabase";
import type { AssemblyMode, BrandId, FurnitureId } from "@/src/game/core/type";
import type { BuildProgressRepo, CatalogRepo, FriendsRepo, ItemVariant, PlaceableRoomRow, ProfileRepo, Repos, RoomLayoutRepo, RoomLikesRepo, StoreRepo, VariantsRepo } from "../repos";
import type { BuildSave, Profile, ProfilePatch, RoomLayout } from "../types";
import type { ShopCategory, ShopItem } from "../shopItems";
import type { AvatarRef } from "../avatars";
import { idForMode, modeForId } from "../avatars";
import type { LevelRow } from "../levels";
import { levelSpan, titleForLevel } from "../levels";

// Throw on any Postgrest error so callers get a real failure instead of a silent null.
function check(error: PostgrestError | null): void {
  if (error) throw error;
}

// Reference tables (levels, avatars) are small and rarely change — fetch each once per session and resolve client-side.
type Refs = { levels: LevelRow[]; avatars: AvatarRef[] };

// Caches the PROMISE, so concurrent callers share one round trip — but drops it again if that promise
// rejects. Without the reset a single transient failure (a blip, or a fetch that raced ahead of the
// session) would be cached as a permanently-rejected promise: getRefs() feeds every profile read, so
// the HUD, store, inventory and profile screen would all stay broken until the app was restarted.
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
    title: titleForLevel(level, refs.levels),
    xpIntoLevel: span.xpIntoLevel,
    xpForNextLevel: span.xpForNextLevel,
    itemsAssembled: r.assembly_count ?? 0,
    likes: r.like_count ?? 0,
  };
}

// Only the patched keys are sent, mapped to their columns. title is derived (not writable); avatarMode maps to the avatar_id FK.
// coin/xp/level are absent BY DESIGN — see ProfilePatch. They are economy state and move only through the RPCs; the DB revokes UPDATE on those columns, so adding them back here would fail at the API anyway.
function profilePatchToRow(patch: ProfilePatch, avatars: AvatarRef[]): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if ("username" in patch) row.username = patch.username;
  if ("avatarMode" in patch) row.avatar_id = idForMode(patch.avatarMode ?? null, avatars);
  if ("onboardingCompleted" in patch) row.onboarding_completed = patch.onboardingCompleted;
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
      .select("id, name, brand_id, link, duration_min, furniture_types(name)");
    check(error);
    type Embedded = { name: string };
    type Row = {
      id: string;
      name: string;
      brand_id: string | null;
      link: string | null;
      duration_min: number | null;
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
        ...(r.link ? { link: r.link } : {}),
      };
    });
  },

  async listPlaceables() {
    // The union view spans both item tables; a null size means "no room model authored", so those
    // rows are filtered server-side — the room never sees an item it could not place.
    const { data, error } = await supabase
      .from("placeable_items")
      .select("id, source, size_x, size_y, size_z, base_offset_y")
      .not("size_x", "is", null);
    check(error);
    type Row = { id: string; source: "built" | "bought"; size_x: number; size_y: number; size_z: number; base_offset_y: number };
    return ((data ?? []) as Row[]).map(
      (r): PlaceableRoomRow => ({
        id: r.id,
        source: r.source,
        size: { x: r.size_x, y: r.size_y, z: r.size_z },
        baseOffsetY: r.base_offset_y,
      }),
    );
  },
};

// --- rooms ------------------------------------------------------------------

// The jsonb column carries a versioned envelope: { version, placements }. Legacy rows hold a bare
// array from the pre-grid model — those coordinates are meaningless on the grid, so any shape
// other than the current envelope reads as an empty room rather than a mis-placed one.
type RoomEnvelope = { version: number; placements: RoomLayout["placements"] };
type RoomRow = { owner_id: string; placements: RoomEnvelope | unknown[]; updated_at: string };

const roomRepo: RoomLayoutRepo = {
  async get(ownerId) {
    const { data, error } = await supabase.from("user_room").select("*").eq("owner_id", ownerId).maybeSingle();
    check(error);
    if (!data) return { ownerId, version: 1, placements: [], updatedAt: new Date().toISOString() };
    const row = data as RoomRow;
    const envelope = row.placements;
    // Version AND shape: a malformed row ({version:1} with no/null placements) must read as an
    // empty room, not hand `undefined` to the store to throw on later.
    const placements =
      !Array.isArray(envelope) && envelope?.version === 1 && Array.isArray(envelope.placements)
        ? envelope.placements
        : [];
    return { ownerId: row.owner_id, version: 1, placements, updatedAt: row.updated_at };
  },
  async save(ownerId, layout) {
    const { error } = await supabase.from("user_room").upsert({
      owner_id: ownerId,
      placements: { version: 1, placements: layout.placements } satisfies RoomEnvelope,
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
    // Atomic + idempotent + server-authoritative: reward_build reads the amount from item_build,
    // inserts the one-per-build ledger row, and bumps the profile as the authenticated caller.
    const { data, error } = await supabase.rpc("reward_build", { p_furniture_id: furnitureId });
    check(error);
    const res = data as { ok: boolean; already_rewarded?: boolean; coins?: number; xp?: number };
    return { coins: res.coins ?? 0, xp: res.xp ?? 0, alreadyRewarded: res.already_rewarded ?? false };
  },
  async buildReward(furnitureId) {
    // Read-only: the configured reward for the completion screen. Same source the grant uses.
    const { data, error } = await supabase
      .from("item_build")
      .select("coin_reward, xp_reward")
      .eq("id", furnitureId)
      .maybeSingle();
    check(error);
    const row = data as { coin_reward: number; xp_reward: number } | null;
    return { coins: row?.coin_reward ?? 0, xp: row?.xp_reward ?? 0 };
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

// The purchasable catalog is item_buy — small and
// unchanging, so fetch it once per session. category_id maps to the app's ShopCategory (fur/deco/wall/floor).
const getShopItems = cachedOnce(async (): Promise<ShopItem[]> => {
  const { data, error } = await supabase.from("item_buy").select("id, name, category_id, price, min_level");
  check(error);
  return (data as { id: string; name: string; category_id: string; price: number; min_level: number }[]).map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category_id as ShopItem["category"],
    price: r.price,
    minLevel: r.min_level,
  }));
});

const storeRepo: StoreRepo = {
  listItems() {
    return getShopItems();
  },
  async listOwned(userId) {
    const { data, error } = await supabase.from("user_buy").select("item_id").eq("owner_id", userId);
    check(error);
    return (data as { item_id: string }[]).map((r) => r.item_id);
  },
  async purchase(_userId, itemId) {
    // Atomic in the DB: purchase_item checks balance + ownership + level, deducts coins and grants the
    // item as the authenticated caller (auth.uid()), so _userId is implied — never trusted from the client.
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
    // Whole table, no filter: reference data of a few rows per item, cached client-side by variantStore.
    // Ordered so the picker's swatch row is stable across sessions rather than following the DB's whim.
    const { data, error } = await supabase
      .from("item_variants")
      .select("item_id, variation, is_default")
      .order("item_id")
      .order("variation");
    check(error);
    type Row = { item_id: string; variation: string | null; is_default: boolean };
    return ((data ?? []) as Row[]).map(
      (r): ItemVariant => ({ itemId: r.item_id, variation: r.variation, isDefault: r.is_default }),
    );
  },
};

export function createSupabaseRepos(): Repos {
  return { catalog: catalogRepo, profiles: profileRepo, rooms: roomRepo, friends: friendsRepo, builds: buildRepo, likes: likesRepo, store: storeRepo, variants: variantsRepo };
}
