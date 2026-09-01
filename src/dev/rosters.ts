import type { TestAccount } from "./accounts";
import { DEV_ACCOUNTS, DEV_ACCOUNTS_ENABLED, signInToDevAccount, startFreshDevAccount } from "./devAccounts";
import { SHOWCASE_ACCOUNTS, SHOWCASE_ENABLED, signInToShowcaseAccount, startFreshShowcaseAccount } from "./showcase";

export interface Roster {
  title: string;
  pickerLabel: string;
  accounts: TestAccount[];
  signIn: (email: string) => Promise<void>;
  startFresh: () => Promise<void>;
  envVar: string;
  showcase?: boolean;
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
  pickerLabel: "Try a Demo Account",
  accounts: SHOWCASE_ACCOUNTS,
  signIn: signInToShowcaseAccount,
  startFresh: startFreshShowcaseAccount,
  envVar: "EXPO_PUBLIC_SHOWCASE_ACCOUNTS",
  showcase: true,
};

export const ENABLED_ROSTERS: Roster[] = [
  ...(DEV_ACCOUNTS_ENABLED ? [DEV_ROSTER] : []),
  ...(SHOWCASE_ENABLED ? [SHOWCASE_ROSTER] : []),
];