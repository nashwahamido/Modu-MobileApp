import { parseAccounts, signInToAccount, startFreshAccount } from "./accounts";
import type { TestAccount } from "./accounts";

export const DEV_ACCOUNTS_ENABLED =
  __DEV__ && process.env.EXPO_PUBLIC_DATA_BACKEND === "supabase" && process.env.EXPO_PUBLIC_SHOWCASE !== "1";

export const DEV_ACCOUNTS: TestAccount[] = parseAccounts(
  process.env.EXPO_PUBLIC_DEV_ACCOUNTS,
  "EXPO_PUBLIC_DEV_ACCOUNTS",
);

const DEV_PASSWORD = process.env.EXPO_PUBLIC_DEV_PASSWORD;

const FRESH_USERNAME = "Dev Builder";

export function signInToDevAccount(email: string): Promise<void> {
  return signInToAccount(email, DEV_PASSWORD, "EXPO_PUBLIC_DEV_PASSWORD");
}

export function startFreshDevAccount(): Promise<void> {
  return startFreshAccount(FRESH_USERNAME);
}

export function isDevAccount(email: string | undefined | null): boolean {
  if (!email) return false;
  return email === process.env.EXPO_PUBLIC_DEV_EMAIL || DEV_ACCOUNTS.some((a) => a.email === email);
}
