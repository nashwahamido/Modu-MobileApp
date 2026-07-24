// Onboarding loading gate: same look and progress mechanics as the assembly loader (LoadingOverlay) — avatar slot + name line + creep/jump bar — but the slot holds the onboarding mascot and the "model" being loaded is the session/profile routing decision.
import { router } from "expo-router";
import type { Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { getCurrentSession } from "@/src/services/auth";
import { createProfileIfMissing } from "@/src/services/profile";
import { getLatestOnboardingMode } from "@/src/services/onboarding";
import { useGameStore } from "@/src/game/core/store";
import type { ProfileId } from "@/src/game/core/profile";
import { ProgressBar } from "@/src/game/ui/Button";
import { Theme, useStyles } from "@/src/game/ui/theme";
import { advance, type Milestone } from "@/src/game/ui/loadingProgress";

const mascot = require("../../assets/images/mascot/mascot.png");
const questionnaireRoute = "/onboarding-questionnaire" as Href;
const mainRoute = "/room" as Href;
const profileIds = new Set<ProfileId>(["visual", "momentum", "clearPath", "control"]);

// Same cadence as LoadingOverlay: 100ms ticks, a short hold at 100% before moving on.
const TICK_MS = 100;
const HOLD_MS = 150;

export default function LoadingScreen() {
  const styles = useStyles(makeStyles);
  const [fraction, setFraction] = useState(0);
  // 0.35 from the first frame: the async work starts immediately, so the bar opens in "data landed" creep instead of the pre-data stall.
  const [milestone, setMilestone] = useState<Milestone>(0.35);
  const targetRoute = useRef<Href>(questionnaireRoute);
  const navigated = useRef(false);

  // The real load: decide where onboarding resumes. Milestone hits 1 when the answer is known — the bar then sweeps to 100% and navigation happens below.
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

  // Creep + jump tick, identical to the assembly loader.
  useEffect(() => {
    const iv = setInterval(() => setFraction((f) => advance(f, TICK_MS, milestone)), TICK_MS);
    return () => clearInterval(iv);
  }, [milestone]);

  // The final beat: bar at 100% → short hold → route. navigated ref guards double-fires when deps churn during the hold.
  useEffect(() => {
    if (milestone !== 1 || fraction < 1 || navigated.current) return;
    navigated.current = true;
    const hold = setTimeout(() => router.replace(targetRoute.current), HOLD_MS);
    return () => clearTimeout(hold);
  }, [milestone, fraction]);

  return (
    <View style={styles.root}>
      <View style={styles.avatar}>
        <Image source={mascot} style={styles.mascot} />
      </View>
      <Text style={styles.name}>Loading…</Text>
      <ProgressBar value={fraction} total={1} style={styles.bar} />
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: t.bg,
      alignItems: "center",
      justifyContent: "center",
      gap: 18,
    },
    // The LoadingOverlay avatar ring, holding the mascot instead of a profile initial.
    avatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: t.surfaceInset,
      borderWidth: 2,
      borderColor: t.accent,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    mascot: { width: 56, height: 56, borderRadius: 28 },
    name: { color: t.textDim, fontWeight: "600", fontSize: 16 },
    bar: { width: "60%", maxWidth: 420 },
  });
