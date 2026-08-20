// The one place the BUILD MAP knows how a catalogue finish and the build's `renderStyle` correspond.
//
// It exists because the map needs that correspondence read BACKWARD. The catalogue reads it forward — the player picks a finish off the carousel, and that sets the render style the build runs in — and owns its own copy of the table, in catalogue.tsx. The map is handed the style after the fact and has to recover which finish's artwork to wear.
//
// So the table below is a SECOND copy, and that is a known cost rather than an oversight: keeping the catalogue untouched was worth more than collapsing them. If a finish is ever added, renamed, or repointed, catalogue.tsx's FINISH_STYLE and this one both have to move — and the test beside this file pins the shape, so a drift shows up there rather than as a wrong picture on a stage circle.

import type { ClusterId, Furniture, RenderStyleId, ThumbSet } from "@/src/game/core/type";

/**
 * What each carousel finish means to the BUILD.
 *
 * The assembly screen has exactly one lever for how a model looks — `renderStyle` — and it drives
 * either a whole-model swap (cozy / cartoon ship their own GLB) or a material pass (illustrated is
 * the wood-grain shader, shown as "Wooden" in settings). The DB's variations are a different axis:
 * they dress the FINISHED piece in the room, and the build screen does not read them at all, which
 * is why white and black land on the plain model there rather than silently doing nothing.
 *
 * MIRRORS `FINISH_STYLE` in src/app/(game)/catalogue.tsx — see the note at the top of this file.
 */
export const FINISH_STYLE: Record<string, RenderStyleId> = {
  cozy: "cozy",
  cartoon: "cartoon",
  wooden: "illustrated",
  white: "realistic",
  black: "realistic",
};

/**
 * The inverse: which of THIS model's finishes is the one being built.
 *
 * Narrowed by the model's own finish list rather than inverted globally, because the forward map is
 * many-to-one — white and black both mean "realistic". No single model ships both, so the answer is
 * unambiguous once the candidates are just the finishes this model actually has art for: EKET's
 * realistic is white, DALFRED's is black. Inverting the table on its own could only ever pick one of
 * them for every model, and would have been wrong for the other.
 *
 * Undefined means "no finish corresponds" — `toon` is a style with no carousel finish at all, and a
 * model may simply not ship art for the finish its style maps to. Callers fall back to the plain art.
 */
export function finishForStyle(
  style: RenderStyleId,
  finishes: readonly string[] | undefined,
): string | undefined {
  if (!finishes) return undefined;
  return finishes.find((f) => FINISH_STYLE[f] === style);
}

/** The whole-model art in the finish being built, falling back to the meta's plain thumbnail. */
export function modelThumbSet(furniture: Furniture, style: RenderStyleId): ThumbSet {
  const art = furniture.meta.variantThumbnails;
  const finish = finishForStyle(style, art && Object.keys(art));
  return (finish ? art?.[finish] : undefined) ?? furniture.meta.thumbnail;
}

/**
 * One sub-assembly's art in the finish being built.
 *
 * Falls back per-CLUSTER, not per-model: a model that ships variant art for its cabinet but not yet
 * for its drawers shows the finished cabinet beside the plain drawers, rather than dropping the
 * whole set back to plain. That is the same degradation rule `variantThumbnails` already documents
 * for the catalogue tile, applied one level down.
 */
export function clusterThumbSet(
  furniture: Furniture,
  clusterId: ClusterId,
  style: RenderStyleId,
): ThumbSet | undefined {
  const art = furniture.clusterVariantThumbs;
  const finish = finishForStyle(style, art && Object.keys(art));
  return (finish ? art?.[finish]?.[clusterId] : undefined) ?? furniture.clusterThumbs?.[clusterId];
}