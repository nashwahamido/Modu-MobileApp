import { useEffect, useState } from "react";
import { Image } from "react-native";
import { FilamentProxy, useFilamentContext, type RenderableManager, type Texture, type TextureFlags } from "react-native-filament";

import { surfaceMapUrl } from "../../data/catalog/urls";
import { probeRemote } from "../../data/remoteAsset";
import type { ItemSource, SurfaceMap } from "../../data/catalog/assets";
import type { ShopItem } from "../../data/shop/items";
import type { MapSet } from "./applySurfaceItem";

// Turn a surface item into GPU textures, or null.
//
// NULL MEANS "KEEP THE AUTHORED LOOK", and it is the only failure mode: a missing or undecodable map leaves the shell's own texture in place. There is no state in which a wall renders blank, because not applying a surface item is a valid, complete render.
//
// ALL OR NOTHING, deliberately. A base colour landing while its normal map is still in flight would show the new material lit by the old surface detail for a frame or two, which reads as a rendering bug rather than as loading. Resolving together costs nothing, because the maps are fetched in parallel; only the texture creation is serialised, and that runs on the Filament worklet thread rather than here — see stage 2.
//
// The probe is data/remoteAsset.ts's probeRemote, the SAME one variantModel.ts loads models through — one module owns the rule for every remote asset this app fetches, and the session cache is shared with it rather than a second private copy. It exists because react-native-filament's loader reports a failed fetch with a console.error and then leaves the buffer stuck in `loading` FOREVER — there is no error state to react to — so a missing texture has to be DETECTED with a HEAD request rather than awaited. It doubles as the cache-buster: storage serves with max-age=3600 and the device's HTTP cache honours it across restarts, so a re-uploaded texture would otherwise be invisible for an hour. The ETag becomes a ?v= query, which makes a re-upload a cache miss by construction.

// Base colour is sRGB; normal and metallic-roughness carry LINEAR data. Decoding those as sRGB does not throw — it just makes the lighting subtly wrong, which reads as "this material looks cheap" rather than as a bug, so it is the kind of mistake that ships.
const FLAGS: Record<SurfaceMap, TextureFlags> = {
  texture: "sRGB",
  normal: "none",
  rough: "none",
  trim_texture: "sRGB",
  trim_normal: "none",
  trim_rough: "none",
};

// What an ABSENT map has to be replaced with, rather than left alone. Filament keeps a texture HANDLE on the material and there is no API to unset one, so a slot the incoming item does not write keeps sampling the OUTGOING item's map — apply a fabric wallpaper with real weave in its normal, then a flat paint that ships none, and the paint wears the fabric's bump and gloss. Not a rare case either: the portal SKIPS publishing a map whose variance is below threshold (see MapSet), so "this item has no normal" is the normal state of any smooth surface. This is the same failure applySurfaceItem already defends against for the cornice (a slot nobody writes keeps the last item's trim) and for the UV matrices, which are written even when their map is absent for exactly this reason; the normal and roughness slots were the one place that reasoning had not been carried through.
//
// 1x1 PNGs, and their VALUES are the whole point rather than a placeholder colour. (128, 128, 255) is the flat tangent-space normal — it perturbs nothing, which is precisely what "no normal map" means. White is the neutral metallicRoughness: glTF multiplies G (roughness) and B (metallic) by roughnessFactor and metallicFactor, so 1.0 lets the material's own scalars through untouched, and anything darker would silently gloss or metallicise every surface that omits the map.
//
// ".tex" IS LOAD-BEARING — see the note in metro.config.js. These are PNG bytes, and a real .png extension makes Metro file them as an aapt drawable in an Android release build, where react-native-filament's loadAsset never looks. Decoding is unaffected: createTextureFromBuffer sniffs the CONTENT (KTX2 magic, else stb) and ignores both the filename and the mimeType.
const NEUTRAL_SOURCES = {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  normal: require("../../assets/textures/neutral_normal.tex"),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  rough: require("../../assets/textures/neutral_rough.tex"),
} as const;

