// The roster core, shared by the two SEPARATE account sets built on top of it:
//
//   devAccounts.ts — the accounts you switch between while building. __DEV__ only.
//   showcase.ts    — the accounts an attendee taps during a live demo. Runs in release builds too.
//
// They stay separate on purpose. A dev account is expected to be broken: half-migrated, full of junk state, sitting on whatever you were last debugging. A showcase account has to read as a real player every time. One shared roster means every demo is one stale row away from embarrassing you, and it also means you cannot wreck a test account freely. Different gates, different passwords, different lists — the only thing they share is the plumbing below.
import { supabase } from "@/src/config/supabase";
import { useGameStore } from "@/src/game/core/store";
import { usePlacementStore } from "@/src/room/core/placement";
import { signIn } from "@/src/services/auth";

export interface TestAccount {
  // What the button says, e.g. "Ada — level 8, furnished room".
  label: string;
  email: string;
}

// Rosters come from env as JSON so the list changes without a code edit: [{"label":"...","email":"..."}]
export function parseAccounts(raw: string | undefined, envVar: string): TestAccount[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((a) => typeof a?.label === "string" && typeof a?.email === "string");
  } catch {
    console.warn(`[accounts] ${envVar} is not valid JSON — none of its accounts will be listed.`);
    return [];
  }
}

// Zustand stores outlive a sign-out, so a switch has to clear them or the next account inherits the previous player's build progress and half-placed furniture.
function resetClientState(): void {
  useGameStore.getState().reset();
  usePlacementStore.getState().reset();
}

// Sign out first: switching straight from one session to another leaves the old tokens in storage on some paths.
async function clearSession(): Promise<void> {
  resetClientState();
  await supabase.auth.signOut();
}

// Signing out and back in leaves a window with NO session, and useSessionGate reacts to exactly that by bouncing to the login screen. Its redirect then races the caller's own navigation, and when it lands second you end up on /auth instead of wherever you asked for — the switch looking like it simply did nothing. Every path below brackets its work in this flag so the gate holds still until the new session exists.
//
// A failed sign-in leaves you on a protected screen with no session (the gate cannot re-fire, since nothing it watches changed). That is a broken state either way, and the caller surfaces the error.
let transitions = 0;

export function isAuthTransitionActive(): boolean {
  return transitions > 0;
}

async function duringAuthTransition(work: () => Promise<void>): Promise<void> {
  transitions += 1;
  try {
    await work();
  } finally {
    transitions -= 1;
  }
}

// Goes through services/auth signIn() rather than supabase.auth.signInWithPassword directly: that one also runs createProfileIfMissing, so an account whose profile row was wiped by a db reset gets it rebuilt on the way in instead of landing you in a session that every repo read then fails against.
export async function signInToAccount(email: string, password: string | undefined, passwordVar: string): Promise<void> {
  if (!password) {
    throw new Error(`Set ${passwordVar} to use these accounts.`);
  }
  await duringAuthTransition(async () => {
    await clearSession();
    await signIn(email, password);
  });
}

// A brand-new player in one tap. Anonymous sign-in issues a real session with a real uuid, so RLS, the profile trigger and every repo behave exactly as they would for a signed-up user — there is just no email or password anywhere. Needs Anonymous sign-ins enabled in the Supabase dashboard (Authentication -> Providers); the error below says so when it is not.
//
// The username matters: without it the player is named from their uuid ("builder-3f8a91cc"), which is what the profile card and everyone's friends list would show. The trigger prefers this metadata over every other source and adds a numeric suffix on collision, so successive runs read New Builder, New Builder-1, New Builder-2 — all renameable in-app.
export async function startFreshAccount(username: string): Promise<void> {
  await duringAuthTransition(async () => {
    await clearSession();
    const { error } = await supabase.auth.signInAnonymously({
      options: { data: { username } },
    });
    if (error) {
      throw new Error(`${error.message} — enable Anonymous sign-ins in Authentication → Providers.`);
    }
  });
}

export async function signOutAccount(): Promise<void> {
  await clearSession();
}

// Deletes every anonymous account — the ones "Start fresh" leaves behind, which accumulate one per tap. The rule lives in the dev_purge_anonymous_users() migration, NOT here: deleting from auth.users needs privileges no client may hold, and a function that took the list of victims from the app would be a mass-delete primitive for anyone holding the (public) anon key. Accounts with an email address — the whole dev and showcase rosters — are therefore unreachable through this.
//
// Returns how many went. Every owner-scoped table cascades, so their rooms and inventories go too.
export async function purgeAnonymousAccounts(): Promise<number> {
  const { data, error } = await supabase.rpc("dev_purge_anonymous_users");
  if (error) throw error;
  // The caller's own session is untouched (it is not anonymous — the function refuses otherwise).
  return typeof data === "number" ? data : 0;
}
