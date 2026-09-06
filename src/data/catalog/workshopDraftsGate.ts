// whether this build merges testing drafts into the live catalogue — see supabase.ts and placeableStore.ts
export function workshopDraftsDevGateOpen(
  isDev: boolean,
  dataBackend: string | undefined,
  showcase: string | undefined,
): boolean {
  return isDev && dataBackend === "supabase" && showcase !== "1";
}