// Derived rather than imported: neither type is re-exported from the package root.
type SurfaceBuffer = Parameters<RenderableManager["createTexture"]>[0];
type WorkletContext = ReturnType<typeof useFilamentContext>["workletContext"];

// UPLOAD EACH MAP ONCE PER ENGINE. A Texture cannot be freed on demand — TextureWrapper owns its Filament texture and destroys it only when Hermes collects the wrapper, and Hermes sizes that wrapper at a few bytes while it owns ~5.6 MB of GPU memory, so it feels no pressure to collect one. Re-resolving a surface therefore uploaded the same bytes again and left the previous upload resident. Three of these hooks are live at once (floor, wall, trim), so one account switch re-resolved up to eighteen maps with nothing reclaimed. Not creating the duplicate is the fix available to us, because releasing is not.
//
// KEYED ON THE RENDERABLE MANAGER, never module-global: a Texture belongs to the Engine that made it, so a scene remount has to start from an empty cache — handing a new engine a texture from a destroyed one is a use-after-free. The WeakMap drops each engine's cache along with the engine.
//
// The key is the VERSIONED url (probeRemote's ?v=<etag>), so a re-uploaded texture is a cache miss by construction — the same property the HTTP cache-bust already relies on.
const textureCaches = new WeakMap<RenderableManager, Map<string, Promise<Texture>>>();

function textureCacheFor(manager: RenderableManager): Map<string, Promise<Texture>> {
  let cache = textureCaches.get(manager);
  if (!cache) {
    cache = new Map();
    textureCaches.set(manager, cache);
  }
  return cache;
}

/**
 * Drop every cached upload for an engine that is going away.
 *
 * NOT MERELY TIDINESS, and not optional: TextureWrapper holds a STRONG shared_ptr to the Engine — its
 * own header says the failure signature of a leaked one is "the Engine never dies", because a single
 * surviving texture pins the whole GPU context, every asset and every material with it. Caching the
 * textures for the life of the engine is what makes the upload happen once; holding them PAST it
 * would keep a dead scene's entire engine resident, which is the difference between a few megabytes
 * and a few hundred. The WeakMap alone cannot be relied on for that — it drops the entry only once
 * the manager itself is unreachable, and a JS reference lingering anywhere defers the whole engine.
 */
function releaseTextureCache(manager: RenderableManager): void {
  textureCaches.delete(manager);
}

/**
 * The cached upload for `key`, creating it only on a miss.
 *
 * PROMISES ARE CACHED, NOT TEXTURES, and that is the point rather than a convenience: two effects
 * racing for the same map await ONE upload instead of starting a second and discarding the loser's,
 * and a discarded upload is a leak rather than a no-op.
 */
function uploadOnce(
  manager: RenderableManager,
  workletContext: WorkletContext,
  key: string,
  buffer: SurfaceBuffer | null,
  flags: TextureFlags,
): Promise<Texture> | null {
  const cache = textureCacheFor(manager);
  const existing = cache.get(key);
  if (existing) return existing;
  // No buffer and no cache entry means the fetch was skipped for a hit that has since been dropped.
  if (!buffer) return null;
  // On the FILAMENT WORKLET THREAD — see the note in stage 2 for why createTexture cannot run here.
  // ADOPTED WITH Promise.resolve, and it must stay that way: runAsync hands back a worklets-core THENABLE, not a Promise — it has .then but no .catch, and it is not safe to await more than once. Both matter here, because this value is cached and then awaited by every effect that asks for the same map. Unadopted, the .catch below threw a synchronous TypeError BEFORE the return, so a cache miss never delivered its texture at all and left the upload stranded in the map. Same adoption the shader material cache does, for the same reason — see ensureMaterial in game/scene/shaders.tsx.
  const created = Promise.resolve(
    workletContext.runAsync(() => {
      "worklet";
      return manager.createTexture(buffer, flags);
    }),
  );
  cache.set(key, created);
  // A failed upload must not stay cached, or one bad fetch makes the miss permanent for the session.
  void created.catch(() => cache.delete(key));
  return created;
}

export type NeutralMaps = { normal: Texture; rough: Texture };

