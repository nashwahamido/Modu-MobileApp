// Onboarding loading gate: the "model" being loaded is the session/profile routing decision. The look and the progress mechanics come from LoadingScreen, the one file that owns them.
import { router } from "expo-router";
import type { Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentSession } from "@/src/services/auth";
import { createProfileIfMissing } from "@/src/services/profile";
import { getLatestOnboardingMode } from "@/src/services/onboarding";
import { useGameStore } from "@/src/game/core/store";
import type { ProfileId } from "@/src/game/core/profile";
import { LoadingScreen } from "@/src/game/ui/loading/LoadingScreen";
import { type Milestone } from "@/src/game/ui/loading/loadingProgress";

const questionnaireRoute = "/onboarding-questionnaire" as Href;
const mainRoute = "/room" as Href;
const profileIds = new Set<ProfileId>(["visual", "momentum", "clearPath", "control"]);

export default function LoadingScreenRoute() {
  // 0.35 from the first frame: the async work starts immediately, so the bar opens in "data landed" creep instead of the pre-data stall.
  const [milestone, setMilestone] = useState<Milestone>(0.35);
  const targetRoute = useRef<Href>(questionnaireRoute);

  // The real load: decide where onboarding resumes. Milestone hits 1 when the answer is known — the bar then sweeps to 100% and LoadingScreen calls back below.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const session = await getCurrentSession();
        const user = session?.user;
        if (user) {
          const profile = await createProfileIfMissing(user.id, user.email);
          if (profile.onboarding_completed) {
            const latestMode = await getLatestOnboardingMode(user.id);
            if (latestMode && profileIds.has(latestMode as ProfileId)) {
              useGameStore.getState().applyProfile(latestMode as ProfileId);
            }
            targetRoute.current = mainRoute;
          }
        }
      } catch {
        // Fall through: the default target is the questionnaire.
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
