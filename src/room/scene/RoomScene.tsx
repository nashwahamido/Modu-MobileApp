import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { Dimensions, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  Camera,
  EnvironmentalLight,
  FilamentScene,
  FilamentView,
  Light,
  RenderCallbackContext,
  optionsToJSI,
  useFilamentContext,
  useModel,
  type Entity,
  type Mat4,
  type MaterialInstance,
} from "react-native-filament";
import { useSharedValue } from "react-native-worklets-core";

import {
  ORBIT,
  clampOrbit,
  controlsFromOrbit,
  orbitFromControls,
  restOrbit,
  type OrbitAngles,
} from "../input/orbit";
import {
  cellsFor,
  occupiedFootprint,
  resolveHost,
  rotatedFootprint,
  floorCellToRoom,
  topCellToRoom,
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
import type { RoomItemLight } from "../../data/core/repos";
import { useVariantModelSource } from "./variantModel";
import { GridOverlay } from "./GridOverlay";
import { GRID_TUNING } from "./gridTuning";
import { applySurfaceItem } from "./applySurfaceItem";
import {
  SHELL_GRID,
  SHELL_GRID_NODE,
  SHELL_GRID_NODES,
  SHELL_ORIGINAL,
  shellGridWallNode,
} from "./shellMaterials";
import { useNeutralMaps, useSurfaceTextures } from "./useSurfaceTextures";
import { RoomAvatar } from "./RoomAvatar";
import { isScenePaused, setScenePaused } from "./scenePaused";
import { useCurrentUserId, useRepos } from "../../data";
import { useShopStore } from "../../data/shop/store";
import { setCameraAzimuth, usePlacementStore } from "../core/placement";
import { AIM_DOWN, aimToDirection, aimTuple } from "../core/lightAim";
import { CEILING_LIGHT_AT, CEILING_LIGHT_RIG, ceilingCone, fillLumens } from "../core/ceilingLight";
import { useGameStore } from "../../game/core/store";
import { WALL_FILL_DIRECTIONS, sunDirection, sunPreset, type CeilingLight } from "../core/timeOfDay";
import {
  dragTopTarget,
  dragWallTarget,
  pickBoxAt,
  placementPickBoxes,
  pointsAtSurface,
  screenPointToFloorCell,
  type TopTarget,
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
  wallDepthOffset,
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
  /** Fired once when the user finishes dragging the active placement ghost to a new position. */
  onPlacementReposition?: () => void;
  /** Whether the room is covered by a near-full-screen popup and so not worth drawing — see ./scenePaused for what this switches off and why it is not simply an unmount. The scene keeps every asset it holds; only the per-frame work stops. */
  paused?: boolean;
};

type OrbitState = {
  raw: { radius: number; phi: number; theta: number };
  smoothed: { radius: number; phi: number; theta: number };
};

// Which editing grids belong on screen. Null while nothing is being placed; "floor" covers a tabletop ghost too, since a stacked piece is aimed at a host standing on the floor.
type GridMode = "floor" | "wall" | null;

// The plates to draw, given the mode and how visible each wall currently is. A wall ghost lights up EVERY wall the camera can see rather than only the one being dressed — a piece crosses corners while it is dragged, and a lattice that appeared only after the hand-off left the player nothing to aim at on the way there. Hidden walls are left out: their grid would hang in mid-air in front of a room whose wall has been culled out of the way.
function gridNodesFor(mode: GridMode, byWall: Record<ShellWallId, number>): ReadonlySet<string> {
  if (mode === null) return EMPTY_GRIDS;
  if (mode === "floor") return FLOOR_GRID_ONLY;
  // Wall grids are suppressed wholesale while the floor's legibility is being tuned — see gridTuning.ts. Deliberately here rather than in the culling loop: this function is the single place that answers "which plates belong on screen", and the loop only ever writes the DIFFERENCE against what it last showed, so a plate withheld here is removed on the next frame like any other and nothing else has to know.
  if (!GRID_TUNING.wallGrid) return EMPTY_GRIDS;
  const wanted = new Set<string>();
  for (const wall of SHELL_WALL_IDS) {
    if (byWall[wall] > WALL_GRID_MIN_ALPHA) wanted.add(shellGridWallNode(wall));
  }
  return wanted;
}

const EMPTY_GRIDS: ReadonlySet<string> = new Set();
const FLOOR_GRID_ONLY: ReadonlySet<string> = new Set([SHELL_GRID_NODE]);
// A wall carries its grid while it is more present than not. The plates are opaque and cannot fade with their wall, so this is a threshold rather than a ramp — set at the midpoint, where the wall is half gone and about to stop being somewhere the player can aim anyway.
const WALL_GRID_MIN_ALPHA = 0.5;

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean =>
  a.size === b.size && [...a].every((v) => b.has(v));

function RoomModel({
  onReady,
  orbit,
  gridMode,
}: {
  onReady: () => void;
  orbit: ReturnType<typeof useSharedValue<OrbitState>>;
  /** Which family of editing grids to draw. Read through a ref by the per-frame culling loop, which is what decides which WALLS qualify. */
  gridMode: GridMode;
}) {
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
  // Read by the culling loop, which runs off the worklet's angle rather than React state and so cannot subscribe to anything itself.
  const gridModeRef = useRef<GridMode>(null);
  gridModeRef.current = gridMode;

  const editingWallRef = useRef<ShellWallId | null>(null);
  editingWallRef.current =
    activeEdit && activeEdit.placement.surface.kind === "wall"
      ? activeEdit.placement.surface.wall
      : null;

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
      if (panel)
        (toCells ? scene.removeEntity : scene.addEntity).call(scene, panel);
      for (let col = 0; col < WALL_CELLS[wall].w; col += 1) {
        for (let row = 0; row < WALL_CELLS[wall].h; row += 1) {
          const name = windowCellEntityName(wall, col, row);
          if (!name) continue;
          // A cell knocked out for a window stays out — the hole wins over the band swap.
          if (toCells && knockedOut.current.has(name)) continue;
          const cell = model.asset.getFirstEntityByName(name);
          if (cell)
            (toCells ? scene.addEntity : scene.removeEntity).call(scene, cell);
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
  // Every shell material instance by material NAME — the cache surface items write through. Built in the wall-culling walk below rather than its own pass, and cleared in the same teardown for the same reason that one is: useModel's cleanup runs ahead of both, and a write through a stale instance reaches an asset that has already been released.
  const shellMaterialsByName = useRef<Partial<Record<string, MaterialInstance>>>({});
  useEffect(() => {
    if (model.state !== "loaded") return;
    const groups = new Map<
      string,
      { instance: MaterialInstance; rgb: [number, number, number] }[]
    >();
    for (const entity of model.asset.getRenderableEntities()) {
      const count = renderableManager.getPrimitiveCount(entity);
      for (let index = 0; index < count; index += 1) {
        const instance = renderableManager.getMaterialInstanceAt(entity, index);
        // The TS type says `name`, but the native HybridObject registers the getter under the literal property key `getName` — reading `.name` is silently undefined (regex.exec then coerces it to "undefined" and nothing ever matches, which shipped a sealed box on the first pass of this feature). The fallback keeps this working if the library ever fixes its declaration.
        const instanceName =
          (instance as unknown as { getName?: string }).getName ??
          instance.name;
        const name = instanceName ?? "";
        // Recorded for EVERY material, not just the fading ones, and deliberately BEFORE the early return below: the Floor slab and the FloorEdge plinth never fade, so collecting after that line would silently miss exactly the two materials a floor item needs. A wall's 86 primitives all carry the same material name and therefore hand back the same instance, so this collapses ~355 entities into 15 entries and one texture write repaints a whole wall — the same property camera-facing culling relies on for its alpha write.
        if (name) shellMaterialsByName.current[name] = instance;
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
      shellMaterialsByName.current = {};
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
      // Under a popup this writes alphas nobody can see, onto a view whose choreographer is stopped anyway. Skipped INSIDE the tick rather than by cancelling the loop, so `written` and shownGrids keep describing what the materials and the scene actually hold — a loop torn down and rebuilt here would start from an empty diff and rewrite every wall on the first frame back.
      if (isScenePaused()) return;
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
        if (Math.abs(target - (written.get(name) ?? 1)) < WALL_ALPHA_EPSILON)
          continue;
        written.set(name, target);
        for (const { instance, rgb } of instances) {
          instance.setFloat4Parameter("baseColorFactor", [
            rgb[0],
            rgb[1],
            rgb[2],
            target,
          ]);
        }
      }
      // The editing grids ride along here rather than in an effect of their own, because WHICH of them belongs on screen is a question about wall visibility — and this loop is the one place that knows it, fresh, off the smoothed angle. A wall ghost shows the grid on EVERY wall the camera can see, not only the wall being dressed: a piece is dragged from one wall to another across a corner, and a lattice that appeared only after the hand-off gave the player nothing to aim at on the way there. Hidden walls are excluded for the obvious reason — their grid would hang in mid-air in front of a room whose wall has been culled away.
      const wanted = gridNodesFor(gridModeRef.current, byWall);
      const shown = shownGrids.current;
      const entities = gridEntities.current?.nodes;
      if (entities && !sameSet(wanted, shown)) {
        for (const [name, entity] of entities) {
          const want = wanted.has(name);
          if (want === shown.has(name)) continue;
          if (want) scene.addEntity(entity);
          else scene.removeEntity(entity);
        }
        shownGrids.current = wanted;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [model, orbit, scene]);

  // The editing grids. Ordinary shell geometry — five plates, one for the floor and one per wall, generated into the GLB by scripts/add-shell-grid.mts — so which one is showing is decided by putting that node's entity in the scene and taking the other four out.
  //
  // VISIBILITY IS ENTITY MEMBERSHIP, and it has to be: the plates are OPAQUE now (see add-shell-grid.mts for why they had to leave the transparent pass), so there is no alpha left to hide them with. All five share one material anyway, which could never have given five plates five alphas. Which plates are wanted is decided in the culling loop above, where wall visibility actually lives; this effect only takes the handles and settles the properties that never change.
  //
  // Drawn on the GPU rather than projected into the SVG overlay, which is what the floor grid used to do. That was not merely slower: an overlay has no depth buffer, so hiding the lines behind furniture meant clipping all 38 of them against the projected convex hull of every piece in the room, every frame, and it duplicated the camera — the grid projected through roomPointToScreen while the room was drawn by OrbitCameraRig, and the two disagree by the system-bar insets under edgeToEdge. Here Filament's own depth test does the occlusion exactly, for free, through the same camera the room is drawn with, and a piece hides the grid the way it hides everything else. On a WALL that property is worth even more than on the floor: a wall grid sits behind every piece already hanging there, and they occlude it without a line of code.
  //
  // NEVER lets a plate cast or receive a shadow. Not tidiness: these are unlit UI geometry standing 1 cm off the surfaces they describe, so a shadow-casting plate would print itself back onto that surface as hundreds of hard lines — and with the plates opaque, that shadow would be as solid as any wall's.
  //
  // Keyed on the ASSET, never on `model` — useModel rebuilds that as a fresh object literal on every render.
  const gridEntities = useRef<{ asset: unknown; nodes: Map<string, Entity> } | null>(null);
  const shownGrids = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (!asset) return;
    // A shell built before the grid pass existed simply has no such material. The room is completely usable without it — a floor ghost still shows its own cells in the overlay — so this stays silent in production and says so once in dev, where it means the GLB needs rebuilding.
    if (!shellMaterialsByName.current[SHELL_GRID]) {
      if (__DEV__)
        console.log(`[room] no "${SHELL_GRID}" material — rebuild the shell with npm run build:room`);
      return;
    }
    // The lines' colour, written at runtime rather than trusted from the GLB. It has to be a write to be tunable at all: the value is baked into the Grid material's baseColorFactor by the generator, and that generator (scripts/add-shell-grid.mts) is missing from the tree, so the shipped factor is frozen and editing a constant would change nothing. All five plates share the one material, so this is a single write for the whole grid. Alpha stays 1 — the plates are OPAQUE and their visibility is entity membership, never alpha; writing anything else here would not fade them, it would just be ignored.
    shellMaterialsByName.current[SHELL_GRID]?.setFloat4Parameter("baseColorFactor", [
      ...GRID_TUNING.lineRgb,
      1,
    ]);
    const nodes = new Map<string, Entity>();
    for (const name of SHELL_GRID_NODES) {
      const entity = asset.getFirstEntityByName(name);
      if (!entity) continue;
      nodes.set(name, entity);
      renderableManager.setCastShadow(entity, false);
      renderableManager.setReceiveShadow(entity, false);
      // addAssetEntities put every plate in the scene when the shell loaded. None of them belongs there until something is being placed, and the loop above only ever writes the DIFFERENCE against shownGrids — so the starting state has to be the empty one it believes in.
      scene.removeEntity(entity);
    }
    gridEntities.current = { asset, nodes };
    shownGrids.current = new Set();
    return () => {
      gridEntities.current = null;
      shownGrids.current = new Set();
    };
  }, [asset, renderableManager, scene]);

  // The room's chosen surface items, as SAVED IDS. Through the viewing layer, same as `layout` above, so a visited room paints ITS finishes rather than the player's own.
  const finishes = usePlacementStore((s) => s.viewing?.finishes ?? s.finishes);
  // The catalogue is loaded HERE and not only by the Shop and Inventory popups, because the room needs it whether or not either of them is ever opened. Without this a player's own saved wallpaper stays invisible until they happen to open the inventory and the room re-skins itself behind the sheet, and a VISITED room never renders its host's finishes at all — visit.tsx mounts neither popup, so nothing on that route would ever fetch the rows the ids resolve against. load() is documented as cheap to call repeatedly and serves a cached list after the first fetch, so this costs one request per session.
  const repos = useRepos();
  const me = useCurrentUserId();
  useEffect(() => {
    // Deliberately not awaited and deliberately not surfaced: the catalogue failing to load means finishes resolve to null and the shell renders as authored, which is the same graceful degradation every other failure in this feature falls back to. The popups own the retry affordance.
    void useShopStore.getState().load(repos, me);
  }, [repos, me]);

  // The catalogue rows those ids name. Validated HERE rather than in readRoomFinishes: that module is dependency-free by design, and the item set is remote and mutable, so an id that was valid when saved can stop being valid. An unknown id — or one whose row has landed under the WRONG category, which is the same class of mistake as a deleted one — resolves to null and drops THAT slot only, leaving the shell as authored. The catalogue is a network fetch, so this correctly resolves to null on the first frames and fills in when the sync lands.
  const catalogue = useShopStore((s) => s.items);
  const floorItem = useMemo(
    () => catalogue.find((i) => i.id === finishes.floor && i.category === "floor") ?? null,
    [catalogue, finishes.floor],
  );
  const wallItem = useMemo(
    () => catalogue.find((i) => i.id === finishes.wall && i.category === "wall") ?? null,
    [catalogue, finishes.wall],
  );

  // Each finish carries its own source: a testing workshop draft applied in a dev build reads from room/workshop/, and hardcoding "bought" here would 404 every one of its maps while the data layer served the row perfectly.
  const floorTextures = useSurfaceTextures(floorItem, floorItem?.source ?? "bought", renderableManager);
  const wallTextures = useSurfaceTextures(wallItem, wallItem?.source ?? "bought", renderableManager);

  // The cornice is the WALL's joinery — it sits at the wall/ceiling junction and follows the wallpaper, not the floor — but most wall items will not ship maps for it, and a slot nobody writes keeps whatever the LAST item left there, so applying wall A then wall B would leave B's walls under A's moulding. The room-as-designed item always carries a full cornice set, so it is the honest thing to fall back to: a wall item that says nothing about the cornice gets the room's original one rather than its predecessor's.
  // Resolved from the catalogue like any other item and loaded only when it is actually needed — useSurfaceTextures returns null for a null item, so a wall that ships its own trim costs nothing here.
  const shellWall = useMemo(() => catalogue.find((i) => i.id === SHELL_ORIGINAL.wall) ?? null, [catalogue]);
  const needsTrimFallback = wallItem != null && wallItem.id !== SHELL_ORIGINAL.wall && !wallItem.surface?.maps.includes("trim_texture");
  // The fallback is always the shipped shell wallpaper, which is a published item by construction — but read its source anyway rather than assert one, so this line cannot be the odd one out if the shell items ever move.
  const fallbackTrim = useSurfaceTextures(needsTrimFallback ? shellWall : null, shellWall?.source ?? "bought", renderableManager);

  // The stand-ins for the normal and roughness slots of any item that ships neither — a flat normal and a white metallic-roughness, decoded once for the life of the scene. Not a fallback in the sense fallbackTrim is: that one substitutes another ITEM's art, which is right for the cornice because the cornice keeps its authored look; these substitute NOTHING, which is what an unpublished map actually means. See useNeutralMaps.
  const neutralMaps = useNeutralMaps(renderableManager);

  // Keyed on the ASSET, so a re-render cannot re-apply through instances belonging to a released load. Surface items apply only AFTER the asset has loaded and the name cache above is populated — the cache is built in an effect on the same `asset`, declared ABOVE this one, and React runs a commit's creates in declaration order, so this one always sees it filled. The emptiness check is the belt to that braces: an empty cache means the walk has not run, and painting through nothing would silently do nothing while marking the slot applied.
  useEffect(() => {
    if (!asset) return;
    const instances = shellMaterialsByName.current;
    if (Object.keys(instances).length === 0) return;

    // spec is what tells applySurfaceItem how to tile; an item row that arrived without its portal-authored surface block is not applicable yet, and the slot stays as authored until it is.
    // floorItem/wallItem come from a useMemo over the store and floorTextures/wallTextures come from useSurfaceTextures's own setState, two hooks updating on different schedules, so within a single commit the memo can already read a NEW item while the texture hook's state still holds the OLD item's maps — itemId is therefore checked against the resolved item's id before anything is written, or a mismatched commit paints the old textures under the new item's tiling.
    if (floorItem?.surface && floorTextures && floorTextures.itemId === floorItem.id) {
      applySurfaceItem({ slot: "floor", instances, renderableManager, maps: floorTextures.maps, spec: floorItem.surface, neutral: neutralMaps });
    }
    if (wallItem?.surface && wallTextures && wallTextures.itemId === wallItem.id) {
      // The fallback cornice is folded in HERE rather than inside applySurfaceItem, so that module keeps knowing nothing about which item is the default one — it is handed a complete set and writes it.
      const trim = wallTextures.maps.trim ?? (fallbackTrim && fallbackTrim.itemId === SHELL_ORIGINAL.wall ? fallbackTrim.maps.trim : undefined);
      const trimTiling = wallTextures.maps.trim ? wallItem.surface.trimTiling : shellWall?.surface?.trimTiling;
      applySurfaceItem({
        slot: "wall",
        instances,
        renderableManager,
        maps: { ...wallTextures.maps, trim },
        spec: { ...wallItem.surface, trimTiling },
        neutral: neutralMaps,
      });
    }
    // neutralMaps is in here so the first commit after they decode REPAINTS. They land asynchronously and can easily arrive after a finish has already been applied, and without this the slots that item left unwritten would keep the shell's authored maps until the next finish change.
  }, [asset, floorItem, wallItem, floorTextures, wallTextures, fallbackTrim, shellWall, renderableManager, neutralMaps]);

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

// Scene space, resolved once: the position is a module constant in ../core/ceilingLight and this light never moves, so there is nothing here for a hook to recompute. Everything ELSE about the fitting — cone, reach, the key/fill split — lives in that module too, because it is geometry rather than rendering; only this conversion is the renderer's business.
const CEILING_LIGHT_SCENE = roomToScene(CEILING_LIGHT_AT);

// Simpler than RoomLit in the one way that matters: RoomLit has to chase a piece being dragged across the room, so it creates its entities once and moves them with setPosition. This one never moves, so it is a plain create-on-mount, destroy-on-unmount — for BOTH entities, and both must be destroyed or every hour change strands one. The effect's dependency on `light` is what makes an hour change rebuild them: lumens and kelvin are CREATION parameters of createLightEntity, and TIME_OF_DAY is a module constant, so each preset's interiorLight is a stable object identity and a different hour is a genuinely different reference. No key prop needed; this is the same mechanism RoomLit relies on for item.light.
const RoomCeilingLight = memo(function RoomCeilingLight({
  light,
}: {
  light: CeilingLight;
}) {
  const { lightManager, scene } = useFilamentContext();

  useEffect(() => {
    const at = CEILING_LIGHT_SCENE;
    // THE KEY. A spot aimed straight down, and the reason this is no longer one point light: it lays a defined pool on the floor and lets the upper walls and corners fall away, which is the only cue available that a bulb hangs overhead — the fitting itself can never be drawn, see ../core/ceilingLight. The old comment here argued a spot "leaves the corners black", which was true of a LONE spot and is what the fill below answers.
    const key = lightManager.createLightEntity(
      "spot",
      light.kelvin,
      light.lumens,
      aimTuple(AIM_DOWN),
      [at.x, at.y, at.z],
      // No shadows yet: switched on in its own step so it can be judged, and dropped, on its own.
      false,
      CEILING_LIGHT_RIG.keyReachMetres * SCENE_SCALE,
      ceilingCone(),
    );
    // THE FILL. A dim wide point at the same position. The corners sit OUTSIDE the key's cone by design, and this is what keeps them readable enough to place furniture into rather than black. It is not a second key: if the corners read too dark, raise CEILING_LIGHT_RIG.fillRatio before widening the cone, because widening spends the very gradient the key exists to create.
    const fill = lightManager.createLightEntity(
      "point",
      light.kelvin,
      fillLumens(light.lumens),
      undefined,
      [at.x, at.y, at.z],
      // No shadows, for the reason RoomLit already states: a point light needs a six-face cube shadow map, the most expensive thing available here.
      false,
      CEILING_LIGHT_RIG.fillReachMetres * SCENE_SCALE,
      // No cone: that argument is the spot's, and this is a point.
      undefined,
    );
    scene.addEntity(key);
    scene.addEntity(fill);
    return () => {
      scene.removeEntity(key);
      scene.removeEntity(fill);
      lightManager.destroy(key);
      lightManager.destroy(fill);
    };
  }, [lightManager, scene, light]);

  return null;
});

// The LIVE placement of the host a stacked piece stands on: the ghost while that host is being dragged, so children ride the drag; null for a floor or wall piece, and for an orphan whose host is gone.
//
// THROUGH THE VIEWING LAYER, exactly as the scene's own `layout` selector is (see both call sites of `s.viewing?.layout ?? s.layout`), and that is the whole reason this lookup is shared rather than written out at each of its three call sites. Searching `s.layout` — the player's OWN room — meant that in a friend's room every stacked piece looked for its host among the visitor's furniture instead of the host's: instance ids are `itemId#n` and deterministic (see nextInstanceId), so the lookup either MISSED, orphaning a piece that is standing on something in plain sight, or — worse — hit the visitor's own same-named piece and positioned the child on a table that is not in the room.
function useHostPlacement(placement: GridPlacement): GridPlacement | null {
  const hostId =
    placement.surface.kind === "furniture"
      ? placement.surface.hostInstanceId
      : null;
  return usePlacementStore((s) =>
    hostId === null
      ? null
      : s.activeEdit && s.activeEdit.placement.instanceId === hostId
        ? s.activeEdit.placement
        : ((s.viewing?.layout ?? s.layout).find((p) => p.instanceId === hostId) ?? null),
  );
}

// Whether a placement needs a host at all — a furniture surface does, everything else stands on the room itself.
const needsHost = (placement: GridPlacement): boolean => placement.surface.kind === "furniture";

const RoomLit = memo(function RoomLit({
  placement,
  item,
}: {
  placement: GridPlacement;
  item: RoomItemModel;
}) {
  const hostId =
    placement.surface.kind === "furniture"
      ? placement.surface.hostInstanceId
      : null;
  // Same live-host subscription LoadedItem uses: a lamp standing on a dragged table carries its light along, ghost included.
  const hostPlacement = useHostPlacement(placement);
  const hostDef = hostPlacement
    ? getRoomItemDef(hostPlacement.itemId)
    : undefined;
  const hostItem = hostPlacement ? getRoomItem(hostPlacement.itemId) : null;
  const topHeight = hostItem ? hostItem.size.y * fitScale(hostItem) : 0;

  // emitsLight is only true when the row carried a light, so this is present — but the catalog is a network fetch and a stale cache could disagree, and a lamp that renders nothing beats a crash. A stacked lamp whose host has vanished goes dark the same graceful way.
  const lights =
    hostId !== null && (!hostPlacement || !hostDef || !hostItem)
      ? undefined
      : item.lights;

  // occupiedFootprint, not a raw rotatedFootprint(item.def.footprint, ...): a stacked lamp's footprint is topFootprint, at TOP_CELL_SIZE, not the floor footprint scaled.
  const footprint = occupiedFootprint(placement, item.def);
  const centre =
    hostId !== null && hostPlacement && hostDef
      ? topCellToRoom(
          { placement: hostPlacement, def: hostDef },
          placement.cell,
          footprint,
          topHeight,
        )
      : floorCellToRoom(placement.cell, footprint);
  // A stacked lamp's base sits on the host's top, not the floor — everything below measures bulb height from here.
  const baseY = ROOM_SHELL.floor.y + (hostId !== null ? topHeight : 0);

  // The bulb's offset is authored in the piece's OWN space at rotSteps 0, so it has to be turned with the piece — otherwise rotating a desk lamp leaves its light behind, pointing at where the lamp used to be. Only x/z turn; height is unaffected by a yaw. On a host, the piece's world yaw is host + child.
  const spin =
    (((hostPlacement?.rotSteps ?? 0) + placement.rotSteps) * Math.PI) / 2;
  const cos = Math.cos(spin);
  const sin = Math.sin(spin);

  // ONE EMITTER PER LIGHT (migration 026). A lamp may carry a point and a spot at once — a soft glow
  // from the shade plus an aimed beam — each with its own brightness, colour, reach, bulb position and
  // aim, so each needs its own Filament entity with its own create/move/destroy lifecycle. Everything
  // ABOVE this line is per-PIECE (where it stands, what it stands on, which way it is turned) and is
  // computed once and shared; everything below is per-LIGHT and lives in RoomLitEmitter.
  //
  // Keyed by `type`, not by index: there is at most one point and at most one spot (item_lights is keyed
  // (item_id, type)), so the type IS the stable identity. A catalog sync that adds a spot to a lamp that
  // had only a point then leaves the point's entity untouched instead of tearing both down and
  // rebuilding them, which an index key would do the moment the array's order or length changed.
  if (!lights) return null;
  return (
    <>
      {lights.map((light) => (
        <RoomLitEmitter
          key={light.type}
          light={light}
          centreX={centre.x}
          centreZ={centre.z}
          baseY={baseY}
          cos={cos}
          sin={sin}
          itemHeight={item.size.y}
        />
      ))}
    </>
  );
});

// One light of one placed lamp: create the Filament entity once, move it as the piece moves, destroy it
// on unmount. Split out of RoomLit for 026 (see its comment above) — the arithmetic here is verbatim
// what RoomLit used to do inline for a lamp's single light, now parameterised by the piece's frame
// rather than reading it from the enclosing scope.
const RoomLitEmitter = memo(function RoomLitEmitter({
  light,
  centreX,
  centreZ,
  baseY,
  cos,
  sin,
  itemHeight,
}: {
  light: RoomItemLight;
  centreX: number;
  centreZ: number;
  baseY: number;
  /** The piece's world yaw, pre-resolved to its cosine and sine by RoomLit — passed as two numbers rather than as a turn() closure so this component's effects can depend on them without a new function identity firing on every render. */
  cos: number;
  sin: number;
  /** The piece's own height in authored metres, for the pre-014 bulb fallback below. */
  itemHeight: number;
}) {
  const { lightManager, scene } = useFilamentContext();
  const entityRef = useRef<Entity | null>(null);

  const turn = (x: number, z: number) => ({
    x: x * cos + z * sin,
    z: -x * sin + z * cos,
  });

  // A bulb at exactly the base is meaningless for a lamp — it would sit inside the floor — so 0 is a reliable "not authored yet" sentinel, which is what a row cached before migration 014 reads as. Falling back to the old whole-catalog heuristic keeps such a row looking roughly right until the next catalog sync replaces it, instead of dropping its light through the floor for one session.
  const authored = light.bulb;
  const offset =
    authored && authored.y !== 0
      ? authored
      : { x: 0, y: itemHeight + LIT.bulbAboveTopMetres, z: 0 };
  const local = turn(offset.x, offset.z);
  const bulb = roomToScene({
    x: centreX + local.x,
    y: baseY + offset.y,
    z: centreZ + local.z,
  });

  // Aim, turned by the same rotation. Absent for a point light, which ignores direction entirely.
  const aimed =
    light.type === "spot"
      ? aimToDirection(light.aim?.pitchDeg ?? null, light.aim?.yawDeg ?? null)
      : null;
  const aimTurned = aimed ? turn(aimed.x, aimed.z) : null;
  const direction: [number, number, number] | undefined =
    aimed && aimTurned ? [aimTurned.x, aimed.y, aimTurned.z] : undefined;

  // Latest position, read at CREATION only — keeping it out of the create effect's deps is what stops the entity being rebuilt (and leaked) on every drag step.
  const spawnRef = useRef(bulb);
  spawnRef.current = bulb;
  const dirRef = useRef(direction);
  dirRef.current = direction;

  useEffect(() => {
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
        ? [
            ((light.coneDeg * Math.PI) / 180 / 2) * 0.7,
            (light.coneDeg * Math.PI) / 180 / 2,
          ]
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
    if (entity)
      lightManager.setPosition(entity, [bulb.x, bulb.y, bulb.z] as never);
  }, [lightManager, bulb.x, bulb.y, bulb.z]);

  // Rotating a spot has to move its beam too. Guarded on `direction` being present: setDirection on a point light is meaningless, and Filament treats a zero-length direction as an error rather than ignoring it. Depends on the COMPONENTS, not on `direction` itself: that array is rebuilt every render, so depending on it would fire this on every frame of a drag rather than only when the aim moves.
  useEffect(() => {
    const entity = entityRef.current;
    if (entity && dirRef.current)
      lightManager.setDirection(entity, dirRef.current as never);
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
  const loaded = useCallback(
    () => onLoaded?.(placement.instanceId),
    [onLoaded, placement.instanceId],
  );
  // An orphan — a stacked piece whose host is not in the room being drawn — renders NOTHING, and it has to be refused here, before a model is ever loaded, rather than by the transform effect bailing further down. The effect cannot decline a piece it has already normalized: transformToUnitCube WRITES a transform, so a bail after it left the model standing at unit-cube scale, and the unit cube is not a small mistake — SCENE_SCALE normalizes the whole 5.3 m diorama to exactly those 2 units, so a 30 cm ornament drew at the size of the ROOM. That is the "objects got bigger" report: nothing was scaled up, an orphan was simply never scaled DOWN.
  const host = useHostPlacement(placement);
  // No model yet — a bought item whose storage URL is still being probed (it has no bundled fallback) — must render NOTHING: useModel has no empty source, and feeding it the room shell would briefly draw a second whole room as the "piece".
  if (!item || !source) return null;
  if (needsHost(placement) && !host) return null;
  return (
    <LoadedItem
      item={item}
      source={source}
      placement={placement}
      tint={tint}
      orbit={orbit}
      onLoaded={loaded}
    />
  );
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

  // The host's LIVE placement — the ghost while the host is being dragged, so children ride the drag; null for floor/wall items and for orphans whose host is gone. Subscribing here is what re-runs the transform effect on every host cell crossing.
  const hostPlacement = useHostPlacement(placement);

  // The unit-cube normalization for the model currently loaded here — see the effect below for why it is held rather than recomputed.
  //
  // Keyed on the SOURCE, which is what decides which GLB is loaded and therefore what its unit cube is. Not on the root entity: Filament's EntityManager recycles ids, so a colour swap that releases one asset and loads another can legitimately hand the new model the id the old one just gave up — and a cache that trusted that id would serve the previous GLB's normalization for the new mesh, which is the very class of wrong-size bug this is here to prevent.
  const sourceKey = typeof source === "object" ? source.uri : String(source);
  const unitBase = useRef<{ key: string; matrix: Mat4; data: number[] } | null>(null);

  useEffect(() => {
    if (model.state !== "loaded") return;

    // Resolved BEFORE the unit-cube step below, and the ORDER is the load-bearing part: transformToUnitCube writes a transform, so a bail after it leaves the piece at unit-cube scale — the size of the whole room (see PlacedItem, where an orphan is refused a model in the first place). This is the second line of that defence, for a host that disappears between the two.
    const hostDef = hostPlacement ? getRoomItemDef(hostPlacement.itemId) : undefined;
    const hostItem = hostPlacement ? getRoomItem(hostPlacement.itemId) : null;
    // Spelled out rather than via needsHost() so the dependency array can stay on `placement.surface` alone — depending on the whole placement would re-run this on every cell of a drag.
    if (placement.surface.kind === "furniture" && (!hostPlacement || !hostDef || !hostItem)) return;

    // transformToUnitCube = scaling(2/maxExtent) · translation(-center) — a KNOWN matrix, used here as a normalization base so the algebra below is exact for any GLB origin.
    //
    // COMPUTED ONCE PER MODEL AND CACHED, and that is not an optimisation. transformToUnitCube does not RETURN the matrix, it WRITES it — and what it writes is the model scaled to two scene units, which is the size of the entire room (SCENE_SCALE normalises the whole 5.3 m diorama to exactly those 2 units). The real transform is written a few statements later, but Filament renders on its own thread, so any frame it samples between the two shows the piece at room scale. That is the "bought items glitch to very big and back" report: one frame, one piece, gone before you can look at it.
    //
    // It bit hardest while DRAGGING because this effect depends on `model`, which useModel rebuilds as a fresh object literal on every render — so the window was re-opened on every render of a ghost being dragged, not merely on every cell it crossed. Caching closes it for every update after the first: a drag now composes from a matrix that is already in hand and writes exactly one transform per move.
    //
    // Keyed on the ROOT ENTITY rather than on the component, because a colour swap loads a different GLB into the same LoadedItem and its unit cube is its own.
    if (unitBase.current?.key !== sourceKey) {
      transformManager.transformToUnitCube(model.rootEntity, model.boundingBox);
      const matrix = transformManager.getTransform(model.rootEntity);
      unitBase.current = { key: sourceKey, matrix, data: [...matrix.data] };
    }
    const unit = unitBase.current.matrix;

    // Holding that base is only sound if composing from it leaves it alone. Mat4's scaling/rotate/translate are documented to RETURN a new matrix rather than modify the receiver, and every branch below chains all three off `unit` — so if the documentation were ever wrong, the base would accumulate a whole drag's worth of transforms and the piece would grow without bound instead of glitching once. That failure can only show up on device, so it says so there rather than being assumed away.
    const apply = (transform: Mat4): void => {
      transformManager.setTransform(model.rootEntity, transform);
      const base = unitBase.current;
      if (__DEV__ && base && base.matrix.data.some((v, i) => v !== base.data[i])) {
        console.log("[room] unit-cube base was mutated by matrix composition — caching it is unsafe");
      }
    };

    const scale = fitScale(item) * SCENE_SCALE;
    const unitScale = 2 / Math.max(item.size.x, item.size.y, item.size.z);

    if (placement.surface.kind === "wall") {
      // A wall item mounts by its ANCHOR on the wall's inner face, while the unit-cube base re-centres the model on its AABB centre. Authored origins CANNOT express depth (the unit-cube erases them), so seating is a renderer POLICY over the measured size — and there are TWO policies, because there are two kinds of wall item and applying one rule to both buries the other.
      //
      // A HOLE-CUTTING item (opensWall — a window) OCCUPIES the wall: its front sits flush with the interior face and its body extends backward through the opening it knocked out. A model deeper than the wall pokes out of the EXTERIOR by the excess, accepted by design (the diorama is viewed from inside; the outside face is scenery), and a model shallower than the wall keeps its back on the outer skin instead (recessed front), which is how the approved shallow windows already sat.
      //
      // Everything else SITS ON the wall the way furniture sits on the floor: its BACK rests on the interior face and its whole body extends into the room. baseOffsetY is the exact analogue one axis over — a floor item's base meets the floor plane, a wall item's back meets the wall plane. Applying the window rule to a painting is not a near miss but a total one: a 3.6 cm canvas has protrusion -0.084, so the old formula pushed it 0.102 OUTWARD and left it flush against the outer skin, entirely inside the wall and invisible from the room it hangs in.
      const wall = placement.surface.wall;
      const anchor = roomToScene(
        wallCellToRoom(
          wall,
          placement.cell,
          occupiedFootprint(placement, item.def),
        ),
      );
      // Models are authored facing the room with the wall at −z behind them, which is exactly the z-max pose; the x-min wall looks along +x, a quarter turn the other way.
      const yaw = wallMountYaw(wall);
      // Positive is OUTWARD (see the translate below), so a hole-cutter moves out to put its front on the anchor and a mounted piece moves IN by half its depth to put its back there. The arithmetic is wallDepthOffset in roomShell, where it is unit-tested — it was silently wrong for every non-window wall item until 2026-08-10.
      const depthOffset = wallDepthOffset(item.size.z, item.def.opensWall === true) * scale;
      const transform = unit
        .scaling([scale / unitScale, scale / unitScale, scale / unitScale])
        .rotate(yaw, [0, 1, 0])
        // The seating offset runs along the wall's OUTWARD normal, so all four walls share one formula.
        .translate([
          anchor.x + (isXWall(wall) ? wallOutward(wall) * depthOffset : 0),
          anchor.y,
          anchor.z + (isXWall(wall) ? 0 : wallOutward(wall) * depthOffset),
        ]);
      apply(transform);
      return;
    }

    if (placement.surface.kind === "furniture") {
      // A stacked piece composes: host cell-box centre + host yaw over its host-local offset + top height, then its OWN yaw on top of the host's — topCellToRoom owns the maths so the grid and this transform can never disagree. The orphan case is already refused above, before the unit-cube step, which is the only place it can be refused safely; this repeat is what narrows the three values for the compiler.
      if (!hostPlacement || !hostDef || !hostItem) return;
      const host = { placement: hostPlacement, def: hostDef };
      const topHeight = hostItem.size.y * fitScale(hostItem);
      // occupiedFootprint, not rotatedFootprint(item.def.footprint, ...): a stacked child's footprint on the host's top is topFootprint, at TOP_CELL_SIZE, never the floor footprint scaled — see PlaceableItemDef.topFootprint.
      const childFootprint = occupiedFootprint(placement, item.def);
      const centre = roomToScene(topCellToRoom(host, placement.cell, childFootprint, topHeight));
      const transform = unit
        .scaling([scale / unitScale, scale / unitScale, scale / unitScale])
        .rotate(
          ((hostPlacement.rotSteps + placement.rotSteps) * Math.PI) / 2,
          [0, 1, 0],
        )
        .translate([centre.x, centre.y + (scale * item.size.y) / 2, centre.z]);
      apply(transform);
      return;
    }

    const footprint = rotatedFootprint(item.def.footprint, placement.rotSteps);
    const centre = roomToScene(floorCellToRoom(placement.cell, footprint));

    // Rotation is about Y through the model's own centre (unit-cube re-centres it), so the model's authored centre offsets cancel out of the translation entirely: the piece lands on its cell centre with its base lifted by half its rendered height above the floor plane.
    const transform = unit
      .scaling([scale / unitScale, scale / unitScale, scale / unitScale])
      .rotate((placement.rotSteps * Math.PI) / 2, [0, 1, 0])
      .translate([centre.x, centre.y + (scale * item.size.y) / 2, centre.z]);
    apply(transform);
  }, [
    hostPlacement,
    item,
    model,
    placement.cell,
    placement.rotSteps,
    placement.surface,
    sourceKey,
    transformManager,
  ]);

  // Wall items must not cast shadows: Filament's shadow maps treat alpha-blended glass as OPAQUE, so a window would shadow the room exactly like solid wall — the light shaft through the opening is the whole point of having one. The frame's thin shadow is an acceptable loss.
  useEffect(() => {
    if (model.state !== "loaded" || placement.surface.kind !== "wall") return;
    for (const entity of model.asset.getRenderableEntities()) {
      renderableManager.setCastShadow(entity, false);
    }
  }, [model, placement.surface.kind, renderableManager]);

  // Every material instance of the piece, with the colour and opacity it was AUTHORED with, captured once when the asset loads. The ghost's tint and the wall fade are both MULTIPLIERS over that pair, which is what lets the two compose: the tint used to write a flat [1, 1, 1, 1] and so erased whatever alpha each material shipped with, turning a window's 0.16 glass into a solid slab from the first time it was placed. Keyed on the ASSET, not on `model`, and that is load-bearing rather than tidiness: useModel rebuilds a fresh object literal every render (see the note in RoomModel), so `model` in the deps would re-run this on every render — re-reading baseColorFactor from values THIS component had already written and folding the tint and the fade into the baseline they are supposed to be measured from. A ghost dragged across ten cells would arrive ten multiplications darker. KEYED ON THE ASSET AND NOTHING ELSE. Anything else in these deps re-reads baseColorFactor off values the tint has already multiplied and calls the result "authored", and from then on the piece is stuck at that tint: every later paint() writes baseline × factor, so a baseline captured red stays red however the tint moves. That is exactly what surface.kind used to do here — a lamp dragged from the floor onto a table crosses "floor" → "furniture" mid-drag, re-ran this with the ghost's red or green multiplier live on the materials, and the piece kept the tint after it was committed. The transparency mode a wall item needs is set in its own effect below, which is what surface.kind was in these deps for.
  const materials = useRef<
    { instance: MaterialInstance; rgba: [number, number, number, number] }[]
  >([]);
  const asset = model.state === "loaded" ? model.asset : null;
  useEffect(() => {
    if (!asset) return;
    const found: {
      instance: MaterialInstance;
      rgba: [number, number, number, number];
    }[] = [];
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
    for (const { instance } of materials.current)
      instance.setTransparencyMode("twoPassesOneSide");
  }, [asset, placement.surface.kind]);

  // ALWAYS written, including the no-tint, no-fade reset: if the engine ever hands two components the same asset, the committed sibling heals any tint the ghost left behind.
  const paint = useCallback(
    (fade: number) => {
      const factor = TINTS[tint ?? "none"];
      for (const { instance, rgba } of materials.current) {
        instance.setFloat4Parameter("baseColorFactor", [
          rgba[0] * factor[0],
          rgba[1] * factor[1],
          rgba[2] * factor[2],
          rgba[3] * fade,
        ]);
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
    // Seeded from a real write, never from the ASSUMPTION that the materials already hold authored colour × 1. That assumption holds on a fresh mount and is false on the one transition that matters: committing a wall ghost re-runs this effect with tint gone, and the materials are still carrying the ghost's green multiplier, which the branch above only clears for non-wall pieces. wallAlpha returns EXACTLY 1 for any wall the camera is inside of — i.e. the wall you just placed the piece on — so seeding written = 1 made the guard below true on every frame and the untinted repaint never happened. The piece stayed green until an orbit wide enough to start fading its wall finally moved alpha off 1.
    let written = wallAlpha(wall, orbit.value.smoothed.theta);
    paint(written);
    const setDrawn = (draw: boolean) => {
      drawn = draw;
      for (const entity of asset.getRenderableEntities()) {
        if (draw) scene.addEntity(entity);
        else scene.removeEntity(entity);
      }
    };
    let frame = requestAnimationFrame(function tick() {
      frame = requestAnimationFrame(tick);
      // Skipped inside the tick, never by cancelling: this loop's teardown deliberately hands the entities back and repaints to alpha 1, so restarting it on every popup would pop culled windows back into a room the player cannot even see, then fade them out again on the way back. `drawn` and `written` stay true of the materials across the pause for the same reason.
      if (isScenePaused()) return;
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

    // ANTI-ALIASING IS A GRID QUESTION HERE, not an image-quality one, and both knobs live in gridTuning.ts with the evidence behind them. In short: the editing grid is 6 mm world-space geometry, which is about one pixel at the room's normal framing and less than one further away, so it aliases; FXAA is a post-process and cannot recover a line that never rasterised, TAA can because it jitters and accumulates. Filament defaults FXAA on, so stating it is itself a change — this is the first time the render path has said either way.
    view.antiAliasing = GRID_TUNING.fxaa ? "FXAA" : "none";

    // The one option object here that must NOT come from a view.create*Options() factory. Unlike AO and bloom above, `temporalAntiAliasingOptions` is a plain property whose binding takes a Record<string, number>, built by the package's own optionsToJSI — there is no createTemporalAntiAliasingOptions to call. Set unconditionally rather than only when enabled, so toggling it off in gridTuning actually turns it off on a Fast Refresh instead of leaving the last value latched on the native view.
    view.temporalAntiAliasingOptions = optionsToJSI({
      enabled: GRID_TUNING.taa,
      // Eight sub-pixel sample positions, which is what buys the grid its coverage. X16 and X32 converge further on a still camera but take proportionally longer to settle after every orbit, and this camera is rarely still for long.
      jitterPattern: "HALTON_23_X8",
      // History weight, and Filament's own default — 0.12 accumulates ~19 samples in steady state. This is the ghosting/settling dial and the LAST one to touch: raising it cuts smear during a glide but costs exactly the sub-pixel coverage TAA is here for.
      feedback: 0.12,
      // Reject history the current frame contradicts, so furniture and the drag ghost do not trail. ACCURATE is the default; the cheaper modes are for debugging.
      boxClipping: "ACCURATE",
      historyReprojection: true,
      // Built for thin high-contrast geometry that flickers between frames, which is this grid exactly.
      preventFlickering: true,
      // filterWidth is deliberately absent. It is in the TypeScript type, but RNFViewWrapper.cpp never reads that key — every other field is guarded by a find() and this one simply is not among them — so setting it does nothing at all, silently.
    });
  }, [view]);
  return null;
}

// Stops the render loop itself while a popup covers the room. The choreographer is what drives every frame — the render callbacks (camera rig, avatar animator), the shadow pass, and the whole post-processing chain this scene leans on (TAA at eight jitter positions, six levels of bloom, SSAO) — so stopping it is the single largest saving available here, and it is exactly what FilamentView.pause() does. Reached through useFilamentContext rather than a ref because the package's public `FilamentView` export is a function wrapper that forwards no ref; the choreographer on the context is the same object that wrapper's pause() would have called.
//
// The JS-side rAF loops are NOT stopped by this — rAF is React Native's frame loop, not Filament's — which is why each of them checks ./scenePaused for itself. Both halves are needed and both are switched from here: this one saves the GPU and the render thread, the flag saves the JS thread.
//
// Deliberately no AppState handling. A backgrounded app already loses its surface (Android destroys it outright, and FilamentView tears the swap chain down with it), so there is nothing here for a foreground check to switch off that the platform has not switched off already. The one seam this leaves is a surface RECREATED while paused: FilamentView calls choreographer.start() when it re-attaches its render callback, which resumes a room still under a popup. That is the behaviour this scene already had, so the worst case is no worse than before, and it heals on the next open or close.
function ScenePauseControl({ paused }: { paused: boolean }) {
  const { choreographer } = useFilamentContext();
  useEffect(() => {
    if (!paused) return;
    // Set together and cleared together, so the render loop and the rAF loops can never disagree about whether the room is being drawn. The flag is cleared on UNMOUNT as well as on resume — it outlives this component, and a scene torn down while a popup was up would otherwise leave the next one paused with nothing left to un-pause it.
    setScenePaused(true);
    choreographer.stop();
    return () => {
      setScenePaused(false);
      choreographer.start();
    };
  }, [choreographer, paused]);
  return null;
}

function OrbitCameraRig({
  orbit,
}: {
  orbit: ReturnType<typeof useSharedValue<OrbitState>>;
}) {
  const { camera } = useFilamentContext();
  // Captured as a plain number: a worklet can copy values in, but cannot call the host-side helpers in ../orbit — which is why the smoothing and spherical math is inlined below and unit tests pin the same formulas on the exported versions.
  const tau = ORBIT.smoothingTau;

  RenderCallbackContext.useRenderCallback(
    ({ timeSinceLastFrame }) => {
      "worklet";
      const state = orbit.value;
      // Exponential chase toward the raw values — identical maths to the reference project's Navigation.update(), made frame-rate independent.
      const alpha = 1 - Math.exp(-Math.max(0, timeSinceLastFrame) / tau);
      state.smoothed.radius +=
        (state.raw.radius - state.smoothed.radius) * alpha;
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
function useSmoothedOrbit(
  orbit: ReturnType<typeof useSharedValue<OrbitState>>,
  active: boolean,
): OrbitAngles {
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

export function RoomScene({
  rotationY,
  zoom,
  onRotationChange,
  onZoomChange,
  ceilingLight,
  onReady,
  onPlacementReposition,
  paused = false,
}: RoomSceneProps) {
  const [loaded, setLoaded] = useState(false);
  // The player's chosen hour. Every preset is authored to enter through walls the resting camera can see — see src/room/core/timeOfDay.ts for why that constraint exists and what breaks without it.
  const hour = useGameStore((s) => s.roomTimeOfDay);
  // Read HERE rather than passed down from RoomExperience, so it reaches every route that mounts this scene — the hub and a friend's room alike. It is the player's own display preference, not a fact about whose room is being drawn, so a visited room honours it too.
  const avatarVisible = useGameStore((s) => s.roomAvatarVisible);
  const sun = sunPreset(hour);
  const handleReady = useCallback(() => setLoaded(true), []);
  const win = useWindowDimensions();
  // THE VIEW'S OWN BOX, measured — not the window's.
  //
  // Everything the overlay draws and everything the picker inverts is projected through this
  // viewport, and it has to be the box FILAMENT RENDERS INTO or the two cameras disagree. They are
  // not the same rectangle: `edgeToEdgeEnabled` is on (app.config.ts), so the scene draws behind the
  // system bars while useWindowDimensions reports the window between them. The SVG overlay made
  // that worse by being absoluteFill — filling the container — while sizing its own coordinate
  // space from the window, so the grid was both offset AND scaled against the room it sits on.
  //
  // The window is the fallback for the frames before the first layout lands, which is the only time
  // it is ever right by accident.
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width: w, height: h } = e.nativeEvent.layout;
      setBox((prev) => (prev && prev.width === w && prev.height === h ? prev : { width: w, height: h }));
    },
    [],
  );
  const width = box?.width ?? win.width;
  const height = box?.height ?? win.height;

  // ── TEMPORARY DIAGNOSTIC — remove once the room is confirmed correct on device ──
  //
  // Prints the three rectangles that have to agree. `screen` is the whole display, `window` is what
  // React Native reports (and what the overlay used to project through), `view` is the box Filament
  // actually renders into. If window and view differ, the grid is drawn for a camera the room is not
  // being rendered with, and the difference IS the offset you can see.
  //
  // Logged once per distinct measurement rather than every render, so it does not flood Metro.
  const loggedRef = useRef("");
  useEffect(() => {
    if (!box) return;
    const scr = Dimensions.get("screen");
    const key = `${box.width}x${box.height}`;
    if (loggedRef.current === key) return;
    loggedRef.current = key;
    console.log(
      "[room viewport]",
      `screen ${scr.width}x${scr.height}`,
      `| window ${win.width}x${win.height}`,
      `| view ${box.width}x${box.height}`,
      `| delta ${(win.width - box.width).toFixed(1)}x${(win.height - box.height).toFixed(1)}`,
      `| aspect window ${(win.width / win.height).toFixed(4)} view ${(box.width / box.height).toFixed(4)}`,
    );
  }, [box, win.width, win.height]);
  const smallestSide = Math.min(width, height);
  const viewportRef = useRef({ width, height });
  viewportRef.current = { width, height };

  // The player's own room in the hub, a friend's while visiting. Placement is refused at the store while viewing, so activeEdit below is always null on that path and every ghost, overlay and drag branch is inert without needing its own check.
  const baseLayout = usePlacementStore((s) => s.viewing?.layout ?? s.layout);
  const viewing = usePlacementStore((s) => s.viewing !== null);
  // Is the layout above the REAL one, or the empty placeholder a hydrate that hasn't answered yet leaves behind? Nothing may be called ready against the placeholder: an empty room parses instantly and would fire onReady before the saved furniture had even been asked for. A visit is settled by construction — its layout arrives with startViewing, in one commit.
  const layoutSettled = usePlacementStore(
    (s) => s.viewing !== null || s.hydrated,
  );
  const activeEdit = usePlacementStore((s) => s.activeEdit);
  // Subscribed (not getState) so pieces whose item rows arrive with the catalog sync appear then.
  const roomItems = useRoomCatalogStore((s) => s.items);
  const reservedFixtureCount = usePlacementStore((s) => s.reserved.length);
  const editingReservedFixture = usePlacementStore((s) => s.activeEdit?.reserved === true);
  const setReserved = usePlacementStore((s) => s.setReserved);
  const cancelPlacement = usePlacementStore((s) => s.cancel);
  useEffect(() => {
    // Clear stale non-persisted fixtures left by a Fast Refresh from the former
    // Pebble-bed implementation. New avatars never reserve furniture cells.
    if (editingReservedFixture) cancelPlacement();
    if (reservedFixtureCount > 0) setReserved([]);
  }, [cancelPlacement, editingReservedFixture, reservedFixtureCount, setReserved]);
  const layout = baseLayout;
  // The ghost re-renders through the store on every cell change; committed pieces only when the layout itself changes.
  const editing = activeEdit !== null;

  // Everything the scene is actually asked to draw right now, resolved once and used by the render tree AND by the ready gate below — the two must be looking at the same list or the gate would wait on a piece that is never mounted. An id the catalog doesn't know (yet) has no model or dimensions and is skipped; sanitizeLayout deliberately KEEPS such a row (the catalog syncs after first paint), so it is normal for this to be shorter than the layout, and the gate must not wait for the missing rows — a piece whose row lands late simply appears late, exactly as it did before.
  const placements = activeEdit ? [...layout, activeEdit.placement] : layout;
  const scenePlacements = placements.filter(
    (placement) => roomItems[placement.itemId],
  );

  // Which pieces have their GLB in hand. A set in state rather than a counter: pieces mount, unmount and re-key freely (a ghost morphs into a committed piece), and only identity survives that.
  const [modelled, setModelled] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const markModelled = useCallback((instanceId: string) => {
    setModelled((prev) =>
      prev.has(instanceId) ? prev : new Set(prev).add(instanceId),
    );
  }, []);

  // The whole-room ready signal, fired exactly once per mount. Once is the point: the screens use it to lift a loading screen, and a room that is being lived in — a piece dragged in, a colour swapped — is not loading any more, so later arrivals must not re-announce anything.
  const announced = useRef(false);
  useEffect(() => {
    if (announced.current || !loaded || !layoutSettled) return;
    if (
      !scenePlacements.every((placement) => modelled.has(placement.instanceId))
    )
      return;
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

  // WHICH grid plate the scene should draw: the floor's for a floor or tabletop ghost, and the edited wall's own for a wall ghost. Exactly one at a time — the other surface's lattice is not something the player is aiming at, and drawing both would clutter the very view they are judging the fit in. Null whenever nothing is being placed.
  //
  // A wall ghost gets the grid on top of what it already had (the tinted model and the live hole preview), not instead of it: those say whether the piece fits, and the lattice is what lets the player line it up with what is already hanging there. The wall being edited is pinned visible for the length of the edit by the culling loop, so its plate cannot fade out from under the ghost.
  const gridMode: GridMode =
    activeEdit === null
      ? null
      : activeEdit.placement.surface.kind === "wall"
        ? "wall"
        : "floor";
  // The SVG overlay's green/red cells stay a floor-and-tabletop affair: they are quads on a horizontal plane, and a wall ghost's fit is already reported by the tint on the model itself.
  const showGrid =
    activeEdit !== null && activeEdit.placement.surface.kind !== "wall";
  // The GHOST's own cells still follow the camera frame by frame, so they stay welded to the floor through a drag, a pinch and the glide after both. The grid lines themselves no longer need this — they are scene geometry now, drawn by the same camera as the room (see RoomModel) — so what this mirror feeds is a handful of quads rather than 38 lines clipped against every piece in the room.
  // Gated on `paused` too, and this one CAN be a dependency rather than an in-tick check: the mirror owns no scene state and its teardown is a bare cancelAnimationFrame, so stopping and restarting it costs nothing and leaves nothing behind. The pose is read fresh during render, so the overlay is correct on the first frame back regardless of how long the loop was down.
  const gridAngles = useSmoothedOrbit(orbit, showGrid && !paused);

  // While a ghost is active, the finger owns the ghost, not the camera: the same drag that orbited a moment ago now slides the piece cell to cell under the fingertip. A wall ghost slides on ITS wall and hops at the corner; which wall it lands on — and the hysteresis that keeps a finger near a corner from teleporting it — is dragWallTarget's job.
  const dragGhost = useCallback(
    (px: number, py: number) => {
      const state = usePlacementStore.getState();
      const edit = state.activeEdit;
      if (!edit) return;
      const def = getRoomItemDef(edit.placement.itemId);
      if (!def) return;
      if (edit.placement.surface.kind !== "wall") {
        // Tops first: a floor-capable ghost climbs onto any flagged host under the finger, the current host winning ties (dragTopTarget's hysteresis); pointing at open floor hops it back off. Wall items never enter this branch, so only "anything that fits" ever reaches a top.
        const defs = roomItemDefs();
        const targets: TopTarget[] = state.layout
          .filter(
            (p) =>
              p.surface.kind === "floor" &&
              p.instanceId !== edit.placement.instanceId,
          )
          .flatMap((p) => {
            const hostDef = defs.get(p.itemId);
            const hostItem = getRoomItem(p.itemId);
            return hostDef?.hostsTop && hostItem
              ? [
                  {
                    host: { placement: p, def: hostDef },
                    topHeight: hostItem.size.y * fitScale(hostItem),
                  },
                ]
              : [];
          });
        const currentHost =
          edit.placement.surface.kind === "furniture"
            ? edit.placement.surface.hostInstanceId
            : null;
        const top = dragTopTarget(
          currentHost,
          px,
          py,
          viewportRef.current,
          orbit.value.smoothed,
          targets,
        );
        if (top) {
          const surface = {
            kind: "furniture",
            hostInstanceId: top.hostInstanceId,
            slot: "top",
          } as const;
          state.moveGhost(
            anchorForCentre(
              top.cell,
              occupiedFootprint({ ...edit.placement, surface }, def),
            ),
            top.hostInstanceId === currentHost ? undefined : surface,
          );
          return;
        }
        const floorSurface = { kind: "floor" } as const;
        const pointed = screenPointToFloorCell(
          px,
          py,
          viewportRef.current,
          orbit.value.smoothed,
        );
        if (pointed)
          state.moveGhost(
            anchorForCentre(
              pointed,
              occupiedFootprint(
                { ...edit.placement, surface: floorSurface },
                def,
              ),
            ),
            edit.placement.surface.kind === "floor" ? undefined : floorSurface,
          );
        return;
      }
      const here = edit.placement.surface.wall;
      const target = dragWallTarget(
        here,
        px,
        py,
        viewportRef.current,
        orbit.value.smoothed,
      );
      if (!target) return;
      const surface = { kind: "wall", wall: target.wall } as const;
      // The surface argument is what makes moveGhost a HANDOFF rather than a slide, so it is passed only on an actual hop.
      state.moveGhost(
        anchorForCentre(
          target.cell,
          occupiedFootprint({ ...edit.placement, surface }, def),
        ),
        target.wall === here ? undefined : surface,
      );
    },
    [orbit],
  );

  // Gesture Handler may deliver several pan updates before React has finished
  // rendering the previous Zustand update. Moving across different cells means
  // moveGhost's same-cell guard cannot coalesce those calls, and React can then
  // report a nested "maximum update depth" loop. Keep only the latest finger
  // position and commit at most one ghost move per animation frame.
  const pendingGhostPoint = useRef<{ x: number; y: number } | null>(null);
  const ghostMoveFrame = useRef<number | null>(null);
  const scheduleGhostDrag = useCallback(
    (px: number, py: number) => {
      pendingGhostPoint.current = { x: px, y: py };
      if (ghostMoveFrame.current !== null) return;
      ghostMoveFrame.current = requestAnimationFrame(() => {
        ghostMoveFrame.current = null;
        const point = pendingGhostPoint.current;
        pendingGhostPoint.current = null;
        if (point) dragGhost(point.x, point.y);
      });
    },
    [dragGhost],
  );

  useEffect(
    () => () => {
      if (ghostMoveFrame.current !== null)
        cancelAnimationFrame(ghostMoveFrame.current);
      ghostMoveFrame.current = null;
      pendingGhostPoint.current = null;
    },
    [],
  );

  // Does this touch belong to the piece being placed, or to the camera? A placement no longer takes the whole screen: the finger owns the ghost only while it is over the surface that ghost can actually stand on (the floor grid, or a wall the camera can see), and everywhere else — the other surface, the cornice, the backdrop around the diorama — it orbits exactly as it does with nothing being placed. Before this there was no way to look behind a wall mid-placement without cancelling the edit. Read from the store rather than from the subscribed activeEdit so this callback survives every cell the ghost crosses; the rule itself is pointsAtSurface, unit-tested in ../input/picking.
  const ghostOwnsPoint = useCallback(
    (px: number, py: number) => {
      const state = usePlacementStore.getState();
      const edit = state.activeEdit;
      if (edit === null) return false;
      // A stacked ghost owns the finger while it points at ITS host's top — pointsAtSurface needs the resolved host, which only this layer (store + catalog in hand) can supply.
      let topTarget: TopTarget | undefined;
      if (edit.placement.surface.kind === "furniture") {
        const host = resolveHost(
          edit.placement.surface.hostInstanceId,
          state.layout,
          roomItemDefs(),
        );
        const hostItem = host ? getRoomItem(host.placement.itemId) : null;
        if (host && hostItem)
          topTarget = { host, topHeight: hostItem.size.y * fitScale(hostItem) };
      }
      return pointsAtSurface(
        px,
        py,
        viewportRef.current,
        orbit.value.smoothed,
        edit.placement.surface,
        topTarget,
      );
    },
    [orbit],
  );

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
  const pickUpAt = useCallback(
    (px: number, py: number) => {
      const state = usePlacementStore.getState();
      // `viewing` too: the editable list belongs to the player's OWN room, so
      // in a friend's room it would raycast against pieces that are not on
      // screen and buzz for a piece nobody can see. editPlacement refuses too.
      if (state.activeEdit || state.viewing) return;
      const editableLayout = [...state.layout, ...state.reserved];
      // Every piece a real pickable VOLUME, on every surface alike, in ONE pass — so pickBoxAt's nearest-wins rule reaches across surface kinds and a chair standing in front of a wall painting wins on distance rather than on a precedence rule. Why volume and never the plane under the finger — and what plane-picking does to a deep wall item like the eket cabinet — is in placementPickBoxes, along with why that function is tested rather than this callback.
      const boxes = placementPickBoxes(
        editableLayout,
        (itemId) => {
          const item = getRoomItem(itemId);
          if (!item) return null;
          const scale = fitScale(item);
          return {
            def: item.def,
            size: { x: item.size.x * scale, y: item.size.y * scale, z: item.size.z * scale },
          };
        },
        (wall) => wallAlpha(wall, orbit.value.smoothed.theta) > 0.5,
      );
      const picked = pickBoxAt(
        px,
        py,
        viewportRef.current,
        orbit.value.smoothed,
        boxes.map((b) => b.box),
      );
      const under = picked !== null ? boxes[picked].placement : undefined;
      if (!under) return;
      // The hold has no other confirmation — no ghost appears until the store updates a frame later — so the pick-up announces itself the way every other grab in the app does.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      state.editPlacement(under.instanceId);
    },
    [orbit],
  );

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
            scheduleGhostDrag(e.x, e.y);
            return;
          }
          dragStart.value = {
            theta: orbit.value.raw.theta,
            phi: orbit.value.raw.phi,
          };
        })
        .onUpdate((e) => {
          if (dragOwner.current === "ghost") {
            scheduleGhostDrag(e.x, e.y);
            return;
          }
          const clamped = clampOrbit({
            radius: orbit.value.raw.radius,
            theta:
              dragStart.value.theta -
              (e.translationX * ORBIT.dragSensitivity) / smallestSide,
            phi:
              dragStart.value.phi -
              (e.translationY * ORBIT.dragSensitivity) / smallestSide,
          });
          orbit.value.raw.theta = clamped.theta;
          orbit.value.raw.phi = clamped.phi;
        })
        .onEnd(() => {
          if (dragOwner.current === "ghost") {
            onPlacementReposition?.();
            return;
          }
          onRotationChange(controlsFromOrbit(orbit.value.raw).rotationY);
        })
        .runOnJS(true),
    [
      dragStart,
      ghostOwnsPoint,
      onPlacementReposition,
      onRotationChange,
      orbit,
      scheduleGhostDrag,
      smallestSide,
    ],
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
    () =>
      Gesture.Race(
        doubleTap,
        Gesture.Exclusive(longPress, Gesture.Simultaneous(pan, pinch)),
      ),
    [doubleTap, longPress, pan, pinch],
  );

  return (
    <View style={styles.container} onLayout={onLayout}>
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
          {/* One cool counter-fill, kept weak. The reference look is high-contrast: warm bounce with genuinely dark corners. The old rig had 64k of flat fill here, which washed exactly that contrast out. */}
          {/* PER-HOUR, and that is not cosmetic. This light burns at every hour while the sun can drop to zero, so a constant figure here becomes the DOMINANT light after dark — and being the room's coldest source, it then fights every warm bulb in it. Held as literals until 2026-08-18, it was the real cause of a "the ceiling light is too cold" report that no edit to the ceiling light could have fixed. Hard-coding these again is that bug, not a simplification. */}
          <Light
            type="directional"
            colorKelvin={sun.counterFill.kelvin}
            intensity={sun.counterFill.intensity}
            direction={[0.6, -0.45, 0.5]}
          />
          {/* The wall-readability layer: two opposed, near-horizontal directionals so that every wall inner face is lit by exactly one of them and the floor takes only about a third of what they give. Both the pairing and the shallow angle are load-bearing — the derivation is on WALL_FILL_DIRECTIONS, and collapsing this to a single light or tilting it down turns it into a second ambient that washes out the sun's pool. No castShadows: a fill that casts is a key, and a second set of wall-length shadows crossing the sun's is exactly the mess the old flat 64k fill made. */}
          {sun.wallFill.intensity > 0
            ? WALL_FILL_DIRECTIONS.map((direction) => (
                <Light
                  key={direction.join()}
                  type="directional"
                  colorKelvin={sun.wallFill.kelvin}
                  intensity={sun.wallFill.intensity}
                  direction={direction}
                />
              ))
            : null}
          {/* The room's own ceiling light. Off at the three daylight hours by default and on after dark, with the player's switch overriding either way — see ceilingLightOn. */}
          {ceilingLight ? <RoomCeilingLight light={sun.interiorLight} /> : null}
          <RoomPostProcess />
          <ScenePauseControl paused={paused} />
          <RoomModel onReady={handleReady} orbit={orbit} gridMode={gridMode} />
          {/* UNMOUNTED when the player turns it off, never hidden. RoomAvatar has a HIDDEN_SCENE_Y for the transient case where it has nowhere legal to stand, and parking it under the floor is exactly the wrong tool here: it would keep the GLB and its three textures resident, keep the Filament animator driving a skinned mesh every frame, and keep the rAF loop — including choosePath's A*, the most expensive thing this scene can do in one frame. Taking the element out is what actually gives those back. */}
          {avatarVisible ? <RoomAvatar /> : null}
          {/* Committed pieces AND the ghost render from ONE array, and that is load-bearing: React keys only match within the same children array, so a ghost in its own sibling slot is a different element even with the same key — pick-up and confirm then unmount/remount the piece, and useModel reloads the whole GLB each time (useBuffer has no cache). That remount is what made a dragged piece invisible until seconds after settling, and where the old "Pointer FilamentAssetWrapper has already been manually released" race lived. In one array the key genuinely matches, the component morphs, and the model loads exactly once per piece.
              An id the catalog doesn't know (yet) has no model or dimensions — skip it. */}
          {scenePlacements.map((placement) => (
            <PlacedItem
              key={placement.instanceId}
              placement={placement}
              tint={
                activeEdit &&
                placement.instanceId === activeEdit.placement.instanceId
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
            .filter(
              (p) =>
                getRoomItemDef(p.itemId)?.emitsLight &&
                (p.surface.kind === "floor" ||
                  p.surface.kind === "furniture") &&
                p.lightOn !== false,
            )
            .map((p) => {
              const item = roomItems[p.itemId];
              return item ? (
                <RoomLit
                  key={`lit:${p.instanceId}`}
                  placement={p}
                  item={item}
                />
              ) : null;
            })}
          <OrbitCameraRig orbit={orbit} />
        </FilamentView>
      </FilamentScene>
      {/* The overlay draws the ghost's highlight quads ONLY — the floor grid itself is scene geometry (RoomModel). The two are split by which way each one needs occlusion to go: a grid line should be hidden by a piece standing over it, which is what the depth buffer does for free, while these quads must stay visible THROUGH the very piece being placed, since they are the answer to "will it fit here" and the ghost model stands directly on them. A wall ghost gets its feedback from the tinted model and the live hole preview instead, so the overlay stays down for walls only. */}
      {showGrid && activeEdit ? (
        <GridOverlay
          viewport={{ width, height }}
          angles={gridAngles}
          ghostQuads={(() => {
            const p = activeEdit.placement;
            const def =
              getRoomItemDef(p.itemId) ??
              { itemId: p.itemId, footprint: { w: 1, d: 1 }, topFootprint: { w: 1, d: 1 }, allowedSurfaces: ["floor" as const] };
            const cells = cellsFor(p, def);
            const CORNERS = [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
            ] as const;
            if (p.surface.kind === "furniture") {
              const host = resolveHost(
                p.surface.hostInstanceId,
                layout,
                roomItemDefs(),
              );
              const hostItem = host ? getRoomItem(host.placement.itemId) : null;
              if (!host || !hostItem) return [];
              const topHeight = hostItem.size.y * fitScale(hostItem);
              // topCellToRoom returns a CELL CENTRE for a 1x1 footprint, so corner (cell + d − 0.5) yields the corner point exactly, host yaw included.
              return cells.map((cell) => ({
                key: `${cell.x},${cell.y}`,
                corners: CORNERS.map(([dx, dy]) =>
                  topCellToRoom(
                    host,
                    { x: cell.x + dx - 0.5, y: cell.y + dy - 0.5 },
                    { w: 1, d: 1 },
                    topHeight,
                  ),
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
