// Which GLB the scene loads for a placed piece: the colour variant from storage when it is really there, else the bundled model.
//
// The fallback has to be EXPLICIT. react-native-filament's loader reports a failed fetch with a console.error and leaves useModel stuck in `state: 'loading'` forever (see useBuffer.ts) — there is no error state to react to, so a piece whose variant GLB is missing would simply never appear. So each variant URL is probed once per session with a HEAD request, and the answer is cached at module scope: after the first probe, switching colour resolves synchronously and loads exactly one model.
//
// The probe doubles as the CACHE-BUSTER. Storage serves models with cache-control: max-age=3600, and the device's HTTP cache honours it across app restarts — a re-uploaded model was invisible for up to an hour. The HEAD revalidates against origin (no-cache) and the file's ETag becomes a ?v= query on the URL the scene actually loads: a re-upload changes the ETag, which changes the URL, which is a cache miss by construction. Unchanged files keep their URL and their cached bytes.
//
// The probe itself lives in data/remoteAsset.ts, shared with the cloud recipe loader — this module only keeps the room-placement framing (bundled fallback, per-item memoization) around it.
import { useEffect, useMemo, useState } from "react";

import type { AssetSrc } from "../../game/core/type";
import { peekProbedRemote, probeRemote } from "../../data/remoteAsset";
import { getRoomItemModelSource, getRoomItemVariantUrl } from "../core/placeableItems";

// The model source for one item in one colour. Starts on the bundled model so a built piece is NEVER invisible, and upgrades to the variant the moment its URL is known good. A BOUGHT item has no bundle: this returns null until its storage URL is confirmed, and the caller renders nothing.
export function useVariantModelSource(
  itemId: string,
  variation: string | null | undefined,
): AssetSrc | { uri: string } | null {
  const url = getRoomItemVariantUrl(itemId, variation);
  // Synchronous when the URL was already probed this session — the common case once the room has drawn itself once, and what makes a colour tap feel instant.
  const known = url === null ? undefined : peekProbedRemote(url);
  const [confirmed, setConfirmed] = useState<string | null>(known ? known : null);

  useEffect(() => {
    if (url === null) {
      setConfirmed(null);
      return;
    }
    const cached = peekProbedRemote(url);
    if (cached !== undefined) {
      setConfirmed(cached);
      return;
    }
    // Unprobed colour: drop to the bundled model NOW rather than keep showing the previous colour's GLB while the probe is in flight — the documented fallback, never a stale look.
    setConfirmed(null);
    let alive = true;
    void probeRemote(url).then((versioned) => {
      if (alive) setConfirmed(versioned);
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
