import { supabase } from "@/src/config/supabase";
import { useGameStore } from "@/src/game/core/store";
import { usePlacementStore } from "@/src/room/core/placement";
import { signIn } from "@/src/services/auth";

export interface TestAccount {
  label: string;
  email: string;
}

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

function resetClientState(): void {
  useGameStore.getState().reset();
  usePlacementStore.getState().reset();
}

async function clearSession(): Promise<void> {
  resetClientState();
  await supabase.auth.signOut();
}

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

export async function signInToAccount(email: string, password: string | undefined, passwordVar: string): Promise<void> {
  if (!password) {
    throw new Error(`Set ${passwordVar} to use these accounts.`);
  }
  await duringAuthTransition(async () => {
    await clearSession();
    await signIn(email, password);
  });
}

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

async function resetIfDemoAccount(): Promise<void> {
  const { error } = await supabase.rpc("dev_reset_demo_account");
  if (!error) return;
  if (error.message.includes("is not a demo account")) {
    console.log("[accounts] no demo reset —", error.message);
    return;
  }
  console.warn("[accounts] demo reset failed", error.message);
}

export async function signOutAccount(): Promise<void> {
  await resetIfDemoAccount().catch((err) =>
    console.warn("[accounts] demo reset threw", (err as Error).message),
  );
  await clearSession();
}

export async function purgeAnonymousAccounts(): Promise<number> {
  const { data, error } = await supabase.rpc("dev_purge_anonymous_users");
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}
