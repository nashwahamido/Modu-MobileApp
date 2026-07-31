import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, ActivityIndicator, Text, View, useWindowDimensions } from "react-native";
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
} from "react-native-filament";
import { useSharedValue } from "react-native-worklets-core";

import { ORBIT, clampOrbit, controlsFromOrbit, orbitFromControls } from "../input/orbit";
import {
  cellsFor,
  occupiedFootprint,
  rotatedFootprint,
  floorCellToRoom,
  surfaceExtent,
  surfaceKey,
  wallCellToRoom,
  windowCellNamesFor,
  type GridPlacement,
} from "../core/grid";
import {
  fitScale,
  getRoomItemDef,
  useRoomCatalogStore,
  useRoomItem,
  type RoomItemModel,
} from "../core/placeableItems";
import { useVariantModelSource } from "./variantModel";
import { GridOverlay } from "./GridOverlay";
import { usePlacementStore } from "../core/placement";
import { screenPointToFloorCell, screenPointToWallCell } from "../input/picking";
import { anchorForCentre } from "../core/grid";
import { SCENE_SCALE, WALL_THICKNESS, roomToScene, type WallId } from "../core/roomShell";

// Metro exposes bundled GLBs through the React Native numeric asset module.
// The shell is authored art, put through scripts/compress-room-glb.mjs — textures only, geometry
// untouched, so the measurements frozen in src/room/core/roomShell.ts stay valid.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ROOM_MODEL = require("../../assets/models/room/virtualroom_empty.glb");

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

function RoomModel({ onReady }: { onReady: () => void }) {
  const model = useModel(ROOM_MODEL);
  const { transformManager, scene } = useFilamentContext();
  const layout = usePlacementStore((s) => s.layout);
  const activeEdit = usePlacementStore((s) => s.activeEdit);
  // Entity handles for the wall cells currently knocked out, by GLB node name. A ref, not state:
  // this is imperative scene bookkeeping — the entities must be RE-ADDED when a window moves away,
  // and only this map still knows their handles once they are out of the scene.
  const knockedOut = useRef(new Map<string, Entity>());

  // The shell is STATIC: normalized to the unit cube once and never rotated. All view control is
  // the camera's, which is what keeps picking a ray against fixed planes.
  useEffect(() => {
    if (model.state !== "loaded") return;
    transformManager.transformToUnitCube(model.rootEntity, model.boundingBox);
    onReady();
  }, [model, onReady, transformManager]);

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
const PlacedItem = memo(function PlacedItem({
  placement,
  tint,
}: {
  placement: GridPlacement;
  tint?: "valid" | "blocked";
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
  return <LoadedItem item={item} source={source} placement={placement} tint={tint} />;
});

const LoadedItem = memo(function LoadedItem({
  item,
  source,
  placement,
  tint,
}: {
  item: RoomItemModel;
  source: NonNullable<ReturnType<typeof useVariantModelSource>>;
  placement: GridPlacement;
  tint?: "valid" | "blocked";
}) {
  const model = useModel(source);
  const { renderableManager, transformManager } = useFilamentContext();

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
      const yaw = wall === "z-max" ? 0 : -Math.PI / 2;
      const protrusion = Math.min(item.size.z - WALL_THICKNESS, 0);
      const depthOffset = (item.size.z / 2 - protrusion) * scale;
      const transform = unit
        .scaling([scale / unitScale, scale / unitScale, scale / unitScale])
        .rotate(yaw, [0, 1, 0])
        .translate([
          anchor.x + (wall === "x-min" ? -depthOffset : 0),
          anchor.y,
          anchor.z + (wall === "z-max" ? depthOffset : 0),
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

  // While a ghost is active, the finger owns the ghost, not the camera: the same drag that
  // orbited a moment ago now slides the piece cell to cell under the fingertip. A wall ghost
  // slides on ITS wall with HYSTERESIS at the corner: it stays loyal while the finger is anywhere
  // over its own wall's run, and hops to the other wall only when the finger has clearly left the
  // run AND points inside the other one — a naive nearest-plane pick teleported the piece every
  // time the ray grazed the corner.
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
    const other: WallId = here === "z-max" ? "x-min" : "z-max";
    const own = screenPointToWallCell(px, py, viewportRef.current, orbit.value.smoothed, here);
    const ownW = surfaceExtent({ kind: "wall", wall: here }).w;
    if (own && own.x >= 0 && own.x < ownW) {
      state.moveGhost(anchorForCentre(own, occupiedFootprint(edit.placement, def)));
      return;
    }
    const hop = screenPointToWallCell(px, py, viewportRef.current, orbit.value.smoothed, other);
    const hopW = surfaceExtent({ kind: "wall", wall: other }).w;
    if (hop && hop.x >= 0 && hop.x < hopW) {
      const surface = { kind: "wall", wall: other } as const;
      state.moveGhost(
        anchorForCentre(hop, occupiedFootprint({ ...edit.placement, surface }, def)),
        surface,
      );
    }
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
    const under =
      hits({ kind: "floor" }, screenPointToFloorCell(px, py, viewportRef.current, orbit.value.smoothed)) ??
      hits({ kind: "wall", wall: "z-max" }, screenPointToWallCell(px, py, viewportRef.current, orbit.value.smoothed, "z-max")) ??
      hits({ kind: "wall", wall: "x-min" }, screenPointToWallCell(px, py, viewportRef.current, orbit.value.smoothed, "x-min"));
    if (under) state.editPlacement(under.instanceId);
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
        .minDuration(420)
        .onStart((e) => pickUpAt(e.x, e.y))
        .runOnJS(true),
    [pickUpAt],
  );

  // Race: a finger that moves becomes pan; one that holds still becomes the pick-up long-press;
  // a second finger hands the pair to pinch.
  const gesture = useMemo(
    () => Gesture.Race(longPress, Gesture.Simultaneous(pan, pinch)),
    [longPress, pan, pinch],
  );

  return (
    <View style={styles.container}>
      <FilamentScene>
        <FilamentView style={styles.filament}>
          {/* No manipulator: OrbitCameraRig owns the eye every frame. The 68 mm lens is the
              reference project's 20-degree FOV — the telephoto diorama look. */}
          <Camera focalLengthInMillimeters={ORBIT.focalLengthMm} />
          <EnvironmentalLight source={{ uri: "RNF_default_env_ibl.ktx" }} intensity={30_000} />
          <Light
            type="directional"
            colorKelvin={4_800}
            intensity={90_000}
            direction={[-0.5, -1, -0.6]}
            castShadows
          />
          <Light
            type="directional"
            colorKelvin={7_600}
            intensity={15_000}
            direction={[0.6, -0.45, 0.5]}
          />
          <Light
            type="directional"
            colorKelvin={7_800}
            intensity={64_000}
            direction={[0.3, -0.25, 0.85]}
          />
          <RoomModel onReady={handleReady} />
          {/* An id the catalog doesn't know (yet) has no model or dimensions — skip it. */}
          {layout
            .filter((placement) => roomItems[placement.itemId])
            .map((placement) => (
              <PlacedItem key={placement.instanceId} placement={placement} />
            ))}
          {/* SAME key as a committed piece, on purpose: confirm and pick-up then morph this
              component instead of unmount/remounting it, so the model is neither reloaded nor
              released mid-flight — the release/addAssetEntities race in useModel ("Pointer
              FilamentAssetWrapper has already been manually released") lived in that remount. */}
          {activeEdit ? (
            <PlacedItem
              key={activeEdit.placement.instanceId}
              placement={activeEdit.placement}
              tint={activeEdit.check.ok ? "valid" : "blocked"}
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
