import { useEffect, useState } from "react";

import { useAuth } from "@/src/hooks/useAuth";
import { getCurrentSession } from "@/src/services/auth";
import { DEV_ACCOUNTS_ENABLED, isDevAccount, signInToDevAccount } from "./devAccounts";
import { isShowcaseAccount } from "./showcase";

const EMAIL = process.env.EXPO_PUBLIC_DEV_EMAIL;
const PASSWORD = process.env.EXPO_PUBLIC_DEV_PASSWORD;
const ENABLED = DEV_ACCOUNTS_ENABLED && Boolean(EMAIL && PASSWORD);

export function useDevAutoSignIn(): boolean {
  const { user, loading } = useAuth();
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!ENABLED) {
      setSettled(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const session = await getCurrentSession();
        if (cancelled) return;
        if (session?.user) {
          const known =
            session.user.is_anonymous ||
            isDevAccount(session.user.email) ||
            isShowcaseAccount(session.user.email);
          if (!known) {
            console.warn(`[devAuth] session is ${session.user.email ?? session.user.id}, which is on neither roster`);
          }
          return;
        }
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

  return ENABLED && !settled && (loading || !user);
}
