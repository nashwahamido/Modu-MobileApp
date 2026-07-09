import { useMemo } from "react";
import { availableActions, currentStage } from "@/src/adhd/core/assembly/availability";
import { buildPartActions, buildPartStage } from "@/src/adhd/core/assembly/targets";
import { labelFor } from "@/src/adhd/core/presentation/labels";
import { AssemblyAction, Furniture, PartType } from "@/src/adhd/core/type";
import { useGameStore } from "@/src/adhd/core/store";

/**
 * socket_hint: an unplaced part whose snap or insert socket is currently
 * reachable (same group as the held part). Renders as a glowing ghost
 * at its target position so the player can see all valid drop targets at once.
 */
export type PartMode = "hidden" | "flush" | "loose" | "held" | "socket_hint";

export interface TrayItem {
  label: string;
  group: string;
  /** Representative part for the group (thumbnail source). */
  partId: string;
  /** Parts of this kind not yet placed/inserted in the current stage. */
  remaining: number;
  /** Representative action picked up when the card is grabbed (if enabled). */
  action: AssemblyAction | null;
  enabled: boolean;
  kind: PartType;
}

export interface SceneState {
  modes: Record<string, PartMode>;
  /** Action whose part the player is currently holding. */
  heldAction: AssemblyAction | null;
  /** Everything this stage uses, grouped — the inventory column. */
  trayItems: TrayItem[];
  /** Tighten action currently awaiting the circular gesture. */
  activeTighten: AssemblyAction | null;
  /** Reorient/combine beat currently awaiting the player's swipe. */
  activeBeat: AssemblyAction | null;
}

export function deriveSceneState(
  furniture: Furniture,
  completed: readonly string[],
  heldActionId: string | null,
  activeCluster: string | null = null,
  focusMode = false,
): SceneState {
  const done = new Set(completed);
  const actionById = new Map(furniture.actions.map((a) => [a.actionId, a]));
  const partActions = buildPartActions(furniture.actions);
  const partStage = buildPartStage(furniture.actions);

  const heldAction = heldActionId ? (actionById.get(heldActionId) ?? null) : null;
  const available = availableActions(furniture.actions, furniture.gates, done);
  const availableIds = new Set(available.map((a) => a.actionId));
  const stage = currentStage(furniture.actions, done);

  // Inventory: every snap/insert part of the current stage that isn't placed yet.
  const groups = new Map<string, TrayItem>();
  for (const a of furniture.actions) {
    if (a.stage !== stage || !a.partId || done.has(a.actionId)) continue;
    if (a.type !== "snapPart" && a.type !== "insertFastener") continue;
    const part = furniture.parts[a.partId];
    const pickable = !heldAction && availableIds.has(a.actionId);
    const isHeld = heldAction?.actionId === a.actionId;
    const label = labelFor(furniture.labels, part.group);
    const g = groups.get(part.group);
    if (g) {
      g.remaining += 1;
      // The group always carries an action so its GestureDetector stays
      // mounted for the whole touch (unmounting it mid-gesture kills the
      // active pan). Priority: held instance > first pickable > first seen.
      if (isHeld) {
        g.action = a;
      } else if (pickable && !g.enabled) {
        g.enabled = true;
        g.action = a;
      }
    } else {
      groups.set(part.group, {
        label,
        group: part.group,
        partId: part.partId,
        remaining: 1,
        action: a,
        enabled: pickable,
        kind: part.type,
      });
    }
  }
  const allTray = [...groups.values()];
  // Focus Mode strips the tray to a single group — the one in hand, else the
  // current one — so only the current part is on screen.
  let trayItems = allTray;
  if (focusMode && allTray.length > 0) {
    if (heldAction?.partId) {
      const heldG = furniture.parts[heldAction.partId].group;
      const only = allTray.filter((t) => t.group === heldG);
      trayItems = only.length ? only : allTray.slice(0, 1);
    } else {
      trayItems = allTray.slice(0, 1);
    }
  }
  const firstTighten = available.find((a) => a.type === "tightenFastener") ?? null;
  const activeTighten = !heldAction ? firstTighten : null;
  const activeBeat = !heldAction
    ? (available.find((a) => a.type === "reorient" || a.type === "combine") ?? null)
    : null;

  // During the seat build (stage 3) the player may set the finished base
  // cluster aside (into the tray) so it doesn't block the view; it returns
  // for the stage-4 combine. Player-controlled, never automatic.
  const baseSetAside = stage === 3 && activeCluster === "base";

  // When the player holds a snap or insert part, record the group so we can
  // show ghost hints at every same-group open socket simultaneously.
  const heldGroup =
    heldAction?.partId &&
    (heldAction.type === "snapPart" || heldAction.type === "insertFastener")
      ? furniture.parts[heldAction.partId].group
      : null;
  const heldIsInsert = heldAction?.type === "insertFastener";

  const modes: Record<string, PartMode> = {};
  for (const id of Object.keys(furniture.parts)) {
    const acts = partActions[id] ?? {};
    const part = furniture.parts[id];
    let placed = acts.insert
      ? done.has(acts.insert)
      : acts.snap
        ? done.has(acts.snap)
        : false;
    // A fastener with no action of its own (LACK's leg screws) is built into
    // the leg it belongs to — it shows once that leg is placed. The leg carries
    // the link via `attach`, so find the part that points back at this screw.
    if (!placed && !acts.snap && !acts.insert && part.type === "fastener") {
      const owner = Object.values(furniture.parts).find((p) => p.attach === id);
      const ownerSnap = owner ? partActions[owner.partId]?.snap : undefined;
      if (ownerSnap) placed = done.has(ownerSnap);
    }
    if (heldAction?.partId === id) modes[id] = "held";
    else if (!placed) {
      // Show a ghost at every open socket in the same group as the held
      // part so the player can see all valid drop positions at once.
      const hintActionId = heldIsInsert ? acts.insert : acts.snap;
      if (
        heldGroup &&
        furniture.parts[id].group === heldGroup &&
        hintActionId &&
        availableIds.has(hintActionId)
      ) {
        modes[id] = "socket_hint";
      } else {
        modes[id] = "hidden";
      }
    } else if (baseSetAside && (partStage[id] ?? 9) <= 2) modes[id] = "hidden";
    // Anything awaiting a tighten/secure action sits loose until it completes
    // (hand-inserted fasteners AND mallet-secured structurals like the pole).
    else if (acts.tighten && !done.has(acts.tighten)) modes[id] = "loose";
    else modes[id] = "flush";
  }
  return { modes, heldAction, trayItems, activeTighten, activeBeat };
}

export function useSceneState(): SceneState {
  const furniture = useGameStore((s) => s.furniture);
  const completed = useGameStore((s) => s.completed);
  const heldActionId = useGameStore((s) => s.heldActionId);
  const activeCluster = useGameStore((s) => s.activeCluster);
  const focusMode = useGameStore((s) => s.settings.focusMode);
  return useMemo(
    () =>
      furniture
        ? deriveSceneState(furniture, completed, heldActionId, activeCluster, focusMode)
        : { modes: {}, heldAction: null, trayItems: [], activeTighten: null, activeBeat: null },
    [furniture, completed, heldActionId, activeCluster, focusMode],
  );
}
