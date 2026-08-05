import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
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

import { ORBIT, clampOrbit, controlsFromOrbit, orbitFromControls, restOrbit, type OrbitAngles } from "../input/orbit";
import {
  cellsFor,
  floorPlacementBox,
  occupiedFootprint,
  resolveHost,
  rotatedFootprint,
  floorCellToRoom,
  surfaceKey,
  topCellToRoom,
  topPlacementBox,
  wallCellToRoom,
  windowCellNamesFor,
  type GridPlacement,
} from "../core/grid";
import {
  fitScale,
  getRoomItem,
  getRoomItemDef,
  roomItemDefs,
  useRoomCatalogStore,
  useRoomItem,
  type RoomItemModel,
} from "../core/placeableItems";
import { useVariantModelSource } from "./variantModel";
import { GridOverlay } from "./GridOverlay";
import { setCameraAzimuth, usePlacementStore } from "../core/placement";
import { aimToDirection } from "../core/lightAim";
import { useGameStore } from "../../game/core/store";
import { sunDirection, sunPreset, type CeilingLight } from "../core/timeOfDay";
import {
  dragTopTarget,
  dragWallTarget,
  pickBoxAt,
  pointsAtSurface,
  roomPointToScreen,
  screenPointToFloorCell,
  screenPointToWallCell,
  type PickBox,
  type TopTarget,
} from "../input/picking";
import { convexHull, type Pt } from "../core/gridOcclusion";
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
  type Vec3,
} from "../core/roomShell";
import {
  WALL_ALPHA_EPSILON,
  cornerAlpha,
  cornerWalls,
  shellWallOfMaterial,
  wallAlpha,
  wallAlphas,
} from "../core/wallCulling";

// Metro exposes bundled GLBs through the React Native numeric asset module.
// The shell is authored art, exported from print_room.blend and then put through three passes IN THIS ORDER — geometry untouched by all of them, so the measurements frozen in src/room/core/roomShell.ts stay valid:
//   1. scripts/compress-room-glb.mjs   resize and re-encode by texture role
//   2. scripts/set-shell-blend-modes.mjs   alphaMode BLEND on the cullable Wall_*/Trim_* groups, which Blender's exporter cannot express
//   3. scripts/set-ao-strength.mjs   how hard the baked occlusion bites; pure taste, re-runnable without Blender THE ORDER OF 1 AND 2 IS LOAD-BEARING, and it is the reverse of what reads naturally. gltf-transform refuses to re-encode a baseColorTexture to JPEG once its material is BLEND, because that would discard an alpha channel the material declares it needs — so blend-modes-first silently leaves the wall and trim colour maps as multi-MB PNGs. Observed: 5.44 MB of texture that way against 0.83 MB this way, from the same export. The AO map those passes carry comes from scripts/bake_room_ao.py; see the note above RoomPostProcess for why a baked map is the only way to darken a wall in this scene.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ROOM_MODEL = require("../../assets/models/room/virtualroom_empty.glb");

// The room's OWN ambient: an interior panorama baked in Blender from inside the enclosed shell (warm ceiling light, cream-wall and sage-floor bounce), packed to Filament's KTX by scripts/build_room_ibl.py. Replaces the stock outdoor sky probe, which lit every shadowed surface with open sky and was the single biggest reason the room never read as enclosed. Re-bake via the ibl_bake collection in print_room.blend if the shell's colours change. Intensity note: this bundle's sh[0] is ~3.5 versus the stock probe's ~0.79, so equivalent ambient energy needs roughly 30_000 * 0.79 / 3.5 — the value below starts there; tune against the key light, not in isolation.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ROOM_IBL = require("../../assets/ibl/room_ibl.ktx");


export type RoomSceneProps = {
  rotationY: number;
  zoom: number;
  onRotationChange: (rotationY: number) => void;
  onZoomChange: (zoom: number) => void;
  /** Whether the room's built-in ceiling light is lit. Resolved in RoomExperience via ceilingLightOn rather than here, because the switch's override is HUD state and the scene has no business owning it. */
  ceilingLight: boolean;
  /** Fired ONCE, when the room is worth looking at: the layout is settled, the shell has parsed, and every piece the scene is currently rendering has its GLB in hand. The screens keep their loading overlay up until this lands — see src/room/ui/RoomLoadingOverlay.tsx. Nothing waits on it, so a screen that doesn't pass it simply shows the room filling in. */
  onReady?: () => void;
};

type OrbitState = {
  raw: { radius: number; phi: number; theta: number };
  smoothed: { radius: number; phi: number; theta: number };
};

