import type { ActionId, Furniture, TextLevel } from "@/src/game/core/type";
import { buildInstructions, instructionText } from "@/src/game/core/presentation/instructions";

export const VOICEOVER_BUCKET = "Voiceover";

export const SCRIPT_BLOCKS: Record<
  string,
  Record<TextLevel, { folder: string; prefix: string; firstLine: number; lines: readonly string[] }> | undefined
> = {
  "lack-table": {
    standard: {
      folder: "LACK-Standard",
      prefix: "LACK-standard",
      firstLine: 11,
      lines: [
 "Place the Table top into position.",
 "Place the Leg into position.",
 "Push the Bolt into its hole by hand.",
 "Tighten the Bolt by hand.",
      ],
    },
    simple: {
      folder: "LACK-Simple",
      prefix: "LACK-Simple",
      firstLine: 17,
      lines: [
 "Add the Top.",
 "Add the Leg.",
 "Start the Bolt by hand.",
 "Tighten the Bolt.",
      ],
    },
  },
  "dalfred-stool": {
    standard: {
      folder: "dalferd-standard",
      prefix: "dalferd-standard",
      firstLine: 68,
      lines: [
 "Place the Top plate into position.",
 "Place the Leg into position.",
 "Place the Bottom plate into position.",
 "Place the Ring rail into position.",
 "Place the Support pin into position.",
 "Place the Seat into position.",
 "Place the Seat plate into position.",
 "Place the Pole into position.",
 "Set the base down in place.",
 "Set the seat's pole into the base and screw it clockwise until it sits tight.",
 "Push the Wood screw into its hole by hand.",
 "Tighten the Wood screw with the allen key.",
 "Push the Ring rail screw into its hole by hand.",
 "Tighten the Ring rail screw with the allen key.",
 "Push the Support pin screw into its hole by hand.",
 "Tighten the Support pin screw with the screwdriver.",
 "Push the Plate screw into its hole by hand.",
 "Tighten the Plate screw with the screwdriver.",
 "Push the Cap into its hole by hand.",
 "Tap the Cap fully in with the mallet.",
      ],
    },
    simple: {
      folder: "dalferd-simple",
      prefix: "dalferd-simple",
      firstLine: 90,
      lines: [
 "Add the Top circle.",
 "Add the Leg.",
 "Add the Bottom circle.",
 "Add the Round bar.",
 "Add the Center pin.",
 "Add the Seat.",
 "Add the Plate.",
 "Add the Pole.",
 "Place the base.",
 "Screw the seat onto the base.",
 "Start the Screw by hand.",
 "Tighten the Screw.",
 "Start the Cap by hand.",
 "Tap the Cap in.",
      ],
    },
  },
  "bekvam-stool": {
    standard: {
      folder: "bekvam-standard",
      prefix: "bekvam-standard",
      firstLine: 241,
      lines: [
 "Place the Left side panel into position.",
 "Place the Lower step into position.",
 "Place the Right side panel into position.",
 "Place the Back bottom rail into position.",
 "Place the Front step rail into position.",
 "Place the Front top rail into position.",
 "Place the Back top rail into position.",
 "Place the Top step into position.",
 "Push the Wood dowel into its hole by hand.",
 "Tap the Wood dowel fully in by hand.",
 "Push the Wood screw into its hole by hand.",
 "Tighten the Wood screw with the allen key.",
 "Push the Long screw into its hole by hand.",
 "Tighten the Long screw with the allen key.",
      ],
    },
    simple: {
      folder: "bekvam-simple",
      prefix: "bekvam-simple",
      firstLine: 257,
      lines: [
 "Add the Left side.",
 "Add the Step.",
 "Add the Right side.",
 "Add the Rail.",
 "Add the Top.",
 "Start the Peg by hand.",
 "Tap the Peg in.",
 "Start the Screw by hand.",
 "Tighten the Screw.",
      ],
    },
  },
  "eket-cabinet": {
    standard: {
      folder: "eket-standard",
      prefix: "eket-standard",
      firstLine: 377,
      lines: [
 "Place the Left side panel into position.",
 "Place the Left runner into position.",
 "Place the Left middle rail into position.",
 "Place the Left slide into position.",
 "Place the Slide clip into position.",
 "Press the Top panel onto its pins, then push it forward to lock.",
 "Press the Right side panel onto its pins, then push it back to lock.",
 "Place the Right runner into position.",
 "Place the Right middle rail into position.",
 "Place the Right slide into position.",
 "Place the Back panel into position.",
 "Press the Bottom panel onto its pins, then push it forward to lock.",
 "Take out the Stabiliser rod and set it down in front of you — you will fit its hardware before it goes in.",
 "Set the Dowel at the end of the Stabiliser rod.",
 "Press the Dowel into the end of the Stabiliser rod.",
 "Pick the assembled Stabiliser rod back up and fit it into position.",
 "Draw the Dowel out into the slider, then turn it a quarter turn to lock.",
 "Place the Suspension bracket into position.",
 "Tighten the Suspension bracket with the screwdriver.",
 "Place the Adjuster knob into position.",
 "Place the Suspension cover into position.",
 "Place the Cover cap into position.",
 "Place the Left drawer side into position.",
 "Press the Drawer front onto its pins, then push it down to lock.",
 "Press the Right drawer side onto its pins, then push it up to lock.",
 "Place the Drawer bottom into position.",
 "Place the Drawer back into position.",
 "Place the Left runner bracket into position.",
 "Place the Right runner bracket into position.",
 "Stand the cabinet where it will live and settle it into place.",
 "Line the top drawer up with the upper runners and slide it in until it clicks.",
 "Slide the bottom drawer onto the lower runners the same way.",
 "Press the front of the top drawer so it springs open, pull it all the way out, then push it home until it clicks.",
 "Now the bottom drawer: press to pop it open, pull it out, and push it home.",
 "Push the Back screw into its hole by hand.",
 "Tighten the Back screw with the screwdriver.",
 "Push the Bracket screw into its hole by hand.",
 "Tighten the Bracket screw with the screwdriver.",
 "Push the Runner screw into its hole by hand.",
 "Tighten the Runner screw with the screwdriver.",
 "Push the Cam lock into its hole by hand.",
 "Press the Cam lock in until it seats.",
 "Push the Cam pin into its hole by hand.",
 "Press the Cam pin in until it seats.",
      ],
    },
    simple: {
      folder: "eket-simple",
      prefix: "eket-simple",
      firstLine: 423,
      lines: [
 "Add the Left side.",
 "Add the Runner.",
 "Add the Middle.",
 "Add the Slide.",
 "Add the Clip.",
 "Press the Top panel on, then push forward.",
 "Press the Right side on, then push back.",
 "Add the Back panel.",
 "Press the Bottom panel on, then push forward.",
 "Take out the Rod.",
 "Add the Peg.",
 "Press the Peg in.",
 "Put the Rod in.",
 "Pull the Peg out and turn to lock.",
 "Add the Wall bracket.",
 "Tighten the Wall bracket.",
 "Add the Knob.",
 "Add the Cover.",
 "Add the Cap.",
 "Press the Front on, then push down.",
 "Press the Right side on, then push up.",
 "Add the Base.",
 "Add the Back.",
 "Add the Bracket.",
 "Put the cabinet in place.",
 "Slide the top drawer in.",
 "Slide the bottom drawer in.",
 "Press the top drawer, pull it out, push it back in.",
 "Press the bottom drawer, pull it out, push it back in.",
 "Start the Screw by hand.",
 "Tighten the Screw.",
 "Start the Lock by hand.",
 "Press the Lock in.",
 "Start the Pin by hand.",
 "Press the Pin in.",
      ],
    },
  },
};

