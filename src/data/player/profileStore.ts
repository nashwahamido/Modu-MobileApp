// The signed-in player's OWN profile, in one place, because two features read it and one of them writes it.
//
// Why this exists rather than each screen fetching for itself: the room HUD shows coins and level (RoomTopStats via useProfileHud) and the shop SPENDS coins. Two independent fetches were survivable while the shop was a (presentation) route, because it took focus, so useProfileHud's focus refetch picked the new balance up on the way back to the room. The shop is a popup INSIDE the room now: the room never blurs, so that focus effect never re-fires, and a purchase left the coin pill showing the old number until something else happened to remount the room. So the balance lives here and the purchase writes it. One source, one update, no refetch.
//
// Deliberately NOT cached to AsyncStorage, unlike catalogStore: a coin balance is authoritative server state, and showing a stale one from disk is worse than showing the placeholder dashes.
import { create } from "zustand";

import type { Repos } from "../core/repos";
import type { Profile, UserId } from "../core/types";

interface ProfileState {
  profile: Profile | null;
  /** The user `profile` belongs to, so an account switch cannot show the previous player's coins. */
  ownerId: UserId | null;
  /**
   * Bumped by every local write. load() captures it before its await and discards its own result if it moved,
   * so a read that was already in flight cannot overwrite a balance a purchase has since settled — that read
   * would be reporting pre-purchase coins.
   */
  revision: number;
  /** Read the profile fresh. Safe to call on every focus — it is one small row. */
  load: (repos: Repos, me: UserId) => Promise<void>;
  /**
   * After a purchase. The server has already moved the coins and told us the balance it landed on, so this is
   * not an optimistic guess — it is the authoritative number, applied without a round trip.
   */
  setCoins: (coins: number) => void;
}

export const useProfileStore = create<ProfileState>()((set, get) => ({
  profile: null,
  ownerId: null,
  revision: 0,

  async load(repos, me) {
    // Drop the previous player's row immediately on a switch, so nothing renders their coins while the new read is in flight.
    if (get().ownerId !== me) set({ profile: null, ownerId: me });
    const startedAt = get().revision;
    try {
      const p = await repos.profiles.get(me);
      // Discard a read that lost a race with an account switch or with a purchase.
      if (get().ownerId !== me || get().revision !== startedAt) return;
      set({ profile: p });
    } catch (err) {
      // Swallowed on purpose, as the HUD read always was: this is decoration, and an unhandled rejection would take the room down over a transient failure. Falls back to the placeholder dashes.
      console.warn("[profile] could not read the profile:", (err as Error).message);
    }
  },

  setCoins(coins) {
    const { profile, revision } = get();
    // The revision moves even with no profile loaded yet, so an in-flight read that would land on a now-outdated balance is still discarded.
    set({ revision: revision + 1, ...(profile ? { profile: { ...profile, coins } } : {}) });
  },
}));
