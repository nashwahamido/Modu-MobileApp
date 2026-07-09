// Generic fastener-rule expansion. A furniture authors a few rules (which
// group, in which stage, with which tool, requiring what); this stamps out the
// insert+tighten action pair for every part in each group.
import { AssemblyAction, PartDef, ToolId } from "@/src/adhd/core/type";
import { pair } from "./actionBuilder";
import { groupParts } from "./targets";

export type FastenerRule = {
  group: string;
  stage: number;
  tool: ToolId;
  requires: (p: PartDef) => readonly string[];
};

export function expandFastenerRules(
  rules: readonly FastenerRule[],
  parts: Record<string, PartDef>,
): AssemblyAction[] {
  return rules.flatMap((r) =>
    groupParts(parts, r.group).flatMap((p) =>
      pair(p.partId, r.tool, r.requires(p), r.stage),
    ),
  );
}
