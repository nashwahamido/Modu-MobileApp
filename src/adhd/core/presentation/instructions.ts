// Generic step-text. Builds an InstructionSet from a furniture's actions using
// shared assembly verbs (place / insert / tighten / tap), pulling part names
// from the furniture's labels. Per-furniture beats (reorient/combine wording)
// are passed in as overrides. Resolving text at a level is also here.
import {
  AssemblyAction,
  InstructionContent,
  InstructionSet,
  LabelMap,
  PartDef,
  TextLevel,
} from "@/src/adhd/core/type";
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
 * + the furniture's labels; part-less beats come from `beats[actionId]`.
 */
export function buildInstructions(
  actions: readonly AssemblyAction[],
  parts: Record<string, PartDef>,
  labels: LabelMap,
  beats: Record<string, InstructionContent> = {},
): InstructionSet {
  const contentFor = (a: AssemblyAction): InstructionContent => {
    if (beats[a.actionId]) return beats[a.actionId];

    const group = a.partId ? parts[a.partId]?.group : undefined;
    const std = group ? labelFor(labels, group, "standard") : "part";
    const sim = group ? labelFor(labels, group, "simple") : "part";
    const min = group ? labelFor(labels, group, "minimal") : "part";
    const tool = a.tool ? (TOOL_NAME[a.tool] ?? a.tool) : "the tool";

    switch (a.type) {
      case "snapPart":
        return {
          text: `Place the ${std} into position.`,
          simpleText: `Add the ${sim}.`,
          minimalText: min,
        };
      case "insertFastener":
        return {
          text: `Push the ${std} into its hole by hand.`,
          simpleText: `Start the ${sim} by hand.`,
          minimalText: `Insert ${min}`,
        };
      case "tightenFastener":
        return a.tool === "mallet"
          ? {
              text: `Tap the ${std} fully in with the ${tool}.`,
              simpleText: `Tap the ${sim} in.`,
              minimalText: `Tap ${min}`,
            }
          : {
              text: `Tighten the ${std} with the ${tool}.`,
              simpleText: `Tighten the ${sim}.`,
              minimalText: `Tighten ${min}`,
            };
      default:
        return { text: std };
    }
  };

  return Object.fromEntries(
    actions.map((a): [string, InstructionContent] => [a.actionId, contentFor(a)]),
  );
}

/** The wording for a step at a given text level, falling back to standard. */
export function instructionText(
  instructions: InstructionSet,
  actionId: string,
  level: TextLevel = "standard",
): string {
  const c = instructions[actionId];
  if (!c) return "";
  if (level === "simple") return c.simpleText ?? c.text ?? "";
  if (level === "minimal") return c.minimalText ?? c.simpleText ?? c.text ?? "";
  return c.text ?? "";
}
