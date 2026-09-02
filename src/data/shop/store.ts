// the purchasable catalogue and what this player owns of it — read once, shared by both surfaces
// a store, not a fetch per overlay: both popups need the same REFERENCE data, so opening shop-then-inventory paid for it twice
// and a purchase changes ownership BOTH render — the shop's own local Set was invisible to the inventory, so markOwned() owns it
// the owned set is per user and the catalogue is not, but they live together because they are always read together
import { create } from "zustand";

import type { Repos } from "../core/repos";
import type { ShopItem, ShopItemId } from "./items";
import type { UserId } from "../core/types";

// "empty" means nothing has asked yet; "error" means the read failed with nothing to show
// a genuinely empty catalogue is "ready"
export type ShopStatus = "empty" | "loading" | "ready" | "error";

interface ShopState {
  items: ShopItem[];
  owned: Set<ShopItemId>;
  // who `owned` belongs to. a mismatch is what makes load() refetch after an account switch
  ownerId: UserId | null;
  status: ShopStatus;
  // fetch unless this user's data is loaded — cheap to call on every popup open
  load: (repos: Repos, me: UserId) => Promise<void>;
  // fetch regardless — the "Try again" path, and anything that must not serve a cached list
  reload: (repos: Repos, me: UserId) => Promise<void>;
  // after a purchase: the item is ours now, with no re-read of the owned list
  markOwned: (itemId: ShopItemId) => void;
}

async function fetchInto(
  set: (partial: Partial<ShopState>) => void,
  get: () => ShopState,
  repos: Repos,
  me: UserId,
): Promise<void> {
  set({ status: "loading", ownerId: me });
  try {
    const [items, ownedIds] = await Promise.all([
      repos.store.listItems(),
      repos.store.listOwned(me),
    ]);
    // discard a read that lost a race with an account switch
    if (get().ownerId !== me) return;
    set({ items, owned: new Set(ownedIds), status: "ready" });
  } catch (err) {
    // the repos THROW on any Postgrest error, so this is the ordinary failure path
    // keep what we had — a stale catalogue beats an empty popup — and report error only with nothing to show
    console.warn("[shop] could not load the catalogue:", (err as Error).message);
    if (get().ownerId !== me) return;
    set({ status: get().items.length > 0 ? "ready" : "error" });
  }
}

export const useShopStore = create<ShopState>()((set, get) => ({
  items: [],
  owned: new Set(),
  ownerId: null,
  status: "empty",

  async load(repos, me) {
    const { status, ownerId } = get();
    if (ownerId === me && (status === "ready" || status === "loading")) return;
    await fetchInto(set, get, repos, me);
  },

  async reload(repos, me) {
    await fetchInto(set, get, repos, me);
  },

  markOwned(itemId) {
    const { owned } = get();
    if (owned.has(itemId)) return;
    // a new Set, not a mutation: zustand compares by reference, so mutating leaves subscribers on the old ownership
    set({ owned: new Set(owned).add(itemId) });
  },
}));
