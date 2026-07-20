import { GroupId, LabelMap, LabelSet, PartDef, PartId } from "@/src/game/core/type";

export function composeLabels(
  authored: LabelMap,
  parts: Record<PartId, PartDef>,
  hardware: Partial<Record<GroupId, { label?: LabelSet }>> = {},
): LabelMap {
  const out: LabelMap = { ...authored };
  for (const p of Object.values(parts)) {
    if (out[p.group]) continue;
    const label = hardware[p.group]?.label;
    if (label) out[p.group] = label;
  }
  return out;
}
