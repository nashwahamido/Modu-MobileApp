import { BlockReason } from "@/src/game/core/evaluation/blockReason";
import { clusterLabel } from "@/src/game/core/evaluation/clusters";
import { ClusterId, Furniture, GroupId, TextLevel } from "@/src/game/core/type";
import { labelFor } from "./labels";

const VERB: Record<Exclude<BlockReason["kind"], "finishCluster">, string> = {
  place: "place",
  insert: "insert",
  secure: "secure",
  tighten: "tighten",
};

export function hintText(
  reason: BlockReason,
  f: Furniture,
  level: TextLevel = "standard",
): string {
  if (reason.kind === "finishCluster") {
    const name = clusterLabel(f, reason.target as ClusterId);
    return `Maybe finish the ${name} first.`;
  }
  const name = labelFor(f.labels, reason.target as GroupId, level);
  const verb = VERB[reason.kind];
  if (level === "simple") {
    return `${verb[0].toUpperCase()}${verb.slice(1)} the ${name} first.`;
  }
  return `Maybe ${verb} the ${name} first.`;
}
