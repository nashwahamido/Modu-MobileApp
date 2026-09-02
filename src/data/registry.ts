// non-React registry — store actions and node tests import this, so data access never drags RN hooks into a pure module
import { createInMemoryRepos } from "./adapters/inMemory";
import type { Repos } from "./core/repos";

let active: Repos =
  process.env.EXPO_PUBLIC_DATA_BACKEND === "supabase"
    ? // required, not imported: keeps the native Supabase client out of in-memory runs and node tests
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("./adapters/supabase") as typeof import("./adapters/supabase")).createSupabaseRepos()
    : createInMemoryRepos();

export function getRepos(): Repos {
  return active;
}

export function setRepos(next: Repos): void {
  active = next;
}
