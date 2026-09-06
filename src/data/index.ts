// the data injection point
import { useAuth } from "@/src/hooks/useAuth";
import { createInMemoryRepos } from "./adapters/inMemory";
import { DEMO_ME } from "./adapters/seed";
import type { UserId } from "./core/types";
import { getRepos } from "./registry";

export { getRepos, setRepos } from "./registry";

export function useRepos() {
  return getRepos();
}
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
