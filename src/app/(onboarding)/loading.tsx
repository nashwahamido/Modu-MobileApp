import { router } from "expo-router";
import type { Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentSession } from "@/src/services/auth";
import { createProfileIfMissing } from "@/src/services/profile";
import { getLatestHandedness, getLatestOnboardingMode } from "@/src/services/onboarding";
import { hydrateSettings, useGameStore } from "@/src/game/core/store";
import { usePrefsStore } from "@/src/game/core/prefsStore";
import type { ProfileId } from "@/src/game/core/profile";
import { LoadingScreen } from "@/src/game/ui/loading/LoadingScreen";
import { type Milestone } from "@/src/game/ui/loading/loadingProgress";
import { modeForId } from "@/src/data/player/avatars";
import { saveSelectedAvatarMode } from "@/src/services/onboarding";

const questionnaireRoute = "/voice-intro" as Href;
const mainRoute = "/room" as Href;
const profileIds = new Set<ProfileId>(["visual", "momentum", "clearPath", "control"]);

export default function LoadingScreenRoute() {
  const [milestone, setMilestone] = useState<Milestone>(0.35);
  const targetRoute = useRef<Href>(questionnaireRoute);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await hydrateSettings();
        const session = await getCurrentSession();
        const user = session?.user;
        if (user) {
          const profile = await createProfileIfMissing(user.id, user.email);
          if (profile.onboarding_completed) {
            let selectedMode = modeForId(profile.avatar_id);
            if (!selectedMode) {
              const latestMode = await getLatestOnboardingMode(user.id);
              if (latestMode && profileIds.has(latestMode as ProfileId)) {
                selectedMode = latestMode as ProfileId;
                await saveSelectedAvatarMode(latestMode);
              }
            }
            if (selectedMode) {
              useGameStore.getState().applyProfile(selectedMode);
            }
            const hand = await getLatestHandedness(user.id);
            if (hand) usePrefsStore.getState().setHandedness(hand);
            targetRoute.current = mainRoute;
          }
        }
      } catch {
      }
      if (active) setMilestone(1);
    })();
    return () => {
      active = false;
    };
  }, []);

  const go = useCallback(() => router.replace(targetRoute.current), []);

  return <LoadingScreen milestone={milestone} onComplete={go} />;
}
