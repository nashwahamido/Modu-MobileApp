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

// Metro exposes bundled GLBs through the React Native numeric asset module.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ROOM_MODEL = require("../../assets/models/homepageroom-runtime.glb");

export type RoomSceneProps = {
  rotationY: number;
  zoom: number;
  onRotationChange: (rotationY: number) => void;
};

function roomMaterialColor(name: string): [number, number, number] {
  const value = name.toLowerCase();
  if (value.includes("floor")) return [0.55, 0.45, 0.36];
  if (value.includes("wall") || value.includes("plaster"))
    return [0.9, 0.89, 0.87];
  if (
    value.includes("sofa") ||
    value.includes("cushion") ||
    value.includes("pillow") ||
    value.includes("chair")
  )
    return [0.72, 0.66, 0.63];
  if (value.includes("plant") || value.includes("calathea"))
    return [0.4, 0.5, 0.37];
  if (value.includes("gold")) return [0.72, 0.57, 0.33];
  if (value.includes("glass")) return [0.72, 0.82, 0.85];
  if (
    value.includes("wood") ||
    value.includes("oak") ||
    value.includes("wicker")
  )
    return [0.6, 0.44, 0.3];
  if (value.includes("mat") || value.includes("inside"))
    return [0.18, 0.17, 0.16];
  return [0.77, 0.75, 0.72];
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
  const {
    nameComponentManager,
    renderableManager,
    transformManager,
  } = useFilamentContext();
  const unitTransform = useRef<Mat4 | null>(null);

  useEffect(() => {
    if (model.state !== "loaded") return;

    transformManager.transformToUnitCube(model.rootEntity, model.boundingBox);
    unitTransform.current = transformManager.getTransform(model.rootEntity);

    // The optimized GLB intentionally has no texture payload and most
    // materials omit a base color. Keep Filament's native glTF shading while
    // supplying the same calm material palette the previous room used.
    for (const entity of model.asset.getRenderableEntities()) {
      const entityName = nameComponentManager.getEntityName(entity) ?? "";
      const primitiveCount = renderableManager.getPrimitiveCount(entity);
      for (let index = 0; index < primitiveCount; index += 1) {
        const material = renderableManager.getMaterialInstanceAt(entity, index);
        material.setFloat4Parameter("baseColorFactor", [
          ...roomMaterialColor(material.name ?? entityName),
          1,
        ]);
      }
    }

    onReady();
  }, [
    model,
    nameComponentManager,
    onReady,
    renderableManager,
    transformManager,
  ]);

  useEffect(() => {
    if (model.state !== "loaded" || !unitTransform.current) return;
    const scale = 1 / zoom;
    const transform = unitTransform.current
      .rotate(rotationY, [0, 1, 0])
      .scaling([scale, scale, scale]);
    transformManager.setTransform(model.rootEntity, transform);
  }, [model, rotationY, transformManager, zoom]);

  return null;
}

function RoomFilamentScene({
  rotationY,
  zoom,
  onReady,
}: {
  rotationY: number;
  zoom: number;
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
      <RoomModel rotationY={rotationY} zoom={zoom} onReady={onReady} />
    </FilamentView>
  );
}

export function RoomScene({
  rotationY,
  zoom,
  onRotationChange,
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
