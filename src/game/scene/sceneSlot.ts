// One Filament engine at a time.
//
// Two scenes alive together race on surface teardown: Android frees the outgoing view's SurfaceTexture
// on the UI thread while that engine is still drawing into it, which leaks the engine and eventually
// wedges the render thread. Every route that owns a scene claims the slot here, and the previous owner
// is revoked a full commit BEFORE the next one is granted, so no two scenes are ever mounted together.
//
// This replaces a route-name check that never matched: expo-router names the root screens "(game)/play"
// and "(social)/visit", so a Set of bare names ("play", "visit") left the guard permanently off.
import { useEffect, useRef, useSyncExternalStore } from "react";

// Claimants in request order. The newest is the one the slot belongs to.
let queue: string[] = [];
// Distinguishes two hook instances mounted under the same route name — see useSceneSlot.
let nextClaim = 0;
let owner: string | null = null;
const subscribers = new Set<() => void>();

function emit(): void {
  subscribers.forEach((notify) => notify());
}

function claimant(): string | null {
  return queue.length > 0 ? queue[queue.length - 1] : null;
}

/**
 * Revoke first, grant second, never both in one commit — that gap is the whole point of this module.
 * The revoked owner re-enters here once its scene is out of the tree, which is what grants the next.
 */
export function settleSlot(): void {
  const next = claimant();
  if (owner === next) return;
  owner = owner === null ? next : null;
  emit();
}

export function requestSlot(id: string): void {
  if (!queue.includes(id)) queue.push(id);
  settleSlot();
}

export function withdrawSlot(id: string): void {
  queue = queue.filter((entry) => entry !== id);
  // An owner that is unmounting has nothing left to tear down, so it needs no revoke commit of its own.
  if (owner === id) owner = null;
  settleSlot();
}

export function currentOwner(): string | null {
  return owner;
}

/** Drops every claim. For tests, so one case cannot leak state into the next. */
export function resetSceneSlot(): void {
  queue = [];
  owner = null;
  subscribers.clear();
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

/**
 * Whether `id` may mount its Filament scene this commit. Pass `wanted: false` to give the slot up
 * without unmounting the screen around it — the room does this while a friend's room is on top.
 */
export function useSceneSlot(id: string, wanted = true): boolean {
  // A CLAIM IS PER HOOK INSTANCE, never the route name, and that distinction is the whole guarantee. Two components can be mounted under the same name at once — expo-router leaves the old room in the tree while the next one arrives, and a dev account switch does it every time, because signInToAccount brackets the whole switch in duringAuthTransition so the session gate never navigates away. Keyed by name, the second room's requestSlot was swallowed by `queue.includes(id)`, settleSlot saw an unchanged claimant and returned early, and BOTH instances then read currentOwner() === "room" and mounted a scene. Two scenes means two engines, and the older one is never revoked, so nothing releases its assets: a FilamentAsset's deleter holds a strong shared_ptr<EngineImpl>, so the whole engine stays resident. That is ~460 MB per login until the OS kills the app.
  // The name is kept only as a prefix, so a claim still reads as "room#3" in a debugger.
  const claim = useRef<string | null>(null);
  if (claim.current === null) claim.current = `${id}#${nextClaim++}`;
  const mine = claim.current;
  const current = useSyncExternalStore(subscribe, currentOwner, currentOwner);
  useEffect(() => {
    if (!wanted) {
      withdrawSlot(mine);
      return;
    }
    requestSlot(mine);
    return () => withdrawSlot(mine);
  }, [mine, wanted]);
  const granted = current === mine;
  useEffect(() => {
    // Our scene is out of the tree as of this commit, so the slot is free to move on.
    if (!granted) settleSlot();
  }, [granted]);
  return granted;
}
