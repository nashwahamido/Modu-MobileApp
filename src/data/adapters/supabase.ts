// the Supabase data connection
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/src/config/supabase";
import type { AssemblyMode, BrandId, FurnitureId } from "@/src/game/core/type";
import type {
  BuildProgressRepo,
  BuildRewardRow,
  CatalogRepo,
  FriendRequestsRepo,
  FriendsRepo,
  ItemVariant,
  PlaceableRoomRowInput,
  ProfileRepo,
  Repos,
  RoomLayoutRepo,
  RoomLikesRepo,
  StoreRepo,
  VariantsRepo,
  WorkshopDraftRow,
} from "../core/repos";
import {
  toBuildRewardAmount,
  toPlaceableRoomRow,
  workshopDraftsToItemVariants,
  workshopModelDraftsToPlaceableRoomRows,
} from "../core/repos";
import type {
  BuildSave,
  FriendRequest,
  Profile,
  ProfilePatch,
  RoomLayout,
} from "../core/types";
import { ROOM_LAYOUT_VERSION } from "../core/types";
import {
  toShopItem,
  workshopDraftsToShopItems,
  type ShopCategory,
  type ShopItem,
  type ShopItemRow,
  type WorkshopDraftShopRow,
} from "../shop/items";
import { workshopDraftsDevGateOpen } from "../catalog/workshopDraftsGate";
import type { AvatarRef } from "../player/avatars";
import { idForMode, modeForId } from "../player/avatars";
import type { LevelRow } from "../player/levels";
import { levelSpan, titleForLevel } from "../player/levels";
import { migrateRoomPlacements, readRoomFinishes } from "../room/layoutMigrate";

// let dev accounts test workshop items
const WORKSHOP_DRAFTS_MERGE_ENABLED = workshopDraftsDevGateOpen(
  __DEV__,
  process.env.EXPO_PUBLIC_DATA_BACKEND,
  process.env.EXPO_PUBLIC_SHOWCASE,
);

function check(error: PostgrestError | null): void {
  if (error) throw error;
}

// the reference tables behind a profile — level titles and avatars
type Refs = { levels: LevelRow[]; avatars: AvatarRef[] };

// caches the promise so concurrent callers share one round trip, and drops it on rejection
// without the reset one blip caches as a permanent failure, and getRefs() feeds every profile read
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
  const { data, error } = await supabase
    .from("levels")
    .select("level, xp_required, title");
  check(error);
  return (
    data as { level: number; xp_required: number; title: string | null }[]
  ).map((r) => ({
    level: r.level,
    xpRequired: r.xp_required,
    title: r.title,
  }));
});

const getAvatars = cachedOnce(async (): Promise<AvatarRef[]> => {
  const { data, error } = await supabase.from("avatars").select("id, mode");
  check(error);
  return (data as { id: number; mode: string }[]).map((r) => ({
    id: r.id,
    mode: r.mode as AvatarRef["mode"],
  }));
});

async function getRefs(): Promise<Refs> {
  const [levels, avatars] = await Promise.all([getLevels(), getAvatars()]);
  return { levels, avatars };
}

// --------------- profiles

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
    mapCoachSeen: r.map_coach_seen ?? false,
    title: titleForLevel(level, refs.levels),
    xpIntoLevel: span.xpIntoLevel,
    xpForNextLevel: span.xpForNextLevel,
    itemsAssembled: r.assembly_count ?? 0,
    likes: r.like_count ?? 0,
  };
}

// username and avatar only — coin/xp/level move through the RPCs
function profilePatchToRow(
  patch: ProfilePatch,
  avatars: AvatarRef[],
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if ("username" in patch) row.username = patch.username;
  if ("avatarMode" in patch)
    row.avatar_id = idForMode(patch.avatarMode ?? null, avatars);
  if ("onboardingCompleted" in patch)
    row.onboarding_completed = patch.onboardingCompleted;
  if ("mapCoachSeen" in patch) row.map_coach_seen = patch.mapCoachSeen;
  return row;
}

