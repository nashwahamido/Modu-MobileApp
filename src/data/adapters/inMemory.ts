// In-memory adapter for the repo seam. Values are cloned on the way in and out so callers can't mutate the backing store by reference — the same isolation a network round-trip gives you.
import type { FurnitureId } from "@/src/game/core/type";
import type { BuildProgressRepo, CatalogRepo, FriendsRepo, ProfileRepo, Repos, RoomLayoutRepo, RoomLikesRepo, StoreRepo, VariantsRepo } from "../repos";
import type { BuildSave, Friend, Profile, ProfilePatch, RoomLayout, UserId } from "../types";
import type { ShopItemId } from "../shopItems";
import { levelForXp, levelSpan, titleForLevel } from "../levels";
import { seedBuildCatalog, seedBuilds, seedBuiltItems, seedCompleted, seedFriends, seedInventory, seedLevelRows, seedPlaceableItems, seedProfiles, seedItemVariants, seedRoomLikes, seedRooms, seedShopItems } from "./seed";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const delay = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

export interface InMemoryReposOptions {
  // Simulated round-trip latency in ms, to exercise loading states. Default 0 keeps tests fast.
  latencyMs?: number;
}

// Mirror of item_build' generated xp_reward/coin_reward totals (the reward-catalog seed) — keep in sync with the 20260724030000 migration. Furnitures not listed reward 0 (matches the DB).
// Each row is steps × the DB-authored rates (coins_per_step=3, xp_per_step=6, xp_bonus=0), with steps = the recipe's actions.length, exactly what sync_furniture_counts writes into step_count: lack 14, bekvam 35, dalfred 58, eket 147. Recompose a recipe and these go stale — the real adapter re-syncs, this table does not.
const DEFAULT_BUILT_REWARDS: Record<string, { coins: number; xp: number }> = {
  "eket-cabinet": { coins: 441, xp: 882 },
  "bekvam-stool": { coins: 105, xp: 210 },
  "dalfred-stool": { coins: 174, xp: 348 },
  "lack-table": { coins: 42, xp: 84 },
};

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
  // Which builds have been rewarded — mirrors the transaction one-per-build unique index, so a
  // repeat reward() is an idempotent no-op just like the Supabase RPC.
  const rewarded = new Map<UserId, Set<FurnitureId>>();
  const roomLikes = new Map<UserId, Set<UserId>>(
    Object.entries(seedRoomLikes()).map(([id, list]) => [id, new Set(list)] as [UserId, Set<UserId>]),
  );
  // Owned shop items per user — the contents of their inventory and the source of the shop's "owned" ticks.
  const inventory = new Map<UserId, Set<ShopItemId>>(
    Object.entries(seedInventory()).map(([id, list]) => [id, new Set(list)] as [UserId, Set<ShopItemId>]),
  );

  // The dev stand-in for the levels table. Tune levelling in the migration, not here.
  const levels = seedLevelRows();

  // Fill the derived fields (title and the xp span from the levels table, itemsAssembled/likes from the sets) — mirrors what the Supabase adapter reads back from the reference tables and the trigger-cached counters.
  const withDerived = (p: Profile): Profile => {
    const span = levelSpan(p.level, p.xp, levels);
    return {
      ...clone(p),
      title: titleForLevel(p.level, levels),
      xpIntoLevel: span.xpIntoLevel,
      xpForNextLevel: span.xpForNextLevel,
      itemsAssembled: completed.get(p.userId)?.size ?? 0,
      likes: roomLikes.get(p.userId)?.size ?? 0,
    };
  };

  const catalogRepo: CatalogRepo = {
    async listBuilds() {
      await delay(latency);
      return clone(seedBuildCatalog());
    },
    async listPlaceables() {
      await delay(latency);
      return clone(seedPlaceableItems());
    },
  };

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
      return { ownerId, version: 1, placements: [], updatedAt: new Date().toISOString() };
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
    async reward(ownerId, furnitureId) {
      await delay(latency);
      const profile = profiles.get(ownerId);
      if (!profile) throw new Error(`No profile for ${ownerId}`);
      // Server-authoritative amount, mirrored from the item_build seed (0 if not configured).
      const { coins, xp } = DEFAULT_BUILT_REWARDS[furnitureId] ?? { coins: 0, xp: 0 };
      const set = rewarded.get(ownerId) ?? new Set<FurnitureId>();
      // Idempotent: already rewarded → return current totals unchanged (mirrors the DB no-op).
      if (set.has(furnitureId)) return { coins: profile.coins, xp: profile.xp, alreadyRewarded: true };
      set.add(furnitureId);
      rewarded.set(ownerId, set);
      // level is DERIVED from the new xp total, not incremented — mirrors reward_build in the migration.
      const nextXp = profile.xp + xp;
      const next = { ...profile, coins: profile.coins + coins, xp: nextXp, level: levelForXp(nextXp, levels) };
      profiles.set(ownerId, next);
      return { coins: next.coins, xp: next.xp, alreadyRewarded: false };
    },
    async buildReward(furnitureId) {
      await delay(latency);
      return DEFAULT_BUILT_REWARDS[furnitureId] ?? { coins: 0, xp: 0 };
    },
    async syncCounts() {
      // No-op: the in-memory fixtures use pre-computed flat rewards (DEFAULT_BUILT_REWARDS), so there is no catalog row to mirror counts into. Only the Supabase adapter tracks the live recipe.
      await delay(latency);
    },
    async listCompleted(ownerId) {
      await delay(latency);
      return [...(completed.get(ownerId) ?? [])];
    },
    async listCompletedItems(ownerId) {
      await delay(latency);
      // Mirrors the Supabase join: a completed id with no catalog row is dropped, not rendered nameless.
      const catalog = seedBuiltItems();
      return [...(completed.get(ownerId) ?? [])].flatMap((id) => {
        const row = catalog[id];
        return row ? [{ id, name: row.name, category: row.category }] : [];
      });
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

  // The purchasable catalog. Read once into a local like every other seed above, rather than calling
  // seedShopItems() per request — purchase() and listItems() must agree on one set of rows.
  const shopItems = seedShopItems();

  const storeRepo: StoreRepo = {
    async listItems() {
      await delay(latency);
      return clone(shopItems);
    },
    async listOwned(userId) {
      await delay(latency);
      return [...(inventory.get(userId) ?? [])];
    },
    async purchase(userId, itemId) {
      await delay(latency);
      const owned = inventory.get(userId) ?? new Set<ShopItemId>();
      if (owned.has(itemId)) return { ok: false, reason: "already_owned" };
      const item = shopItems.find((i) => i.id === itemId);
      if (!item) throw new Error(`No shop item ${itemId}`);
      const profile = profiles.get(userId);
      if (!profile) throw new Error(`No profile for ${userId}`);
      if (profile.level < item.minLevel) return { ok: false, reason: "level_locked" };
      if (profile.coins < item.price) return { ok: false, reason: "insufficient_coins" };
      // Spend the coins and grant the item — the same two effects the Supabase RPC does atomically.
      const coinsRemaining = profile.coins - item.price;
      profiles.set(userId, { ...profile, coins: coinsRemaining });
      owned.add(itemId);
      inventory.set(userId, owned);
      return { ok: true, coinsRemaining };
    },
  };

  // Reference data, identical for every player — read once like shopItems above.
  const itemVariants = seedItemVariants();

  const variantsRepo: VariantsRepo = {
    async list() {
      await delay(latency);
      return clone(itemVariants);
    },
  };

  return { catalog: catalogRepo, profiles: profileRepo, rooms: roomRepo, friends: friendsRepo, builds: buildsRepo, likes: likesRepo, store: storeRepo, variants: variantsRepo };
}
