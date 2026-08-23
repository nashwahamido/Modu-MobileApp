// Sound effects, driven from the STORE rather than from the controls.
//
// Every gesture in this app ends in the same few store transitions — a part is held, an action completes, a tighten accumulates degrees. Subscribing once here means a new control gets its sounds for free, and no control has to remember to make a noise. It also keeps the audio out of the gesture path, which is the part that has to stay at 60fps.
import { useEffect, useRef } from "react";
import { actionCluster, requiresClusterFocus } from "@/src/game/core/evaluation/clusters";
import { useGameStore } from "@/src/game/core/store";
import { playSfx, preloadSfx } from "@/src/game/audio/sfx";
import type { ActionId } from "@/src/game/core/type";

/** Degrees of rotation between clicks. A tighten reports degrees continuously, so without a detent
 *  this is not a click track but a buzz. 30 is roughly a sixth of a turn — frequent enough to feel
 *  like progress, sparse enough to stay a sound rather than a texture. */
const TICK_DEGREES = 30;

export function useAssemblySfx(enabled: boolean): void {
  const lastTickRef = useRef<Record<string, number>>({});
  const prevCompletedRef = useRef(0);
  const prevHeldRef = useRef<ActionId | null>(null);

  useEffect(() => {
    if (!enabled) return;
    preloadSfx();

    // Seed from the CURRENT state, not from zero: resuming a saved build would otherwise replay a seat sound for every step already finished.
    const start = useGameStore.getState();
    prevCompletedRef.current = start.completed.length;
    prevHeldRef.current = start.heldActionId;
    lastTickRef.current = Object.fromEntries(
      Object.entries(start.tightenDeg).map(([id, deg]) => [id, Math.floor(deg / TICK_DEGREES)]),
    );

    return useGameStore.subscribe((s) => {
      // ── picking up and putting down ──────────────────────────────────────
      if (s.heldActionId !== prevHeldRef.current) {
        if (s.heldActionId) {
          // A pickup of a part whose step isn't available yet is a mistake in progress: it gets
          // the error cue INSTEAD of the pickup cue — one sound, saying the right thing, rather
          // than a cheerful pickup with a correction talking over it.
          const held = s.heldActionId;
          const blocked = !s.available().some((a) => a.actionId === held);
          playSfx(blocked ? "error" : "pickup");
        }
        // Only a genuine put-back: a release that COMPLETED the action is a seat, and the seat sound fires below. Playing both would double up on every successful placement.
        else if (s.completed.length === prevCompletedRef.current) playSfx("drop");
        prevHeldRef.current = s.heldActionId;
      }

      // ── an action finishing ──────────────────────────────────────────────
      if (s.completed.length > prevCompletedRef.current) {
        const justDone = s.completed[s.completed.length - 1];
        // The finished build is deliberately SILENT here: the completion screen has its own celebration, and a fanfare firing the instant the last action lands would collide with it.
        if (s.furniture) {
          const action = s.furniture.actions.find((a) => a.actionId === justDone);
          const cluster = action ? actionCluster(s.furniture, action) : null;
          const clusterDone =
            cluster != null &&
            s.furniture.actions
              .filter((a) => actionCluster(s.furniture!, a) === cluster)
              .every((a) => s.completed.includes(a.actionId));
          // The cluster fanfare is for models that ACTUALLY have stages — DALFRED and EKET. LACK and
          // BEKVAM are single-cluster builds, so `clusterDone` goes true on their very last action
          // and the fanfare would fire a beat before the completion screen's own. requiresClusterFocus
          // is the same test the project map uses to decide whether to offer a stage chooser at all,
          // so the sound and the map agree about what a stage is by construction.
          const staged = requiresClusterFocus(s.furniture);
          // Logged in dev because "the cluster sound did not play" has three possible causes that
          // look identical from the outside: the action was not the last of its cluster, the model
          // has no stages, or the clip itself failed to open. This says which.
          if (__DEV__ && clusterDone) {
            console.log(
              `[sfx] cluster "${cluster}" complete on ${s.furniture.meta.id} — staged=${staged} -> ${
                staged ? "clusterComplete" : "seat"
              }`,
            );
          }
          playSfx(clusterDone && staged ? "clusterComplete" : "seat");
        } else {
          playSfx("seat");
        }
        prevCompletedRef.current = s.completed.length;
      } else if (s.completed.length < prevCompletedRef.current) {
        // Undo. Silent on purpose — a sound here would reward going backwards.
        prevCompletedRef.current = s.completed.length;
      }

      // ── turning a fastener ───────────────────────────────────────────────
      for (const [id, deg] of Object.entries(s.tightenDeg)) {
        const detent = Math.floor(Math.abs(deg) / TICK_DEGREES);
        if (detent !== (lastTickRef.current[id] ?? 0)) {
          // Only on the way IN. Backing a screw out should not sound like progress.
          if (detent > (lastTickRef.current[id] ?? 0)) playSfx("tick");
          lastTickRef.current[id] = detent;
        }
      }
    });
  }, [enabled]);
}

/** The mallet. Fired by the tap controls directly rather than from the subscription: a strike is an
 *  INPUT event, and its sound has to land with the finger, not one store update later. */
export function playTapSfx(): void {
  playSfx("tap");
}