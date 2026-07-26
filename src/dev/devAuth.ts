// Dev-only auto sign-in. In __DEV__ on the Supabase backend, signs the app into a fixed dev account
// on launch so you skip the login screen on every reload. No-op in production, on the in-memory
// backend, or when a session already exists. Creds come from env (never committed); the UID below is
// only a guard. Never wire this into a release build.
import { useEffect, useState } from "react";

import { useAuth } from "@/src/hooks/useAuth";
import { getCurrentSession, signIn } from "@/src/services/auth";
import { isShowcaseAccount } from "./showcase";

// The account this bootstrap expects to land on — a guard, not a credential. If sign-in resolves to a
// different uid, the env creds point at the wrong account.
const DEV_USER_ID = "0ebe9501-828d-4240-b596-eb3c16e43af1";

const ENABLED = __DEV__ && process.env.EXPO_PUBLIC_DATA_BACKEND === "supabase";
const EMAIL = process.env.EXPO_PUBLIC_DEV_EMAIL;
const PASSWORD = process.env.EXPO_PUBLIC_DEV_PASSWORD;

// Runs the auto sign-in and returns TRUE while the app should HOLD rendering — i.e. we're bringing a
// dev session up but don't have a user yet. Holding avoids the first-frame window where
// useCurrentUserId() falls back to DEMO_ME ("me") and features query uuid columns with it (22P02).
export function useDevAutoSignIn(): boolean {
  const { user, loading } = useAuth();
  // True once the ONE bootstrap attempt has finished, however it finished. The hold below keys off
  // this rather than off "is anyone signed in", because signed-out is a legitimate state after the
  // bootstrap: signing out (or switching demo accounts) would otherwise re-raise the hold forever —
  // the effect runs once, so nothing would ever bring a session back.
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!ENABLED) {
      setSettled(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        // A persisted session survives reloads — reuse it instead of signing in again.
        const session = await getCurrentSession();
        if (cancelled) return;
        if (session?.user) {
          // A demo-roster or anonymous session is a DELIBERATE switch (AccountSwitcher / the auth
          // screen picker), not the wrong-creds case this warning is for — stay quiet on those.
          const switched = session.user.is_anonymous || isShowcaseAccount(session.user.email);
          if (session.user.id !== DEV_USER_ID && !switched) {
            console.warn(`[devAuth] session is ${session.user.id}, expected ${DEV_USER_ID}`);
          }
          return;
        }
        if (!EMAIL || !PASSWORD) {
          console.warn("[devAuth] set EXPO_PUBLIC_DEV_EMAIL and EXPO_PUBLIC_DEV_PASSWORD to auto sign-in");
          return;
        }
        // signIn() also runs createProfileIfMissing, so the profile row is rebuilt after a db reset.
        const { user: signed } = await signIn(EMAIL, PASSWORD);
        if (cancelled) return;
        if (signed && signed.id !== DEV_USER_ID) {
          console.warn(`[devAuth] signed in as ${signed.id}, expected ${DEV_USER_ID} — check the dev creds`);
        }
      } catch (err) {
        console.warn("[devAuth] auto sign-in failed:", (err as Error).message);
      } finally {
        if (!cancelled) setSettled(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Only hold during that first attempt, while we both CAN and WILL produce a session (creds present)
  // but don't have one yet. Without creds we fall through so the normal login/onboarding flow renders.
  return ENABLED && Boolean(EMAIL && PASSWORD) && !settled && (loading || !user);
}
