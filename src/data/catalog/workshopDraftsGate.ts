// whether this build merges testing drafts into the live catalogue — see adapters/supabase.ts and placeableStore.ts
// devAccounts.ts's DEV_ACCOUNTS_ENABLED condition VERBATIM, so the switcher and the workshop merge always move together
// a function, not a constant: importing devAccounts.ts would close a circular import back through data/index.ts
// and __DEV__ is a Metro global node does not define, so reading it at the top level would throw under node:test
export function workshopDraftsDevGateOpen(
  isDev: boolean,
  dataBackend: string | undefined,
  showcase: string | undefined,
): boolean {
  return isDev && dataBackend === "supabase" && showcase !== "1";
}
