import type {
  ActionId,
  ComponentId,
  ComponentMap,
  LabelSet,
  PartDef,
  PartId,
} from "@/src/game/core/type";
import { placeId } from "@/src/game/core/ids";

/** Derived component lookups, hung off Furniture alongside `liaisons`. */
export interface ComponentIndex {
  /** Every body (INCLUDING the lead) → its component. */
  byBody: Record<PartId, ComponentId>;
  bodies: Record<ComponentId, readonly PartId[]>;
  lead: Record<ComponentId, PartId>;
  label: Record<ComponentId, LabelSet>;
}

const EMPTY: ComponentIndex = { byBody: {}, bodies: {}, lead: {}, label: {} };

/** Build and VALIDATE the component index. Throws on an authoring mistake, the same contract the gate evaluator uses for an unknown gate. */
export function buildComponents(
  components: ComponentMap | undefined,
  parts: Record<PartId, PartDef>,
): ComponentIndex {
  if (!components) return EMPTY;
  const idx: ComponentIndex = { byBody: {}, bodies: {}, lead: {}, label: {} };
  for (const c of Object.values(components)) {
    if (c.bodies.length < 2) throw new Error(`component "${c.id}" needs ≥2 bodies`);
    if (!c.bodies.includes(c.lead)) throw new Error(`component "${c.id}" lead "${c.lead}" is not one of its bodies`);
    for (const b of c.bodies) {
      if (!parts[b]) throw new Error(`component "${c.id}" references missing part "${b}"`);
      if (idx.byBody[b]) throw new Error(`part "${b}" is claimed by both "${idx.byBody[b]}" and "${c.id}"`);
      idx.byBody[b] = c.id;
    }
    idx.bodies[c.id] = c.bodies;
    idx.lead[c.id] = c.lead;
    idx.label[c.id] = c.label;
  }
  return idx;
}

/** True when the part is a component body that is NOT its lead — never carded, never independently offered. */
export function isNonLeadBody(idx: ComponentIndex | undefined, partId: PartId): boolean {
  if (!idx) return false;
  const c = idx.byBody[partId];
  return !!c && idx.lead[c] !== partId;
}

/** The place ids of a lead's sibling bodies (empty unless `leadActionId` is exactly a lead's place action). */
export function memberPlaceIdsForLead(
  idx: ComponentIndex | undefined,
  leadActionId: ActionId,
): ActionId[] {
  if (!idx) return [];
  for (const c of Object.keys(idx.bodies) as ComponentId[]) {
    if (placeId(idx.lead[c]) !== leadActionId) continue;
    return idx.bodies[c].filter((b) => b !== idx.lead[c]).map(placeId);
  }
  return [];
}

/** If the tail of `completed` is a component body, how many contiguous ids form its block and which lead's place id to remember for redo. Null when the tail is a normal single action. */
export function componentBlockAtTail(
  idx: ComponentIndex | undefined,
  actions: readonly { actionId: ActionId; partId?: PartId }[],
  completed: readonly ActionId[],
): { leadActionId: ActionId; count: number } | null {
  if (!idx || completed.length === 0) return null;
  const partOf = new Map(actions.map((a) => [a.actionId, a.partId]));
  const tailPart = partOf.get(completed[completed.length - 1]);
  const comp = tailPart ? idx.byBody[tailPart] : undefined;
  if (!comp) return null;
  let count = 0;
  for (let i = completed.length - 1; i >= 0; i--) {
    const p = partOf.get(completed[i]);
    if (!p || idx.byBody[p] !== comp) break;
    count++;
  }
  return { leadActionId: placeId(idx.lead[comp]), count };
}
