// HEAD-probe a remote asset URL once per session, for two jobs in one request
// filament's loader has no error state, so a bad URL strands useModel/useBuffer in `loading` forever
// and the ETag becomes a ?v= cache-buster, since storage's max-age=3600 would otherwise hide a re-upload for an hour
// null = unreachable, the caller's cue to fall back to its default. a 200 with an unreadable ETag resolves on the bare URL
const resolved = new Map<string, string | null>();
// in-flight probes, so N callers sharing a URL cause ONE request
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
      // offline or DNS — transient, so leave the URL UNCACHED and let the next probe retry rather than pin it until restart
      (): null => null,
    )
    .then((versioned) => {
      probes.delete(url);
      return versioned;
    });
  probes.set(url, p);
  return p;
}

// undefined = never probed, null = probed and unreachable, string = the versioned URL
// lets a settled URL render instantly instead of a tick later through an effect
export function peekProbedRemote(url: string): string | null | undefined {
  return resolved.get(url);
}
