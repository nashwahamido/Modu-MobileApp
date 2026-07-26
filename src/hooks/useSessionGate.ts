// Route guard. On the Supabase backend every screen that reads user data needs a REAL session: without one, useCurrentUserId() falls back to the DEMO_ME fixture id ("me"), which Postgres rejects against the uuid columns (22P02). Rather than let each screen discover that for itself, bounce to the sign-in screen the moment a protected route is reached without a session.
import { useEffect } from "react";
import { router, useRootNavigationState, useSegments } from "expo-router";

import { useAuth } from "./useAuth";

// Only the live backend needs a session. The in-memory adapter is BUILT to run signed-out, on the demo user.
export const SESSION_REQUIRED = process.env.EXPO_PUBLIC_DATA_BACKEND === "supabase";

// Where an unauthenticated user is sent — the screen offering create-account, log-in, and (in showcase builds) the demo accounts.
export const SIGN_IN_ROUTE = "/auth";

// Reachable without a session: the whole sign-up / onboarding run (which is how you GET a session), and
// the dev engine harness, which never touches the repos. The landing route "/" is handled separately —
// it has no group, so useSegments() reports it as empty.
const PUBLIC_GROUPS = new Set<string>(["(onboarding)", "(dev)"]);

export function useSessionGate(): void {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const navState = useRootNavigationState();

  useEffect(() => {
    if (!SESSION_REQUIRED) return;
    // replace() is a no-op until the router is actually mounted.
    if (!navState?.key) return;
    // loading = auth still resolving (including a magic-link exchange). Redirecting here would race it.
    if (loading || user) return;

    const group = segments[0] as string | undefined;
    if (group === undefined || PUBLIC_GROUPS.has(group)) return;

    router.replace(SIGN_IN_ROUTE);
  }, [loading, user, segments, navState?.key]);
}
