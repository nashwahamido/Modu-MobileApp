import { useMemo } from 'react';
import { ACTIONS, ACTION_BY_ID, AssemblyAction } from '../game/assembly';
import { availableActions, currentStage } from '../game/availability';
import { ALL_PART_IDS, PARTS, PartId } from '../game/parts';
import { PART_ACTIONS, PART_STAGE } from '../game/targets';
import { useGameStore } from '../game/store';

export type PartMode = 'hidden' | 'flush' | 'loose' | 'held';

export interface TrayItem {
  label: string;
  /** Representative part for the group (thumbnail source). */
  partId: PartId;
  /** Parts of this kind not yet placed/inserted in the current stage. */
  remaining: number;
  /** Representative action picked up when the card is grabbed (if enabled). */
  action: AssemblyAction | null;
  enabled: boolean;
  kind: 'structural' | 'fastener';
}

export interface SceneState {
  modes: Record<PartId, PartMode>;
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
  completed: readonly string[],
  heldActionId: string | null,
  baseStashed = false,
): SceneState {
  const done = new Set(completed);
  const heldAction = heldActionId ? (ACTION_BY_ID.get(heldActionId) ?? null) : null;
  const available = availableActions(done);
  const availableIds = new Set(available.map((a) => a.id));
  const stage = currentStage(done);

  // Inventory: every snap/insert part of the current stage that isn't placed yet.
  const groups = new Map<string, TrayItem>();
  for (const a of ACTIONS) {
    if (a.stage !== stage || !a.partId || done.has(a.id)) continue;
    if (a.type !== 'snapPart' && a.type !== 'insertFastener') continue;
    const part = PARTS[a.partId];
    const pickable = !heldAction && availableIds.has(a.id);
    const isHeld = heldAction?.id === a.id;
    const g = groups.get(part.label);
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
      groups.set(part.label, {
        label: part.label,
        partId: part.id,
        remaining: 1,
        action: a,
        enabled: pickable,
        kind: part.kind,
      });
    }
  }
  const trayItems = [...groups.values()];
  const firstTighten = available.find((a) => a.type === 'tightenFastener') ?? null;
  const activeTighten = !heldAction ? firstTighten : null;
  const activeBeat = !heldAction
    ? (available.find((a) => a.type === 'reorient' || a.type === 'combine') ?? null)
    : null;

  // Bug 2: during the seat build (stage 3) the player may set the finished
  // leg/ring base aside (into the tray) so it doesn't block the view; it
  // returns for the stage-4 combine. Player-controlled, never automatic.
  const baseSetAside = stage === 3 && baseStashed;

  const modes = {} as Record<PartId, PartMode>;
  for (const id of ALL_PART_IDS) {
    const acts = PART_ACTIONS[id] ?? {};
    const placed = acts.insert ? done.has(acts.insert) : acts.snap ? done.has(acts.snap) : false;
    if (heldAction?.partId === id) modes[id] = 'held';
    else if (!placed) modes[id] = 'hidden';
    else if (baseSetAside && (PART_STAGE[id] ?? 9) <= 2) modes[id] = 'hidden';
    // Anything awaiting a tighten/secure action sits loose until it completes
    // (hand-inserted fasteners AND mallet-secured structurals like the pole).
    else if (acts.tighten && !done.has(acts.tighten)) modes[id] = 'loose';
    else modes[id] = 'flush';
  }
  return { modes, heldAction, trayItems, activeTighten, activeBeat };
}

export function useSceneState(): SceneState {
  const completed = useGameStore((s) => s.completed);
  const heldActionId = useGameStore((s) => s.heldActionId);
  const baseStashed = useGameStore((s) => s.baseStashed);
  return useMemo(
    () => deriveSceneState(completed, heldActionId, baseStashed),
    [completed, heldActionId, baseStashed],
  );
}