/**
 * The stand-in maps for slots a surface item does not fill. Created ONCE for the life of the scene and shared by every group the shell has — they carry no item identity, so the floor slab, all four walls and the cornice sample the same two textures.
 *
 * Null until they land, and applySurfaceItem treats null as "leave the slot alone", which is exactly the behaviour this replaced. So the worst a failed decode can do is put back the bug, never break the room.
 */
export function useNeutralMaps(renderableManager: RenderableManager | null): NeutralMaps | null {
  const { workletContext } = useFilamentContext();
  const [neutral, setNeutral] = useState<NeutralMaps | null>(null);

  useEffect(() => {
    if (!renderableManager) return;
    let alive = true;

    void (async () => {
      // Same guard, and the same reason, as the per-map fetch below: FilamentProxy is undefined until the native side installs it, and on a dev client older than the current react-native-filament it never appears at all. Returning leaves `neutral` null, which is the supported "leave the slot alone" path.
      if (!FilamentProxy?.loadAsset) return;
      const uri = (source: number): string | null =>
        Image.resolveAssetSource(source)?.uri ?? null;
      const normalUri = uri(NEUTRAL_SOURCES.normal);
      const roughUri = uri(NEUTRAL_SOURCES.rough);
      if (!normalUri || !roughUri) return;

      const [normalBuffer, roughBuffer] = await Promise.all([
        FilamentProxy.loadAsset(normalUri),
        FilamentProxy.loadAsset(roughUri),
      ]);
      if (!alive) return;

      // On the FILAMENT WORKLET THREAD, for the reason stage 2 below spells out at length: createTexture spawns JobSystem work, and Filament aborts the process when that is entered from a thread it has not adopted. Both maps are LINEAR ("none"), never sRGB — a normal and a metallic-roughness carry data, not colour, and decoding them as sRGB would bend the very values chosen above to be exactly neutral.
      // Through uploadOnce like every other map: these two outlive the scene, so a remount that reuses the same engine must not upload them twice.
      const normalUpload = uploadOnce(renderableManager, workletContext, normalUri, normalBuffer, "none");
      const roughUpload = uploadOnce(renderableManager, workletContext, roughUri, roughBuffer, "none");
      if (!normalUpload || !roughUpload) return;
      const normal = await normalUpload;
      if (!alive) return;
      const rough = await roughUpload;
      if (!alive) return;

      setNeutral({ normal, rough });
    })();

    return () => {
      alive = false;
      // THE CACHE DIES WITH THE SCENE. This hook is instantiated exactly once per RoomScene, which
      // makes it the one owner that can say when an engine's uploads are finished with — the three
      // useSurfaceTextures instances share the same cache and unmount alongside it. See
      // releaseTextureCache for why holding textures past the engine is the expensive mistake.
      releaseTextureCache(renderableManager);
    };
  }, [renderableManager, workletContext]);

  return neutral;
}

export type SurfaceTextures = MapSet & { trim?: MapSet };
// itemId is the id this hook actually resolved maps FOR, set atomically with maps in the same setTextures call — the caller compares it against the item id it currently holds (itself from a separate useMemo, on its own schedule) before writing anything, because "maps is non-null" alone does not prove maps belongs to the item the caller thinks it does.
export type ResolvedSurfaceTextures = { itemId: string; maps: SurfaceTextures };

