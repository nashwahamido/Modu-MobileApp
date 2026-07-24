// The injection point. Every feature imports the repo seam from here — never a concrete adapter, never src/services or supabase directly.
// TODAY: an in-memory adapter with demo fixtures. To go live, implement createSupabaseRepos() against the same Repos interface (wrapping src/services) and swap the one line below. No feature code changes.
import { useAuth } from "@/src/hooks/useAuth";
import { createInMemoryRepos } from "./adapters/inMemory";
import { createSupabaseRepos } from "./adapters/supabase";
import { DEMO_ME } from "./adapters/seed";
import type { Repos } from "./repos";
import type { UserId } from "./types";

// Which backend the seam runs on. Defaults to the in-memory fixtures; set
// EXPO_PUBLIC_DATA_BACKEND=supabase (after running the migration + signing in) to go live.
let active: Repos =
  process.env.EXPO_PUBLIC_DATA_BACKEND === "supabase" ? createSupabaseRepos() : createInMemoryRepos();

// Read the active repo bundle from non-React code (services, store actions).
export function getRepos(): Repos {
  return active;
}

// Swap the implementation — for tests, or the Supabase go-live. Call once at startup, before render.
export function setRepos(next: Repos): void {
  active = next;
}

// The repo seam for components. Swap is startup-only, so a stable singleton needs no reactivity.
export function useRepos(): Repos {
  return active;
}

// The single source of "who am I" for features. Returns the real Supabase id when signed in, else the demo user so features work on the in-memory adapter without a live session. Drop the DEMO_ME fallback at go-live.
export function useCurrentUserId(): UserId {
  const { user } = useAuth();
  return user?.id ?? DEMO_ME;
}

export * from "./types";
export * from "./repos";
export * from "./shopItems";
export { createInMemoryRepos } from "./adapters/inMemory";
export { DEMO_ME } from "./adapters/seed";
