// The purchasable catalogue and what this player owns of it — read once, shared by both surfaces.
//
// Two reasons this is a store and not a fetch inside each overlay.
// FIRST: the catalogue is REFERENCE data ("the same for everyone" — see StoreRepo.listItems), and both popups need it. The shop needs it to list what is for sale; the inventory needs it to turn an owned id into a name and a category. Fetching per open meant every open of either popup paid listItems + listOwned again, and opening the shop then the inventory fetched the identical catalogue twice in a row. SECOND: a purchase changes ownership, and BOTH surfaces render it. The shop used to add the id to its own local Set, which was correct for the shop and invisible to the inventory, so the inventory had to refetch to notice. markOwned() updates the one copy, so the other surface is already right when you open it.
//
// The owned set is per user and the catalogue is not, but they live together because they are always read together. Splitting them would only mean two load calls with the same lifecycle.
import { create } from "zustand";

import type { Repos } from "../core/repos";
import type { ShopItem, ShopItemId } from "./items";
import type { UserId } from "../core/types";

// "loading" is distinct from "empty": empty means nothing has asked yet.
// "error" means the read failed with nothing to show — a loaded-and-genuinely-empty catalogue stays "ready".
export type ShopStatus = "empty" | "loading" | "ready" | "error";

interface ShopState {
  items: ShopItem[];
  owned: Set<ShopItemId>;
  /** Who `owned` belongs to. A mismatch is what makes load() refetch after an account switch. */
  ownerId: UserId | null;
  status: ShopStatus;
  /** Fetch unless this user's data is already loaded. Cheap to call on every popup open. */
  load: (repos: Repos, me: UserId) => Promise<void>;
  /** Fetch regardless — the "Try again" path, and anything that must not serve a cached list. */
  reload: (repos: Repos, me: UserId) => Promise<void>;
  /** After a successful purchase: the item is ours now, with no re-read of the owned list. */
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
    // Discard a read that lost a race with an account switch.
    if (get().ownerId !== me) return;
    set({ items, owned: new Set(ownedIds), status: "ready" });
  } catch (err) {
    // The repos THROW on any Postgrest error, so this is the ordinary failure path and not an exotic one. Keep whatever we already had, because a stale catalogue beats an empty popup, and only report error with nothing at all to show.
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
    // A new Set, not a mutation: zustand compares by reference, so mutating in place would leave every subscriber showing the old ownership.
    set({ owned: new Set(owned).add(itemId) });
  },
}));
