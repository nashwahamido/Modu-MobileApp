import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import {
  Camera,
  EnvironmentalLight,
  FilamentScene,
  FilamentView,
  Light,
  useCameraManipulator,
  useFilamentContext,
  useModel,
} from "react-native-filament";
import type { Mat4 } from "react-native-filament";
import type { RenderStyleId } from "../../game/core/type";
import {
  getRoomFurnitureDefinition,
  getRoomFurnitureModel,
} from "../furnitureCatalog";
import {
  getRoomFloorCorners,
  getRoomFloorPointFromNormalizedFloor,
  invertMat4,
  transformPointByMat4,
} from "../placementConstraints";
import type {
  NormalizedPlacementPoint,
  ProjectedFurnitureBounds,
  ProjectedRoomFloor,
  RoomFloorPoint,
} from "../placementConstraints";

// Metro exposes bundled GLBs through the React Native numeric asset module.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ROOM_MODEL = require("../../assets/models/room/virtualroom_empty.glb");

export type RoomSceneProps = {
  rotationY: number;
  zoom: number;
  furniture?: {
    itemId: string;
    position: NormalizedPlacementPoint;
    renderStyle?: RenderStyleId;
  } | null;
  onFloorProjectionChange?: (floor: ProjectedRoomFloor) => void;
  onFurnitureProjectionChange?: (
    projection: ProjectedFurnitureBounds | null,
  ) => void;
};

function isFinitePoint(point: readonly number[]) {
  return point.every(Number.isFinite);
}

function projectModelBounds(
  matrix: Mat4,
  center: readonly [number, number, number],
  halfExtent: readonly [number, number, number],
  project: (point: RoomFloorPoint) => readonly [number, number],
): ProjectedFurnitureBounds | null {
  const worldCenter = transformPointByMat4(matrix.data, {
    x: center[0],
    y: center[1],
    z: center[2],
  });
  const worldFloorAnchor = transformPointByMat4(matrix.data, {
    x: center[0],
    y: center[1] - halfExtent[1],
    z: center[2],
  });
  const projectedCenter = project(worldCenter);
  const projectedFloorAnchor = project(worldFloorAnchor);
  if (!isFinitePoint(projectedCenter) || !isFinitePoint(projectedFloorAnchor)) {
    return null;
  }

  const projectedCorners: Array<readonly [number, number]> = [];
  for (const xDirection of [-1, 1] as const) {
    for (const yDirection of [-1, 1] as const) {
      for (const zDirection of [-1, 1] as const) {
        const worldCorner = transformPointByMat4(matrix.data, {
          x: center[0] + halfExtent[0] * xDirection,
          y: center[1] + halfExtent[1] * yDirection,
          z: center[2] + halfExtent[2] * zDirection,
        });
        const projectedCorner = project(worldCorner);
        if (!isFinitePoint(projectedCorner)) return null;
        projectedCorners.push(projectedCorner);
      }
    }
  }

  const xs = projectedCorners.map(([x]) => x);
  const ys = projectedCorners.map(([, y]) => y);

  return {
    floorAnchor: {
      x: projectedFloorAnchor[0],
      y: projectedFloorAnchor[1],
    },
    center: { x: projectedCenter[0], y: projectedCenter[1] },
    bounds: {
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys),
      bottom: Math.max(...ys),
    },
  };
}

function PlacedFurnitureModel({
  itemId,
  position,
  renderStyle = "realistic",
  roomRotation,
  roomZoom,
  viewportRevision,
  onProjectionChange,
}: NonNullable<RoomSceneProps["furniture"]> & {
  roomRotation: number;
  roomZoom: number;
  viewportRevision: number;
  onProjectionChange?: RoomSceneProps["onFurnitureProjectionChange"];
}) {
  const definition = getRoomFurnitureDefinition(itemId);
  const source = definition
    ? getRoomFurnitureModel(definition, renderStyle)
    : ROOM_MODEL;
  const model = useModel(source);
  const { transformManager, view } = useFilamentContext();
  const unitTransform = useRef<Mat4 | null>(null);
  const normalizedHeight = useRef(2);

  useEffect(() => {
    if (!definition || model.state !== "loaded") return;
    const [halfWidth, halfHeight, halfDepth] = model.boundingBox.halfExtent;
    const maxHalfExtent = Math.max(
      Math.abs(halfWidth),
      Math.abs(halfHeight),
      Math.abs(halfDepth),
    );
    normalizedHeight.current =
      maxHalfExtent > 0 ? (2 * Math.abs(halfHeight)) / maxHalfExtent : 2;

    transformManager.transformToUnitCube(model.rootEntity, model.boundingBox);
    unitTransform.current = transformManager.getTransform(model.rootEntity);
  }, [definition, model, transformManager]);

  useEffect(() => {
    if (!definition || model.state !== "loaded" || !unitTransform.current) {
      onProjectionChange?.(null);
      return;
    }

    const localScale = definition.sceneScale;
    const renderedHeight = normalizedHeight.current * localScale;
    const floorPoint = getRoomFloorPointFromNormalizedFloor(
      position,
      renderedHeight,
    );

    // Mat4 helpers pre-multiply. Build transforms from local to world:
    // room rotation * room zoom * floor translation * local scale * unit cube.
    const transform = unitTransform.current
      .scaling([localScale, localScale, localScale])
      .translate([floorPoint.x, floorPoint.y, floorPoint.z])
      .scaling([roomZoom, roomZoom, roomZoom])
      .rotate(roomRotation, [0, 1, 0]);

    transformManager.setTransform(model.rootEntity, transform);
    const worldTransform = transformManager.getWorldTransform(model.rootEntity);

    const viewport = view.getViewport();
    if (viewport.width <= 0 || viewport.height <= 0) return;

    const projection = projectModelBounds(
      worldTransform,
      model.boundingBox.center,
      model.boundingBox.halfExtent,
      (worldPoint) =>
        view.projectWorldToScreen([worldPoint.x, worldPoint.y, worldPoint.z]),
    );
    onProjectionChange?.(projection);
  }, [
    definition,
    model,
    onProjectionChange,
    position.x,
    position.y,
    roomRotation,
    roomZoom,
    transformManager,
    view,
    viewportRevision,
  ]);

  useEffect(
    () => () => {
      onProjectionChange?.(null);
    },
    [onProjectionChange],
  );

  return null;
}

