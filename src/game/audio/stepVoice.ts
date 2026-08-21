// Where each assembly step's recording lives in storage.
//
// THE NUMBER IS THE LINE NUMBER. The clips were cut from the generated script (one text file, all
// four models at both text levels), and each file is named for the line it came from — so
// `LACK-standard-11.mp3` is line 11 of that file, which is the first LACK standard instruction.
//
// That is why the numbers do not start at 1 and why they are not action indices. LACK has thirteen
// actions but only four distinct sentences, because "Place the Leg into position." is said for every
// leg; the script lists each sentence ONCE, so there are four clips and one of them plays four
// times.
//
// The mapping is therefore: dedupe a furniture's instructions in action order, take the position in
// that list, and add the block's offset. The offsets below are transcribed from the script; every
// other number is derived from the app's own instruction builder, so re-wording a step moves its
// clip automatically and only the offsets need touching if the script is regenerated.
import type { ActionId, Furniture, TextLevel } from "@/src/game/core/type";
import { buildInstructions, instructionText } from "@/src/game/core/presentation/instructions";

export const VOICEOVER_BUCKET = "Voiceover";

/**
 * Folder, file prefix and first line number, per model and level.
 *
 * SPELLED OUT rather than derived from the furniture id, because storage is case-sensitive and the
 * uploaded names follow no single rule: LACK's folder is capitalised where the others are lowercase,
 * and DALFRED is spelled "dalferd". A derived path would produce the name the code thinks is right
 * and get silence; listing them keeps the odd ones visible and fixable in one place.
 *
 * THE OFFSETS ARE TRANSCRIBED FROM THE SCRIPT, not calculated. They were computed once by rebuilding
 * the file in code, and that rebuild was two lines short by DALFRED — close enough to look right and
 * wrong enough to play the wrong instruction. LACK and DALFRED below are now read off the file
 * itself, and so are BEKVAM's; EKET is still calculated and should be checked the same way before
 * its recordings are relied on.
 */
const BLOCKS: Record<
  string,
  Record<TextLevel, { folder: string; prefix: string; offset: number }> | undefined
> = {
  "lack-table": {
    standard: { folder: "LACK-Standard", prefix: "LACK-standard", offset: 10 },
    // Capital S in the PREFIX as well as the folder — LACK's two blocks were uploaded with different
    // casing ("LACK-standard-11.mp3" but "LACK-Simple-17.mp3"), which is exactly the kind of thing a
    // derived path gets wrong and a transcribed one gets right.
    simple: { folder: "LACK-Simple", prefix: "LACK-Simple", offset: 16 },
  },
  "dalfred-stool": {
    standard: { folder: "dalferd-standard", prefix: "dalferd-standard", offset: 67 },
    simple: { folder: "dalferd-simple", prefix: "dalferd-simple", offset: 89 },
  },
  "bekvam-stool": {
    standard: { folder: "bekvam-standard", prefix: "bekvam-standard", offset: 240 },
    simple: { folder: "bekvam-simple", prefix: "bekvam-simple", offset: 256 },
  },
  // UNVERIFIED — calculated, not read off the script. See the note above. The three blocks checked
  // so far were out by 2, 2 and 6, so this one should be assumed wrong until it is read the same way.
  "eket-cabinet": {
    standard: { folder: "eket-standard", prefix: "eket-standard", offset: 396 },
    simple: { folder: "eket-simple", prefix: "eket-simple", offset: 442 },
  },
};

/** The script's own de-duplication, rebuilt from the furniture. Cached: it walks every action and
 *  formats every instruction, which is wasted work to repeat on each spoken step. */
const lineCache = new Map<string, Map<string, number>>();

function linesFor(furniture: Furniture, level: TextLevel): Map<string, number> {
  const key = `${furniture.meta.id}:${level}`;
  const hit = lineCache.get(key);
  if (hit) return hit;

  const set = buildInstructions(
    furniture.actions,
    furniture.parts,
    furniture.labels,
    furniture.instructions ?? {},
    furniture.clusters ?? {},
  );
  // ACTION ORDER, first occurrence wins — the same walk the script did, so the positions agree.
  const byAction = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const action of furniture.actions) {
    const text = instructionText(set, action.actionId, level);
    if (!text) continue;
    let n = seen.get(text);
    if (n === undefined) {
      n = seen.size + 1;
      seen.set(text, n);
    }
    byAction.set(action.actionId, n);
  }
  lineCache.set(key, byAction);
  return byAction;
}

/**
 * The storage path for one step's recording, or null if there is no clip for it.
 *
 * Null covers a model with no recordings and an action that is not part of the build. Callers should
 * do what onboarding's speech does with a missing clip — fall back to synthesis rather than going
 * quiet, so a step is never silent just because a file is absent.
 */
export function stepVoicePath(
  furniture: Furniture,
  actionId: ActionId,
  level: TextLevel,
): string | null {
  const block = BLOCKS[furniture.meta.id]?.[level];
  if (!block) return null;
  const position = linesFor(furniture, level).get(actionId);
  if (position === undefined) return null;
  return `${block.folder}/${block.prefix}-${block.offset + position}.mp3`;
}