// Onboarding loading gate: the "model" being loaded is the session/profile routing decision. The look and the progress mechanics come from LoadingScreen, the one file that owns them.
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

// The voice notice, which then replaces itself with the questionnaire. Onboarding's FIRST screen is
// now "you can have this read to you" — before Modu introduces himself, and before any question.
const questionnaireRoute = "/voice-intro" as Href;
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
        // BEFORE the profile is applied. The gate calls applyProfile below, which lays the profile's
        // defaults down and keeps only the keys the player has touched — and it can only know which
        // those are once they have been read back from storage.
        await hydrateSettings();
        const session = await getCurrentSession();
        const user = session?.user;
        if (user) {
          const profile = await createProfileIfMissing(user.id, user.email);
          if (profile.onboarding_completed) {
            let selectedMode = modeForId(profile.avatar_id);
            // One-time compatibility for accounts created before avatar_id
            // became the current-choice source: recover their latest answer
            // and backfill the profile row.
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
            // AFTER applyProfile, not before — that call replaces the settings object wholesale, and while handedness deliberately lives outside it (see the store), ordering it second means the two can never fight if that ever changes.
            const hand = await getLatestHandedness(user.id);
            if (hand) usePrefsStore.getState().setHandedness(hand);
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
