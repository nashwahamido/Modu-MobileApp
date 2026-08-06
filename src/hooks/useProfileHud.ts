// The live level/coins the room HUD shows.
//
// Backed by profileStore rather than its own useState, because the shop now spends coins from INSIDE the room. See the note in src/data/player/profileStore.ts: the focus refetch below can no longer see a purchase, since the room never blurs for a popup. So the purchase writes the new balance to the store and this hook renders whatever the store holds. The focus refetch stays and still earns its keep: returning from play, the tutorial or a visit DOES blur the room, and a finished build's reward lands on the profile server-side where only a read will find it.
import { useCallback } from "react";
import { useFocusEffect } from "expo-router";

import { useCurrentUserId, useRepos } from "@/src/data";
import { useProfileStore } from "@/src/data/player/profileStore";
import type { Profile } from "@/src/data";

export function useProfileHud(): Profile | null {
  const repos = useRepos();
  const me = useCurrentUserId();
  const profile = useProfileStore((s) => s.profile);

  useFocusEffect(
    useCallback(() => {
      // No alive flag needed: the store discards a read that lost a race with an account switch, which is the only staleness an unmount could have caused here.
      void useProfileStore.getState().load(repos, me);
    }, [me, repos]),
  );

  return profile;
}
