// The injection point. Every feature imports the repo seam from here — never a concrete adapter, never src/services or supabase directly. TODAY: an in-memory adapter with demo fixtures. To go live, implement createSupabaseRepos() against the same Repos interface (wrapping src/services) and swap the one line below. No feature code changes.
import { useAuth } from "@/src/hooks/useAuth";
import { createInMemoryRepos } from "./adapters/inMemory";
import { DEMO_ME } from "./adapters/seed";
import type { UserId } from "./core/types";
import { getRepos } from "./registry";

export { getRepos, setRepos } from "./registry";

// The repo seam for components. Swap is startup-only, so a stable singleton needs no reactivity.
export function useRepos() {
  return getRepos();
}

// The single source of "who am I" for features. Returns the real Supabase id when signed in, else the demo user so features work on the in-memory adapter without a live session. Drop the DEMO_ME fallback at go-live.
export function useCurrentUserId(): UserId {
  const { user } = useAuth();
  return user?.id ?? DEMO_ME;
}

export * from "./core/types";
export * from "./core/repos";
export * from "./shop/items";
export * from "./catalog/assets";
export { createInMemoryRepos } from "./adapters/inMemory";
export { DEMO_ME } from "./adapters/seed";
