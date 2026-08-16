// Whether this build may read workshop_drafts (status='testing') and merge those rows into the live catalogue/shop, client-side — see the merges in listPlaceables/getShopItems/listOwned (adapters/supabase.ts) and the cache-read filter in placeableStore.ts. Re-expresses devAccounts.ts's DEV_ACCOUNTS_ENABLED condition VERBATIM rather than inventing a second spelling of the same idea — a build that shows the dev account switcher but not its own workshop uploads, or the reverse, would be a confusing thing to debug against, and the two gates must always move together.
//
// Written as a function of its three inputs rather than a top-level constant read off __DEV__/process.env at import time the way devAccounts.ts's own export is, for two reasons. First, importing devAccounts.ts directly from here would close a circular import: devAccounts.ts -> accounts.ts -> room/core/placement.ts -> data/index.ts -> data/adapters/supabase.ts, which is exactly where this gate gets applied. Second, __DEV__ is a Metro/Expo global that plain node does not define — a module that reads it at the top level throws the moment node:test imports it, and this file needs to stay importable from a plain test the way assets.ts and surfaceSpec.ts already are.
export function workshopDraftsDevGateOpen(
  isDev: boolean,
  dataBackend: string | undefined,
  showcase: string | undefined,
): boolean {
  return isDev && dataBackend === "supabase" && showcase !== "1";
}
