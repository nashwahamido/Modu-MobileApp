// The live level/coins the room HUD shows. Refetches on focus, not just on mount: the room stays mounted under the (presentation) modals, so a shop purchase or a finished build must be picked up when the modal closes rather than on a remount that never comes.
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

import { useCurrentUserId, useRepos } from "@/src/data";
import type { Profile } from "@/src/data";

export function useProfileHud(): Profile | null {
  const repos = useRepos();
  const me = useCurrentUserId();
  const [profile, setProfile] = useState<Profile | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        // Swallowed on purpose: the HUD is decoration, and an unhandled rejection here would take the
        // whole room down over a transient read. Falls back to the placeholder dashes.
        try {
          const p = await repos.profiles.get(me);
          if (alive) setProfile(p);
        } catch (err) {
          console.warn("[hud] could not read the profile:", (err as Error).message);
        }
      })();
      return () => {
        alive = false;
      };
    }, [me, repos]),
  );

  return profile;
}
