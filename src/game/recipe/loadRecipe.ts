// src/game/recipe/loadRecipe.ts
// The one entry point that turns a parsed RecipeV1 into a playable Furniture, through the SAME pipeline bundled furniture uses at import time — applyStructure → buildLiaisons → buildComponents → composeLabels → composeFurnitureActions → buildInstructions → metaCounts → assertValidFurniture. Validation runs ALWAYS here (not just __DEV__ like the bundled modules): a cloud recipe is data from outside the bundle, and a broken one must surface as a Result the caller can render, never as a crash or a silently wrong build.
import { action, composeFurnitureActions, type FastenerRule } from "@/src/game/core/composition/composeActions";
import { composeLabels } from "@/src/game/core/composition/composeLabels";
import { metaCounts } from "@/src/game/core/composition/metaCounts";
import { assertValidFurniture } from "@/src/game/core/composition/validateFurniture";
import { asFurnitureId } from "@/src/game/core/ids";
import { buildComponents } from "@/src/game/core/model/components";
import { applyStructure, buildLiaisons, type StructureOverlay } from "@/src/game/core/model/liaisons";
import { buildInstructions } from "@/src/game/core/presentation/instructions";
import { HARDWARE } from "@/src/game/content/hardware";
import type { AssetSrc, ClusterDef, ClusterId, ClusterThumbMap, ComponentId, ComponentDef, DraftAction, Furniture, LabelMap, PartDef, PartId, PushOpenSpec, ThumbMap, ThumbSet } from "@/src/game/core/type";
import { toFastenerRule } from "./fastenerRules";
import { compileGate } from "./gateExpr";
import { expandRefs } from "./refs";
import type { RecipeV1 } from "./schema";

export interface RecipeAssets {
  model: AssetSrc;
  thumbs: ThumbMap;
  clusterThumbs?: ClusterThumbMap;
  thumbnail: ThumbSet;
}

export interface RecipeRow {
  xpPerStep: number;
  xpBonusOnComplete: number;
}

export type RecipeResult = { ok: true; furniture: Furniture } | { ok: false; error: string };

export function composeRecipe(recipe: RecipeV1, assets: RecipeAssets, row: RecipeRow): RecipeResult {
  try {
    const rawParts = recipe.parts as unknown as Record<PartId, PartDef>;
    const parts = applyStructure(rawParts, recipe.structure as unknown as StructureOverlay);
    const liaisons = buildLiaisons(parts);
    const componentMap = recipe.components ? (Object.fromEntries(Object.entries(recipe.components).map(([id, c]) => [id, { id, label: c.label, bodies: c.bodies, lead: c.lead }])) as unknown as Record<ComponentId, ComponentDef>) : undefined;
    const components = componentMap ? buildComponents(componentMap, parts) : undefined;
    const hardware = { ...(recipe.hardware ?? {}), ...HARDWARE } as typeof HARDWARE;
    const labels = composeLabels(recipe.labels as unknown as LabelMap, parts, hardware);
    const rules: FastenerRule[] = recipe.fastenerRules.map((r) => toFastenerRule(r, parts));
    const clusters = recipe.clusters as unknown as Record<ClusterId, ClusterDef> | undefined;
    // DEVIATION from the brief's pseudo-code: a bare cast of RecipeActionJson to DraftAction leaves `actionId` undefined for every part-tied beat (the fixture's placePart entries carry no actionId — it is meant to be DERIVED, same as bundled furniture's meta.ts does via this same `action()` helper). Routing through `action()` derives "place_<partId>" etc. and validates any explicit actionId against that convention, which is exactly what validateFurniture's id-convention check (validateFurniture.ts:99-108) enforces downstream.
    const drafts: DraftAction[] = recipe.actions.map((a) =>
      action({
        actionId: a.actionId,
        type: a.type as DraftAction["type"],
        stage: a.stage,
        partId: a.partId,
        cluster: a.cluster,
        tool: a.tool as DraftAction["tool"],
        motion: a.motion as DraftAction["motion"],
        gate: a.gate,
        requires: expandRefs(a.requires ?? [], parts),
        requiresAny: a.requiresAny ? expandRefs(a.requiresAny, parts) : undefined,
      }),
    );
    const actions = composeFurnitureActions(drafts, rules, parts, hardware, clusters);
    const gates = recipe.gates ? Object.fromEntries(Object.entries(recipe.gates).map(([name, expr]) => [name, compileGate(expr, parts)])) : undefined;
    const instructions = buildInstructions(actions, parts, labels, recipe.beats ?? {}, clusters ?? {});
    const counts = metaCounts(Object.keys(rawParts) as PartId[], actions, clusters);
    const furniture: Furniture = {
      meta: { id: asFurnitureId(recipe.id), thumbnail: assets.thumbnail, ...counts },
      model: assets.model,
      parts, actions, gates, liaisons, clusters,
      thumbs: assets.thumbs, clusterThumbs: assets.clusterThumbs,
      instructions, labels,
      pushOpen: recipe.pushOpen as unknown as PushOpenSpec | undefined,
      components,
      xpPerStep: row.xpPerStep,
      xpBonusOnComplete: row.xpBonusOnComplete,
    };
    assertValidFurniture(furniture);
    return { ok: true, furniture };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