function RoomModel({
  rotationY,
  zoom,
  viewportRevision,
  onReady,
  onFloorProjectionChange,
}: {
  rotationY: number;
  zoom: number;
  viewportRevision: number;
  onReady: () => void;
  onFloorProjectionChange?: RoomSceneProps["onFloorProjectionChange"];
}) {
  const model = useModel(ROOM_MODEL);
  const { transformManager, view } = useFilamentContext();
  const unitTransform = useRef<Mat4 | null>(null);

  useEffect(() => {
    if (model.state !== "loaded") return;

    transformManager.transformToUnitCube(model.rootEntity, model.boundingBox);
    unitTransform.current = transformManager.getTransform(model.rootEntity);
    onReady();
  }, [model, onReady, transformManager]);

  useEffect(() => {
    if (model.state !== "loaded" || !unitTransform.current) return;

    const transform = unitTransform.current
      .scaling([zoom, zoom, zoom])
      .rotate(rotationY, [0, 1, 0]);
    transformManager.setTransform(model.rootEntity, transform);
    const worldTransform = transformManager.getWorldTransform(model.rootEntity);

    const viewport = view.getViewport();
    if (viewport.width <= 0 || viewport.height <= 0) return;

    // ROOM_FLOOR is expressed after the room model's unit-cube transform.
    // Convert each point back to original model space, apply the exact current
    // room transform, then let Filament perform the camera projection.
    const inverseUnitTransform = invertMat4(unitTransform.current.data);
    if (!inverseUnitTransform) return;

    const projected = getRoomFloorCorners().map((floorCorner) => {
      const originalModelPoint = transformPointByMat4(
        inverseUnitTransform,
        floorCorner,
      );
      const worldPoint = transformPointByMat4(
        worldTransform.data,
        originalModelPoint,
      );
      const [x, y] = view.projectWorldToScreen([
        worldPoint.x,
        worldPoint.y,
        worldPoint.z,
      ]);
      return { x, y };
    });

    if (
      projected.every(
        (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
      )
    ) {
      onFloorProjectionChange?.(projected as unknown as ProjectedRoomFloor);
    }
  }, [
    model,
    onFloorProjectionChange,
    rotationY,
    transformManager,
    view,
    viewportRevision,
    zoom,
  ]);

  return null;
}

function RoomFilamentScene({
  rotationY,
  zoom,
  viewportRevision,
  onReady,
  furniture,
  onFloorProjectionChange,
  onFurnitureProjectionChange,
}: RoomSceneProps & {
  viewportRevision: number;
  onReady: () => void;
}) {
  const cameraManipulator = useCameraManipulator({
    orbitHomePosition: [1.45, 1.05, -1.45],
    targetPosition: [0, 0, 0],
    orbitSpeed: [0.005, 0.005],
  });

  return (
    <FilamentView style={styles.filament}>
      <Camera
        cameraManipulator={cameraManipulator}
        focalLengthInMillimeters={32}
      />
      <EnvironmentalLight
        source={{ uri: "RNF_default_env_ibl.ktx" }}
        intensity={30_000}
      />
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
      <RoomModel
        rotationY={rotationY}
        zoom={zoom}
        viewportRevision={viewportRevision}
        onReady={onReady}
        onFloorProjectionChange={onFloorProjectionChange}
      />
      {furniture && getRoomFurnitureDefinition(furniture.itemId) ? (
        <PlacedFurnitureModel
          key={`${furniture.itemId}-${furniture.renderStyle ?? "realistic"}`}
          {...furniture}
          roomRotation={rotationY}
          roomZoom={zoom}
          viewportRevision={viewportRevision}
          onProjectionChange={onFurnitureProjectionChange}
        />
      ) : null}
    </FilamentView>
  );
}

export function RoomScene({
  rotationY,
  zoom,
  furniture,
  onFloorProjectionChange,
  onFurnitureProjectionChange,
}: RoomSceneProps) {
  const [loaded, setLoaded] = useState(false);
  const [viewportRevision, setViewportRevision] = useState(0);
  const viewportSizeRef = useRef({ width: 0, height: 0 });
  const handleReady = useCallback(() => setLoaded(true), []);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    const current = viewportSizeRef.current;

    if (
      Math.abs(current.width - width) < 0.5 &&
      Math.abs(current.height - height) < 0.5
    ) {
      return;
    }

    viewportSizeRef.current = { width, height };
    setViewportRevision((revision) => revision + 1);
  }, []);
  const hasFurniture = Boolean(furniture);

  useEffect(() => {
    if (!hasFurniture) onFurnitureProjectionChange?.(null);
  }, [hasFurniture, onFurnitureProjectionChange]);

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <FilamentScene>
        <RoomFilamentScene
          rotationY={rotationY}
          zoom={zoom}
          viewportRevision={viewportRevision}
          onReady={handleReady}
          furniture={furniture}
          onFloorProjectionChange={onFloorProjectionChange}
          onFurnitureProjectionChange={onFurnitureProjectionChange}
        />
      </FilamentScene>
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
  loading: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: { color: "#666", fontSize: 12 },
});
