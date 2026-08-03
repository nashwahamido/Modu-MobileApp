import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, ActivityIndicator, Text, View, useWindowDimensions } from "react-native";
import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  Camera,
  EnvironmentalLight,
  FilamentScene,
  FilamentView,
  Light,
  RenderCallbackContext,
  useFilamentContext,
  useModel,
  type Entity,
  type MaterialInstance,
} from "react-native-filament";
import { useSharedValue } from "react-native-worklets-core";

import { ORBIT, clampOrbit, controlsFromOrbit, orbitFromControls } from "../input/orbit";
import {
  cellsFor,
  floorPlacementBox,
  occupiedFootprint,
  rotatedFootprint,
  floorCellToRoom,
  surfaceKey,
  wallCellToRoom,
  windowCellNamesFor,
  type GridPlacement,
} from "../core/grid";
import {
  fitScale,
  getRoomItem,
  getRoomItemDef,
  useRoomCatalogStore,
  useRoomItem,
  type RoomItemModel,
} from "../core/placeableItems";
import { useVariantModelSource } from "./variantModel";
import { GridOverlay } from "./GridOverlay";
import { setCameraAzimuth, usePlacementStore } from "../core/placement";
import { useGameStore } from "../../game/core/store";
import { sunDirection, sunPreset } from "../core/timeOfDay";
import {
  dragWallTarget,
  pickBoxAt,
  screenPointToFloorCell,
  screenPointToWallCell,
  type PickBox,
} from "../input/picking";
import { anchorForCentre } from "../core/grid";
import {
  CEILING_MATERIAL,
  ROOM_SHELL,
  SCENE_SCALE,
  SHELL_WALL_IDS,
  isXWall,
  wallMountYaw,
  wallOutward,
  WALL_CELLS,
  WALL_THICKNESS,
  roomToScene,
  windowCellEntityName,
  type ShellWallId,
} from "../core/roomShell";
import {
  WALL_ALPHA_EPSILON,
  cornerAlpha,
  cornerWalls,
  shellWallOfMaterial,
  wallAlpha,
  wallAlphas,
  wallItemHidden,
} from "../core/wallCulling";

// Metro exposes bundled GLBs through the React Native numeric asset module.
// The shell is authored art, put through scripts/set-shell-blend-modes.mjs (alphaMode BLEND on the
// cullable Wall_*/Trim_* groups — Blender's exporter cannot express it) and, when it carries
// textures, scripts/compress-room-glb.mjs. Geometry untouched by both, so the measurements frozen
// in src/room/core/roomShell.ts stay valid.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ROOM_MODEL = require("../../assets/models/room/virtualroom_empty.glb");

// The room's OWN ambient: an interior panorama baked in Blender from inside the enclosed shell (warm ceiling light, cream-wall and sage-floor bounce), packed to Filament's KTX by scripts/build_room_ibl.py. Replaces the stock outdoor sky probe, which lit every shadowed surface with open sky and was the single biggest reason the room never read as enclosed. Re-bake via the ibl_bake collection in print_room.blend if the shell's colours change.
// Intensity note: this bundle's sh[0] is ~3.5 versus the stock probe's ~0.79, so equivalent ambient energy needs roughly 30_000 * 0.79 / 3.5 — the value below starts there; tune against the key light, not in isolation.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ROOM_IBL = require("../../assets/ibl/room_ibl.ktx");

export type RoomSceneProps = {
  rotationY: number;
  zoom: number;
  onRotationChange: (rotationY: number) => void;
  onZoomChange: (zoom: number) => void;
};

type OrbitState = {
  raw: { radius: number; phi: number; theta: number };
  smoothed: { radius: number; phi: number; theta: number };
};

