// the injection point — every feature imports the seam from HERE, never a concrete adapter, so going live is one line
import { useAuth } from "@/src/hooks/useAuth";
import { createInMemoryRepos } from "./adapters/inMemory";
import { DEMO_ME } from "./adapters/seed";
import type { UserId } from "./core/types";
import { getRepos } from "./registry";

export { getRepos, setRepos } from "./registry";

// the repo seam for components. the swap is startup-only, so a stable singleton needs no reactivity
export function useRepos() {
  return getRepos();
}

// the real Supabase id when signed in, else the demo user so features work with no session — drop the fallback at go-live
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
