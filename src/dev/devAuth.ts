// Dev-only auto sign-in. In __DEV__ on the Supabase backend, signs the app into a dev account on launch so you skip the login screen on every reload. No-op in production, on the in-memory backend, or when a session already exists. Never wire this into a release build.
//
// EXPO_PUBLIC_DEV_EMAIL is the on/off: name a roster account to land on it every launch, or leave it UNSET to open on the account picker and choose. No separate flag — "which account do I start as" and "do I get asked" are the same question, and one empty value answers both.
import { useEffect, useState } from "react";

import { useAuth } from "@/src/hooks/useAuth";
import { getCurrentSession } from "@/src/services/auth";
import { DEV_ACCOUNTS_ENABLED, isDevAccount, signInToDevAccount } from "./devAccounts";
import { isShowcaseAccount } from "./showcase";

const EMAIL = process.env.EXPO_PUBLIC_DEV_EMAIL;
const PASSWORD = process.env.EXPO_PUBLIC_DEV_PASSWORD;
// Showcase builds are excluded through DEV_ACCOUNTS_ENABLED: a demo must always start at the picker.
const ENABLED = DEV_ACCOUNTS_ENABLED && Boolean(EMAIL && PASSWORD);

// Runs the auto sign-in and returns TRUE while the app should HOLD rendering — i.e. we're bringing a dev session up but don't have a user yet. Holding avoids the first-frame window where useCurrentUserId() falls back to DEMO_ME ("me") and features query uuid columns with it (22P02).
export function useDevAutoSignIn(): boolean {
  const { user, loading } = useAuth();
  // True once the ONE bootstrap attempt has finished, however it finished. The hold below keys off this rather than off "is anyone signed in", because signed-out is a legitimate state after the bootstrap: signing out (or switching accounts) would otherwise re-raise the hold forever — the effect runs once, so nothing would ever bring a session back.
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
          // Either roster, or an anonymous session, means a DELIBERATE switch (AccountSwitcher or the auth screen picker) — the expected case, so stay quiet. Anything else is a session we did not put here, worth saying out loud since every repo read now runs against that account.
          const known =
            session.user.is_anonymous ||
            isDevAccount(session.user.email) ||
            isShowcaseAccount(session.user.email);
          if (!known) {
            console.warn(`[devAuth] session is ${session.user.email ?? session.user.id}, which is on neither roster`);
          }
          return;
        }
        // ENABLED already proved both are set; this is the narrowing TypeScript needs.
        if (!EMAIL) return;
        await signInToDevAccount(EMAIL);
      } catch (err) {
        console.warn(`[devAuth] auto sign-in as ${EMAIL} failed:`, (err as Error).message);
      } finally {
        if (!cancelled) setSettled(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Only hold during that first attempt, while we both CAN and WILL produce a session but don't have one yet. With auto sign-in off we fall through, so the picker on the auth screen renders instead.
  return ENABLED && !settled && (loading || !user);
}