function RoomModel({ onReady, orbit }: { onReady: () => void; orbit: ReturnType<typeof useSharedValue<OrbitState>> }) {
  // addToScene OFF, and it must stay off: this component decides what of the shell is in the scene, cell by cell, and useModel's own add is not a call it can sequence against. That add is `scene.addAssetEntities(asset)` — every node of the asset, unconditionally — dispatched from a WORKLET effect, i.e. queued onto the worklet thread while the effects below run synchronously on the JS thread. Whichever thread got there second won, so a shell that finished loading while the layout already held a window had its knocked-out cells put straight back, leaving the window buried in solid wall and every band showing its panel AND its 84 cells at once. Nothing healed it either: the effects below diff against the refs here, which still claimed the work was done.
  const model = useModel(ROOM_MODEL, { addToScene: false });
  const { transformManager, scene, renderableManager } = useFilamentContext();
  // Through the viewing layer, so a visited room knocks out ITS windows' wall cells rather than the player's.
  const layout = usePlacementStore((s) => s.viewing?.layout ?? s.layout);
  const activeEdit = usePlacementStore((s) => s.activeEdit);
  // Entity handles for the wall cells currently knocked out, by GLB node name. A ref, not state: this is imperative scene bookkeeping — the entities must be RE-ADDED when a window moves away, and only this map still knows their handles once they are out of the scene.
  const knockedOut = useRef(new Map<string, Entity>());
  // Which walls are currently in CELL form. null until the first pass: the asset enters the scene carrying BOTH forms, so the opening move must force a swap on every wall — trusting an assumed start state left panel and cells both present, which z-fights and (worse) plugs the very window holes the cells exist to open.
  const banded = useRef<Set<ShellWallId> | null>(null);

  // The shell is STATIC: normalized to the unit cube once and never rotated. All view control is the camera's, which is what keeps picking a ray against fixed planes.
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

  // Window holes: the wall's band ships pre-diced into WCell_* nodes (see roomShell.ts), and a window "cuts" its opening by removing exactly the cells its footprint covers. Diffed against the previous frame so a moving ghost heals the wall behind it as it goes — removal and re-adding are both O(changed cells), and the ghost previews its hole even while blocked (windowCellNamesFor is total; cells outside the band simply have no node to remove).
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
      // A name with no entity means the shell GLB and roomShell.ts disagree — stale export. The hole simply doesn't open; placement stays valid, and the next export heals it.
      if (entity) {
        scene.removeEntity(entity);
        removed.set(name, entity);
      }
    }
  }, [model, layout, activeEdit, scene]);

  // A wall with no window in it does not need its band diced at all. The shell ships BOTH forms — 84 cells and one solid Shell_Band_* panel covering the same volume — and exactly one of them is in the scene at a time. That matters: cells are the single largest draw-call cost in the room (4 walls x 84), and a typical layout has windows on at most one or two walls, so this is the difference between ~336 renderables and ~90. Both forms are geometrically identical, so the swap is invisible; leaving both in would z-fight. Which wall (if any) an active edit is dressing — read by the culling loop, which runs off the worklet's angle rather than React state and so cannot subscribe to the store itself.
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

  // Camera-facing wall culling, half one: group the shell's material instances by which wall they belong to, ONCE, when the asset loads. Every renderable of a wall — its slab, its corner post, its cornice run, and its 84 diced band cells — carries that wall's material name, so this collapses ~180 entities into four buckets and leaves the per-frame work at four alpha writes. Each instance's authored RGB is captured here because the fade must write the full baseColorFactor. The walls stay in Filament's DEFAULT transparency mode on purpose, and changeAlpha is NOT used anywhere in this path because it force-switches the instance to twoPassesOneSide. Two-pass runs a depth pre-pass that ignores alpha entirely, so an invisible wall kept occluding whatever stood behind it — on device that clipped both far walls along the hidden walls' silhouette. Default-mode blending has no depth write; correctness comes from the shell shipping each wall as its OWN renderable (Shell_* nodes), which Filament depth-sorts back to front per frame. Keyed by MATERIAL NAME rather than by wall, because not every fading surface answers to a single wall: a cornice corner follows whichever of its two walls is more visible, and the ceiling never appears at all.
  const wallMaterials = useRef<Map<string, { instance: MaterialInstance; rgb: [number, number, number] }[]> | null>(null);
  useEffect(() => {
    if (model.state !== "loaded") return;
    const groups = new Map<string, { instance: MaterialInstance; rgb: [number, number, number] }[]>();
    for (const entity of model.asset.getRenderableEntities()) {
      const count = renderableManager.getPrimitiveCount(entity);
      for (let index = 0; index < count; index += 1) {
        const instance = renderableManager.getMaterialInstanceAt(entity, index);
        // The TS type says `name`, but the native HybridObject registers the getter under the literal property key `getName` — reading `.name` is silently undefined (regex.exec then coerces it to "undefined" and nothing ever matches, which shipped a sealed box on the first pass of this feature). The fallback keeps this working if the library ever fixes its declaration.
        const instanceName = (instance as unknown as { getName?: string }).getName ?? instance.name;
        const name = instanceName ?? "";
        const fades = name === CEILING_MATERIAL || shellWallOfMaterial(name) !== null || cornerAlpha(name, 0) !== null;
        if (!fades) continue;
        const [r, g, b] = instance.getFloat4Parameter("baseColorFactor");
        // Walls run twoPassesOneSide ALWAYS, at every alpha. Default BLEND writes no depth, so a wall composites as its own internal geometry stacked up — band-cell side faces and window jambs drawing over the skin as a grid of seams; faint at alpha 1, and glaring on a HALF-FADED wall, where the camera can legitimately park. The pre-pass gives each wall proper self-occlusion in every state. The pre-pass writing depth even at alpha 0 is safe for the WALLS, and the reason is narrow: the shell ships each wall as its own renderable (Shell_* nodes), Filament sorts blended renderables back to front by bounding-box centre, and a hidden wall is by definition the one between the eye and the room — so it draws AFTER everything behind it and nothing is left for its depth to clip. (With the old single-'room'-node shell, primitive order put hidden walls' pre-pass BEFORE the far walls, which clipped them along the hidden silhouette — that is what the per-wall split fixed.) Read that as a CONDITION, not a blanket licence: an alpha-0 surface may run this mode only while it is guaranteed to sort nearest. The ceiling never was — it sits at the room's centre and half the shell sorts after it — and it silently ate diced band cells for exactly that reason, which is why it now returns before this line. The ceiling is the exception to every rule here: it is written once, to zero, and never touched again. It exists ONLY to stop the sun falling into the room from above — which is what confines daylight to the window openings, instead of the walls printing their silhouettes across the floor. Invisible in colour, solid in the shadow map. It is deliberately returned BEFORE the transparency mode below, and must stay that way. A ceiling on twoPassesOneSide is a room-spanning depth occluder that draws nothing: it spans the whole floor plan, its underside sits exactly on the band top (ROOM_SHELL.walls[*].top), and it overhangs out past the wall inner faces — so a grazing ray to the top of a band crosses it. The wall SLABS survive that (one big renderable each, always sorting farther than the ceiling, so they draw first), but a DICED band is 84 small renderables sorted individually, and the ones at the camera-end of a wall sort NEARER than the ceiling: they draw after it, their own depth pre-pass loses to the depth it already wrote, and their colour pass — testing EQUAL — draws nothing at all. Whole cells vanish from an otherwise intact wall, worst at the four azimuths where the camera looks straight down an axis and two walls go edge-on. Shadows do not depend on this: the shadow pass ignores the colour pass's transparency mode.
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
  // Not from the rotationY prop — that only reaches React when a drag ENDS, so a state-driven fade would sit frozen through the whole gesture and then jump on release. The smoothed theta is already eased by the render callback, so the alpha it produces needs no easing of its own. A wall is faded, never removed from the scene: an entity out of the scene is out of the SHADOW pass too, and the room's interior would visibly re-light every time the camera crossed a boundary. At alpha 0 the wall is invisible and still occluding, which is the entire point.
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
      // The wall being edited is FORCED visible for as long as the edit lasts. Without this the player can orbit the very wall they are dressing out of view — the ghost keeps tracking their finger against a wall that is no longer drawn, which reads as the piece having vanished.
      const editedWall = editingWallRef.current;
      if (editedWall) byWall[editedWall] = 1;
      for (const [name, instances] of groups) {
        // A plain wall or cornice run follows its own wall; a corner block follows the MORE visible of the two walls it joins, which is what keeps three of the four standing at any azimuth.
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

// The multiplier gltfio's ubershader applies over the base colour texture: the ghost's valid/blocked feedback without touching materials or shaders.
const TINTS = {
  valid: [0.55, 1, 0.6, 1] as const,
  blocked: [1, 0.42, 0.42, 1] as const,
  none: [1, 1, 1, 1] as const,
};

// One placed furniture piece (or the active ghost). The furniture is authored in real-world meters; fitScale carries the shell's oversize factor, so no unit-cube guesswork is needed: measured size × scale, placed on its cell centre. A placeable lamp's light. Follows its piece around the room as the piece is dragged.
//
// This does NOT use <Light>, and that is the whole point. react-native-filament's useLightEntity memoizes the entity on its POSITION, so a moving light rebuilds the entity every time the ghost changes cell — and useEntityInScene only removes the old one from the scene, it never destroys it. Dragging a lamp across the room would strand one orphaned light entity per cell it crossed. So the entity is created ONCE here and moved with lightManager.setPosition, and destroyed on unmount.
//
// Units. falloffRadius IS a pure geometry conversion — the shell is normalized into a 2-unit cube, so a metre is SCENE_SCALE (~0.38) of a world unit — and metres are the honest way to express reach. INTENSITY is not. It was first derived from real lumens scaled by SCENE_SCALE^2 (small scene, shorter distances, inverse-square, so a physically-rated bulb should land ~7x too bright), which is sound reasoning that still failed to predict anything: Filament's final brightness also depends on CAMERA EXPOSURE, and react-native-filament does not bridge setExposure. With that term unknowable, no physically-derived number can be trusted here, so this is calibrated by eye against the night preset and stated plainly as such rather than dressed up in a formula. Renderer-side policy for ANY lighting item (category 'lit'), not just a table lamp. Type, brightness, colour, reach and cone all come from the item's own item_lights row (migration
// 012), so a designer retunes a lamp in the catalog rather than here. Only the BULB HEIGHT stays a renderer policy: it is a fallback for models that do not yet carry a 'Bulb' node, and once they do the node's transform supersedes it.
const LIT = {
  // How far above the piece's own top the bulb sits — a shade standing on a side table.
  bulbAboveTopMetres: 0.28,
};

// The room's OWN light: a fixture, not a bought lamp, so it takes no placement and reads its look from the HOUR instead of from item_lights. Geometry is global and look is per-hour, and the split is deliberate — where a ceiling fitting hangs and how far it throws are facts about the room, while how bright and how warm it burns is what the player is choosing when they pick an hour. Derived from ROOM_SHELL rather than written out, because nothing in this codebase carries its own copy of a shell measurement: re-export the shell and this follows it.
const CEILING_LIGHT = {
  x: (ROOM_SHELL.floor.minX + ROOM_SHELL.floor.maxX) / 2,
  z: (ROOM_SHELL.floor.minZ + ROOM_SHELL.floor.maxZ) / 2,
  // Just under the wall band's top, so the source sits inside the room rather than buried in the ceiling slab.
  y: ROOM_SHELL.walls["x-min"].top - 0.1,
  // UNLIKE the brightness, this one IS derived: the farthest thing to light is a floor corner, hypot(2.25, 2.2495) = 3.18 m out and 2.82 m down, so 4.25 m of slant distance. 6 leaves the corners inside the falloff instead of sitting on its edge.
  reachMetres: 6,
};

// Scene space, resolved once: ROOM_SHELL is a module constant and this light never moves, so there is nothing here for a hook to recompute.
const CEILING_LIGHT_AT = roomToScene({ x: CEILING_LIGHT.x, y: CEILING_LIGHT.y, z: CEILING_LIGHT.z });

// Simpler than RoomLit in the one way that matters: RoomLit has to chase a piece being dragged across the room, so it creates its entity once and moves it with setPosition. This one never moves, so it is a plain create-on-mount, destroy-on-unmount. The effect's dependency on `light` is what makes an hour change rebuild the entity — lumens and kelvin are CREATION parameters of createLightEntity, and TIME_OF_DAY is a module constant, so each preset's interiorLight is a stable object identity and a different hour is a genuinely different reference. No key prop needed; this is the same mechanism RoomLit relies on for item.light.
const RoomCeilingLight = memo(function RoomCeilingLight({ light }: { light: CeilingLight }) {
  const { lightManager, scene } = useFilamentContext();

  useEffect(() => {
    const entity = lightManager.createLightEntity(
      // Point, not spot: a spot from the ceiling centre lays a disc on the floor and leaves the corners black, and a ceiling fitting in a 4.5 x 4.5 m room is meant to fill it.
      "point",
      light.kelvin,
      light.lumens,
      undefined,
      [CEILING_LIGHT_AT.x, CEILING_LIGHT_AT.y, CEILING_LIGHT_AT.z],
      // No shadows, for the reason RoomLit already states: a point light needs a six-face cube shadow map, the most expensive thing available here.
      false,
      CEILING_LIGHT.reachMetres * SCENE_SCALE,
      // No cone: that argument is the spot's, and this is a point.
      undefined,
    );
    scene.addEntity(entity);
    return () => {
      scene.removeEntity(entity);
      lightManager.destroy(entity);
    };
  }, [lightManager, scene, light]);

  return null;
});

const RoomLit = memo(function RoomLit({ placement, item }: { placement: GridPlacement; item: RoomItemModel }) {
  const { lightManager, scene } = useFilamentContext();
  const entityRef = useRef<Entity | null>(null);

  const hostId = placement.surface.kind === "furniture" ? placement.surface.hostInstanceId : null;
  // Same live-host subscription LoadedItem uses: a lamp standing on a dragged table carries its light along, ghost included.
  const hostPlacement = usePlacementStore((s) =>
    hostId === null
      ? null
      : s.activeEdit && s.activeEdit.placement.instanceId === hostId
        ? s.activeEdit.placement
        : (s.layout.find((p) => p.instanceId === hostId) ?? null),
  );
  const hostDef = hostPlacement ? getRoomItemDef(hostPlacement.itemId) : undefined;
  const hostItem = hostPlacement ? getRoomItem(hostPlacement.itemId) : null;
  const topHeight = hostItem ? hostItem.size.y * fitScale(hostItem) : 0;

  // emitsLight is only true when the row carried a light, so this is present — but the catalog is a network fetch and a stale cache could disagree, and a lamp that renders nothing beats a crash. A stacked lamp whose host has vanished goes dark the same graceful way.
  const light = hostId !== null && (!hostPlacement || !hostDef || !hostItem) ? undefined : item.light;

  const footprint = rotatedFootprint(item.def.footprint, placement.rotSteps);
  const centre =
    hostId !== null && hostPlacement && hostDef
      ? topCellToRoom({ placement: hostPlacement, def: hostDef }, placement.cell, footprint, topHeight)
      : floorCellToRoom(placement.cell, footprint);
  // A stacked lamp's base sits on the host's top, not the floor — everything below measures bulb height from here.
  const baseY = ROOM_SHELL.floor.y + (hostId !== null ? topHeight : 0);

  // The bulb's offset is authored in the piece's OWN space at rotSteps 0, so it has to be turned with the piece — otherwise rotating a desk lamp leaves its light behind, pointing at where the lamp used to be. Only x/z turn; height is unaffected by a yaw. On a host, the piece's world yaw is host + child.
  const spin = (((hostPlacement?.rotSteps ?? 0) + placement.rotSteps) * Math.PI) / 2;
  const cos = Math.cos(spin);
  const sin = Math.sin(spin);
  const turn = (x: number, z: number) => ({ x: x * cos + z * sin, z: -x * sin + z * cos });

  // A bulb at exactly the base is meaningless for a lamp — it would sit inside the floor — so 0 is a reliable "not authored yet" sentinel, which is what a row cached before migration 014 reads as. Falling back to the old whole-catalog heuristic keeps such a row looking roughly right until the next catalog sync replaces it, instead of dropping its light through the floor for one session.
  const authored = light?.bulb;
  const offset = authored && authored.y !== 0 ? authored : { x: 0, y: item.size.y + LIT.bulbAboveTopMetres, z: 0 };
  const local = turn(offset.x, offset.z);
  const bulb = roomToScene({
    x: centre.x + local.x,
    y: baseY + offset.y,
    z: centre.z + local.z,
  });

  // Aim, turned by the same rotation. Absent for a point light, which ignores direction entirely.
  const aimed = light?.type === "spot" ? aimToDirection(light.aim?.pitchDeg ?? null, light.aim?.yawDeg ?? null) : null;
  const aimTurned = aimed ? turn(aimed.x, aimed.z) : null;
  const direction: [number, number, number] | undefined =
    aimed && aimTurned ? [aimTurned.x, aimed.y, aimTurned.z] : undefined;

  // Latest position, read at CREATION only — keeping it out of the create effect's deps is what stops the entity being rebuilt (and leaked) on every drag step.
  const spawnRef = useRef(bulb);
  spawnRef.current = bulb;
  const dirRef = useRef(direction);
  dirRef.current = direction;

  useEffect(() => {
    if (!light) return;
    const at = spawnRef.current;
    const entity = lightManager.createLightEntity(
      light.type,
      light.kelvin,
      light.lumens,
      dirRef.current,
      [at.x, at.y, at.z],
      // No shadows: a point light needs a six-face cube shadow map, the most expensive thing available here, and a lamp reads fine without it against the sun's shadows.
      false,
      light.reachMetres * SCENE_SCALE,
      // Filament wants the cone in RADIANS as [inner, outer]; item_lights stores the full outer angle in degrees. The inner cone is held at 70% of the outer so the edge falls off instead of cutting — a hard-edged disc on the floor reads as a projector, not a lamp.
      light.type === "spot" && light.coneDeg != null
        ? [((light.coneDeg * Math.PI) / 180 / 2) * 0.7, (light.coneDeg * Math.PI) / 180 / 2]
        : undefined,
    );
    scene.addEntity(entity);
    entityRef.current = entity;
    return () => {
      scene.removeEntity(entity);
      lightManager.destroy(entity);
      entityRef.current = null;
    };
  }, [lightManager, scene, light]);

  useEffect(() => {
    const entity = entityRef.current;
    if (entity) lightManager.setPosition(entity, [bulb.x, bulb.y, bulb.z] as never);
  }, [lightManager, bulb.x, bulb.y, bulb.z]);

  // Rotating a spot has to move its beam too. Guarded on `direction` being present: setDirection on a point light is meaningless, and Filament treats a zero-length direction as an error rather than ignoring it. Depends on the COMPONENTS, not on `direction` itself: that array is rebuilt every render, so depending on it would fire this on every frame of a drag rather than only when the aim moves.
  useEffect(() => {
    const entity = entityRef.current;
    if (entity && dirRef.current) lightManager.setDirection(entity, dirRef.current as never);
  }, [lightManager, aimTurned?.x, aimed?.y, aimTurned?.z]);

  return null;
});


const PlacedItem = memo(function PlacedItem({
  placement,
  tint,
  orbit,
  onLoaded,
}: {
  placement: GridPlacement;
  tint?: "valid" | "blocked";
  orbit: ReturnType<typeof useSharedValue<OrbitState>>;
  /** Reports this instance's GLB as parsed, so the scene can tell when the WHOLE room has landed. */
  onLoaded?: (instanceId: string) => void;
}) {
  // Reactive: a bought piece in a saved layout only gets its item row once the catalog syncs.
  const item = useRoomItem(placement.itemId);
  // The colour the player chose, when that variant GLB is in storage; the bundled single-colour model otherwise. Swapping colour swaps this source, and the transform effect below re-runs on the new model.
  const source = useVariantModelSource(placement.itemId, placement.variation);
  // Bound to the instance id here so LoadedItem's effect can depend on a callback that only changes when the piece does — an inline arrow would re-fire it on every render of a dragged ghost.
  const loaded = useCallback(() => onLoaded?.(placement.instanceId), [onLoaded, placement.instanceId]);
  // No model yet — a bought item whose storage URL is still being probed (it has no bundled fallback) — must render NOTHING: useModel has no empty source, and feeding it the room shell would briefly draw a second whole room as the "piece".
  if (!item || !source) return null;
  return <LoadedItem item={item} source={source} placement={placement} tint={tint} orbit={orbit} onLoaded={loaded} />;
});

const LoadedItem = memo(function LoadedItem({
  item,
  source,
  placement,
  tint,
  orbit,
  onLoaded,
}: {
  item: RoomItemModel;
  source: NonNullable<ReturnType<typeof useVariantModelSource>>;
  placement: GridPlacement;
  tint?: "valid" | "blocked";
  orbit: ReturnType<typeof useSharedValue<OrbitState>>;
  onLoaded?: () => void;
}) {
  const model = useModel(source);
  const { renderableManager, transformManager, scene } = useFilamentContext();

  // Parsed — not yet transformed or painted, both of which happen in effects below, in the same commit. Depends on model.STATE rather than on `model`, which useModel rebuilds as a fresh object literal every render.
  useEffect(() => {
    if (model.state === "loaded") onLoaded?.();
  }, [model.state, onLoaded]);

  const hostId = placement.surface.kind === "furniture" ? placement.surface.hostInstanceId : null;
  // The host's LIVE placement — the ghost while the host is being dragged, so children ride the drag; null for floor/wall items and for orphans whose host is gone. Subscribing here is what re-runs the transform effect on every host cell crossing.
  const hostPlacement = usePlacementStore((s) =>
    hostId === null
      ? null
      : s.activeEdit && s.activeEdit.placement.instanceId === hostId
        ? s.activeEdit.placement
        : (s.layout.find((p) => p.instanceId === hostId) ?? null),
  );

  useEffect(() => {
    if (model.state !== "loaded") return;

    // transformToUnitCube = scaling(2/maxExtent) · translation(-center) — a KNOWN matrix, used here as a normalization base so the algebra below is exact for any GLB origin.
    transformManager.transformToUnitCube(model.rootEntity, model.boundingBox);
    const unit = transformManager.getTransform(model.rootEntity);

    const scale = fitScale(item) * SCENE_SCALE;
    const unitScale = 2 / Math.max(item.size.x, item.size.y, item.size.z);

    if (placement.surface.kind === "wall") {
      // A wall item mounts by its ANCHOR — hole centre on the wall's inner face — while the unit-cube base re-centres the model on its AABB centre. Authored origins CANNOT express depth (the unit-cube erases them), so seating is a renderer POLICY over the measured size: the INTERIOR is what must look right — the window's front sits flush with the interior wall face and its body extends backward. A model deeper than the wall pokes out of the EXTERIOR by the excess, which is accepted by design (the diorama is viewed from inside; the outside face is scenery). A model shallower than the wall keeps its back on the outer skin instead (recessed front), which is how the approved shallow windows already sat. Width and height need no correction — the anchor scripts centre them exactly.
      const wall = placement.surface.wall;
      const anchor = roomToScene(wallCellToRoom(wall, placement.cell, occupiedFootprint(placement, item.def)));
      // Models are authored facing the room with the wall at −z behind them, which is exactly the z-max pose; the x-min wall looks along +x, a quarter turn the other way.
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

    if (placement.surface.kind === "furniture") {
      // A stacked piece composes: host cell-box centre + host yaw over its host-local offset + top height, then its OWN yaw on top of the host's — topCellToRoom owns the maths so the grid and this transform can never disagree. An orphan (host gone mid-sync) renders nowhere rather than at a stale spot.
      const hostDef = hostPlacement ? getRoomItemDef(hostPlacement.itemId) : undefined;
      const hostItem = hostPlacement ? getRoomItem(hostPlacement.itemId) : null;
      if (!hostPlacement || !hostDef || !hostItem) return;
      const host = { placement: hostPlacement, def: hostDef };
      const topHeight = hostItem.size.y * fitScale(hostItem);
      const childFootprint = rotatedFootprint(item.def.footprint, placement.rotSteps);
      const centre = roomToScene(topCellToRoom(host, placement.cell, childFootprint, topHeight));
      const transform = unit
        .scaling([scale / unitScale, scale / unitScale, scale / unitScale])
        .rotate(((hostPlacement.rotSteps + placement.rotSteps) * Math.PI) / 2, [0, 1, 0])
        .translate([centre.x, centre.y + (scale * item.size.y) / 2, centre.z]);
      transformManager.setTransform(model.rootEntity, transform);
      return;
    }

    const footprint = rotatedFootprint(item.def.footprint, placement.rotSteps);
    const centre = roomToScene(floorCellToRoom(placement.cell, footprint));

    // Rotation is about Y through the model's own centre (unit-cube re-centres it), so the model's authored centre offsets cancel out of the translation entirely: the piece lands on its cell centre with its base lifted by half its rendered height above the floor plane.
    const transform = unit
      .scaling([scale / unitScale, scale / unitScale, scale / unitScale])
      .rotate((placement.rotSteps * Math.PI) / 2, [0, 1, 0])
      .translate([centre.x, centre.y + (scale * item.size.y) / 2, centre.z]);
    transformManager.setTransform(model.rootEntity, transform);
  }, [hostPlacement, item, model, placement.cell, placement.rotSteps, placement.surface, transformManager]);

  // Wall items must not cast shadows: Filament's shadow maps treat alpha-blended glass as OPAQUE, so a window would shadow the room exactly like solid wall — the light shaft through the opening is the whole point of having one. The frame's thin shadow is an acceptable loss.
  useEffect(() => {
    if (model.state !== "loaded" || placement.surface.kind !== "wall") return;
    for (const entity of model.asset.getRenderableEntities()) {
      renderableManager.setCastShadow(entity, false);
    }
  }, [model, placement.surface.kind, renderableManager]);

  // Every material instance of the piece, with the colour and opacity it was AUTHORED with, captured once when the asset loads. The ghost's tint and the wall fade are both MULTIPLIERS over that pair, which is what lets the two compose: the tint used to write a flat [1, 1, 1, 1] and so erased whatever alpha each material shipped with, turning a window's 0.16 glass into a solid slab from the first time it was placed. Keyed on the ASSET, not on `model`, and that is load-bearing rather than tidiness: useModel rebuilds a fresh object literal every render (see the note in RoomModel), so `model` in the deps would re-run this on every render — re-reading baseColorFactor from values THIS component had already written and folding the tint and the fade into the baseline they are supposed to be measured from. A ghost dragged across ten cells would arrive ten multiplications darker. KEYED ON THE ASSET AND NOTHING ELSE. Anything else in these deps re-reads baseColorFactor off values the tint has already multiplied and calls the result "authored", and from then on the piece is stuck at that tint: every later paint() writes baseline × factor, so a baseline captured red stays red however the tint moves. That is exactly what surface.kind used to do here — a lamp dragged from the floor onto a table crosses "floor" → "furniture" mid-drag, re-ran this with the ghost's red or green multiplier live on the materials, and the piece kept the tint after it was committed. The transparency mode a wall item needs is set in its own effect below, which is what surface.kind was in these deps for.
  const materials = useRef<{ instance: MaterialInstance; rgba: [number, number, number, number] }[]>([]);
  const asset = model.state === "loaded" ? model.asset : null;
  useEffect(() => {
    if (!asset) return;
    const found: { instance: MaterialInstance; rgba: [number, number, number, number] }[] = [];
    for (const entity of asset.getRenderableEntities()) {
      const count = renderableManager.getPrimitiveCount(entity);
      for (let index = 0; index < count; index += 1) {
        const instance = renderableManager.getMaterialInstanceAt(entity, index);
        const [r, g, b, a] = instance.getFloat4Parameter("baseColorFactor");
        found.push({ instance, rgba: [r, g, b, a] });
      }
    }
    materials.current = found;
    // Cleared on teardown so the fade effect's own paint(1) below cannot reach through to instances whose asset has already been released — useModel's cleanup runs ahead of both of these. When the asset SURVIVES a re-render (the ghost-to-committed morph, which shares a key on purpose) this does not run, the list stays live, and the reset lands.
    return () => {
      materials.current = [];
    };
  }, [asset, renderableManager]);

  // A wall item's materials are BLEND now (converted and uploaded by Modu-Portal's scripts/fix-catalog-blend-modes.mjs), and blended geometry that writes no depth composites as its own internal parts stacked up — the sash through the casing in front of it, the back of the frame through its face. The pre-pass gives the piece back the self-occlusion its opaque version got for free. Safe at every alpha for the same reason the walls are, and for one more: a wall item is small, it sits in its wall's opening, and it protrudes INTO the room, so its bounding-box centre is always on the camera's side of the wall plane. It sorts after the cells around it and draws over them rather than under. Declared AFTER the capture above so it reads a populated list on the commit that loads the asset — React runs every destroy in a commit before every create, then the creates in declaration order.
  useEffect(() => {
    if (!asset || placement.surface.kind !== "wall") return;
    for (const { instance } of materials.current) instance.setTransparencyMode("twoPassesOneSide");
  }, [asset, placement.surface.kind]);

  // ALWAYS written, including the no-tint, no-fade reset: if the engine ever hands two components the same asset, the committed sibling heals any tint the ghost left behind.
  const paint = useCallback(
    (fade: number) => {
      const factor = TINTS[tint ?? "none"];
      for (const { instance, rgba } of materials.current) {
        instance.setFloat4Parameter("baseColorFactor", [rgba[0] * factor[0], rgba[1] * factor[1], rgba[2] * factor[2], rgba[3] * fade]);
      }
    },
    [tint],
  );

  // A wall item fades WITH its wall — without this, orbiting behind a wall left its windows hanging in mid-air. It used to POP instead, at the fade's midpoint, and that mismatch is what read as a glitch: the wall dissolving over some seven degrees of orbit while the window inside it left in a single frame. Driven by the wall's OWN alpha, not a curve of its own, so the two cannot drift apart at any angle; same rAF-off-smoothed-theta pattern as the wall fade, and no lighting cost, since wall items already never cast shadows (the effect above). Below WALL_ALPHA_EPSILON the piece leaves the scene rather than lingering at alpha 0. That earns its branch twice over: a transparent draw call for nothing, and the invisible-depth-occluder trap that any alpha-0 twoPassesOneSide surface is (see what it did to the ceiling, in RoomModel). The GHOST is exempt: it is the thing being placed, and dimming it mid-drag because the camera drifted behind its wall would read as the drag eating the piece. Its wall is pinned visible for the length of the edit anyway (editedWall, in the culling loop).
  useEffect(() => {
    if (!asset) return;
    if (placement.surface.kind !== "wall" || tint) {
      paint(1);
      return;
    }
    const wall = placement.surface.wall;
    let drawn = true;
    let written = 1;
    const setDrawn = (draw: boolean) => {
      drawn = draw;
      for (const entity of asset.getRenderableEntities()) {
        if (draw) scene.addEntity(entity);
        else scene.removeEntity(entity);
      }
    };
    let frame = requestAnimationFrame(function tick() {
      frame = requestAnimationFrame(tick);
      const alpha = wallAlpha(wall, orbit.value.smoothed.theta);
      const draw = alpha > WALL_ALPHA_EPSILON;
      if (draw !== drawn) setDrawn(draw);
      // Settled pieces cost nothing: at rest the alpha stops moving and this writes nothing at all.
      if (!draw || Math.abs(alpha - written) < WALL_ALPHA_EPSILON) return;
      written = alpha;
      paint(alpha);
    });
    return () => {
      cancelAnimationFrame(frame);
      // Hand the entities back, at full opacity, before the asset is released or the item re-renders: every other effect (and the engine's own teardown) assumes the asset's renderables are in the scene, and a re-adopted asset must not inherit the half-faded alpha of whatever camera angle the last one was torn down at.
      if (!drawn) setDrawn(true);
      paint(1);
    };
  }, [asset, orbit, paint, placement.surface, scene, tint]);

  return null;
});

// Post-processing, set once. Both option objects MUST come from the View's own create* factories — they are native HostObjects, and handing setBloomOptions a plain JS literal throws.
//
// SSAO REACHES THE FLOOR AND THE FURNITURE ONLY, NEVER THE WALLS. Measured on device 2026-08-03 — do not spend time retuning it for the walls. Filament builds its AO buffer out of the OPAQUE depth pass, and every Wall_*, Trim_* and the Ceiling is alphaMode BLEND because camera-facing culling needs an alpha to write (scripts/set-shell-blend-modes.mjs); only Floor and FloorEdge stay OPAQUE, so only they have depth to be occluded against. Cranking intensity to 4 darkened the floor heavily and moved the walls by nothing at all. The same root cause explains two things that look like separate bugs: a bed pushed against a wall drops no ambient contact shadow onto it, and the walls cast no occlusion down onto the floor.
//
// So the settings below are tuned for the only thing they can touch — contact darkening under furniture. The walls are handled instead by a BAKED occlusion map on a TEXCOORD_1 unwrap, shipped in the shell GLB since 2026-08-03 and produced by scripts/bake_room_ao.py. Occlusion is a MATERIAL feature rather than a screen-space one, so it reaches BLEND geometry exactly as well as opaque — the blocker above simply does not apply to it, and it costs one texture sample instead of a pass. What the baked map does NOT give you is the other half of the reference look: a bed pushed against a wall still drops no ambient contact shadow onto it, because furniture moves and a static bake cannot know where it is. That gap is the window portal lights' job, not this one's.
//
// Bloom lets a window blow out instead of clipping flat to white. Deliberately modest — the reference look is soft, not glowing.
function RoomPostProcess() {
  const { view } = useFilamentContext();
  useEffect(() => {
    const ao = view.createAmbientOcclusionOptions();
    ao.enabled = true;
    // RADIUS IS IN WORLD UNITS, and the shell is normalized to a 2-unit cube — so one unit is about 2.7 m and a believable ~0.35 m occlusion radius is 0.13, not the metre-scale number the Filament docs' examples use. Too large here and the whole room greys over. Held at contact scale on purpose. A room-scale radius (0.26, ~0.7 m) was tried in order to gradient the walls into their corners, and could not work for the reason in the note above; on the floor alone, all the extra width did was smear the furniture's contact shadows until they stopped reading as contact.
    ao.radius = 0.13;
    ao.intensity = 1.75;
    ao.power = 2.1;
    ao.quality = "MEDIUM";
    // bentNormals is deliberately absent. Making the ambient term directional instead of uniform is exactly the right idea for the flat walls, but it only applies to surfaces that receive SSAO in the first place — so it reaches the furniture and nothing else. Real cost, no visible change on device, and it does not touch the problem it looks like it should solve.
    view.setAmbientOcclusionOptions(ao);

    const bloom = view.createBloomOptions();
    bloom.enabled = true;
    bloom.strength = 0.32;
    // Threshold on: only genuinely bright pixels bleed, so daylight through a window glows while the cream walls stay crisp. Without it the entire image softens and reads as fog.
    bloom.threshold = true;
    bloom.levels = 6;
    bloom.quality = "MEDIUM";
    view.setBloomOptions(bloom);
  }, [view]);
  return null;
}

function OrbitCameraRig({ orbit }: { orbit: ReturnType<typeof useSharedValue<OrbitState>> }) {
  const { camera } = useFilamentContext();
  // Captured as a plain number: a worklet can copy values in, but cannot call the host-side helpers in ../orbit — which is why the smoothing and spherical math is inlined below and unit tests pin the same formulas on the exported versions.
  const tau = ORBIT.smoothingTau;

  RenderCallbackContext.useRenderCallback(
    ({ timeSinceLastFrame }) => {
      "worklet";
      const state = orbit.value;
      // Exponential chase toward the raw values — identical maths to the reference project's Navigation.update(), made frame-rate independent.
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

// How far the smoothed pose has to move before the grid overlay is re-projected. At the home radius one ten-thousandth of a radian moves a floor point by well under half a pixel, so this is invisible motion filtered out, not motion dropped.
const ORBIT_ANGLE_EPSILON = 1e-4;
const ORBIT_RADIUS_EPSILON = 1e-3;

// The camera pose the SVG overlay has to project through, mirrored out of the shared value into React. It must be the SMOOTHED pose, because that is the one OrbitCameraRig actually points the camera with — the raw values the HUD props carry are where the camera is HEADED. The two differ for the whole of the 0.2 s glide after any pose change, and for very much longer than that during a gesture: pan and pinch write raw on every move but only push (rotationY, zoom) back to React on release, and phi has no prop at all. A prop-driven overlay therefore sat frozen through an entire camera drag and snapped into place when the finger lifted, and never tracked a vertical drag at all. A rAF mirror is the cheap fix, and it costs nothing when it is not wanted: the loop runs only while `active` (the grid is drawn only while a ghost is up), it allocates nothing per frame, and it re-renders only when the pose has actually moved. The pose is read fresh during render rather than stored in state so the overlay is never a frame stale — the state here is a re-render trigger and nothing else.
function useSmoothedOrbit(orbit: ReturnType<typeof useSharedValue<OrbitState>>, active: boolean): OrbitAngles {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const shown = useRef<OrbitAngles>({ ...orbit.value.smoothed });

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const now = orbit.value.smoothed;
      const prev = shown.current;
      if (
        Math.abs(prev.theta - now.theta) < ORBIT_ANGLE_EPSILON &&
        Math.abs(prev.phi - now.phi) < ORBIT_ANGLE_EPSILON &&
        Math.abs(prev.radius - now.radius) < ORBIT_RADIUS_EPSILON
      ) {
        return;
      }
      rerender();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, orbit]);

  // Held by IDENTITY while the pose is unchanged, not just by value: the ghost re-renders this tree on every cell it crosses, and downstream memos (the projected silhouettes) must not be thrown away by a drag that never moved the camera.
  const { radius, phi, theta } = orbit.value.smoothed;
  const prev = shown.current;
  if (prev.radius !== radius || prev.phi !== phi || prev.theta !== theta) {
    shown.current = { radius, phi, theta };
  }
  return shown.current;
}

// A piece's screen-space silhouette: its eight box corners projected and hulled, for the grid overlay to dim its lines against (see ../core/gridOcclusion). Null when any corner falls behind the eye, which the overlay reads as "this piece hides nothing" — the conservative answer, and only reachable with the camera zoomed inside a piece.
function boxHull(box: PickBox, viewport: { width: number; height: number }, angles: OrbitAngles): Pt[] | null {
  const corners: Pt[] = [];
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        const p = roomPointToScreen({ x, y, z }, viewport, angles);
        if (!p) return null;
        corners.push(p);
      }
    }
  }
  const hull = convexHull(corners);
  return hull.length >= 3 ? hull : null;
}

export function RoomScene({ rotationY, zoom, onRotationChange, onZoomChange, ceilingLight, onReady }: RoomSceneProps) {
  const [loaded, setLoaded] = useState(false);
  // The player's chosen hour. Every preset is authored to enter through walls the resting camera can see — see src/room/core/timeOfDay.ts for why that constraint exists and what breaks without it.
  const hour = useGameStore((s) => s.roomTimeOfDay);
  const sun = sunPreset(hour);
  const handleReady = useCallback(() => setLoaded(true), []);
  const { width, height } = useWindowDimensions();
  const smallestSide = Math.min(width, height);
  const viewportRef = useRef({ width, height });
  viewportRef.current = { width, height };

  // The player's own room in the hub, a friend's while visiting. Placement is refused at the store while viewing, so activeEdit below is always null on that path and every ghost, overlay and drag branch is inert without needing its own check.
  const layout = usePlacementStore((s) => s.viewing?.layout ?? s.layout);
  // Is the layout above the REAL one, or the empty placeholder a hydrate that hasn't answered yet leaves behind? Nothing may be called ready against the placeholder: an empty room parses instantly and would fire onReady before the saved furniture had even been asked for. A visit is settled by construction — its layout arrives with startViewing, in one commit.
  const layoutSettled = usePlacementStore((s) => s.viewing !== null || s.hydrated);
  const activeEdit = usePlacementStore((s) => s.activeEdit);
  // Subscribed (not getState) so pieces whose item rows arrive with the catalog sync appear then.
  const roomItems = useRoomCatalogStore((s) => s.items);
  // The ghost re-renders through the store on every cell change; committed pieces only when the layout itself changes.
  const editing = activeEdit !== null;

  // Everything the scene is actually asked to draw right now, resolved once and used by the render tree AND by the ready gate below — the two must be looking at the same list or the gate would wait on a piece that is never mounted. An id the catalog doesn't know (yet) has no model or dimensions and is skipped; sanitizeLayout deliberately KEEPS such a row (the catalog syncs after first paint), so it is normal for this to be shorter than the layout, and the gate must not wait for the missing rows — a piece whose row lands late simply appears late, exactly as it did before.
  const placements = activeEdit ? [...layout, activeEdit.placement] : layout;
  const scenePlacements = placements.filter((placement) => roomItems[placement.itemId]);

  // Which pieces have their GLB in hand. A set in state rather than a counter: pieces mount, unmount and re-key freely (a ghost morphs into a committed piece), and only identity survives that.
  const [modelled, setModelled] = useState<ReadonlySet<string>>(() => new Set());
  const markModelled = useCallback((instanceId: string) => {
    setModelled((prev) => (prev.has(instanceId) ? prev : new Set(prev).add(instanceId)));
  }, []);

  // The whole-room ready signal, fired exactly once per mount. Once is the point: the screens use it to lift a loading screen, and a room that is being lived in — a piece dragged in, a colour swapped — is not loading any more, so later arrivals must not re-announce anything.
  const announced = useRef(false);
  useEffect(() => {
    if (announced.current || !loaded || !layoutSettled) return;
    if (!scenePlacements.every((placement) => modelled.has(placement.instanceId))) return;
    announced.current = true;
    onReady?.();
  }, [loaded, layoutSettled, scenePlacements, modelled, onReady]);

  const home = orbitFromControls(rotationY, zoom);
  const orbit = useSharedValue<OrbitState>({
    raw: { radius: home.radius, phi: ORBIT.phi.rest, theta: home.theta },
    // Start smoothed AT raw so the first frames glide from the real pose, not from zero.
    smoothed: { radius: home.radius, phi: ORBIT.phi.rest, theta: home.theta },
  });

  // HUD buttons (rotate ±30°, zoom ±10%) write through the same raw state the gestures use, so both inputs share one clamp and one glide.
  useEffect(() => {
    const next = orbitFromControls(rotationY, zoom);
    const clamped = clampOrbit({ ...next, phi: orbit.value.raw.phi });
    orbit.value.raw.radius = clamped.radius;
    orbit.value.raw.theta = clamped.theta;
  }, [orbit, rotationY, zoom]);

  // The floor grid is drawn for a floor or tabletop ghost only — a wall ghost gets its feedback from the tinted model and the live hole preview instead.
  const showGrid = activeEdit !== null && activeEdit.placement.surface.kind !== "wall";
  // Everything below this line exists only while that grid is up, and follows the camera frame by frame so the grid stays welded to the floor through a drag, a pinch and the glide after both.
  const gridAngles = useSmoothedOrbit(orbit, showGrid);

  // The volumes that hide grid lines, in room units: every committed piece standing on the floor or on a top. Recomputed only when the layout or the catalog changes — the per-frame work is the projection below, not this. The GHOST is deliberately absent. It is not in `layout` anyway, but the rule matters: the piece under the finger must never dim the cells it is being aimed at, which are the whole point of the overlay.
  const occluderBoxes = useMemo(() => {
    if (!showGrid) return [];
    const defs = roomItemDefs();
    const boxes: PickBox[] = [];
    for (const p of layout) {
      const item = getRoomItem(p.itemId);
      if (!item) continue;
      const height = item.size.y * fitScale(item);
      if (p.surface.kind === "floor") {
        boxes.push(floorPlacementBox(p, item.def, height));
      } else if (p.surface.kind === "furniture") {
        const host = resolveHost(p.surface.hostInstanceId, layout, defs);
        const hostItem = host ? getRoomItem(host.placement.itemId) : null;
        if (!host || !hostItem) continue;
        boxes.push(topPlacementBox(host, p, item.def, hostItem.size.y * fitScale(hostItem), height));
      }
    }
    return boxes;
    // roomItems is a dep for its identity alone: it is what changes when the catalog sync lands, and a piece whose item row arrives late must start occluding then.
  }, [layout, roomItems, showGrid]);

  // Projected fresh every frame the camera moves, because the silhouettes turn with it. A dozen boxes at eight corners each is a few hundred multiplies — cheaper by far than the SVG diff it feeds.
  const occluders = useMemo(
    () =>
      occluderBoxes
        .map((box) => boxHull(box, { width, height }, gridAngles))
        .filter((hull): hull is Pt[] => hull !== null),
    [occluderBoxes, gridAngles, width, height],
  );

  // While a ghost is active, the finger owns the ghost, not the camera: the same drag that orbited a moment ago now slides the piece cell to cell under the fingertip. A wall ghost slides on ITS wall and hops at the corner; which wall it lands on — and the hysteresis that keeps a finger near a corner from teleporting it — is dragWallTarget's job.
  const dragGhost = useCallback((px: number, py: number) => {
    const state = usePlacementStore.getState();
    const edit = state.activeEdit;
    if (!edit) return;
    const def = getRoomItemDef(edit.placement.itemId);
    if (!def) return;
    if (edit.placement.surface.kind !== "wall") {
      // Tops first: a floor-capable ghost climbs onto any flagged host under the finger, the current host winning ties (dragTopTarget's hysteresis); pointing at open floor hops it back off. Wall items never enter this branch, so only "anything that fits" ever reaches a top.
      const defs = roomItemDefs();
      const targets: TopTarget[] = state.layout
        .filter((p) => p.surface.kind === "floor" && p.instanceId !== edit.placement.instanceId)
        .flatMap((p) => {
          const hostDef = defs.get(p.itemId);
          const hostItem = getRoomItem(p.itemId);
          return hostDef?.hostsTop && hostItem
            ? [{ host: { placement: p, def: hostDef }, topHeight: hostItem.size.y * fitScale(hostItem) }]
            : [];
        });
      const currentHost = edit.placement.surface.kind === "furniture" ? edit.placement.surface.hostInstanceId : null;
      const top = dragTopTarget(currentHost, px, py, viewportRef.current, orbit.value.smoothed, targets);
      if (top) {
        const surface = { kind: "furniture", hostInstanceId: top.hostInstanceId, slot: "top" } as const;
        state.moveGhost(
          anchorForCentre(top.cell, occupiedFootprint({ ...edit.placement, surface }, def)),
          top.hostInstanceId === currentHost ? undefined : surface,
        );
        return;
      }
      const floorSurface = { kind: "floor" } as const;
      const pointed = screenPointToFloorCell(px, py, viewportRef.current, orbit.value.smoothed);
      if (pointed)
        state.moveGhost(
          anchorForCentre(pointed, occupiedFootprint({ ...edit.placement, surface: floorSurface }, def)),
          edit.placement.surface.kind === "floor" ? undefined : floorSurface,
        );
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

  // Does this touch belong to the piece being placed, or to the camera? A placement no longer takes the whole screen: the finger owns the ghost only while it is over the surface that ghost can actually stand on (the floor grid, or a wall the camera can see), and everywhere else — the other surface, the cornice, the backdrop around the diorama — it orbits exactly as it does with nothing being placed. Before this there was no way to look behind a wall mid-placement without cancelling the edit. Read from the store rather than from the subscribed activeEdit so this callback survives every cell the ghost crosses; the rule itself is pointsAtSurface, unit-tested in ../input/picking.
  const ghostOwnsPoint = useCallback((px: number, py: number) => {
    const state = usePlacementStore.getState();
    const edit = state.activeEdit;
    if (edit === null) return false;
    // A stacked ghost owns the finger while it points at ITS host's top — pointsAtSurface needs the resolved host, which only this layer (store + catalog in hand) can supply.
    let topTarget: TopTarget | undefined;
    if (edit.placement.surface.kind === "furniture") {
      const host = resolveHost(edit.placement.surface.hostInstanceId, state.layout, roomItemDefs());
      const hostItem = host ? getRoomItem(host.placement.itemId) : null;
      if (host && hostItem) topTarget = { host, topHeight: hostItem.size.y * fitScale(hostItem) };
    }
    return pointsAtSurface(px, py, viewportRef.current, orbit.value.smoothed, edit.placement.surface, topTarget);
  }, [orbit]);

  // Double-tap anywhere on the scene to put the camera back where the room opened — the way out of any view a player has orbited themselves into, and the reason the orbit needs no home button. The raw state is written first and the SAME pose is then reported back through the HUD's (rotationY, zoom) pair, so the prop-driven effect above re-applies what was just written instead of fighting it. That round trip is why restOrbit's theta must be the nearest rest azimuth rather than restTheta itself — see the note there. phi has no prop at all, so it is set here and nowhere else.
  const resetView = useCallback(() => {
    const rest = restOrbit(orbit.value.raw.theta);
    orbit.value.raw.radius = rest.radius;
    orbit.value.raw.phi = rest.phi;
    orbit.value.raw.theta = rest.theta;
    const controls = controlsFromOrbit(rest);
    onRotationChange(controls.rotationY);
    onZoomChange(controls.zoom);
    // The glide takes a moment to read as motion; the tap confirms itself immediately.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [onRotationChange, onZoomChange, orbit]);

  // Long-press a committed piece to pick it back up for editing: floor first (pieces stand in front of walls from this camera), then each wall's plane.
  const pickUpAt = useCallback((px: number, py: number) => {
    const state = usePlacementStore.getState();
    // `viewing` too: this searches state.layout — the player's OWN room — so in a friend's room it would raycast against pieces that are not on screen and buzz for a piece nobody can see. editPlacement refuses as well; this is the cheap pre-check that keeps the work and the haptic from happening at all.
    if (state.activeEdit || state.viewing) return;
    const hits = (surface: GridPlacement["surface"], pointed: { x: number; y: number } | null) =>
      pointed
        ? state.layout.find((p) => {
            const def = getRoomItemDef(p.itemId);
            if (!def || surfaceKey(p.surface) !== surfaceKey(surface)) return false;
            return cellsFor(p, def).some((c) => c.x === pointed.x && c.y === pointed.y);
          })
        : undefined;
    // Floor pieces are picked against their VOLUME, not the floor plane under the finger: a piece stands up out of its cells, so the ray through its visible body meets the floor one to three cells BEHIND it (one per 20 cm of height at the rest camera). Plane-picking therefore left only a ~52 x 26 px sliver at a piece's base live, which is what made the long-press feel broken — and, when the cell behind was occupied, picked up the wrong piece.
    const boxes: { placement: GridPlacement; box: PickBox }[] = [];
    for (const p of state.layout) {
      const item = getRoomItem(p.itemId);
      if (!item) continue;
      if (p.surface.kind === "floor") {
        boxes.push({
          placement: p,
          box: floorPlacementBox(p, item.def, item.size.y * fitScale(item)),
        });
      } else if (p.surface.kind === "furniture") {
        // A stacked piece's box stands on its host's top, which is what lets the ray hit IT before the larger host box beneath — no priority code, just geometry.
        const host = resolveHost(p.surface.hostInstanceId, state.layout, roomItemDefs());
        const hostItem = host ? getRoomItem(host.placement.itemId) : null;
        if (!host || !hostItem) continue;
        boxes.push({
          placement: p,
          box: topPlacementBox(host, p, item.def, hostItem.size.y * fitScale(hostItem), item.size.y * fitScale(item)),
        });
      }
    }
    const onFloor = pickBoxAt(px, py, viewportRef.current, orbit.value.smoothed, boxes.map((b) => b.box));
    // Then every wall the camera can actually see — picking a HIDDEN wall would hand the player a piece they cannot look at. Wall items hang flat ON the plane this tests, so they need no volume of their own; the floor pass runs first because pieces stand in front of walls.
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
    // The hold has no other confirmation — no ghost appears until the store updates a frame later — so the pick-up announces itself the way every other grab in the app does.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    state.editPlacement(under.instanceId);
  }, [orbit]);

  const dragStart = useSharedValue({ theta: 0, phi: 0 });
  // Who owns the drag in progress. Decided ONCE, at touch-down, and held until the finger lifts: re-asking per event would hand the camera a piece being dragged to the room's edge (where the finger legitimately strays off the floor) and lurch the view mid-placement. A plain ref rather than a shared value — every handler below is runOnJS.
  const dragOwner = useRef<"ghost" | "camera">("camera");
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .maxPointers(1)
        .onStart((e) => {
          dragOwner.current = ghostOwnsPoint(e.x, e.y) ? "ghost" : "camera";
          if (dragOwner.current === "ghost") {
            dragGhost(e.x, e.y);
            return;
          }
          dragStart.value = { theta: orbit.value.raw.theta, phi: orbit.value.raw.phi };
        })
        .onUpdate((e) => {
          if (dragOwner.current === "ghost") {
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
          if (dragOwner.current === "ghost") return;
          onRotationChange(controlsFromOrbit(orbit.value.raw).rotationY);
        })
        .runOnJS(true),
    [dragGhost, dragStart, ghostOwnsPoint, onRotationChange, orbit, smallestSide],
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
        // 420 ms was long enough that a hold felt like nothing was happening. 300 is iOS's own long-press default and still well clear of a tap.
        .minDuration(300)
        // How far the finger may drift and still count as a hold. The 10 dp default is barely more than the platform's pan slop, so an ordinary steady finger broke the hold; 14 dp is about 2 mm of tremor. It is also what a drag must now travel before the camera starts to orbit (see the Exclusive note below), so it stays modest.
        .maxDistance(14)
        // While a ghost is up, the finger belongs to the ghost: pickUpAt would no-op anyway, but leaving this enabled makes pan wait 300 ms for it to fail before the ghost can be dragged.
        .enabled(!editing)
        .onStart((e) => pickUpAt(e.x, e.y))
        .runOnJS(true),
    [editing, pickUpAt],
  );

  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        // The long press's drift budget, for the same reason: two quick taps from a real finger are never pixel-perfect, and the 10 dp default is barely more than the platform's touch slop.
        .maxDistance(14)
        .onStart(resetView)
        .runOnJS(true),
    [resetView],
  );

  // Exclusive, not Race: under Race nothing makes the pan WAIT, and pan activates at the platform's touch slop (~8 dp on Android, ~10 pt on iOS) — far less than a finger drifts while holding still for a third of a second. The pan would win, orbit the camera a couple of degrees, and cancel the long-press outright, which is most of why the pick-up "did not trigger". Exclusive makes the pan require the long-press to FAIL first, and the long-press fails the instant the finger passes maxDistance — so a real drag still starts within a couple of millimetres, but a stationary finger can no longer be stolen. A second finger hands the pair to pinch. The double tap RACES that pair rather than joining the Exclusive chain, and that asymmetry is deliberate: an Exclusive with the tap first would make every hold and every drag wait out the tap's 500 ms maxDelay before it could begin, to serve a gesture that only fires on the second tap. Under Race the three simply compete, and a pair of quick stationary taps is the only thing that satisfies the tap first — a hold reaches the long press at 300 ms, and any real movement activates the pan, either of which cancels the tap outright.
  const gesture = useMemo(
    () => Gesture.Race(doubleTap, Gesture.Exclusive(longPress, Gesture.Simultaneous(pan, pinch))),
    [doubleTap, longPress, pan, pinch],
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
            // KEYED ON THE INTENSITY, and it must stay that way. EnvironmentalLight ends its setup worklet with lightBuffer.release(), while useBuffer caches the buffer against the asset URI — which never changes for a constant require(). So the second time that worklet runs it hands setIndirectLight a pointer it already freed and throws "FilamentBuffer has already been manually released". Since the worklet's deps are its captured variables, ANY change to intensity re-runs it. Remounting on the value sidesteps it: a fresh component gets a fresh buffer, and releaseOnUnmount is false inside so nothing is freed twice. Cost is re-reading a bundled 2 MB KTX on a settings change, which is not a frame anyone is looking at.
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
          {/* The room's own ceiling light. Off at the three daylight hours by default and on after dark, with the player's switch overriding either way — see ceilingLightOn. */}
          {ceilingLight ? <RoomCeilingLight light={sun.interiorLight} /> : null}
          <RoomPostProcess />
          <RoomModel onReady={handleReady} orbit={orbit} />
          {/* Committed pieces AND the ghost render from ONE array, and that is load-bearing: React keys only match within the same children array, so a ghost in its own sibling slot is a different element even with the same key — pick-up and confirm then unmount/remount the piece, and useModel reloads the whole GLB each time (useBuffer has no cache). That remount is what made a dragged piece invisible until seconds after settling, and where the old "Pointer FilamentAssetWrapper has already been manually released" race lived. In one array the key genuinely matches, the component morphs, and the model loads exactly once per piece.
              An id the catalog doesn't know (yet) has no model or dimensions — skip it. */}
          {scenePlacements.map((placement) => (
            <PlacedItem
              key={placement.instanceId}
              placement={placement}
              tint={
                activeEdit && placement.instanceId === activeEdit.placement.instanceId
                  ? activeEdit.check.ok
                    ? "valid"
                    : "blocked"
                  : undefined
              }
              orbit={orbit}
              onLoaded={markModelled}
            />
          ))}
          {/* Lamps light the room from wherever their piece stands. The ghost is included, so the
              light previews while the piece is still under the finger. */}
          {placements
            // lightOn !== false rather than === true: undefined means ON, which is what lets every lamp saved before the switch existed keep burning.
            .filter((p) => getRoomItemDef(p.itemId)?.emitsLight && (p.surface.kind === "floor" || p.surface.kind === "furniture") && p.lightOn !== false)
            .map((p) => {
              const item = roomItems[p.itemId];
              return item ? <RoomLit key={`lit:${p.instanceId}`} placement={p} item={item} /> : null;
            })}
          <OrbitCameraRig orbit={orbit} />
        </FilamentView>
      </FilamentScene>
      {/* The overlay draws the FLOOR grid, and the ghost's highlight quads on whatever plane the ghost stands on — the floor, or a host's tabletop. A wall ghost gets its feedback from the tinted model and the live hole preview instead, so the overlay stays down for walls only. */}
      {showGrid && activeEdit ? (
        <GridOverlay
          viewport={{ width, height }}
          angles={gridAngles}
          occluders={occluders}
          ghostQuads={(() => {
            const p = activeEdit.placement;
            const def =
              getRoomItemDef(p.itemId) ?? { itemId: p.itemId, footprint: { w: 1, d: 1 }, allowedSurfaces: ["floor" as const] };
            const cells = cellsFor(p, def);
            const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]] as const;
            if (p.surface.kind === "furniture") {
              const host = resolveHost(p.surface.hostInstanceId, layout, roomItemDefs());
              const hostItem = host ? getRoomItem(host.placement.itemId) : null;
              if (!host || !hostItem) return [];
              const topHeight = hostItem.size.y * fitScale(hostItem);
              // topCellToRoom returns a CELL CENTRE for a 1x1 footprint, so corner (cell + d − 0.5) yields the corner point exactly, host yaw included.
              return cells.map((cell) => ({
                key: `${cell.x},${cell.y}`,
                corners: CORNERS.map(([dx, dy]) =>
                  topCellToRoom(host, { x: cell.x + dx - 0.5, y: cell.y + dy - 0.5 }, { w: 1, d: 1 }, topHeight),
                ) as [Vec3, Vec3, Vec3, Vec3],
              }));
            }
            const { cellSize, floor } = ROOM_SHELL;
            return cells.map((cell) => ({
              key: `${cell.x},${cell.y}`,
              corners: CORNERS.map(([dx, dy]) => ({
                x: floor.minX + (cell.x + dx) * cellSize,
                y: floor.y,
                z: floor.minZ + (cell.y + dy) * cellSize,
              })) as [Vec3, Vec3, Vec3, Vec3],
            }));
          })()}
          ghostValid={activeEdit.check.ok}
        />
      ) : null}
      <GestureDetector gesture={gesture}>
        <View
          accessibilityLabel={
            editing
              ? "Drag the furniture to move it, drag outside the room to orbit, pinch to zoom, double tap to reset the view"
              : "Drag to orbit the room, pinch to zoom, hold a piece to move it, double tap to reset the view"
          }
          style={styles.gestureLayer}
        />
      </GestureDetector>
      {/* No spinner of its own any more: waiting is the SCREEN's to show, through the app's one loading look (src/room/ui/RoomLoadingOverlay.tsx over src/game/ui/LoadingScreen.tsx), and it covers the room until onReady above says the whole thing has landed — not just the shell, which is all a spinner here could ever know about. */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "transparent" },
  filament: { flex: 1 },
  gestureLayer: { ...StyleSheet.absoluteFillObject, zIndex: 2 },
});
