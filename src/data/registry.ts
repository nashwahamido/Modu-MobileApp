// non-React registry, so store actions and node tests reach data without dragging in RN hooks
import { createInMemoryRepos } from "./adapters/inMemory";
import type { Repos } from "./core/repos";

let active: Repos =
  process.env.EXPO_PUBLIC_DATA_BACKEND === "supabase"
    ? (
        require("./adapters/supabase") as typeof import("./adapters/supabase")
      ).createSupabaseRepos()
    : createInMemoryRepos();

export function getRepos(): Repos {
  return active;
}

export function setRepos(next: Repos): void {
  active = next;
}
