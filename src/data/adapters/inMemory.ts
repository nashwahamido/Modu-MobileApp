// the in-memory data connection. used together with seed.ts
import type { FurnitureId } from "@/src/game/core/type";
import type {
  BuildProgressRepo,
  CatalogRepo,
  FriendRequestsRepo,
  FriendsRepo,
  ProfileRepo,
  Repos,
  RewardItem,
  RoomLayoutRepo,
  RoomLikesRepo,
  StoreRepo,
  VariantsRepo,
} from "../core/repos";
import type {
  BuildSave,
  Friend,
  FriendRequest,
  Profile,
  ProfilePatch,
  RoomLayout,
  UserId,
} from "../core/types";
import { ROOM_LAYOUT_VERSION } from "../core/types";
import type { ShopItemId } from "../shop/items";
import { levelForXp, levelSpan, titleForLevel } from "../player/levels";
import {
  seedBuildCatalog,
  seedBuilds,
  seedBuiltItems,
  seedCompleted,
  seedFriends,
  seedInventory,
  seedLevelRows,
  seedPlaceableItems,
  seedProfiles,
  seedItemVariants,
  seedRoomLikes,
  seedRooms,
  seedShopItems,
} from "./seed";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const delay = (ms: number): Promise<void> =>
  ms > 0
    ? new Promise((resolve) => setTimeout(resolve, ms))
    : Promise.resolve();

export interface InMemoryReposOptions {
  // simulated latency in ms, to show loading states.
  latencyMs?: number;
}

// rewards for rach task
const DEFAULT_BUILT_REWARDS: Record<string, { coins: number; xp: number }> = {
  "eket-cabinet": { coins: 441, xp: 882 },
  "bekvam-stool": { coins: 105, xp: 210 },
  "dalfred-stool": { coins: 174, xp: 348 },
  "lack-table": { coins: 42, xp: 84 },
};

// mirrors item_build.reward_item_id — every id here MUST exist in seedShopItems() or the grant vanishes silently
// ONE ENTRY, a shape fixture: lack-table -> neiden-bedframe only because DEMO_ME does not own it, so a grant is observable
const DEFAULT_BUILT_REWARD_ITEMS: Record<string, RewardItem> = {
  "lack-table": {
    id: "neiden-bedframe",
    name: "NEIDEN Bedframe",
    category: "fur",
  },
};

