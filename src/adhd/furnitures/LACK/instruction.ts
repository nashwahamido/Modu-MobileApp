// LACK step text. Bolts are screwed in by hand; legs attach onto the bolts.
import { buildInstructions } from "@/src/adhd/core/presentation/instructions";
import {
  InstructionContent,
  InstructionSet,
  PartDef,
} from "@/src/adhd/core/type";
import { ACTIONS } from "./assembly";
import { LABELS } from "./parts.authored";
import { PARTS } from "./parts.gen";

const P = PARTS as Record<string, PartDef>;

const BEATS: Record<string, InstructionContent> = {};
for (const a of ACTIONS) {
  if (!a.partId) continue;
  const group = P[a.partId]?.group;
  if (group === "screw115980") {
    BEATS[a.actionId] = {
      text: "Screw the bolt into the corner by hand.",
      simpleText: "Twist the bolt in.",
      minimalText: "Add bolt",
    };
  } else if (group === "leg") {
    BEATS[a.actionId] = {
      text: "Attach the leg onto the bolt.",
      simpleText: "Add the leg.",
      minimalText: "Add leg",
    };
  }
}

export const INSTRUCTIONS: InstructionSet = buildInstructions(
  ACTIONS,
  P,
  LABELS,
  BEATS,
);
