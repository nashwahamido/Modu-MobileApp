// An ActionRef is either a literal action id or one of three expansion forms that quantify over the parts table: "tighten-group:<group>" (after every fastener in the group is tight — the shorthand ANSWERS.template.json promised in prose), "place-group:<group>", "place-cluster:<cluster>" (every STRUCTURAL part of the cluster placed). Expansion is deterministic from parts alone, so recipes stay data and the quantified sets can never drift from the model.
import { placeId, tightenId, asActionId } from "@/src/game/core/ids";
import type { ActionId, PartDef, PartId } from "@/src/game/core/type";

export type ActionRef = string;

type Parts = Record<PartId, PartDef>;

function expandOver(ref: ActionRef, matched: PartDef[], toAction: (p: PartDef) => ActionId): ActionId[] {
  if (matched.length === 0) throw new Error(`ActionRef "${ref}" matches no parts`);
  return matched.map(toAction);
}

export function expandRef(ref: ActionRef, parts: Parts): ActionId[] {
  const all = Object.values(parts) as PartDef[];
  if (ref.startsWith("tighten-group:")) {
    const g = ref.slice("tighten-group:".length);
    return expandOver(ref, all.filter((p) => p.group === g), (p) => tightenId(p.partId));
  }
  if (ref.startsWith("place-group:")) {
    const g = ref.slice("place-group:".length);
    return expandOver(ref, all.filter((p) => p.group === g), (p) => placeId(p.partId));
  }
  if (ref.startsWith("place-cluster:")) {
    const c = ref.slice("place-cluster:".length);
    return expandOver(ref, all.filter((p) => p.cluster === c && p.type === "structural"), (p) => placeId(p.partId));
  }
  return [asActionId(ref)];
}

export const expandRefs = (refs: readonly ActionRef[], parts: Parts): ActionId[] => refs.flatMap((r) => expandRef(r, parts));