export function createInMemoryRepos(options: InMemoryReposOptions = {}): Repos {
  const latency = options.latencyMs ?? 0;
  const profiles = new Map<UserId, Profile>(
    seedProfiles().map((p) => [p.userId, p] as [UserId, Profile]),
  );
  const rooms = new Map<UserId, RoomLayout>(
    seedRooms().map((r) => [r.ownerId, r] as [UserId, RoomLayout]),
  );
  const friends = new Map<UserId, Friend[]>(Object.entries(seedFriends()));
  // never seeded: a pending request is session state, and a fixture one is a permanent unearned badge on the tab
  const requests: FriendRequest[] = [];
  // keyed by "ownerId:furnitureId" — one resumable save per furniture per user
  const buildKey = (ownerId: UserId, furnitureId: string) =>
    `${ownerId}:${furnitureId}`;
  const builds = new Map<string, BuildSave>(
    seedBuilds().map(
      (b) => [buildKey(b.ownerId, b.furnitureId), b] as [string, BuildSave],
    ),
  );
  // the source-of-truth sets behind the derived counts: finished furniture, and likers per room
  const completed = new Map<UserId, Set<FurnitureId>>(
    Object.entries(seedCompleted()).map(
      ([id, list]) => [id, new Set(list)] as [UserId, Set<FurnitureId>],
    ),
  );
  // mirrors the ledger's one-per-build unique index, so a repeat reward() is an idempotent no-op like the RPC
  const rewarded = new Map<UserId, Set<FurnitureId>>();
  const roomLikes = new Map<UserId, Set<UserId>>(
    Object.entries(seedRoomLikes()).map(
      ([id, list]) => [id, new Set(list)] as [UserId, Set<UserId>],
    ),
  );
  // owned shop items per user — their inventory, and the source of the shop's "owned" ticks
  const inventory = new Map<UserId, Set<ShopItemId>>(
    Object.entries(seedInventory()).map(
      ([id, list]) => [id, new Set(list)] as [UserId, Set<ShopItemId>],
    ),
  );

  // the dev stand-in for the levels table. tune levelling in the migration, not here
  const levels = seedLevelRows();

  // fills the derived fields the Supabase adapter reads back from the reference tables and cached counters
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
    async findByUsername(username) {
      await delay(latency);
      for (const p of profiles.values()) {
        if (p.username === username) return withDerived(p);
      }
      return null;
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
      // no room yet: hand back an empty one, so callers never special-case null
      return {
        ownerId,
        version: ROOM_LAYOUT_VERSION,
        placements: [],
        updatedAt: new Date().toISOString(),
      };
    },
    async save(ownerId, layout) {
      await delay(latency);
      rooms.set(ownerId, clone({ ...layout, ownerId }));
    },
  };

  // one directed edge, deduped — behind friendsRepo.add and behind BOTH writes an accept performs
  const addEdge = (userId: UserId, friendId: UserId) => {
    const list = friends.get(userId) ?? [];
    if (!list.some((f) => f.userId === friendId)) {
      list.push({ userId: friendId, since: new Date().toISOString() });
    }
    friends.set(userId, list);
  };

  const friendsRepo: FriendsRepo = {
    async list(userId) {
      await delay(latency);
      return clone(friends.get(userId) ?? []);
    },
    async add(userId, friendId) {
      await delay(latency);
      addEdge(userId, friendId);
    },
    async remove(userId, friendId) {
      await delay(latency);
      friends.set(
        userId,
        (friends.get(userId) ?? []).filter((f) => f.userId !== friendId),
      );
    },
  };

  const friendRequestsRepo: FriendRequestsRepo = {
    async listIncoming(userId) {
      await delay(latency);
      return clone(requests.filter((r) => r.toId === userId));
    },
    async listOutgoing(userId) {
      await delay(latency);
      return clone(requests.filter((r) => r.fromId === userId));
    },
    async send(fromId, toId) {
      await delay(latency);
      // friend_requests_not_self in the migration, mirrored here so fixtures fail the way the DB would
      if (fromId === toId)
        throw new Error("cannot send a friend request to yourself");
      if (requests.some((r) => r.fromId === fromId && r.toId === toId)) return;
      requests.push({ fromId, toId, createdAt: new Date().toISOString() });
    },
    async accept(recipientId, requesterId) {
      await delay(latency);
      // mirrors accept_friend_request: removing the request IS the authorisation check, and both edges go together
      const index = requests.findIndex(
        (r) => r.fromId === requesterId && r.toId === recipientId,
      );
      if (index === -1)
        throw new Error(`no pending friend request from ${requesterId}`);
      requests.splice(index, 1);
      addEdge(recipientId, requesterId);
      addEdge(requesterId, recipientId);
    },
    async withdraw(fromId, toId) {
      await delay(latency);
      const index = requests.findIndex(
        (r) => r.fromId === fromId && r.toId === toId,
      );
      if (index !== -1) requests.splice(index, 1);
    },
  };

  const buildsRepo: BuildProgressRepo = {
    async list(ownerId) {
      await delay(latency);
      return [...builds.values()]
        .filter((b) => b.ownerId === ownerId)
        .map(clone);
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
      // the server-authoritative amount, mirrored from the item_build seed, 0 when not configured
      const { coins, xp } = DEFAULT_BUILT_REWARDS[furnitureId] ?? {
        coins: 0,
        xp: 0,
      };
      const rewardItem = DEFAULT_BUILT_REWARD_ITEMS[furnitureId];
      const set = rewarded.get(ownerId) ?? new Set<FurnitureId>();
      // into the inventory a purchase writes to, and BEFORE the already-rewarded return, so the id always names something owned
      // a Set, so a repeat is a no-op — the fixture's mirror of the RPC's `on conflict do nothing`
      if (rewardItem) {
        const owned = inventory.get(ownerId) ?? new Set<ShopItemId>();
        owned.add(rewardItem.id);
        inventory.set(ownerId, owned);
      }
      // only the CURRENCY is gated here — ownership was settled above, so a repeat returns the totals unchanged
      if (set.has(furnitureId)) {
        return {
          coins: profile.coins,
          xp: profile.xp,
          alreadyRewarded: true,
          ...(rewardItem ? { rewardItemId: rewardItem.id } : {}),
        };
      }
      set.add(furnitureId);
      rewarded.set(ownerId, set);
      // level is DERIVED from the new xp total, not incremented — mirrors reward_build in the migration
      const nextXp = profile.xp + xp;
      const next = {
        ...profile,
        coins: profile.coins + coins,
        xp: nextXp,
        level: levelForXp(nextXp, levels),
      };
      profiles.set(ownerId, next);
      return {
        coins: next.coins,
        xp: next.xp,
        alreadyRewarded: false,
        ...(rewardItem ? { rewardItemId: rewardItem.id } : {}),
      };
    },
    async buildReward(furnitureId) {
      await delay(latency);
      const item = DEFAULT_BUILT_REWARD_ITEMS[furnitureId];
      // spread, not an explicit undefined, matching toBuildRewardAmount — no reward item means NO item key
      return {
        ...(DEFAULT_BUILT_REWARDS[furnitureId] ?? { coins: 0, xp: 0 }),
        ...(item ? { item } : {}),
      };
    },
    async syncCounts() {
      // a no-op: the fixtures use flat rewards, so there is no catalog row to mirror counts into
      await delay(latency);
    },
    async listCompleted(ownerId) {
      await delay(latency);
      return [...(completed.get(ownerId) ?? [])];
    },
    async listCompletedItems(ownerId) {
      await delay(latency);
      // mirrors the Supabase join: a completed id with no catalog row is dropped, not rendered nameless
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

  // read once into a local rather than per request — purchase() and listItems() must agree on ONE set of rows
  const shopItems = seedShopItems();

  const storeRepo: StoreRepo = {
    async listItems() {
      await delay(latency);
      return clone(shopItems);
    },
    // purchased UNION granted, like the Supabase adapter — which makes the default surfaces ordinary inventory items
    async listOwned(userId) {
      await delay(latency);
      const granted = shopItems.filter((i) => i.granted).map((i) => i.id);
      return [...new Set([...(inventory.get(userId) ?? []), ...granted])];
    },
    async purchase(userId, itemId) {
      await delay(latency);
      const owned = inventory.get(userId) ?? new Set<ShopItemId>();
      if (owned.has(itemId)) return { ok: false, reason: "already_owned" };
      const item = shopItems.find((i) => i.id === itemId);
      if (!item) throw new Error(`No shop item ${itemId}`);
      const profile = profiles.get(userId);
      if (!profile) throw new Error(`No profile for ${userId}`);
      if (profile.level < item.minLevel)
        return { ok: false, reason: "level_locked" };
      if (profile.coins < item.price)
        return { ok: false, reason: "insufficient_coins" };
      // spend the coins and grant the item — the two effects the RPC does atomically
      const coinsRemaining = profile.coins - item.price;
      profiles.set(userId, { ...profile, coins: coinsRemaining });
      owned.add(itemId);
      inventory.set(userId, owned);
      return { ok: true, coinsRemaining };
    },
  };

  // reference data, identical for every player — read once like shopItems above
  const itemVariants = seedItemVariants();

  const variantsRepo: VariantsRepo = {
    async list() {
      await delay(latency);
      return clone(itemVariants);
    },
  };

  return {
    catalog: catalogRepo,
    profiles: profileRepo,
    rooms: roomRepo,
    friends: friendsRepo,
    friendRequests: friendRequestsRepo,
    builds: buildsRepo,
    likes: likesRepo,
    store: storeRepo,
    variants: variantsRepo,
  };
}
