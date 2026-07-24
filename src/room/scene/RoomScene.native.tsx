import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from "react-native";
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

// Metro exposes bundled GLBs through the React Native numeric asset module.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ROOM_MODEL = require("../../assets/models/room/virtualroom_empty.glb");

export type RoomSceneProps = {
  rotationY: number;
  zoom: number;
  onRotationChange: (rotationY: number) => void;
  furniture?: {
    itemId: string;
    position: { x: number; y: number };
    perspectiveScale: number;
    renderStyle?: RenderStyleId;
  } | null;
};

function PlacedFurnitureModel({
  itemId,
  position,
  perspectiveScale,
  renderStyle = "realistic",
  roomRotation,
  roomZoom,
}: NonNullable<RoomSceneProps["furniture"]> & {
  roomRotation: number;
  roomZoom: number;
}) {
  const definition = getRoomFurnitureDefinition(itemId);
  const source = definition
    ? getRoomFurnitureModel(definition, renderStyle)
    : ROOM_MODEL;
  const model = useModel(source);
  const { transformManager } = useFilamentContext();
  const unitTransform = useRef<Mat4 | null>(null);

  useEffect(() => {
    if (!definition || model.state !== "loaded") return;
    transformManager.transformToUnitCube(model.rootEntity, model.boundingBox);
    unitTransform.current = transformManager.getTransform(model.rootEntity);
  }, [definition, model, transformManager]);

  useEffect(() => {
    if (!definition || model.state !== "loaded" || !unitTransform.current) return;

    const localScale = definition.sceneScale * perspectiveScale;
    // UI placement points are normalized to the complete room viewport. Convert
    // them once to the room model's normalized floor plane, then apply the same
    // room rotation and zoom used by the room GLB.
    const floorX = (position.x - 0.5) * 0.9;
    const floorZ = (position.y - 0.62) * 0.9;
    const floorY = -0.5 + localScale / 2;
    const transform = unitTransform.current
      .scaling([localScale, localScale, localScale])
      .translate([floorX, floorY, floorZ])
      .rotate(roomRotation, [0, 1, 0])
      .scaling([roomZoom, roomZoom, roomZoom]);
    transformManager.setTransform(model.rootEntity, transform);
  }, [
    definition,
    model,
    perspectiveScale,
    position.x,
    position.y,
    roomRotation,
    roomZoom,
    transformManager,
  ]);

  return null;
}

function RoomModel({
  rotationY,
  zoom,
  onReady,
}: {
  rotationY: number;
  zoom: number;
  onReady: () => void;
}) {
  const model = useModel(ROOM_MODEL);
  const { transformManager } = useFilamentContext();
  const unitTransform = useRef<Mat4 | null>(null);
  const controlsRef = useRef({ rotationY, zoom });
  controlsRef.current = { rotationY, zoom };

  useEffect(() => {
    if (model.state !== "loaded") return;

    transformManager.transformToUnitCube(model.rootEntity, model.boundingBox);
    unitTransform.current = transformManager.getTransform(model.rootEntity);
    const initialControls = controlsRef.current;
    const initialTransform = unitTransform.current
      .rotate(initialControls.rotationY, [0, 1, 0])
      .scaling([initialControls.zoom, initialControls.zoom, initialControls.zoom]);
    transformManager.setTransform(model.rootEntity, initialTransform);

    onReady();
  }, [model, onReady, transformManager]);

  useEffect(() => {
    if (model.state !== "loaded" || !unitTransform.current) return;
    const transform = unitTransform.current
      .rotate(rotationY, [0, 1, 0])
      .scaling([zoom, zoom, zoom]);
    transformManager.setTransform(model.rootEntity, transform);
  }, [model, rotationY, transformManager, zoom]);

  return null;
}

function RoomFilamentScene({
  rotationY,
  zoom,
  onReady,
  furniture,
}: {
  rotationY: number;
  zoom: number;
  onReady: () => void;
  furniture?: RoomSceneProps["furniture"];
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
      <RoomModel rotationY={rotationY} zoom={zoom} onReady={onReady} />
      {furniture && getRoomFurnitureDefinition(furniture.itemId) ? (
        <PlacedFurnitureModel
          key={`${furniture.itemId}-${furniture.renderStyle ?? "realistic"}`}
          {...furniture}
          roomRotation={rotationY}
          roomZoom={zoom}
        />
      ) : null}
    </FilamentView>
  );
}

export function RoomScene({
  rotationY,
  zoom,
  onRotationChange,
  furniture,
}: RoomSceneProps) {
  const [loaded, setLoaded] = useState(false);
  const rotationStart = useRef(0);
  const rotationRef = useRef(rotationY);
  rotationRef.current = rotationY;
  const handleReady = useCallback(() => setLoaded(true), []);
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 2,
        onPanResponderGrant: () => {
          rotationStart.current = rotationRef.current;
        },
        onPanResponderMove: (_, gesture) => {
          onRotationChange(rotationStart.current + gesture.dx * 0.009);
        },
      }),
    [onRotationChange],
  );

  return (
    <View style={styles.container}>
      <FilamentScene>
        <RoomFilamentScene
          rotationY={rotationY}
          zoom={zoom}
          onReady={handleReady}
          furniture={furniture}
        />
      </FilamentScene>
      <View
        accessibilityLabel="Drag horizontally to rotate room"
        style={styles.gestureLayer}
        {...panResponder.panHandlers}
      />
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