function RoomModel({ onReady, orbit }: { onReady: () => void; orbit: ReturnType<typeof useSharedValue<OrbitState>> }) {
  // addToScene OFF, and it must stay off: this component decides what of the shell is in the scene, cell by cell, and useModel's own add is not a call it can sequence against. That add is `scene.addAssetEntities(asset)` — every node of the asset, unconditionally — dispatched from a WORKLET effect, i.e. queued onto the worklet thread while the effects below run synchronously on the JS thread. Whichever thread got there second won, so a shell that finished loading while the layout already held a window had its knocked-out cells put straight back, leaving the window buried in solid wall and every band showing its panel AND its 84 cells at once. Nothing healed it either: the effects below diff against the refs here, which still claimed the work was done.
  const model = useModel(ROOM_MODEL, { addToScene: false });
  const { transformManager, scene, renderableManager } = useFilamentContext();
  const layout = usePlacementStore((s) => s.layout);
  const activeEdit = usePlacementStore((s) => s.activeEdit);
  // Entity handles for the wall cells currently knocked out, by GLB node name. A ref, not state:
  // this is imperative scene bookkeeping — the entities must be RE-ADDED when a window moves away,
  // and only this map still knows their handles once they are out of the scene.
  const knockedOut = useRef(new Map<string, Entity>());
  // Which walls are currently in CELL form. null until the first pass: the asset enters the scene carrying BOTH forms, so the opening move must force a swap on every wall — trusting an assumed start state left panel and cells both present, which z-fights and (worse) plugs the very window holes the cells exist to open.
  const banded = useRef<Set<ShellWallId> | null>(null);

  // The shell is STATIC: normalized to the unit cube once and never rotated. All view control is
  // the camera's, which is what keeps picking a ray against fixed planes.
  useEffect(() => {
    if (model.state !== "loaded") return;
    transformManager.transformToUnitCube(model.rootEntity, model.boundingBox);
    onReady();
  }, [model, onReady, transformManager]);

  // The shell joins the scene HERE, on the JS thread, ahead of the two effects that carve it — one ordered sequence, no thread to lose a race to. Keyed on the ASSET and not on `model`, which useModel rebuilds as a fresh object literal every render; the refs reset with it, so a re-adopted asset (every entity of it back in the scene) is described by bookkeeping that is true of it rather than of the one before.
  const asset = model.state === "loaded" ? model.asset : null;
  useEffect(() => {
    if (!asset) return;
    scene.addAssetEntities(asset);
    knockedOut.current.clear();
    banded.current = null;
  }, [asset, scene]);

  // Window holes: the wall's band ships pre-diced into WCell_* nodes (see roomShell.ts), and a
  // window "cuts" its opening by removing exactly the cells its footprint covers. Diffed against
  // the previous frame so a moving ghost heals the wall behind it as it goes — removal and
  // re-adding are both O(changed cells), and the ghost previews its hole even while blocked
  // (windowCellNamesFor is total; cells outside the band simply have no node to remove).
  useEffect(() => {
    if (model.state !== "loaded") return;
    const wanted = new Set<string>();
    const placements = activeEdit ? [...layout, activeEdit.placement] : layout;
    for (const placement of placements) {
      const def = getRoomItemDef(placement.itemId);
      if (!def) continue;
      for (const name of windowCellNamesFor(placement, def)) wanted.add(name);
    }
    const removed = knockedOut.current;
    for (const [name, entity] of [...removed]) {
      if (!wanted.has(name)) {
        scene.addEntity(entity);
        removed.delete(name);
      }
    }
    for (const name of wanted) {
      if (removed.has(name)) continue;
      const entity = model.asset.getFirstEntityByName(name);
      // A name with no entity means the shell GLB and roomShell.ts disagree — stale export. The
      // hole simply doesn't open; placement stays valid, and the next export heals it.
      if (entity) {
        scene.removeEntity(entity);
        removed.set(name, entity);
      }
    }
  }, [model, layout, activeEdit, scene]);

  // A wall with no window in it does not need its band diced at all. The shell ships BOTH forms — 84
  // cells and one solid Shell_Band_* panel covering the same volume — and exactly one of them is in
  // the scene at a time. That matters: cells are the single largest draw-call cost in the room (4
  // walls x 84), and a typical layout has windows on at most one or two walls, so this is the
  // difference between ~336 renderables and ~90. Both forms are geometrically identical, so the swap
  // is invisible; leaving both in would z-fight.
  // Which wall (if any) an active edit is dressing — read by the culling loop, which runs off the
  // worklet's angle rather than React state and so cannot subscribe to the store itself.
  const editingWallRef = useRef<ShellWallId | null>(null);
  editingWallRef.current =
    activeEdit && activeEdit.placement.surface.kind === "wall" ? activeEdit.placement.surface.wall : null;

  useEffect(() => {
    if (model.state !== "loaded") return;
    const placements = activeEdit ? [...layout, activeEdit.placement] : layout;
    const diced = new Set<ShellWallId>();
    for (const placement of placements) {
      const def = getRoomItemDef(placement.itemId);
      if (!def?.opensWall || placement.surface.kind !== "wall") continue;
      diced.add(placement.surface.wall);
    }
    const swap = (wall: ShellWallId, toCells: boolean) => {
      const suffix = wall.replace("-", "");
      const panel = model.asset.getFirstEntityByName(`Shell_Band_${suffix}`);
      if (panel) (toCells ? scene.removeEntity : scene.addEntity).call(scene, panel);
      for (let col = 0; col < WALL_CELLS[wall].w; col += 1) {
        for (let row = 0; row < WALL_CELLS[wall].h; row += 1) {
          const name = windowCellEntityName(wall, col, row);
          if (!name) continue;
          // A cell knocked out for a window stays out — the hole wins over the band swap.
          if (toCells && knockedOut.current.has(name)) continue;
          const cell = model.asset.getFirstEntityByName(name);
          if (cell) (toCells ? scene.addEntity : scene.removeEntity).call(scene, cell);
        }
      }
    };
    const first = banded.current === null;
    const state = banded.current ?? new Set<ShellWallId>();
    for (const wall of SHELL_WALL_IDS) {
      const wantCells = diced.has(wall);
      if (!first && wantCells === state.has(wall)) continue;
      swap(wall, wantCells);
      if (wantCells) state.add(wall);
      else state.delete(wall);
    }
    banded.current = state;
  }, [model, layout, activeEdit, scene]);

  // Camera-facing wall culling, half one: group the shell's material instances by which wall they belong to, ONCE, when the asset loads. Every renderable of a wall — its slab, its corner post, its cornice run, and its 84 diced band cells — carries that wall's material name, so this collapses ~180 entities into four buckets and leaves the per-frame work at four alpha writes. Each instance's authored RGB is captured here because the fade must write the full baseColorFactor.
  // The walls stay in Filament's DEFAULT transparency mode on purpose, and changeAlpha is NOT used anywhere in this path because it force-switches the instance to twoPassesOneSide. Two-pass runs a depth pre-pass that ignores alpha entirely, so an invisible wall kept occluding whatever stood behind it — on device that clipped both far walls along the hidden walls' silhouette. Default-mode blending has no depth write; correctness comes from the shell shipping each wall as its OWN renderable (Shell_* nodes), which Filament depth-sorts back to front per frame.
  // Keyed by MATERIAL NAME rather than by wall, because not every fading surface answers to a single wall: a cornice corner follows whichever of its two walls is more visible, and the ceiling never appears at all.
  const wallMaterials = useRef<Map<string, { instance: MaterialInstance; rgb: [number, number, number] }[]> | null>(null);
  useEffect(() => {
    if (model.state !== "loaded") return;
    const groups = new Map<string, { instance: MaterialInstance; rgb: [number, number, number] }[]>();
    for (const entity of model.asset.getRenderableEntities()) {
      const count = renderableManager.getPrimitiveCount(entity);
      for (let index = 0; index < count; index += 1) {
        const instance = renderableManager.getMaterialInstanceAt(entity, index);
        // The TS type says `name`, but the native HybridObject registers the getter under the
        // literal property key `getName` — reading `.name` is silently undefined (regex.exec then
        // coerces it to "undefined" and nothing ever matches, which shipped a sealed box on the
        // first pass of this feature). The fallback keeps this working if the library ever fixes
        // its declaration.
        const instanceName = (instance as unknown as { getName?: string }).getName ?? instance.name;
        const name = instanceName ?? "";
        const fades = name === CEILING_MATERIAL || shellWallOfMaterial(name) !== null || cornerAlpha(name, 0) !== null;
        if (!fades) continue;
        const [r, g, b] = instance.getFloat4Parameter("baseColorFactor");
        // Walls run twoPassesOneSide ALWAYS, at every alpha. Default BLEND writes no depth, so a
        // wall composites as its own internal geometry stacked up — band-cell side faces and
        // window jambs drawing over the skin as a grid of seams; faint at alpha 1, and glaring on
        // a HALF-FADED wall, where the camera can legitimately park. The pre-pass gives each wall
        // proper self-occlusion in every state.
        // The pre-pass writing depth even at alpha 0 is safe for the WALLS, and the reason is narrow: the shell ships each wall as its own renderable (Shell_* nodes), Filament sorts blended renderables back to front by bounding-box centre, and a hidden wall is by definition the one between the eye and the room — so it draws AFTER everything behind it and nothing is left for its depth to clip. (With the old single-'room'-node shell, primitive order put hidden walls' pre-pass BEFORE the far walls, which clipped them along the hidden silhouette — that is what the per-wall split fixed.)
        // Read that as a CONDITION, not a blanket licence: an alpha-0 surface may run this mode only while it is guaranteed to sort nearest. The ceiling never was — it sits at the room's centre and half the shell sorts after it — and it silently ate diced band cells for exactly that reason, which is why it now returns before this line.
        // The ceiling is the exception to every rule here: it is written once, to zero, and never touched again. It exists ONLY to stop the sun falling into the room from above — which is what confines daylight to the window openings, instead of the walls printing their silhouettes across the floor. Invisible in colour, solid in the shadow map.
        // It is deliberately returned BEFORE the transparency mode below, and must stay that way. A ceiling on twoPassesOneSide is a room-spanning depth occluder that draws nothing: it spans the whole floor plan, its underside sits exactly on the band top (ROOM_SHELL.walls[*].top), and it overhangs out past the wall inner faces — so a grazing ray to the top of a band crosses it. The wall SLABS survive that (one big renderable each, always sorting farther than the ceiling, so they draw first), but a DICED band is 84 small renderables sorted individually, and the ones at the camera-end of a wall sort NEARER than the ceiling: they draw after it, their own depth pre-pass loses to the depth it already wrote, and their colour pass — testing EQUAL — draws nothing at all. Whole cells vanish from an otherwise intact wall, worst at the four azimuths where the camera looks straight down an axis and two walls go edge-on. Shadows do not depend on this: the shadow pass ignores the colour pass's transparency mode.
        if (name === CEILING_MATERIAL) {
          instance.setFloat4Parameter("baseColorFactor", [r, g, b, 0]);
          continue;
        }
        instance.setTransparencyMode("twoPassesOneSide");
        const bucket = groups.get(name);
        if (bucket) bucket.push({ instance, rgb: [r, g, b] });
        else groups.set(name, [{ instance, rgb: [r, g, b] }]);
      }
    }
    wallMaterials.current = groups;
    return () => {
      wallMaterials.current = null;
    };
  }, [model, renderableManager]);

  // Half two: drive the alphas from the SMOOTHED orbit every frame.
  // Not from the rotationY prop — that only reaches React when a drag ENDS, so a state-driven fade would sit frozen through the whole gesture and then jump on release. The smoothed theta is already eased by the render callback, so the alpha it produces needs no easing of its own.
  // A wall is faded, never removed from the scene: an entity out of the scene is out of the SHADOW pass too, and the room's interior would visibly re-light every time the camera crossed a boundary. At alpha 0 the wall is invisible and still occluding, which is the entire point.
  useEffect(() => {
    if (model.state !== "loaded") return;
    // The shell ships opaque, so this starts where the materials actually are.
    const written = new Map<string, number>();
    let frame = requestAnimationFrame(function tick() {
      frame = requestAnimationFrame(tick);
      const groups = wallMaterials.current;
      if (!groups) return;
      const theta = orbit.value.smoothed.theta;
      // Mirror the live angle so a placement started from any screen lands on a wall the camera can see.
      setCameraAzimuth(theta);
      const byWall = wallAlphas(theta);
      // The wall being edited is FORCED visible for as long as the edit lasts. Without this the
      // player can orbit the very wall they are dressing out of view — the ghost keeps tracking their
      // finger against a wall that is no longer drawn, which reads as the piece having vanished.
      const editedWall = editingWallRef.current;
      if (editedWall) byWall[editedWall] = 1;
      for (const [name, instances] of groups) {
        // A plain wall or cornice run follows its own wall; a corner block follows the MORE visible
        // of the two walls it joins, which is what keeps three of the four standing at any azimuth.
        const wall = shellWallOfMaterial(name);
        const corner = cornerWalls(name);
        const target = wall
          ? byWall[wall]
          : corner
            ? Math.max(byWall[corner[0]], byWall[corner[1]])
            : 1;
        // Settled surfaces cost nothing: at rest the targets stop moving and this writes nothing at all.
        if (Math.abs(target - (written.get(name) ?? 1)) < WALL_ALPHA_EPSILON) continue;
        written.set(name, target);
        for (const { instance, rgb } of instances) {
          instance.setFloat4Parameter("baseColorFactor", [rgb[0], rgb[1], rgb[2], target]);
        }
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [model, orbit]);

  return null;
}

// The multiplier gltfio's ubershader applies over the base colour texture: the ghost's
// valid/blocked feedback without touching materials or shaders.
const TINTS = {
  valid: [0.55, 1, 0.6, 1] as const,
  blocked: [1, 0.42, 0.42, 1] as const,
  none: [1, 1, 1, 1] as const,
};

// One placed furniture piece (or the active ghost). The furniture is authored in real-world
// meters; fitScale carries the shell's oversize factor, so no unit-cube guesswork is needed:
// measured size × scale, placed on its cell centre.
// A placeable lamp's light. Follows its piece around the room as the piece is dragged.
//
// This does NOT use <Light>, and that is the whole point. react-native-filament's useLightEntity
// memoizes the entity on its POSITION, so a moving light rebuilds the entity every time the ghost
// changes cell — and useEntityInScene only removes the old one from the scene, it never destroys it.
// Dragging a lamp across the room would strand one orphaned light entity per cell it crossed. So the
// entity is created ONCE here and moved with lightManager.setPosition, and destroyed on unmount.
//
// Units. falloffRadius IS a pure geometry conversion — the shell is normalized into a 2-unit cube, so
// a metre is SCENE_SCALE (~0.38) of a world unit — and metres are the honest way to express reach.
// INTENSITY is not. It was first derived from real lumens scaled by SCENE_SCALE^2 (small scene, shorter
// distances, inverse-square, so a physically-rated bulb should land ~7x too bright), which is sound
// reasoning that still failed to predict anything: Filament's final brightness also depends on CAMERA
// EXPOSURE, and react-native-filament does not bridge setExposure. With that term unknowable, no
// physically-derived number can be trusted here, so this is calibrated by eye against the night preset
// and stated plainly as such rather than dressed up in a formula.
const LAMP = {
  intensity: 25_000,
  kelvin: 2_700,
  reachMetres: 4.6,
  // How far above the piece's own top the bulb sits — a shade standing on a side table.
  bulbAboveTopMetres: 0.28,
};

const RoomLamp = memo(function RoomLamp({ placement, item }: { placement: GridPlacement; item: RoomItemModel }) {
  const { lightManager, scene } = useFilamentContext();
  const entityRef = useRef<Entity | null>(null);

  const footprint = rotatedFootprint(item.def.footprint, placement.rotSteps);
  const centre = floorCellToRoom(placement.cell, footprint);
  const bulb = roomToScene({
    x: centre.x,
    y: ROOM_SHELL.floor.y + item.size.y + LAMP.bulbAboveTopMetres,
    z: centre.z,
  });

  // Latest position, read at CREATION only — keeping it out of the create effect's deps is what stops
  // the entity being rebuilt (and leaked) on every drag step.
  const spawnRef = useRef(bulb);
  spawnRef.current = bulb;

  useEffect(() => {
    const at = spawnRef.current;
    const entity = lightManager.createLightEntity(
      "point",
      LAMP.kelvin,
      LAMP.intensity,
      undefined,
      [at.x, at.y, at.z],
      // No shadows: a point light needs a six-face cube shadow map, the most expensive thing
      // available here, and a lamp reads fine without it against the sun's shadows.
      false,
      LAMP.reachMetres * SCENE_SCALE,
      undefined,
    );
    scene.addEntity(entity);
    entityRef.current = entity;
    return () => {
      scene.removeEntity(entity);
      lightManager.destroy(entity);
      entityRef.current = null;
    };
  }, [lightManager, scene]);

  useEffect(() => {
    const entity = entityRef.current;
    if (entity) lightManager.setPosition(entity, [bulb.x, bulb.y, bulb.z] as never);
  }, [lightManager, bulb.x, bulb.y, bulb.z]);

  return null;
});

const PlacedItem = memo(function PlacedItem({
  placement,
  tint,
  orbit,
}: {
  placement: GridPlacement;
  tint?: "valid" | "blocked";
  orbit: ReturnType<typeof useSharedValue<OrbitState>>;
}) {
  // Reactive: a bought piece in a saved layout only gets its item row once the catalog syncs.
  const item = useRoomItem(placement.itemId);
  // The colour the player chose, when that variant GLB is in storage; the bundled single-colour model
  // otherwise. Swapping colour swaps this source, and the transform effect below re-runs on the new model.
  const source = useVariantModelSource(placement.itemId, placement.variation);
  // No model yet — a bought item whose storage URL is still being probed (it has no bundled
  // fallback) — must render NOTHING: useModel has no empty source, and feeding it the room shell
  // would briefly draw a second whole room as the "piece".
  if (!item || !source) return null;
  return <LoadedItem item={item} source={source} placement={placement} tint={tint} orbit={orbit} />;
});

const LoadedItem = memo(function LoadedItem({
  item,
  source,
  placement,
  tint,
  orbit,
}: {
  item: RoomItemModel;
  source: NonNullable<ReturnType<typeof useVariantModelSource>>;
  placement: GridPlacement;
  tint?: "valid" | "blocked";
  orbit: ReturnType<typeof useSharedValue<OrbitState>>;
}) {
  const model = useModel(source);
  const { renderableManager, transformManager, scene } = useFilamentContext();

  useEffect(() => {
    if (model.state !== "loaded") return;

    // transformToUnitCube = scaling(2/maxExtent) · translation(-center) — a KNOWN matrix, used
    // here as a normalization base so the algebra below is exact for any GLB origin.
    transformManager.transformToUnitCube(model.rootEntity, model.boundingBox);
    const unit = transformManager.getTransform(model.rootEntity);

    const scale = fitScale(item) * SCENE_SCALE;
    const unitScale = 2 / Math.max(item.size.x, item.size.y, item.size.z);

    if (placement.surface.kind === "wall") {
      // A wall item mounts by its ANCHOR — hole centre on the wall's inner face — while the
      // unit-cube base re-centres the model on its AABB centre. Authored origins CANNOT express
      // depth (the unit-cube erases them), so seating is a renderer POLICY over the measured size:
      // the INTERIOR is what must look right — the window's front sits flush with the interior
      // wall face and its body extends backward. A model deeper than the wall pokes out of the
      // EXTERIOR by the excess, which is accepted by design (the diorama is viewed from inside; the
      // outside face is scenery). A model shallower than the wall keeps its back on the outer skin
      // instead (recessed front), which is how the approved shallow windows already sat. Width and
      // height need no correction — the anchor scripts centre them exactly.
      const wall = placement.surface.wall;
      const anchor = roomToScene(wallCellToRoom(wall, placement.cell, occupiedFootprint(placement, item.def)));
      // Models are authored facing the room with the wall at −z behind them, which is exactly the
      // z-max pose; the x-min wall looks along +x, a quarter turn the other way.
      const yaw = wallMountYaw(wall);
      const protrusion = Math.min(item.size.z - WALL_THICKNESS, 0);
      const depthOffset = (item.size.z / 2 - protrusion) * scale;
      const transform = unit
        .scaling([scale / unitScale, scale / unitScale, scale / unitScale])
        .rotate(yaw, [0, 1, 0])
        // The seating offset runs along the wall's OUTWARD normal, so all four walls share one formula.
        .translate([
          anchor.x + (isXWall(wall) ? wallOutward(wall) * depthOffset : 0),
          anchor.y,
          anchor.z + (isXWall(wall) ? 0 : wallOutward(wall) * depthOffset),
        ]);
      transformManager.setTransform(model.rootEntity, transform);
      return;
    }

    const footprint = rotatedFootprint(item.def.footprint, placement.rotSteps);
    const centre = roomToScene(floorCellToRoom(placement.cell, footprint));

    // Rotation is about Y through the model's own centre (unit-cube re-centres it), so the model's
    // authored centre offsets cancel out of the translation entirely: the piece lands on its cell
    // centre with its base lifted by half its rendered height above the floor plane.
    const transform = unit
      .scaling([scale / unitScale, scale / unitScale, scale / unitScale])
      .rotate((placement.rotSteps * Math.PI) / 2, [0, 1, 0])
      .translate([centre.x, centre.y + (scale * item.size.y) / 2, centre.z]);
    transformManager.setTransform(model.rootEntity, transform);
  }, [item, model, placement.cell, placement.rotSteps, placement.surface, transformManager]);

  // Wall items must not cast shadows: Filament's shadow maps treat alpha-blended glass as OPAQUE,
  // so a window would shadow the room exactly like solid wall — the light shaft through the
  // opening is the whole point of having one. The frame's thin shadow is an acceptable loss.
  useEffect(() => {
    if (model.state !== "loaded" || placement.surface.kind !== "wall") return;
    for (const entity of model.asset.getRenderableEntities()) {
      renderableManager.setCastShadow(entity, false);
    }
  }, [model, placement.surface.kind, renderableManager]);

  // A wall item disappears WITH its wall — without this, orbiting behind a wall left its windows
  // hanging in mid-air. It pops (scene add/remove at the wall fade's midpoint, hysteresis in
  // wallItemHidden) rather than fading, because wallCulling's alpha trick needs BLEND materials
  // and furniture GLBs ship opaque frames. Same rAF-off-smoothed-theta pattern as the wall fade,
  // and no lighting cost: wall items already never cast shadows (the effect above).
  // The GHOST is exempt: it is the thing being placed, and hiding it mid-drag because the camera
  // faces the wall from behind would read as the drag eating the piece.
  useEffect(() => {
    if (model.state !== "loaded" || placement.surface.kind !== "wall" || tint) return;
    const wall = placement.surface.wall;
    let hidden = false;
    const setHidden = (hide: boolean) => {
      hidden = hide;
      for (const entity of model.asset.getRenderableEntities()) {
        if (hide) scene.removeEntity(entity);
        else scene.addEntity(entity);
      }
    };
    let frame = requestAnimationFrame(function tick() {
      frame = requestAnimationFrame(tick);
      const hide = wallItemHidden(hidden, wallAlpha(wall, orbit.value.smoothed.theta));
      if (hide !== hidden) setHidden(hide);
    });
    return () => {
      cancelAnimationFrame(frame);
      // Hand the entities back before the asset is released or the item re-renders: every other
      // effect (and the engine's own teardown) assumes the asset's renderables are in the scene.
      if (hidden) setHidden(false);
    };
  }, [model, orbit, placement.surface, scene, tint]);

  // ALWAYS written, including the no-tint reset: if the engine ever hands two components the same
  // asset, the committed sibling heals any tint the ghost left behind.
  useEffect(() => {
    if (model.state !== "loaded") return;
    const factor = TINTS[tint ?? "none"];
    for (const entity of model.asset.getRenderableEntities()) {
      const count = renderableManager.getPrimitiveCount(entity);
      for (let index = 0; index < count; index += 1) {
        renderableManager
          .getMaterialInstanceAt(entity, index)
          .setFloat4Parameter("baseColorFactor", [...factor]);
      }
    }
  }, [item, model, renderableManager, tint]);

  return null;
});

// Post-processing, set once. Both option objects MUST come from the View's own create* factories —
// they are native HostObjects, and handing setBloomOptions a plain JS literal throws.
//
// These two are what carry the diorama from "flat game render" toward the lit-room look: SSAO puts
// the contact darkening into corners and under furniture that no directional light can produce, and
// bloom lets a window blow out instead of clipping flat to white. Both are deliberately modest —
// the reference look is soft, not glowing.
function RoomPostProcess() {
  const { view } = useFilamentContext();
  useEffect(() => {
    const ao = view.createAmbientOcclusionOptions();
    ao.enabled = true;
    // RADIUS IS IN WORLD UNITS, and the shell is normalized to a 2-unit cube — so one unit is about
    // 2.7 m and a believable ~0.35 m occlusion radius is 0.13, not the metre-scale number the
    // Filament docs' examples use. Too large here and the whole room greys over.
    ao.radius = 0.13;
    ao.intensity = 1.75;
    ao.power = 2.1;
    ao.quality = "MEDIUM";
    view.setAmbientOcclusionOptions(ao);

    const bloom = view.createBloomOptions();
    bloom.enabled = true;
    bloom.strength = 0.32;
    // Threshold on: only genuinely bright pixels bleed, so daylight through a window glows while
    // the cream walls stay crisp. Without it the entire image softens and reads as fog.
    bloom.threshold = true;
    bloom.levels = 6;
    bloom.quality = "MEDIUM";
    view.setBloomOptions(bloom);
  }, [view]);
  return null;
}

function OrbitCameraRig({ orbit }: { orbit: ReturnType<typeof useSharedValue<OrbitState>> }) {
  const { camera } = useFilamentContext();
  // Captured as a plain number: a worklet can copy values in, but cannot call the host-side
  // helpers in ../orbit — which is why the smoothing and spherical math is inlined below and unit
  // tests pin the same formulas on the exported versions.
  const tau = ORBIT.smoothingTau;

  RenderCallbackContext.useRenderCallback(
    ({ timeSinceLastFrame }) => {
      "worklet";
      const state = orbit.value;
      // Exponential chase toward the raw values — identical maths to the reference project's
      // Navigation.update(), made frame-rate independent.
      const alpha = 1 - Math.exp(-Math.max(0, timeSinceLastFrame) / tau);
      state.smoothed.radius += (state.raw.radius - state.smoothed.radius) * alpha;
      state.smoothed.phi += (state.raw.phi - state.smoothed.phi) * alpha;
      state.smoothed.theta += (state.raw.theta - state.smoothed.theta) * alpha;

      const sinPhi = Math.sin(state.smoothed.phi);
      camera.lookAt(
        [
          state.smoothed.radius * sinPhi * Math.sin(state.smoothed.theta),
          state.smoothed.radius * Math.cos(state.smoothed.phi),
          state.smoothed.radius * sinPhi * Math.cos(state.smoothed.theta),
        ],
        [0, 0, 0],
        [0, 1, 0],
      );
    },
    [camera, orbit],
  );

  return null;
}

export function RoomScene({ rotationY, zoom, onRotationChange, onZoomChange }: RoomSceneProps) {
  const [loaded, setLoaded] = useState(false);
  // The player's chosen hour. Every preset is authored to enter through walls the resting camera can see — see src/room/core/timeOfDay.ts for why that constraint exists and what breaks without it.
  const sun = sunPreset(useGameStore((s) => s.roomTimeOfDay));
  const handleReady = useCallback(() => setLoaded(true), []);
  const { width, height } = useWindowDimensions();
  const smallestSide = Math.min(width, height);
  const viewportRef = useRef({ width, height });
  viewportRef.current = { width, height };

  const layout = usePlacementStore((s) => s.layout);
  const activeEdit = usePlacementStore((s) => s.activeEdit);
  // Subscribed (not getState) so pieces whose item rows arrive with the catalog sync appear then.
  const roomItems = useRoomCatalogStore((s) => s.items);
  // The ghost re-renders through the store on every cell change; committed pieces only when the
  // layout itself changes.
  const editing = activeEdit !== null;
  const editingRef = useRef(editing);
  editingRef.current = editing;

  const home = orbitFromControls(rotationY, zoom);
  const orbit = useSharedValue<OrbitState>({
    raw: { radius: home.radius, phi: ORBIT.phi.rest, theta: home.theta },
    // Start smoothed AT raw so the first frames glide from the real pose, not from zero.
    smoothed: { radius: home.radius, phi: ORBIT.phi.rest, theta: home.theta },
  });

  // HUD buttons (rotate ±30°, zoom ±10%) write through the same raw state the gestures use, so
  // both inputs share one clamp and one glide.
  useEffect(() => {
    const next = orbitFromControls(rotationY, zoom);
    const clamped = clampOrbit({ ...next, phi: orbit.value.raw.phi });
    orbit.value.raw.radius = clamped.radius;
    orbit.value.raw.theta = clamped.theta;
  }, [orbit, rotationY, zoom]);

  // While a ghost is active, the finger owns the ghost, not the camera: the same drag that orbited a moment ago now slides the piece cell to cell under the fingertip.
  // A wall ghost slides on ITS wall and hops at the corner; which wall it lands on — and the hysteresis that keeps a finger near a corner from teleporting it — is dragWallTarget's job.
  const dragGhost = useCallback((px: number, py: number) => {
    const state = usePlacementStore.getState();
    const edit = state.activeEdit;
    if (!edit) return;
    const def = getRoomItemDef(edit.placement.itemId);
    if (!def) return;
    if (edit.placement.surface.kind !== "wall") {
      const pointed = screenPointToFloorCell(px, py, viewportRef.current, orbit.value.smoothed);
      if (pointed) state.moveGhost(anchorForCentre(pointed, occupiedFootprint(edit.placement, def)));
      return;
    }
    const here = edit.placement.surface.wall;
    const target = dragWallTarget(here, px, py, viewportRef.current, orbit.value.smoothed);
    if (!target) return;
    const surface = { kind: "wall", wall: target.wall } as const;
    // The surface argument is what makes moveGhost a HANDOFF rather than a slide, so it is passed only on an actual hop.
    state.moveGhost(
      anchorForCentre(target.cell, occupiedFootprint({ ...edit.placement, surface }, def)),
      target.wall === here ? undefined : surface,
    );
  }, [orbit]);

  // Long-press a committed piece to pick it back up for editing: floor first (pieces stand in
  // front of walls from this camera), then each wall's plane.
  const pickUpAt = useCallback((px: number, py: number) => {
    const state = usePlacementStore.getState();
    if (state.activeEdit) return;
    const hits = (surface: GridPlacement["surface"], pointed: { x: number; y: number } | null) =>
      pointed
        ? state.layout.find((p) => {
            const def = getRoomItemDef(p.itemId);
            if (!def || surfaceKey(p.surface) !== surfaceKey(surface)) return false;
            return cellsFor(p, def).some((c) => c.x === pointed.x && c.y === pointed.y);
          })
        : undefined;
    // Floor pieces are picked against their VOLUME, not the floor plane under the finger: a piece
    // stands up out of its cells, so the ray through its visible body meets the floor one to three
    // cells BEHIND it (one per 20 cm of height at the rest camera). Plane-picking therefore left
    // only a ~52 x 26 px sliver at a piece's base live, which is what made the long-press feel
    // broken — and, when the cell behind was occupied, picked up the wrong piece.
    const boxes: { placement: GridPlacement; box: PickBox }[] = [];
    for (const p of state.layout) {
      if (p.surface.kind !== "floor") continue;
      const item = getRoomItem(p.itemId);
      if (!item) continue;
      boxes.push({
        placement: p,
        box: floorPlacementBox(p, item.def, item.size.y * fitScale(item)),
      });
    }
    const onFloor = pickBoxAt(px, py, viewportRef.current, orbit.value.smoothed, boxes.map((b) => b.box));
    // Then every wall the camera can actually see — picking a HIDDEN wall would hand the player a
    // piece they cannot look at. Wall items hang flat ON the plane this tests, so they need no
    // volume of their own; the floor pass runs first because pieces stand in front of walls.
    const visible = SHELL_WALL_IDS.filter((w) => wallAlpha(w, orbit.value.smoothed.theta) > 0.5);
    const under =
      (onFloor !== null ? boxes[onFloor].placement : undefined) ??
      visible.reduce<GridPlacement | undefined>(
        (found, wall) =>
          found ??
          hits({ kind: "wall", wall }, screenPointToWallCell(px, py, viewportRef.current, orbit.value.smoothed, wall)),
        undefined,
      );
    if (!under) return;
    // The hold has no other confirmation — no ghost appears until the store updates a frame later —
    // so the pick-up announces itself the way every other grab in the app does.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    state.editPlacement(under.instanceId);
  }, [orbit]);

  const dragStart = useSharedValue({ theta: 0, phi: 0 });
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .maxPointers(1)
        .onStart((e) => {
          if (editingRef.current) {
            dragGhost(e.x, e.y);
            return;
          }
          dragStart.value = { theta: orbit.value.raw.theta, phi: orbit.value.raw.phi };
        })
        .onUpdate((e) => {
          if (editingRef.current) {
            dragGhost(e.x, e.y);
            return;
          }
          const clamped = clampOrbit({
            radius: orbit.value.raw.radius,
            theta: dragStart.value.theta - (e.translationX * ORBIT.dragSensitivity) / smallestSide,
            phi: dragStart.value.phi - (e.translationY * ORBIT.dragSensitivity) / smallestSide,
          });
          orbit.value.raw.theta = clamped.theta;
          orbit.value.raw.phi = clamped.phi;
        })
        .onEnd(() => {
          if (editingRef.current) return;
          onRotationChange(controlsFromOrbit(orbit.value.raw).rotationY);
        })
        .runOnJS(true),
    [dragGhost, dragStart, onRotationChange, orbit, smallestSide],
  );

  const pinchStart = useSharedValue(ORBIT.homeRadius);
  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          pinchStart.value = orbit.value.raw.radius;
        })
        .onUpdate((e) => {
          // Pinch scales the radius multiplicatively — spreading fingers moves the camera in.
          orbit.value.raw.radius = clampOrbit({
            ...orbit.value.raw,
            radius: pinchStart.value / Math.max(0.01, e.scale),
          }).radius;
        })
        .onEnd(() => {
          onZoomChange(controlsFromOrbit(orbit.value.raw).zoom);
        })
        .runOnJS(true),
    [onZoomChange, orbit, pinchStart],
  );

  const longPress = useMemo(
    () =>
      Gesture.LongPress()
        // 420 ms was long enough that a hold felt like nothing was happening. 300 is iOS's own
        // long-press default and still well clear of a tap.
        .minDuration(300)
        // How far the finger may drift and still count as a hold. The 10 dp default is barely more
        // than the platform's pan slop, so an ordinary steady finger broke the hold; 14 dp is about
        // 2 mm of tremor. It is also what a drag must now travel before the camera starts to orbit
        // (see the Exclusive note below), so it stays modest.
        .maxDistance(14)
        // While a ghost is up, the finger belongs to the ghost: pickUpAt would no-op anyway, but
        // leaving this enabled makes pan wait 300 ms for it to fail before the ghost can be dragged.
        .enabled(!editing)
        .onStart((e) => pickUpAt(e.x, e.y))
        .runOnJS(true),
    [editing, pickUpAt],
  );

  // Exclusive, not Race: under Race nothing makes the pan WAIT, and pan activates at the platform's
  // touch slop (~8 dp on Android, ~10 pt on iOS) — far less than a finger drifts while holding
  // still for a third of a second. The pan would win, orbit the camera a couple of degrees, and
  // cancel the long-press outright, which is most of why the pick-up "did not trigger". Exclusive
  // makes the pan require the long-press to FAIL first, and the long-press fails the instant the
  // finger passes maxDistance — so a real drag still starts within a couple of millimetres, but a
  // stationary finger can no longer be stolen. A second finger hands the pair to pinch.
  const gesture = useMemo(
    () => Gesture.Exclusive(longPress, Gesture.Simultaneous(pan, pinch)),
    [longPress, pan, pinch],
  );

  return (
    <View style={styles.container}>
      <FilamentScene>
        <FilamentView style={styles.filament}>
          {/* No manipulator: OrbitCameraRig owns the eye every frame. The 68 mm lens is the
              reference project's 20-degree FOV — the telephoto diorama look. */}
          <Camera focalLengthInMillimeters={ORBIT.focalLengthMm} />
          {/* Ambient carries the room now. With a ceiling overhead the key light can only enter
              through a window, so everything not in a light shaft is lit by this probe alone —
              it is the bounce Filament cannot compute, and it must not be starved. */}
          <EnvironmentalLight
            // KEYED ON THE INTENSITY, and it must stay that way. EnvironmentalLight ends its setup
            // worklet with lightBuffer.release(), while useBuffer caches the buffer against the asset
            // URI — which never changes for a constant require(). So the second time that worklet runs
            // it hands setIndirectLight a pointer it already freed and throws "FilamentBuffer has
            // already been manually released". Since the worklet's deps are its captured variables,
            // ANY change to intensity re-runs it. Remounting on the value sidesteps it: a fresh
            // component gets a fresh buffer, and releaseOnUnmount is false inside so nothing is freed
            // twice. Cost is re-reading a bundled 2 MB KTX on a settings change, which is not a frame
            // anyone is looking at.
            key={sun.ambient}
            source={ROOM_IBL}
            intensity={sun.ambient}
          />
          {/* All three directionals CONTRIBUTE — verified by A/B capture, max channel delta 82 between one light and three. Filament's own LightConfig docstring claims only the dominant directional is used; that is true of the SHADOW-casting role only, not of shading. Do not "optimise" the fills away on the strength of that comment.
              The key is steep on purpose. It used to sit low ([-0.5, -1, -0.6]), which threw a shadow 2.9 * 0.78 = 2.3 m into a 4.5 m room — half the floor, and it read as a spotlit quadrant once the room was enclosed on all four sides. At this pitch the same wall lays down about 0.8 m: a slim band that reads as a wall meeting a floor. Shadow length on the floor is wallHeight * |horizontal| / |vertical|, so keep that ratio near 0.27 if the azimuth is ever re-aimed. */}
          {/* The key is LOW again — the opposite of what it needed before the ceiling existed. A low
              sun used to flood the floor and print wall silhouettes across it; now the ceiling stops
              it dead, so the only way in is a window, and a shallow angle is exactly what throws a
              long warm pool across the floor instead of a puddle at the sill. Aimed to enter through
              the x-max and z-max walls, which is where it travels from.
              A room with NO window therefore gets no direct light at all, by design — the probe above
              is what keeps it readable, and a lamp is what will make it inviting.
              THE SIGNS ARE AIMED, NOT PICKED. Light enters a wall only when it travels against that
              wall's outward normal, so entering x-min needs +x and entering z-max needs -z. At the
              resting camera (theta 3PI/4, eye at +x/-z) the VISIBLE walls are exactly x-min and z-max,
              so [+0.7, -1, -0.8] is the one quadrant that streams in through both walls the player can
              actually see. The mirror of it, [-0.7, ...], enters through the two HIDDEN walls instead:
              the pools still land, but they fall out of windows that have popped out of view with their
              wall, which reads as light from nowhere. Re-derive this if restTheta ever moves. */}
          <Light
            type="directional"
            colorKelvin={sun.kelvin}
            intensity={sun.intensity}
            direction={sunDirection(sun)}
            castShadows
          />
          {/* One cool counter-fill, kept weak. The reference look is high-contrast: warm bounce with
              genuinely dark corners. The old rig had 64k of flat fill here, which washed exactly that
              contrast out. */}
          <Light
            type="directional"
            colorKelvin={6_800}
            intensity={4_000}
            direction={[0.6, -0.45, 0.5]}
          />
          <RoomPostProcess />
          <RoomModel onReady={handleReady} orbit={orbit} />
          {/* An id the catalog doesn't know (yet) has no model or dimensions — skip it. */}
          {layout
            .filter((placement) => roomItems[placement.itemId])
            .map((placement) => (
              <PlacedItem key={placement.instanceId} placement={placement} orbit={orbit} />
            ))}
          {/* Lamps light the room from wherever their piece stands. The ghost is included, so the
              light previews while the piece is still under the finger. */}
          {(activeEdit ? [...layout, activeEdit.placement] : layout)
            .filter((p) => getRoomItemDef(p.itemId)?.emitsLight && p.surface.kind === "floor")
            .map((p) => {
              const item = roomItems[p.itemId];
              return item ? <RoomLamp key={`lamp:${p.instanceId}`} placement={p} item={item} /> : null;
            })}
          {/* SAME key as a committed piece, on purpose: confirm and pick-up then morph this
              component instead of unmount/remounting it, so the model is neither reloaded nor
              released mid-flight — the release/addAssetEntities race in useModel ("Pointer
              FilamentAssetWrapper has already been manually released") lived in that remount. */}
          {activeEdit ? (
            <PlacedItem
              key={activeEdit.placement.instanceId}
              placement={activeEdit.placement}
              tint={activeEdit.check.ok ? "valid" : "blocked"}
              orbit={orbit}
            />
          ) : null}
          <OrbitCameraRig orbit={orbit} />
        </FilamentView>
      </FilamentScene>
      {/* The overlay draws the FLOOR grid — a wall ghost gets its feedback from the tinted model
          and the live hole preview instead, so the floor overlay stays down. */}
      {activeEdit && activeEdit.placement.surface.kind === "floor" ? (
        <GridOverlay
          viewport={{ width, height }}
          angles={{ ...orbitFromControls(rotationY, zoom), phi: orbit.value.raw.phi }}
          ghostCell={activeEdit.placement.cell}
          ghostFootprint={rotatedFootprint(
            getRoomItemDef(activeEdit.placement.itemId)?.footprint ?? { w: 1, d: 1 },
            activeEdit.placement.rotSteps,
          )}
          ghostValid={activeEdit.check.ok}
        />
      ) : null}
      <GestureDetector gesture={gesture}>
        <View
          accessibilityLabel={
            editing
              ? "Drag to move the furniture, pinch to zoom"
              : "Drag to orbit the room, pinch to zoom, hold a piece to move it"
          }
          style={styles.gestureLayer}
        />
      </GestureDetector>
      {!loaded ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color="#666" />
          <Text style={styles.loadingText}>Loading room model...</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "transparent" },
  filament: { flex: 1 },
  gestureLayer: { ...StyleSheet.absoluteFillObject, zIndex: 2 },
  loading: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: { color: "#666", fontSize: 12 },
});
