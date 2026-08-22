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

/** Shown instead of a named blocker when the build offers more than one way forward. Naming a step is a promise; with several moves legal the ranked "first actionable" candidate is one arbitrary pick among many, and the promise is not backed by the state. */
const GENERIC = "Something else comes first.";

export function hintText(
  reason: BlockReason,
  f: Furniture,
  level: TextLevel = "standard",
  openWays = 1,
): string {
  // Strictly greater than one: ZERO ways open means blockReason fell through to its candidates[0] backstop, and that guess is the only information there is — the generic line would be strictly less useful.
  if (openWays > 1) return GENERIC;
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
