// Showcase mode: one-tap sign-in for a live demo, so nobody spends the first two minutes of their turn typing an email. Two paths — prepared accounts (an established player with levels, coins and a furnished room) and a FRESH account for showing onboarding through to the tutorial from scratch.
//
// Kept apart from the dev roster in devAccounts.ts — see the note at the top of accounts.ts for why.
//
// EXPO_PUBLIC_SHOWCASE is the one switch: 1 = showcase, 0 = the dev roster instead (devAccounts.ts). Not gated on __DEV__, on purpose — the showcase runs from a release build (no Metro), where __DEV__ is false. That also means anything in EXPO_PUBLIC_* is COMPILED INTO THE BUNDLE and readable by anyone holding the app: throwaway accounts on a project with nothing real in it, and ship real builds with EXPO_PUBLIC_SHOWCASE=0.
//
// Signing out is roster-agnostic — callers use signOutAccount from ./accounts directly.
import { parseAccounts, signInToAccount, startFreshAccount } from "./accounts";
import type { TestAccount } from "./accounts";
import type { ProfileId } from "@/src/game/core/profile";

export type ShowcaseAccount = TestAccount;

export const SHOWCASE_ENABLED = process.env.EXPO_PUBLIC_SHOWCASE === "1";

export const SHOWCASE_ACCOUNTS: ShowcaseAccount[] = parseAccounts(
  process.env.EXPO_PUBLIC_SHOWCASE_ACCOUNTS,
  "EXPO_PUBLIC_SHOWCASE_ACCOUNTS",
);

// One shared password across the demo roster — they are throwaway accounts, and a per-account password would only add typing.
const SHOWCASE_PASSWORD = process.env.EXPO_PUBLIC_SHOWCASE_PASSWORD;

// The name a fresh demo player starts with, shown on the profile card and in friends lists.
const FRESH_USERNAME = "New Builder";

export function signInToShowcaseAccount(email: string): Promise<void> {
  return signInToAccount(email, SHOWCASE_PASSWORD, "EXPO_PUBLIC_SHOWCASE_PASSWORD");
}

export function startFreshShowcaseAccount(): Promise<void> {
  return startFreshAccount(FRESH_USERNAME);
}

/**
 * The four demo accounts, as CHARACTERS rather than placeholder names.
 *
 * The roster itself still comes from env (label + email), because the emails differ per project —
 * this only decides which avatar, name and level each of those accounts wears in the picker. They
 * are matched on the env label first (so "ada@..." or a label containing "Ada" lands on Felix) and
 * fall back to ROSTER ORDER, which is what makes an unedited env still produce the right four cards.
 *
 * DEV accounts are deliberately not in here: that roster stays a plain list of buttons, because it
 * is tooling and should look like tooling.
 */
export interface ShowcasePersona {
  /** The Helping Mode this account is set up in — also picks the avatar art. */
  profile: ProfileId;
  /** Shown on the card's button. */
  name: string;
  /** Drawn as a star in the card's top-right corner — art exists for levels 1-5. */
  level: 1 | 2 | 3 | 4 | 5;
  /** The placeholder name this character replaces, matched case-insensitively against the env label. */
  placeholder: string;
}

export const SHOWCASE_PERSONAS: ShowcasePersona[] = [
  { profile: "control", name: "Felix", level: 4, placeholder: "ada" },
  { profile: "clearPath", name: "Pebble", level: 4, placeholder: "daria" },
  { profile: "momentum", name: "Sparky", level: 2, placeholder: "bella" },
  { profile: "visual", name: "Lumi", level: 1, placeholder: "clara" },
];

/** The persona for a demo account: by placeholder name if the env still uses them, else by order. */
export function personaFor(account: TestAccount, index: number): ShowcasePersona {
  const hay = `${account.label} ${account.email}`.toLowerCase();
  return (
    SHOWCASE_PERSONAS.find((p) => hay.includes(p.placeholder)) ??
    SHOWCASE_PERSONAS[index % SHOWCASE_PERSONAS.length]
  );
}

// Counterpart to isDevAccount, read by devAuth for the same reason: a demo account is a deliberate
// switch, not the wrong-credentials case its warning exists to catch.
export function isShowcaseAccount(email: string | undefined | null): boolean {
  if (!email) return false;
  return SHOWCASE_ACCOUNTS.some((a) => a.email === email);
}