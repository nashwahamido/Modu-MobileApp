import {
  ActionId,
  AssemblyAction,
  AssetSrc,
  AudioMap,
  ClusterDef,
  ClusterId,
  InstructionContent,
  InstructionSet,
  LabelMap,
  PartDef,
  TextLevel,
} from "@/src/game/core/type";
import { labelFor } from "./labels";

export const TOOL_NAME: Record<string, string> = {
  allenkey: "allen key",
  screwdriver: "screwdriver",
  mallet: "mallet",
  hammer: "hammer",
  hand: "your hands",
};

/**
 * Generate step text for every action. Part-bearing steps use shared templates
 * + the furniture's labels; part-less beats get generic defaults worded from
 * the cluster labels — `beats[actionId]` overrides any of them with custom
 * prose (only author what deserves better wording).
 */
export function buildInstructions(
  actions: readonly AssemblyAction[],
  parts: Record<string, PartDef>,
  labels: LabelMap,
  beats: Record<string, InstructionContent> = {},
  clusters: Record<ClusterId, ClusterDef> = {},
): InstructionSet {
  const clusterName = (id?: ClusterId): string =>
    (id && clusters[id]?.label?.toLowerCase()) || "assembly";

  const contentFor = (a: AssemblyAction): InstructionContent => {
    if (beats[a.actionId]) return beats[a.actionId];

    const group = a.partId ? parts[a.partId]?.group : undefined;
    const std = group ? labelFor(labels, group, "standard") : "part";
    const sim = group ? labelFor(labels, group, "simple") : "part";
    const tool = a.tool ? (TOOL_NAME[a.tool] ?? a.tool) : "the tool";

    switch (a.type) {
      case "placePart":
        return {
          text: `Place the ${std} into position.`,
          simpleText: `Add the ${sim}.`,
        };
      case "insertFastener":
        return {
          text: `Push the ${std} into its hole by hand.`,
          simpleText: `Start the ${sim} by hand.`,
        };
      case "tightenFastener":
        return a.tool === "mallet"
          ? {
              text: `Tap the ${std} fully in with the ${tool}.`,
              simpleText: `Tap the ${sim} in.`,
            }
          : {
              text: `Tighten the ${std} with the ${tool}.`,
              simpleText: `Tighten the ${sim}.`,
            };
      case "reorient":
        return a.cluster
          ? {
              text: `Stand the ${clusterName(a.cluster)} upright.`,
              simpleText: "Turn it the right way up.",
            }
          : {
              text: "Give it a gentle press and check everything feels solid.",
              simpleText: "Check it feels solid.",
            };
      case "combineClusters": {
        const others = Object.keys(clusters).filter((c) => c !== a.cluster);
        const target =
          others.length === 1 ? clusterName(others[0] as ClusterId) : "the rest";
        return {
          text: `Lower the ${clusterName(a.cluster)} onto the ${target} and line up the holes.`,
          simpleText: `Put the ${clusterName(a.cluster)} on top.`,
        };
      }
      case "verify":
        return {
          text: "Give everything a final check.",
          simpleText: "Check it.",
        };
      default:
        return { text: std };
    }
  };

  return Object.fromEntries(
    actions.map((a): [string, InstructionContent] => [a.actionId, contentFor(a)]),
  );
}

/** The wording for a step at a given text level, falling back to standard.
 *  When the audio setting is on the clip is the primary channel (see
 *  `stepAudio`); this text stays as the on-screen fallback. */
export function instructionText(
  instructions: InstructionSet,
  actionId: ActionId,
  level: TextLevel = "standard",
): string {
  const c = instructions[actionId];
  if (!c) return "";
  if (level === "simple") return c.simpleText ?? c.text ?? "";
  return c.text ?? "";
}

/** The spoken clip for a step, if the furniture ships audio. Undefined when the
 *  furniture has no `audio` map or no clip for this step (caller falls back to
 *  reading `instructionText`). */
export function stepAudio(
  audio: AudioMap | undefined,
  actionId: ActionId,
): AssetSrc | undefined {
  return audio?.[actionId];
}
