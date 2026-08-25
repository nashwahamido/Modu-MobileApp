// Non-React repository registry. Store actions and Node tests import this
// module directly so data access does not pull React Native hooks into a pure
// state module.
import { createInMemoryRepos } from "./adapters/inMemory";
import type { Repos } from "./core/repos";

let active: Repos =
  process.env.EXPO_PUBLIC_DATA_BACKEND === "supabase"
    ? // Keep the native Supabase client out of in-memory runs and Node tests.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("./adapters/supabase") as typeof import("./adapters/supabase")).createSupabaseRepos()
    : createInMemoryRepos();

export function getRepos(): Repos {
  return active;
}

export function setRepos(next: Repos): void {
  active = next;
}
