// The dev roster: two or three accounts you switch between while building, to check how a feature reads for a level-2 player against a level-20 one without re-running onboarding each time. Kept apart from the showcase roster in showcase.ts — see the note at the top of accounts.ts for why.
//
// The other side of the EXPO_PUBLIC_SHOWCASE switch: 0 lists THIS roster, 1 lists the showcase one. One switch, so the two can never both be on — a screen showing both lists would have to explain which is which, and a demo would be one mis-tap from a half-migrated dev account.
//
// Still __DEV__ and live-backend gated on top: the in-memory adapter has no auth at all, and a release build must never carry a list of accounts sharing one password. The whole roster shares EXPO_PUBLIC_DEV_PASSWORD, which is also what devAuth signs in with.
import { parseAccounts, signInToAccount, startFreshAccount } from "./accounts";
import type { TestAccount } from "./accounts";

export const DEV_ACCOUNTS_ENABLED =
  __DEV__ && process.env.EXPO_PUBLIC_DATA_BACKEND === "supabase" && process.env.EXPO_PUBLIC_SHOWCASE !== "1";

export const DEV_ACCOUNTS: TestAccount[] = parseAccounts(
  process.env.EXPO_PUBLIC_DEV_ACCOUNTS,
  "EXPO_PUBLIC_DEV_ACCOUNTS",
);

const DEV_PASSWORD = process.env.EXPO_PUBLIC_DEV_PASSWORD;

// Distinct from the showcase roster's "New Builder" so a stray anonymous row in auth.users says which list made it — the cleanup query in .env.example cannot otherwise tell a demo run from a dev one.
const FRESH_USERNAME = "Dev Builder";

export function signInToDevAccount(email: string): Promise<void> {
  return signInToAccount(email, DEV_PASSWORD, "EXPO_PUBLIC_DEV_PASSWORD");
}

export function startFreshDevAccount(): Promise<void> {
  return startFreshAccount(FRESH_USERNAME);
}

// Whether an email belongs to the dev roster (or is the auto sign-in account). devAuth reads it so a deliberate switch does not trip its "expected DEV_USER_ID" warning on every reload afterwards.
export function isDevAccount(email: string | undefined | null): boolean {
  if (!email) return false;
  return email === process.env.EXPO_PUBLIC_DEV_EMAIL || DEV_ACCOUNTS.some((a) => a.email === email);
}
