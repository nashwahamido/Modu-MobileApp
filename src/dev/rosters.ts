// The rosters that are live in this build, in the order they should be listed. Shared by the two surfaces that offer accounts — AccountPicker (the auth screen, signed out) and AccountSwitcher (/settings, signed in) — so a roster is described ONCE and both screens agree on what exists.
//
// A build normally has exactly one: a dev build has "Dev accounts", a release showcase build has "Showcase accounts". Both appear only in a dev build with EXPO_PUBLIC_SHOWCASE also set, which is the case where the group headers earn their keep — see the note at the top of accounts.ts.
import type { TestAccount } from "./accounts";
import { DEV_ACCOUNTS, DEV_ACCOUNTS_ENABLED, signInToDevAccount, startFreshDevAccount } from "./devAccounts";
import { SHOWCASE_ACCOUNTS, SHOWCASE_ENABLED, signInToShowcaseAccount, startFreshShowcaseAccount } from "./showcase";

export interface Roster {
  // The settings-screen heading — a plain label, since that surface is openly dev tooling.
  title: string;
  // The auth-screen divider. Separate from `title` because an attendee reads that one during a demo, where "Showcase accounts" would be naming the machinery rather than offering them a way in.
  pickerLabel: string;
  accounts: TestAccount[];
  signIn: (email: string) => Promise<void>;
  startFresh: () => Promise<void>;
  // Named so an empty roster tells you which variable to fill, rather than just that it is empty.
  envVar: string;
}

const DEV_ROSTER: Roster = {
  title: "Dev accounts",
  pickerLabel: "dev accounts",
  accounts: DEV_ACCOUNTS,
  signIn: signInToDevAccount,
  startFresh: startFreshDevAccount,
  envVar: "EXPO_PUBLIC_DEV_ACCOUNTS",
};

const SHOWCASE_ROSTER: Roster = {
  title: "Showcase accounts",
  pickerLabel: "or try a demo account",
  accounts: SHOWCASE_ACCOUNTS,
  signIn: signInToShowcaseAccount,
  startFresh: startFreshShowcaseAccount,
  envVar: "EXPO_PUBLIC_SHOWCASE_ACCOUNTS",
};

export const ENABLED_ROSTERS: Roster[] = [
  ...(DEV_ACCOUNTS_ENABLED ? [DEV_ROSTER] : []),
  ...(SHOWCASE_ENABLED ? [SHOWCASE_ROSTER] : []),
];