export function useSurfaceTextures(
  item: ShopItem | null,
  source: ItemSource,
  renderableManager: RenderableManager | null,
): ResolvedSurfaceTextures | null {
  const { workletContext } = useFilamentContext();
  const [textures, setTextures] = useState<ResolvedSurfaceTextures | null>(null);
  const spec = item?.surface ?? null;
  // A primitive dep, so a fresh object literal from the catalogue store cannot re-run this on every render — re-decoding textures the effect already produced.
  const key = item && spec ? `${source}/${item.id}/${spec.maps.join(",")}` : null;

  useEffect(() => {
    if (!item || !spec || !renderableManager || !key) {
      setTextures(null);
      return;
    }
    let alive = true;
    // Cleared FIRST: showing the previous item's maps while the new one loads would leave a tap looking like it did nothing, then silently change a second later.
    setTextures(null);

    void (async () => {
      // Stage 1 — resolve every URL and fetch its bytes IN PARALLEL. This is plain I/O (HEAD probe +
      // buffer fetch), nothing here runs the native busy-spin, so there is no reason to serialise it —
      // the "requested in parallel" cost-nothing claim above is about this stage.
      const cache = textureCacheFor(renderableManager);
      const fetched = await Promise.all(
        spec.maps.map(async (map) => {
          const url = surfaceMapUrl(source, item.id, map);
          if (!url) return null;
          // probeRemote answers from its own session cache when the URL has already settled, so this awaits a real request only the first time — and null (not in storage, or offline) drops just this map, leaving the shell's own texture in that slot.
          const versioned = await probeRemote(url);
          if (versioned === null) return null;
          // GUARDED. FilamentProxy is the native module's JSI proxy, and it is undefined until the
          // native side has installed it — on a dev client older than the current
          // react-native-filament it never appears at all. Unguarded, this threw an uncaught
          // TypeError per map on every room mount, which is noise rather than a symptom: a missing
          // map is already a supported outcome (null drops just this one, leaving the shell's own
          // texture), so an unavailable proxy takes exactly that path instead of rejecting.
          // A map this engine has already uploaded needs neither the download nor a second upload — see uploadOnce. Checked BEFORE loadAsset rather than after, so a re-resolve costs no network either.
          if (cache.has(versioned)) return { map, key: versioned, buffer: null };
          if (!FilamentProxy?.loadAsset) return null;
          const buffer = await FilamentProxy.loadAsset(versioned);
          return { map, key: versioned, buffer };
        }),
      );
      if (!alive) return;

      // Stage 2 — decode on the FILAMENT WORKLET THREAD, never here.
      //
      // Texture creation spawns JobSystem work, and Filament's JobSystem aborts the process outright
      // when it is entered from a thread it has not adopted: "Precondition ... in getState:334 ...
      // This thread has not been adopted", SIGABRT on mqt_v_js. Calling createTexture straight from
      // this effect crashed the app every time a room with a saved finish was opened. The library
      // says as much in its own types — changeMaterialTextureMap and createPlane are marked @worklet
      // and nothing else is, which is exactly the line between "spawns engine work" and "writes a
      // uniform". Plain parameter writes ARE safe from here, which is why wall culling has always
      // set baseColorFactor from an ordinary effect.
      //
      // Hopping threads also fixes the other half of the problem for free: createTexture busy-spins
      // until the decode drains, so nine maps in a row would have frozen the UI on a tap even when it
      // did not crash. The spin now happens on the thread whose job it is, and the JS thread stays
      // free without needing to be yielded back to.
      const ready = fetched.filter((entry): entry is NonNullable<(typeof fetched)[number]> => entry !== null);
      const byMap = new Map<SurfaceMap, Texture>();
      for (let i = 0; i < ready.length; i++) {
        // Re-checked every iteration, not just once before the loop: a stale effect should stop
        // paying for texture creation the moment it is known to be discarded, rather than running to
        // completion for nothing.
        if (!alive) return;
        const { map, key: cacheKey, buffer } = ready[i];
        const upload = uploadOnce(renderableManager, workletContext, cacheKey, buffer, FLAGS[map]);
        // Null only where the fetch was skipped for a cache entry that has since been dropped by a failed upload. Skipping the map leaves that slot to the neutral stand-in, which is the same outcome as a map the portal never published.
        if (!upload) continue;
        byMap.set(map, await upload);
      }
      if (!alive) return;

      const base = byMap.get("texture");
      // No base colour means no item. Publishing a normal map without one is a portal bug, and applying the normal alone would light the OLD texture with the NEW surface detail.
      if (!base) {
        setTextures(null);
        return;
      }
      const trimBase = byMap.get("trim_texture");
      setTextures({
        itemId: item.id,
        maps: {
          base,
          normal: byMap.get("normal"),
          rough: byMap.get("rough"),
          trim: trimBase
            ? { base: trimBase, normal: byMap.get("trim_normal"), rough: byMap.get("trim_rough") }
            : undefined,
        },
      });
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, renderableManager]);

  return textures;
}