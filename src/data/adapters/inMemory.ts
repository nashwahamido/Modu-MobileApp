// In-memory adapter for the repo seam. Values are cloned on the way in and out so callers can't mutate the backing store by reference — the same isolation a network round-trip gives you.
import type { FurnitureId } from "@/src/game/core/type";
import type { BuildProgressRepo, FriendsRepo, ProfileRepo, Repos, RoomLayoutRepo, RoomLikesRepo } from "../repos";
import type { BuildSave, Friend, Profile, ProfilePatch, RoomLayout, UserId } from "../types";
import { titleForLevel } from "../levelTitles";
import { seedBuilds, seedCompleted, seedFriends, seedProfiles, seedRoomLikes, seedRooms } from "./seed";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const delay = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

export interface InMemoryReposOptions {
  // Simulated round-trip latency in ms, to exercise loading states. Default 0 keeps tests fast.
  latencyMs?: number;
}

export function createInMemoryRepos(options: InMemoryReposOptions = {}): Repos {
  const latency = options.latencyMs ?? 0;
  const profiles = new Map<UserId, Profile>(seedProfiles().map((p) => [p.userId, p] as [UserId, Profile]));
  const rooms = new Map<UserId, RoomLayout>(seedRooms().map((r) => [r.ownerId, r] as [UserId, RoomLayout]));
  const friends = new Map<UserId, Friend[]>(Object.entries(seedFriends()));
  // Keyed by "ownerId:furnitureId" — one resumable save per furniture per user.
  const buildKey = (ownerId: UserId, furnitureId: string) => `${ownerId}:${furnitureId}`;
  const builds = new Map<string, BuildSave>(seedBuilds().map((b) => [buildKey(b.ownerId, b.furnitureId), b] as [string, BuildSave]));
  // Source-of-truth sets for the derived counts: finished furniture, and likers per room.
  const completed = new Map<UserId, Set<FurnitureId>>(
    Object.entries(seedCompleted()).map(([id, list]) => [id, new Set(list)] as [UserId, Set<FurnitureId>]),
  );
  const roomLikes = new Map<UserId, Set<UserId>>(
    Object.entries(seedRoomLikes()).map(([id, list]) => [id, new Set(list)] as [UserId, Set<UserId>]),
  );

  // Fill the derived fields (title from level, itemsAssembled/likes from the sets) — mirrors what the Supabase adapter reads back from the level_titles table and the trigger-cached counters.
  const withDerived = (p: Profile): Profile => ({
    ...clone(p),
    title: titleForLevel(p.level),
    itemsAssembled: completed.get(p.userId)?.size ?? 0,
    likes: roomLikes.get(p.userId)?.size ?? 0,
  });

  const profileRepo: ProfileRepo = {
    async get(userId) {
      await delay(latency);
      const found = profiles.get(userId);
      return found ? withDerived(found) : null;
    },
    async getMany(userIds) {
      await delay(latency);
      return userIds
        .map((id) => profiles.get(id))
        .filter((p): p is Profile => Boolean(p))
        .map(withDerived);
    },
    async update(userId, patch: ProfilePatch) {
      await delay(latency);
      const current = profiles.get(userId);
      if (!current) throw new Error(`No profile for ${userId}`);
      const next = { ...current, ...patch };
      profiles.set(userId, next);
      return withDerived(next);
    },
  };

  const roomRepo: RoomLayoutRepo = {
    async get(ownerId) {
      await delay(latency);
      const found = rooms.get(ownerId);
      if (found) return clone(found);
      // No room yet: hand back an empty one so callers never special-case null.
      return { ownerId, placements: [], updatedAt: new Date().toISOString() };
    },
    async save(ownerId, layout) {
      await delay(latency);
      rooms.set(ownerId, clone({ ...layout, ownerId }));
    },
  };

  const friendsRepo: FriendsRepo = {
    async list(userId) {
      await delay(latency);
      return clone(friends.get(userId) ?? []);
    },
    async add(userId, friendId) {
      await delay(latency);
      const list = friends.get(userId) ?? [];
      if (!list.some((f) => f.userId === friendId)) {
        list.push({ userId: friendId, since: new Date().toISOString() });
      }
      friends.set(userId, list);
    },
    async remove(userId, friendId) {
      await delay(latency);
      friends.set(userId, (friends.get(userId) ?? []).filter((f) => f.userId !== friendId));
    },
  };

  const buildsRepo: BuildProgressRepo = {
    async list(ownerId) {
      await delay(latency);
      return [...builds.values()].filter((b) => b.ownerId === ownerId).map(clone);
    },
    async get(ownerId, furnitureId) {
      await delay(latency);
      const found = builds.get(buildKey(ownerId, furnitureId));
      return found ? clone(found) : null;
    },
    async save(save) {
      await delay(latency);
      builds.set(buildKey(save.ownerId, save.furnitureId), clone(save));
    },
    async clear(ownerId, furnitureId) {
      await delay(latency);
      builds.delete(buildKey(ownerId, furnitureId));
    },
    async complete(ownerId, furnitureId) {
      await delay(latency);
      const set = completed.get(ownerId) ?? new Set<FurnitureId>();
      set.add(furnitureId);
      completed.set(ownerId, set);
      builds.delete(buildKey(ownerId, furnitureId));
    },
    async listCompleted(ownerId) {
      await delay(latency);
      return [...(completed.get(ownerId) ?? [])];
    },
  };

  const likesRepo: RoomLikesRepo = {
    async like(roomOwnerId, likerId) {
      await delay(latency);
      const set = roomLikes.get(roomOwnerId) ?? new Set<UserId>();
      set.add(likerId);
      roomLikes.set(roomOwnerId, set);
    },
    async unlike(roomOwnerId, likerId) {
      await delay(latency);
      roomLikes.get(roomOwnerId)?.delete(likerId);
    },
    async hasLiked(roomOwnerId, likerId) {
      await delay(latency);
      return roomLikes.get(roomOwnerId)?.has(likerId) ?? false;
    },
    async count(roomOwnerId) {
      await delay(latency);
      return roomLikes.get(roomOwnerId)?.size ?? 0;
    },
  };

  return { profiles: profileRepo, rooms: roomRepo, friends: friendsRepo, builds: buildsRepo, likes: likesRepo };
}
