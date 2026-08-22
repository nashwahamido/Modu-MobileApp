// Which GLB the scene loads for a placed piece: the colour variant from storage, or nothing.
//
// There is no bundled room model behind this, for any item — see getRoomItemStoragePath's note on the assembly GLBs that used to serve as one. Every piece renders only once its storage URL is confirmed, and a piece whose variant is genuinely missing from the bucket stays invisible. That is a real cost, accepted knowingly: the alternative on offer was parsing a 66.9 MB assembly model to draw a closed cabinet.
//
// The MISS has to be detected here, before the loader sees it. react-native-filament's loader reports a failed fetch with a console.error and leaves useModel stuck in `state: 'loading'` forever (see useBuffer.ts) — there is no error state to react to, so handing it a URL that 404s costs a permanently pending model rather than a clean nothing. So each variant URL is probed once per session with a HEAD request, and the answer is cached at module scope: after the first probe, switching colour resolves synchronously and loads exactly one model.
//
// The probe doubles as the CACHE-BUSTER. Storage serves models with cache-control: max-age=3600, and the device's HTTP cache honours it across app restarts — a re-uploaded model was invisible for up to an hour. The HEAD revalidates against origin (no-cache) and the file's ETag becomes a ?v= query on the URL the scene actually loads: a re-upload changes the ETag, which changes the URL, which is a cache miss by construction. Unchanged files keep their URL and their cached bytes.
//
// The probe itself lives in data/remoteAsset.ts, shared with the cloud recipe loader — this module only keeps the room-placement framing (catalog lookup, referential stability across a dragged ghost's re-renders) around it.
import { useEffect, useMemo, useState } from "react";

import { defaultVariation, type VariantRef } from "../../data/catalog/assets";
import { useItemVariants } from "../../data/catalog/variantStore";
import { peekProbedRemote, probeRemote } from "../../data/remoteAsset";
import { getRoomItemVariantUrl } from "../core/placeableItems";

/**
 * The colour to LOAD for a placement: its own if it has one, else the item's default from item_variants.
 *
 * RESOLVED HERE, not at placement time. startPlacing also asks for the default (placement.ts), but it asks
 * ONCE, synchronously, off a variantStore that is empty until item_variants has loaded — and a null answer is
 * persisted as an absent `color`, read back as null on every later launch. So a piece placed in that window was
 * pinned to the 'default' path segment for good, which for a multi-variation item is a file that does not
 * exist. Reading the table again at render time is what lets that placement heal: useItemVariants is a
 * subscription, so the default arrives, the URL changes, and the probe runs against the real model.
 *
 * The table stays the only place a default is DEFINED — this reads it, it does not second-guess it.
 */
export function variationToLoad(
  variation: string | null | undefined,
  variants: VariantRef[],
): string | null {
  return variation ?? defaultVariation(variants);
}

// The model source for one item in one colour: null until the storage URL is confirmed, and the caller renders nothing until then. Built and bought behave identically — neither has a bundle to start on.
export function useVariantModelSource(
  itemId: string,
  variation: string | null | undefined,
): { uri: string } | null {
  // Subscribed, not read once: the default this resolves to changes when item_variants hydrates, and that has to reach the URL below.
  const variants = useItemVariants(itemId);
  const url = getRoomItemVariantUrl(itemId, variationToLoad(variation, variants));
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
    // Unprobed colour: clear NOW rather than keep showing the previous colour's GLB while the probe is in flight — the piece blanks for the length of one HEAD request, which is honest, where a stale look is not.
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
  return useMemo(() => (confirmed ? { uri: confirmed } : null), [confirmed]);
}
