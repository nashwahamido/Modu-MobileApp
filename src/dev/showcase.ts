import { parseAccounts, signInToAccount, startFreshAccount } from "./accounts";
import type { TestAccount } from "./accounts";
import type { ProfileId } from "@/src/game/core/profile";

export type ShowcaseAccount = TestAccount;

export const SHOWCASE_ENABLED = process.env.EXPO_PUBLIC_SHOWCASE === "1";

export const SHOWCASE_ACCOUNTS: ShowcaseAccount[] = parseAccounts(
  process.env.EXPO_PUBLIC_SHOWCASE_ACCOUNTS,
  "EXPO_PUBLIC_SHOWCASE_ACCOUNTS",
);

const SHOWCASE_PASSWORD = process.env.EXPO_PUBLIC_SHOWCASE_PASSWORD;

const FRESH_USERNAME = "New Builder";

export function signInToShowcaseAccount(email: string): Promise<void> {
  return signInToAccount(email, SHOWCASE_PASSWORD, "EXPO_PUBLIC_SHOWCASE_PASSWORD");
}

export function startFreshShowcaseAccount(): Promise<void> {
  return startFreshAccount(FRESH_USERNAME);
}

export interface ShowcasePersona {
  profile: ProfileId;
  name: string;
  level: 1 | 2 | 3 | 4 | 5;
  placeholder: string;
}

export const SHOWCASE_PERSONAS: ShowcasePersona[] = [
  { profile: "control", name: "Felix", level: 4, placeholder: "ada" },
  { profile: "clearPath", name: "Pebble", level: 4, placeholder: "daria" },
  { profile: "momentum", name: "Sparky", level: 2, placeholder: "bella" },
  { profile: "visual", name: "Lumi", level: 1, placeholder: "clara" },
];

export function personaFor(account: TestAccount, index: number): ShowcasePersona {
  const hay = `${account.label} ${account.email}`.toLowerCase();
  return (
    SHOWCASE_PERSONAS.find((p) => hay.includes(p.placeholder)) ??
    SHOWCASE_PERSONAS[index % SHOWCASE_PERSONAS.length]
  );
}

export function isShowcaseAccount(email: string | undefined | null): boolean {
  if (!email) return false;
  return SHOWCASE_ACCOUNTS.some((a) => a.email === email);
}