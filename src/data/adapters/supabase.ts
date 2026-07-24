// Supabase adapter for the repo seam — the ONE place that maps snake_case rows <-> the camelCase domain types. Everything above the seam (features, the game store) is unchanged when this replaces the in-memory adapter.
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/src/config/supabase";
import type { AssemblyMode } from "@/src/game/core/type";
import type { FurnitureId } from "@/src/game/core/type";
import type { BuildProgressRepo, FriendsRepo, ProfileRepo, Repos, RoomLayoutRepo, RoomLikesRepo } from "../repos";
import type { BuildSave, Friend, Profile, ProfilePatch, RoomLayout, UserId } from "../types";
import type { AvatarRef } from "../avatars";
import { idForMode, modeForId } from "../avatars";
import type { LevelTitle } from "../levelTitles";
import { titleForLevel } from "../levelTitles";

// Throw on any Postgrest error so callers get a real failure instead of a silent null.
function check(error: PostgrestError | null): void {
  if (error) throw error;
}

// Reference tables (level_titles, avatars) are small and rarely change — fetch each once per session and resolve client-side.
type Refs = { tiers: LevelTitle[]; avatars: AvatarRef[] };

let tiersCache: Promise<LevelTitle[]> | null = null;
function getTiers(): Promise<LevelTitle[]> {
  if (!tiersCache) {
    tiersCache = (async () => {
      const { data, error } = await supabase.from("level_titles").select("min_level, title");
      check(error);
      return (data as { min_level: number; title: string }[]).map((r) => ({ minLevel: r.min_level, title: r.title }));
    })();
  }
  return tiersCache;
}

let avatarsCache: Promise<AvatarRef[]> | null = null;
function getAvatars(): Promise<AvatarRef[]> {
  if (!avatarsCache) {
    avatarsCache = (async () => {
      const { data, error } = await supabase.from("avatars").select("id, mode");
      check(error);
      return (data as { id: number; mode: string }[]).map((r) => ({ id: r.id, mode: r.mode as AvatarRef["mode"] }));
    })();
  }
  return avatarsCache;
}

async function getRefs(): Promise<Refs> {
  const [tiers, avatars] = await Promise.all([getTiers(), getAvatars()]);
  return { tiers, avatars };
}

// --- profiles ---------------------------------------------------------------

type ProfileRow = {
  user_id: string;
  username: string | null;
  avatar_id: number | null;
  level: number | null;
  coins: number | null;
  xp: number | null;
  onboarding_completed: boolean | null;
  items_assembled: number | null;
  likes: number | null;
};

// title is derived from level; avatarMode is resolved from avatar_id — both via the refs passed in.
function rowToProfile(r: ProfileRow, refs: Refs): Profile {
  const level = r.level ?? 1;
  return {
    userId: r.user_id,
    username: r.username,
    avatarMode: modeForId(r.avatar_id, refs.avatars),
    level,
    coins: r.coins ?? 0,
    xp: r.xp ?? 0,
    onboardingCompleted: r.onboarding_completed ?? false,
    title: titleForLevel(level, refs.tiers),
    itemsAssembled: r.items_assembled ?? 0,
    likes: r.likes ?? 0,
  };
}

// Only the patched keys are sent, mapped to their columns. title is derived (not writable); avatarMode maps to the avatar_id FK.
function profilePatchToRow(patch: ProfilePatch, avatars: AvatarRef[]): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if ("username" in patch) row.username = patch.username;
  if ("avatarMode" in patch) row.avatar_id = idForMode(patch.avatarMode ?? null, avatars);
  if ("level" in patch) row.level = patch.level;
  if ("coins" in patch) row.coins = patch.coins;
  if ("xp" in patch) row.xp = patch.xp;
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

// --- rooms ------------------------------------------------------------------

type RoomRow = { owner_id: string; placements: RoomLayout["placements"]; updated_at: string };

const roomRepo: RoomLayoutRepo = {
  async get(ownerId) {
    const { data, error } = await supabase.from("room_layouts").select("*").eq("owner_id", ownerId).maybeSingle();
    check(error);
    if (!data) return { ownerId, placements: [], updatedAt: new Date().toISOString() };
    const row = data as RoomRow;
    return { ownerId: row.owner_id, placements: row.placements ?? [], updatedAt: row.updated_at };
  },
  async save(ownerId, layout) {
    const { error } = await supabase.from("room_layouts").upsert({
      owner_id: ownerId,
      placements: layout.placements,
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
  owner_id: string;
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
    ownerId: r.owner_id,
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
    const { data, error } = await supabase.from("build_saves").select("*").eq("owner_id", ownerId);
    check(error);
    return (data as BuildRow[]).map(rowToBuild);
  },
  async get(ownerId, furnitureId) {
    const { data, error } = await supabase
      .from("build_saves")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("furniture_id", furnitureId)
      .maybeSingle();
    check(error);
    return data ? rowToBuild(data as BuildRow) : null;
  },
  async save(save) {
    const { error } = await supabase.from("build_saves").upsert({
      owner_id: save.ownerId,
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
    const { error } = await supabase.from("build_saves").delete().eq("owner_id", ownerId).eq("furniture_id", furnitureId);
    check(error);
  },
  async complete(ownerId, furnitureId) {
    // Record the completion (upsert = idempotent; the trigger bumps items_assembled) then clear the in-progress save.
    const { error: insertError } = await supabase
      .from("completed_builds")
      .upsert({ owner_id: ownerId, furniture_id: furnitureId }, { onConflict: "owner_id,furniture_id", ignoreDuplicates: true });
    check(insertError);
    const { error: clearError } = await supabase.from("build_saves").delete().eq("owner_id", ownerId).eq("furniture_id", furnitureId);
    check(clearError);
  },
  async listCompleted(ownerId) {
    const { data, error } = await supabase.from("completed_builds").select("furniture_id").eq("owner_id", ownerId);
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

export function createSupabaseRepos(): Repos {
  return { profiles: profileRepo, rooms: roomRepo, friends: friendsRepo, builds: buildRepo, likes: likesRepo };
}
