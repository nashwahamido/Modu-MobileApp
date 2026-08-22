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
 * wrong enough to play the wrong instruction. All four blocks below are now read off the file
 * itself; the calculated numbers were out by 2, 2, 6 and 20.
 *
 * HOW TO VERIFY A BLOCK, since every one checked so far has been wrong: rebuild the model's deduped
 * line list (the same walk linesFor does below — dedupe instructionText in ACTION order, first
 * occurrence wins) and match line 1 against the script. The offset is the script line of the block's
 * FIRST instruction, minus one. Then check the COUNT: the number of distinct lines must equal the
 * number of uploaded files, which is what catches an error that happens to line the first clip up.
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
  // Read off the script (2026-08-21), replacing calculated offsets of 396 and 442 that were both out
  // by 20. Standard runs script lines 377–420 and simple 423–457 — 44 and 35 lines, matching the 44
  // and 35 uploaded files exactly, which is the count check the note above asks for.
  //
  // The 20 mattered differently at each level, and the standard case is why this was worth chasing:
  // 397–440 are all real files, so nothing 404s and nothing falls back — EKET simply spoke the wrong
  // step, twenty lines late, and past 420 it ran off the end of its own block into the simple one.
  // Simple asked for 443–477, which mostly do not exist, so it dropped to the bundled clip instead.
  "eket-cabinet": {
    standard: { folder: "eket-standard", prefix: "eket-standard", offset: 376 },
    simple: { folder: "eket-simple", prefix: "eket-simple", offset: 422 },
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