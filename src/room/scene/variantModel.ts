// Which GLB the scene loads for a placed piece: the colour variant from storage when it is really
// there, else the bundled model.
//
// The fallback has to be EXPLICIT. react-native-filament's loader reports a failed fetch with a
// console.error and leaves useModel stuck in `state: 'loading'` forever (see useBuffer.ts) — there is no
// error state to react to, so a piece whose variant GLB is missing would simply never appear. So each
// variant URL is probed once per session with a HEAD request, and the answer is cached at module scope:
// after the first probe, switching colour resolves synchronously and loads exactly one model.
import { useEffect, useMemo, useState } from "react";

import type { AssetSrc } from "../../game/core/type";
import { getRoomItemModelSource, getRoomItemVariantUrl } from "../core/placeableItems";

// url -> is it fetchable. Session-lifetime: uploading a model mid-session needs an app reload, which is
// the same deal as any other bundled-vs-remote asset swap.
const reachable = new Map<string, boolean>();
// In-flight probes, so N pieces sharing a colour cause ONE request.
const probes = new Map<string, Promise<boolean>>();

function probe(url: string): Promise<boolean> {
  const existing = probes.get(url);
  if (existing) return existing;
  const p = fetch(url, { method: "HEAD" })
    .then(
      // A real server answer (200 or 404) is stable for the session — cache it either way.
      (res) => {
        reachable.set(url, res.ok);
        return res.ok;
      },
      // Offline, DNS — transient: fall back now but leave the URL uncached, so the next mount
      // re-probes instead of pinning this colour to the bundled model until app restart.
      () => false,
    )
    .then((ok) => {
      probes.delete(url);
      return ok;
    });
  probes.set(url, p);
  return p;
}

// The model source for one item in one colour. Starts on the bundled model so a piece is NEVER invisible,
// and upgrades to the variant the moment its URL is known good.
export function useVariantModelSource(
  itemId: string,
  variation: string | null | undefined,
): AssetSrc | { uri: string } | null {
  const url = getRoomItemVariantUrl(itemId, variation);
  // Synchronous when the URL was already probed this session — the common case once the room has drawn
  // itself once, and what makes a colour tap feel instant.
  const known = url === null ? undefined : reachable.get(url);
  const [confirmed, setConfirmed] = useState<string | null>(known ? url : null);

  useEffect(() => {
    if (url === null) {
      setConfirmed(null);
      return;
    }
    const cached = reachable.get(url);
    if (cached !== undefined) {
      setConfirmed(cached ? url : null);
      return;
    }
    // Unprobed colour: drop to the bundled model NOW rather than keep showing the previous
    // colour's GLB while the probe is in flight — the documented fallback, never a stale look.
    setConfirmed(null);
    let alive = true;
    void probe(url).then((ok) => {
      if (alive) setConfirmed(ok ? url : null);
    });
    return () => {
      alive = false;
    };
  }, [url]);

  // Memoized so the source object is referentially stable across the re-renders a dragged ghost causes.
  return useMemo(
    () => (confirmed ? { uri: confirmed } : getRoomItemModelSource(itemId)),
    [confirmed, itemId],
  );
}
