// the signed-in player's own profile in one place — two features read it and one writes it
// the shop is a popup inside the room and the room never blurs, so separate fetches left the coin pill stale
// deliberately not cached to disk, unlike buildStore — a stale balance is worse than placeholder dashes
import { create } from "zustand";

import type { Repos } from "../core/repos";
import type { Profile, UserId } from "../core/types";

interface ProfileState {
  profile: Profile | null;
  // who `profile` belongs to, so an account switch cannot show the previous player's coins
  ownerId: UserId | null;
  // bumped by every local write — load() captures it before its await, so a stale read cannot undo a purchase
  revision: number;
  // read the profile fresh — safe on every focus, it is one small row
  load: (repos: Repos, me: UserId) => Promise<void>;
  // after a purchase — the server moved the coins and told us the balance, applied without a round trip
  setCoins: (coins: number) => void;
}

export const useProfileStore = create<ProfileState>()((set, get) => ({
  profile: null,
  ownerId: null,
  revision: 0,

  async load(repos, me) {
    // drop the previous player's row at once, so nothing renders their coins mid-read
    if (get().ownerId !== me) set({ profile: null, ownerId: me });
    const startedAt = get().revision;
    try {
      const p = await repos.profiles.get(me);
      // discard a read that lost a race with an account switch or a purchase
      if (get().ownerId !== me || get().revision !== startedAt) return;
      set({ profile: p });
    } catch (err) {
      // swallowed: this is decoration, and an unhandled rejection would take the room down over a blip
      console.warn("[profile] could not read the profile:", (err as Error).message);
    }
  },

  setCoins(coins) {
    const { profile, revision } = get();
    // the revision moves even with no profile loaded, so a stale in-flight read is still discarded
    set({ revision: revision + 1, ...(profile ? { profile: { ...profile, coins } } : {}) });
  },
}));
