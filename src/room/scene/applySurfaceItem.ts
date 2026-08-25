import type { MaterialInstance, RenderableManager, Texture } from "react-native-filament";

import type { SurfaceItemSpec } from "../../data/shop/items";
import type { NeutralMaps } from "./useSurfaceTextures";
import { MAP_PARAMS, SHELL_GROUPS, SHELL_PLINTH, UV_MATRIX_PARAMS } from "./shellMaterials";

// The textures one material group wears. base is required — an item with no base colour is not an item — and the other two are present only when the portal published them, which it skips for maps whose variance is below threshold.
export type MapSet = { base: Texture; normal?: Texture; rough?: Texture };

export type ApplySurfaceItemArgs = {
  slot: "floor" | "wall";
  // Every shell material instance, by material name. Built once at asset load; see shellMaterials.
  instances: Partial<Record<string, MaterialInstance>>;
  // Passed through to every setTextureParameter call, which needs it to park the texture in the renderable manager's retention store — Filament keeps only the texture HANDLE, so something outliving the asset has to hold the object. See the patch in Task 6.
  renderableManager: RenderableManager;
  maps: MapSet & { trim?: MapSet };
  spec: SurfaceItemSpec;
  // The stand-ins for slots this item does not fill — see useNeutralMaps for what they are and why an unwritten slot is a bug rather than a no-op. Null while they are still decoding, which reverts this to "leave the slot alone" for those first frames.
  neutral: NeutralMaps | null;
};

// glTF's KHR_texture_transform as gltfio's baseColorUvMatrix: column-major 3x3, scale on the diagonal and offset in the last column.
function uvMatrix(t: { scale: [number, number]; offset: [number, number] }): number[] {
  return [t.scale[0], 0, 0, 0, t.scale[1], 0, t.offset[0], t.offset[1], 1];
}

function paint(
  instances: ApplySurfaceItemArgs["instances"],
  renderableManager: RenderableManager,
  names: readonly string[],
  maps: MapSet,
  tiling: { scale: [number, number]; offset: [number, number] },
  neutral: NeutralMaps | null,
): void {
  // EVERY slot is written on every apply, exactly as the UV matrices below already are, and for the same reason: Filament keeps a texture handle on the material and offers no way to unset one, so a slot left alone keeps sampling the LAST item's map. An item that ships no normal is asking for a flat surface, not for its predecessor's weave — see useNeutralMaps. Falling back to `undefined` when the stand-ins have not decoded yet reverts a slot to the old leave-it-alone behaviour rather than clearing it, which is wrong in the same old way but never worse.
  const normal = maps.normal ?? neutral?.normal;
  const rough = maps.rough ?? neutral?.rough;
  for (const name of names) {
    const instance = instances[name];
    // A material the shell did not ship is skipped rather than thrown on: a partial repaint is a room that looks slightly wrong, an exception here is a room that does not render at all.
    if (!instance) continue;
    instance.setTextureParameter(renderableManager, MAP_PARAMS.base, maps.base);
    if (normal) instance.setTextureParameter(renderableManager, MAP_PARAMS.normal, normal);
    if (rough) instance.setTextureParameter(renderableManager, MAP_PARAMS.rough, rough);
    // ALL THREE matrices, because gltfio keeps one per texture SLOT rather than one per material. Writing only baseColorUvMatrix leaves the normal and roughness maps pinned at raw UV0, so at a tiling scale of 3 the grain repeats three times across the floor while its bump and gloss detail stretch once across the whole 6 m — a material that reads as broken rather than as mis-tiled. The matrices are always written even when the map is absent: the placeholder the shell ships occupies the slot either way, and leaving a stale matrix on it would misplace the NEXT item's map.
    const matrix = uvMatrix(tiling) as never;
    for (const parameter of UV_MATRIX_PARAMS) instance.setMat3fParameter(parameter, matrix);
  }
}

// Write one surface item onto the shell. The ONLY module that writes surface textures, and the only place the invariants live: Ceiling is never touched (it is pinned to alpha 0 and exists purely to block sunlight), occlusionMap is never written (it holds the baked AO on TEXCOORD_1), and the only baseColorFactor written is the plinth's.
//
// TEXTURE IDENTITY IS THE POINT. Each Texture here is created ONCE per (group, map) and set on every material in the group — one wall map on four materials, one cornice map on eight — so a full re-skin costs nine textures, not thirty-nine. Setting them writes the shell's EXISTING material instances rather than duplicating them, which is what keeps camera-facing wall culling's cached pointers valid.
export function applySurfaceItem({ slot, instances, renderableManager, maps, spec, neutral }: ApplySurfaceItemArgs): void {
  if (slot === "wall") {
    paint(instances, renderableManager, SHELL_GROUPS.walls, maps, spec.tiling, neutral);

    // The cornice sits at the wall/ceiling junction and follows the WALLPAPER, not the floor — it keeps its authored look unless the item shipped maps for it, which most wall items will not. The trim set gets the same slot-clearing treatment once it is being written at all: a cornice map with no normal of its own must not inherit the previous wallpaper's.
    if (maps.trim) paint(instances, renderableManager, SHELL_GROUPS.cornice, maps.trim, spec.trimTiling ?? spec.tiling, neutral);
    return;
  }

  paint(instances, renderableManager, SHELL_GROUPS.slab, maps, spec.tiling, neutral);

  // The plinth is a tint, never a texture. Alpha is pinned to 1 because FloorEdge is OPAQUE and never faded — writing anything else would put the floor's border into the transparent pass for no reason.
  if (spec.edgeColor) {
    instances[SHELL_PLINTH]?.setFloat4Parameter("baseColorFactor", [...spec.edgeColor, 1] as never);
  }
}
