// HEAD-probe a remote asset URL once per session. Two jobs in one request: (1) react-native-filament's loader has no error state — a bad URL strands its useModel/useBuffer hooks in `loading` forever — so nothing may reach them unverified; (2) the response ETag becomes a ?v= cache-buster, because storage serves with cache-control: max-age=3600 and the device's HTTP cache honours that across app restarts, so a re-upload would otherwise stay invisible for up to an hour. Extracted from room/scene/variantModel.ts (verbatim ETag/query semantics) so recipe/model/thumb fetching share one discipline instead of three private copies.
//
// null means "not in storage / unreachable" — the caller's cue to fall back to whatever it shows by default (a bundled model, the authored look). A real 200 with an unreadable ETag still resolves, just without a cache-buster (the bare URL keeps ordinary cache semantics rather than losing the asset).
const resolved = new Map<string, string | null>();
// In-flight probes, so N callers sharing a URL cause ONE request.
const probes = new Map<string, Promise<string | null>>();

export function probeRemote(url: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  if (resolved.has(url)) return Promise.resolve(resolved.get(url)!);
  const existing = probes.get(url);
  if (existing) return existing;
  const p = fetcher(url, { method: "HEAD", headers: { "Cache-Control": "no-cache" } })
    .then(
      (res): string | null => {
        if (!res.ok) {
          resolved.set(url, null);
          return null;
        }
        const etag = res.headers.get("etag")?.replace(/[^A-Za-z0-9]/g, "") ?? "";
        const versioned = etag ? `${url}?v=${etag}` : url;
        resolved.set(url, versioned);
        return versioned;
      },
      // Offline, DNS — transient: fall back now but leave the URL UNCACHED, so the next probe this session retries instead of pinning the failure until app restart.
      (): null => null,
    )
    .then((versioned) => {
      probes.delete(url);
      return versioned;
    });
  probes.set(url, p);
  return p;
}

// Synchronous peek at this session's cache: undefined = never probed, null = probed and unreachable, string = the versioned URL to load. Lets a caller render instantly once a URL has already been settled, without waiting a tick through an effect.
export function peekProbedRemote(url: string): string | null | undefined {
  return resolved.get(url);
}