const lineCache = new WeakMap<Furniture, Map<TextLevel, Map<string, string>>>();

function lineTextFor(furniture: Furniture, level: TextLevel): Map<string, string> {
  let byLevel = lineCache.get(furniture);
  if (!byLevel) {
    byLevel = new Map();
    lineCache.set(furniture, byLevel);
  }
  const hit = byLevel.get(level);
  if (hit) return hit;

  const set = buildInstructions(
    furniture.actions,
    furniture.parts,
    furniture.labels,
    furniture.instructions ?? {},
    furniture.clusters ?? {},
  );
  const byAction = new Map<string, string>();
  for (const action of furniture.actions) {
    const text = instructionText(set, action.actionId, level);
    if (text) byAction.set(action.actionId, text);
  }
  byLevel.set(level, byAction);
  return byAction;
}

export function stepVoicePath(
  furniture: Furniture,
  actionId: ActionId,
  level: TextLevel,
): string | null {
  const block = SCRIPT_BLOCKS[furniture.meta.id]?.[level];
  if (!block) return null;
  const text = lineTextFor(furniture, level).get(actionId);
  if (text === undefined) return null;
  const index = block.lines.indexOf(text);
  if (index < 0) return null;
  return `${block.folder}/${block.prefix}-${block.firstLine + index}.mp3`;
}