const profileRepo: ProfileRepo = {
  async get(userId) {
    const refs = await getRefs();
    const { data, error } = await supabase
      .from("user_profile")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    check(error);
    return data ? rowToProfile(data as ProfileRow, refs) : null;
  },
  async getMany(userIds) {
    if (userIds.length === 0) return [];
    const refs = await getRefs();
    const { data, error } = await supabase
      .from("user_profile")
      .select("*")
      .in("user_id", userIds);
    check(error);
    return (data as ProfileRow[]).map((r) => rowToProfile(r, refs));
  },

  async findByUsername(username) {
    const refs = await getRefs();
    const { data, error } = await supabase
      .from("user_profile")
      .select("*")
      .eq("username", username)
      .maybeSingle();
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

// --------------- catalog

const catalogRepo: CatalogRepo = {
  async listBuilds() {
    const { data, error } = await supabase
      .from("item_build")
      .select(
        "id, name, brand_id, link, duration_min, assembly_model, xp_per_step, xp_bonus, furniture_types(name)",
      );
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
      const type = Array.isArray(r.furniture_types)
        ? r.furniture_types[0]
        : r.furniture_types;
      return {
        id: r.id as FurnitureId,
        name: r.name,
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

  // the union view over both item tables
  async listPlaceables() {
    const { data, error } = await supabase
      .from("placeable_items")
      .select("*")
      .not("size_x", "is", null);
    check(error);
    const live = ((data ?? []) as PlaceableRoomRowInput[]).map(
      toPlaceableRoomRow,
    );

    // dev preview: testing drafts
    if (!WORKSHOP_DRAFTS_MERGE_ENABLED) return live;
    try {
      const { data: draftRows, error: draftError } = await supabase
        .from("workshop_drafts")
        .select("*")
        .eq("status", "testing");
      if (draftError) throw draftError;
      return [
        ...live,
        ...workshopModelDraftsToPlaceableRoomRows(
          (draftRows ?? []) as WorkshopDraftRow[],
        ),
      ];
    } catch (err) {
      console.warn(
        "[catalog] workshop_drafts merge failed; the room will not show testing uploads this session",
        err,
      );
      return live;
    }
  },
};

// --------------- rooms

type RoomEnvelope = {
  version: number;
  placements: RoomLayout["placements"];
  finishes?: RoomLayout["finishes"];
};
type RoomRow = {
  owner_id: string;
  placements: RoomEnvelope | unknown[];
  updated_at: string;
};

const roomRepo: RoomLayoutRepo = {
  async get(ownerId) {
    const { data, error } = await supabase
      .from("user_room")
      .select("*")
      .eq("owner_id", ownerId)
      .maybeSingle();
    check(error);
    if (!data)
      return {
        ownerId,
        version: ROOM_LAYOUT_VERSION,
        placements: [],
        updatedAt: new Date().toISOString(),
      };
    const row = data as RoomRow;
    return {
      ownerId: row.owner_id,
      version: ROOM_LAYOUT_VERSION,
      placements: migrateRoomPlacements(row.placements),
      finishes: readRoomFinishes(row.placements),
      updatedAt: row.updated_at,
    };
  },
  async save(ownerId, layout) {
    const { error } = await supabase.from("user_room").upsert({
      owner_id: ownerId,
      placements: {
        version: ROOM_LAYOUT_VERSION,
        placements: layout.placements,
        ...(layout.finishes && Object.keys(layout.finishes).length > 0
          ? { finishes: layout.finishes }
          : {}),
      } satisfies RoomEnvelope,
      updated_at: new Date().toISOString(),
    });
    check(error);
  },
};

// --------------- friends

type FriendRow = { friend_id: string; since: string };

const friendsRepo: FriendsRepo = {
  async list(userId) {
    const { data, error } = await supabase
      .from("friends")
      .select("friend_id, since")
      .eq("user_id", userId);
    check(error);
    return (data as FriendRow[]).map((r) => ({
      userId: r.friend_id,
      since: r.since,
    }));
  },
  async add(userId, friendId) {
    const { error } = await supabase
      .from("friends")
      .insert({ user_id: userId, friend_id: friendId });
    check(error);
  },
  async remove(userId, friendId) {
    const { error } = await supabase
      .from("friends")
      .delete()
      .eq("user_id", userId)
      .eq("friend_id", friendId);
    check(error);
  },
};

// --------------- friend requests

type FriendRequestRow = { from_id: string; to_id: string; created_at: string };

const toRequest = (r: FriendRequestRow): FriendRequest => ({
  fromId: r.from_id,
  toId: r.to_id,
  createdAt: r.created_at,
});

const friendRequestsRepo: FriendRequestsRepo = {
  async listIncoming(userId) {
    const { data, error } = await supabase
      .from("friend_requests")
      .select("from_id, to_id, created_at")
      .eq("to_id", userId)
      .order("created_at", { ascending: false }); // newest first
    check(error);
    return (data as FriendRequestRow[]).map(toRequest);
  },
  async listOutgoing(userId) {
    const { data, error } = await supabase
      .from("friend_requests")
      .select("from_id, to_id, created_at")
      .eq("from_id", userId)
      .order("created_at", { ascending: false });
    check(error);
    return (data as FriendRequestRow[]).map(toRequest);
  },
  async send(fromId, toId) {
    const { error } = await supabase
      .from("friend_requests")
      .upsert({ from_id: fromId, to_id: toId }, { ignoreDuplicates: true });
    check(error);
  },
  async accept(_recipientId, requesterId) {
    const { error } = await supabase.rpc("accept_friend_request", {
      requester: requesterId,
    });
    check(error);
  },
  async withdraw(fromId, toId) {
    const { error } = await supabase
      .from("friend_requests")
      .delete()
      .eq("from_id", fromId)
      .eq("to_id", toId);
    check(error);
  },
};

// --------------- builds

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
    const { data, error } = await supabase
      .from("user_save")
      .select("*")
      .eq("builder_id", ownerId);
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
    const { error } = await supabase
      .from("user_save")
      .delete()
      .eq("builder_id", ownerId)
      .eq("furniture_id", furnitureId);
    check(error);
  },
  async complete(ownerId, furnitureId) {
    const { error: insertError } = await supabase
      .from("user_build")
      .upsert(
        { builder_id: ownerId, furniture_id: furnitureId },
        { onConflict: "builder_id,furniture_id", ignoreDuplicates: true },
      );
    check(insertError);
    const { error: clearError } = await supabase
      .from("user_save")
      .delete()
      .eq("builder_id", ownerId)
      .eq("furniture_id", furnitureId);
    check(clearError);
  },
  async reward(_ownerId, furnitureId) {
    const { data, error } = await supabase.rpc("reward_build", {
      p_furniture_id: furnitureId,
    });
    check(error);
    const res = data as {
      ok: boolean;
      already_rewarded?: boolean;
      coins?: number;
      xp?: number;
      reward_item?: string | null;
    };
    return {
      coins: res.coins ?? 0,
      xp: res.xp ?? 0,
      alreadyRewarded: res.already_rewarded ?? false,
      ...(res.reward_item ? { rewardItemId: res.reward_item } : {}),
    };
  },
  async buildReward(furnitureId) {
    const { data, error } = await supabase
      .from("item_build")
      .select("coin_reward, xp_reward, item_buy(id, name, category_id)")
      .eq("id", furnitureId)
      .maybeSingle();
    check(error);
    const row = data as BuildRewardRow | null;
    return row ? toBuildRewardAmount(row) : { coins: 0, xp: 0 };
  },
  async syncCounts(furnitureId, counts) {
    // push the recipe's counts so item_build's generated reward knows the local model; rates stay DB-authored
    const { error } = await supabase.rpc("sync_furniture_counts", {
      p_furniture_id: furnitureId,
      p_step_count: counts.stepCount,
      p_stage_count: counts.stageCount,
      p_cluster_count: counts.clusterCount,
    });
    check(error);
  },
  async listCompletedItems(ownerId) {
    const { data, error } = await supabase
      .from("user_build")
      .select("furniture_id, item_build(name, category_id)")
      .eq("builder_id", ownerId);
    check(error);
    type Embedded = { name: string; category_id: string };
    type Row = {
      furniture_id: string;
      item_build: Embedded | Embedded[] | null;
    };
    const rows = (data ?? []) as unknown as Row[];
    return rows.flatMap((r) => {
      const row = Array.isArray(r.item_build) ? r.item_build[0] : r.item_build;
      return row
        ? [
            {
              id: r.furniture_id as FurnitureId,
              name: row.name,
              category: row.category_id as ShopCategory,
            },
          ]
        : [];
    });
  },
  async listCompleted(ownerId) {
    const { data, error } = await supabase
      .from("user_build")
      .select("furniture_id")
      .eq("builder_id", ownerId);
    check(error);
    return (data as { furniture_id: string }[]).map(
      (r) => r.furniture_id as FurnitureId,
    );
  },
};

// --------------- likes

const likesRepo: RoomLikesRepo = {
  async like(roomOwnerId, likerId) {
    const { error } = await supabase
      .from("room_likes")
      .upsert(
        { room_owner_id: roomOwnerId, liker_id: likerId },
        { onConflict: "room_owner_id,liker_id", ignoreDuplicates: true },
      );
    check(error);
  },
  async unlike(roomOwnerId, likerId) {
    const { error } = await supabase
      .from("room_likes")
      .delete()
      .eq("room_owner_id", roomOwnerId)
      .eq("liker_id", likerId);
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

// --------------- shop / inventory

// the purchasable catalog is item_buy
const getShopItems = cachedOnce(async (): Promise<ShopItem[]> => {
  const { data, error } = await supabase
    .from("item_buy")
    .select(
      "*, item_surfaces(scale_x, scale_y, offset_x, offset_y, has_normal, has_rough, edge_r, edge_g, edge_b, has_trim, has_trim_normal, has_trim_rough, trim_scale_x, trim_scale_y, trim_offset_x, trim_offset_y)",
    );
  check(error);
  const live = (data as ShopItemRow[]).map(toShopItem);
  return [...live, ...(await getWorkshopDrafts())];
});

// dev only: every testing draft as a ShopItem
const getWorkshopDrafts = cachedOnce(async (): Promise<ShopItem[]> => {
  if (!WORKSHOP_DRAFTS_MERGE_ENABLED) return [];
  try {
    const { data, error } = await supabase
      .from("workshop_drafts")
      .select("*")
      .eq("status", "testing");
    if (error) throw error;
    return workshopDraftsToShopItems((data ?? []) as WorkshopDraftShopRow[]);
  } catch (err) {
    console.warn(
      "[shop] workshop_drafts merge failed; testing uploads will not appear this session",
      err,
    );
    return [];
  }
});

const storeRepo: StoreRepo = {
  listItems() {
    return getShopItems();
  },
  // owned = user_buy rows + granted + testing drafts (dev only)
  async listOwned(userId) {
    const { data, error } = await supabase
      .from("user_buy")
      .select("item_id")
      .eq("owner_id", userId);
    check(error);
    const purchased = (data as { item_id: string }[]).map((r) => r.item_id);
    const granted = (await getShopItems())
      .filter((i) => i.granted)
      .map((i) => i.id);
    const drafts = (await getWorkshopDrafts()).map((i) => i.id);
    return [...new Set([...purchased, ...granted, ...drafts])];
  },
  async purchase(_userId, itemId) {
    const { data, error } = await supabase.rpc("purchase_item", {
      p_item_id: itemId,
    });
    check(error);
    const res = data as { ok: boolean; reason?: string; coins?: number };
    if (res.ok) return { ok: true, coinsRemaining: res.coins ?? 0 };
    const reason =
      res.reason === "already_owned"
        ? "already_owned"
        : res.reason === "level_locked"
          ? "level_locked"
          : "insufficient_coins";
    return { ok: false, reason };
  },
};

// --------------- variants

const variantsRepo: VariantsRepo = {
  async list() {
    const { data, error } = await supabase
      .from("item_variants")
      .select("item_id, variation, is_default")
      .order("item_id")
      .order("variation");
    check(error);
    type Row = {
      item_id: string;
      variation: string | null;
      is_default: boolean;
    };
    const live = ((data ?? []) as Row[]).map(
      (r): ItemVariant => ({
        itemId: r.item_id,
        variation: r.variation,
        isDefault: r.is_default,
      }),
    );

    // dev only: testing drafts
    if (!WORKSHOP_DRAFTS_MERGE_ENABLED) return live;
    try {
      const { data: draftRows, error: draftError } = await supabase
        .from("workshop_drafts")
        .select("*")
        .eq("status", "testing");
      if (draftError) throw draftError;
      return [
        ...live,
        ...workshopDraftsToItemVariants(
          (draftRows ?? []) as WorkshopDraftRow[],
        ),
      ];
    } catch (err) {
      console.warn(
        "[variants] workshop_drafts merge failed; testing uploads will show no colour options",
        err,
      );
      return live;
    }
  },
};

export function createSupabaseRepos(): Repos {
  return {
    catalog: catalogRepo,
    profiles: profileRepo,
    rooms: roomRepo,
    friends: friendsRepo,
    friendRequests: friendRequestsRepo,
    builds: buildRepo,
    likes: likesRepo,
    store: storeRepo,
    variants: variantsRepo,
  };
}
