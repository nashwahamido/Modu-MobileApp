// The shell's material names, grouped by what a surface item does to them. The names are the shell's authored contract — the same fifteen scripts/normalise_shell_materials.py enforces and scripts/verify-room-glb.mts checks — so this list must move only when the shell does.
//
// THREE GROUPS FROM TWO ITEM SLOTS. A floor item drives the slab and the plinth; a wall item drives the four walls AND the cornice. The cornice moved to the wall's side of the split on 2026-08-10: it sits at the wall/ceiling junction, so it is the wallpaper's joinery, not the floor's — the room's cornice should change when its wallpaper does, not when its rug does. (The plinth stays with the floor: it is the raised lip around the floor SLAB, so it is the floor's joinery in the way the cornice used to be assumed to be.) Each group that carries maps gets its OWN images at its OWN tiling — never the same image reused, because a cornice is separate geometry with its own UV mapping and the wall's map on it reads as an extruded strip of wallpaper.
export const SHELL_GROUPS: Record<"slab" | "cornice" | "walls", readonly string[]> = {
  slab: ["Floor"],
  // Four cornice runs plus four mitred corners. A corner shows while EITHER of its walls does, so it cannot share either one's material — which is why there are eight and not four.
  cornice: [
    "Trim_xmin", "Trim_xmax", "Trim_zmin", "Trim_zmax",
    "Trim_xmin_zmin", "Trim_xmin_zmax", "Trim_xmax_zmin", "Trim_xmax_zmax",
  ],
  walls: ["Wall_xmin", "Wall_xmax", "Wall_zmin", "Wall_zmax"],
};

// The plinth. Deliberately not a group: it takes a baseColorFactor tint and never a texture, because unlike the cornice it does NOT fade — nothing else owns its factor, so writing it cannot desync camera-facing wall culling's cached baseline RGB.
export const SHELL_PLINTH = "FloorEdge";

// The editing grid: the sixteenth material, and the only one Blender never authored. It is GENERATED into the shipped GLB by scripts/add-shell-grid.mts, straight out of the ROOM_SHELL floor constants, for the same class of reason set-shell-blend-modes.mjs exists — except that here it is not that Blender cannot express it, but that Blender must not be the one to say it. The drawn grid and the grid a piece is placed on have to be the same grid; deriving the geometry from the same constants the placement maths reads makes drift impossible rather than merely unlikely. Hand-authoring it would put a second copy of the cell pitch in a mesh, which is precisely the mistake roomShell.ts's header blames for the old alignment bugs.
export const SHELL_GRID = "Grid";
export const SHELL_GRID_NODE = "Shell_Grid";
// What the grid fades to while a floor or tabletop ghost is up. Matches the white the SVG overlay drew its lines at, so moving the lines onto the GPU changed where they are drawn and nothing about how they look. The material is AUTHORED at alpha 0 — unlike a wall, whose resting state is opaque, the grid's resting state is hidden, so a runtime that never writes it leaves the room clean rather than permanently gridded.
export const SHELL_GRID_ALPHA = 0.38;

// A glTF material's parameter names in gltfio's ubershader. occlusionMap is deliberately absent and must stay absent: that slot holds the room's baked AO on TEXCOORD_1, and a tiled AO map from a texture pack would fight it.
export const MAP_PARAMS = {
  base: "baseColorMap",
  normal: "normalMap",
  rough: "metallicRoughnessMap",
} as const;

// The catalogue items carrying the shell's OWN authored art, extracted straight out of the GLB by scripts/extract-shell-defaults.mjs.
//
// Named for the material rather than for the role: these are not "the defaults" — they are the herringbone parquet and cream plaster the room was built with, and the item that ships as a player's starting floor may change without either of these becoming a different texture. An id meaning "default" would be a lie the moment that happened, and it is baked into storage paths and every saved room layout, so it is not a rename anyone would want to attempt later.
// These change ONLY when the shell itself is re-textured — which is a GLB re-export, and already means editing BASE_IMAGES in the extractor and re-freezing the tiling constants. They do NOT change when the shipped default choice does.
export const SHELL_ORIGINAL = { floor: "herringbone-parquet", wall: "cream-plaster" } as const;

// One uv matrix per texture SLOT, not one per material — that is gltfio's shape, and it is why a surface item has to write three. Each exists only because scripts/declare-shell-map-slots.mjs declares a KHR_texture_transform on the matching textureInfo; setMat3fParameter THROWS on a parameter the material never declared, so this list and that script's list are one contract in two places. occlusionUvMatrix is deliberately absent for the same reason occlusionMap is: the baked AO lives on its own UV set and must never be retiled with the surface.
export const UV_MATRIX_PARAMS = ["baseColorUvMatrix", "normalUvMatrix", "metallicRoughnessUvMatrix"] as const;
