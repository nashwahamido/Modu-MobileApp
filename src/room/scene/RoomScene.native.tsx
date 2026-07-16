/* eslint-disable @typescript-eslint/no-require-imports, react/no-unknown-property */
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, PanResponder, StyleSheet, Text, View } from 'react-native';
import { Box3, BufferAttribute, BufferGeometry, Matrix4, Quaternion, Vector3 } from 'three';

const roomModule = require('../../assets/models/homepageroom-runtime.glb');

const roomVertexShader = `
  precision highp float;
  attribute vec3 position;
  attribute vec3 normal;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform mat3 normalMatrix;
  varying float vLight;
  varying float vWarmth;
  void main() {
    vec3 transformedNormal = normalize(normalMatrix * normal);
    vec3 keyLight = normalize(vec3(-0.35, 0.9, -0.55));
    vec3 fillLight = normalize(vec3(0.65, 0.35, 0.45));
    float key = max(dot(transformedNormal, keyLight), 0.0);
    float fill = max(dot(transformedNormal, fillLight), 0.0);
    vLight = 0.72 + 0.38 * key + 0.16 * fill;
    vWarmth = 0.08 + 0.08 * key;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

function roomFragmentShader(color: string) {
  const value = color.replace('#', '');
  const red = parseInt(value.slice(0, 2), 16) / 255;
  const green = parseInt(value.slice(2, 4), 16) / 255;
  const blue = parseInt(value.slice(4, 6), 16) / 255;
  return `
    precision mediump float;
    varying float vLight;
    varying float vWarmth;
    void main() {
      vec3 baseColor = vec3(${red.toFixed(5)}, ${green.toFixed(5)}, ${blue.toFixed(5)});
      vec3 litColor = baseColor * vLight;
      vec3 warmFill = vec3(1.0, 0.92, 0.78) * vWarmth;
      gl_FragColor = vec4(min(litColor + warmFill, vec3(1.0)), 1.0);
    }
  `;
}

type RoomTransformTarget = { rotationY: number; zoom: number };
let currentRoomTransform: RoomTransformTarget = { rotationY: 0, zoom: 1 };

export function setRoomCameraTarget(target: RoomTransformTarget) {
  currentRoomTransform = target;
}

function CameraAim() {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  useFrame(() => {
    camera.position.set(11, 8, -12);
    camera.lookAt(0, -0.3, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    invalidate();
  });
  return null;
}

function SceneDiagnostics({ enabled }: { enabled: boolean }) {
  const { camera, gl, scene } = useThree();
  const frames = useRef(0);
  useFrame(() => {
    if (!enabled || frames.current > 30) return;
    frames.current += 1;
    if (frames.current !== 30) return;
    let meshCount = 0;
    let vertexCount = 0;
    scene.traverse((object) => {
      if (!(object as any).isMesh) return;
      meshCount += 1;
      vertexCount += (object as any).geometry?.getAttribute?.('position')?.count ?? 0;
    });
    scene.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(scene);
    console.log('RENDER scene meshes:', meshCount);
    console.log('RENDER scene vertices:', vertexCount);
    console.log('RENDER scene bounds:', bounds.min.toArray(), bounds.max.toArray());
    console.log('RENDER camera:', camera.position.toArray(), camera.getWorldDirection(new Vector3()).toArray());
    console.log('RENDER GPU:', { calls: gl.info.render.calls, triangles: gl.info.render.triangles });
  });
  return null;
}

function materialColor(name: string) {
  const value = name.toLowerCase();
  if (value.includes('floor')) return '#8b725d';
  if (value.includes('wall') || value.includes('plaster')) return '#e6e3dd';
  if (value.includes('sofa') || value.includes('cushion') || value.includes('pillow')) return '#b9a9a0';
  if (value.includes('plant') || value.includes('calathea')) return '#66805f';
  if (value.includes('gold')) return '#b69255';
  if (value.includes('glass')) return '#b9d2d8';
  if (value.includes('wood') || value.includes('oak') || value.includes('wicker')) return '#9a6f4c';
  return '#c6c1b8';
}

function factorColor(factor: number[] | undefined, fallbackName: string) {
  if (!factor || factor.length < 3) return materialColor(fallbackName);
  const channel = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, '0');
  return `#${channel(factor[0])}${channel(factor[1])}${channel(factor[2])}`;
}

type IndexArray = Uint8Array | Uint16Array | Uint32Array;
type RoomPart = { positions: Float32Array; normals: Float32Array; indices: IndexArray | null; color: string; roughness: number; metalness: number };
type PreparedRoom = { parts: RoomPart[]; position: [number, number, number]; scale: number; center: number[]; size: number[] };
let cachedPreparedRoom: PreparedRoom | null = null;
let preparedRoomPromise: Promise<PreparedRoom> | null = null;

function parseRoom(data: ArrayBuffer): PreparedRoom {
  const view = new DataView(data);
  const jsonLength = view.getUint32(12, true);
  const jsonBytes = new Uint8Array(data, 20, jsonLength);
  const json = JSON.parse(new TextDecoder().decode(jsonBytes).replace(/\0+$/, ''));
  const binStart = 20 + jsonLength + 8;
  const parts: RoomPart[] = [];
  const box = new Box3();

  const componentCount = (type: string) => ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[type] ?? 1);
  const accessorArray = (index: number) => {
    const accessor = json.accessors[index];
    const bufferView = json.bufferViews[accessor.bufferView];
    const offset = binStart + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const length = accessor.count * componentCount(accessor.type);
    if (accessor.componentType === 5126) return new Float32Array(data, offset, length).slice();
    if (accessor.componentType === 5125) return new Uint32Array(data, offset, length).slice();
    if (accessor.componentType === 5123) return new Uint16Array(data, offset, length).slice();
    return new Uint8Array(data, offset, length).slice();
  };

  const localMatrix = (node: any) => {
    if (node.matrix) return new Matrix4().fromArray(node.matrix);
    return new Matrix4().compose(
      new Vector3().fromArray(node.translation ?? [0, 0, 0]),
      new Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
      new Vector3().fromArray(node.scale ?? [1, 1, 1]),
    );
  };

  const visit = (nodeIndex: number, parentMatrix: Matrix4) => {
    const node = json.nodes[nodeIndex];
    const worldMatrix = parentMatrix.clone().multiply(localMatrix(node));
    if (node.mesh !== undefined) {
      const mesh = json.meshes[node.mesh];
      for (const primitive of mesh.primitives) {
        const material = primitive.material !== undefined ? json.materials?.[primitive.material] : undefined;
        const geometry = new BufferGeometry();
        const positions = accessorArray(primitive.attributes.POSITION) as Float32Array;
        geometry.setAttribute('position', new BufferAttribute(positions, 3));
        if (primitive.attributes.NORMAL !== undefined) {
          const normals = accessorArray(primitive.attributes.NORMAL) as Float32Array;
          geometry.setAttribute('normal', new BufferAttribute(normals, 3));
        } else {
          geometry.computeVertexNormals();
        }
        if (primitive.indices !== undefined) geometry.setIndex(new BufferAttribute(accessorArray(primitive.indices), 1));
        geometry.applyMatrix4(worldMatrix);
        const renderGeometry = geometry.index ? geometry.toNonIndexed() : geometry;
        renderGeometry.computeBoundingBox();
        if (renderGeometry.boundingBox) box.union(renderGeometry.boundingBox);
        parts.push({
          positions: renderGeometry.getAttribute('position').array as Float32Array,
          normals: renderGeometry.getAttribute('normal').array as Float32Array,
          indices: null,
          color: factorColor(material?.pbrMetallicRoughness?.baseColorFactor, material?.name ?? node.name ?? mesh.name ?? ''),
          roughness: material?.pbrMetallicRoughness?.roughnessFactor ?? 0.82,
          metalness: material?.pbrMetallicRoughness?.metallicFactor ?? 0,
        });
      }
    }
    for (const child of node.children ?? []) visit(child, worldMatrix);
  };

  const scene = json.scenes[json.scene ?? 0];
  for (const root of scene.nodes ?? []) visit(root, new Matrix4());

  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  for (const part of parts) {
    for (let index = 0; index < part.positions.length; index += 3) {
      part.positions[index] -= center.x;
      part.positions[index + 1] -= center.y;
      part.positions[index + 2] -= center.z;
    }
  }
  const largestSide = Math.max(size.x, size.y, size.z);
  const scale = 10 / largestSide;
  return {
    parts,
    scale,
    position: [0, 0, 0],
    center: center.toArray(),
    size: size.toArray(),
  };
}

function loadPreparedRoom() {
  if (cachedPreparedRoom) return Promise.resolve(cachedPreparedRoom);
  if (!preparedRoomPromise) {
    preparedRoomPromise = Asset.loadAsync(roomModule).then(async ([asset]) => {
      const uri = asset.localUri ?? asset.uri;
      const data = await new File(uri).arrayBuffer();
      const room = parseRoom(data);
      cachedPreparedRoom = room;
      return room;
    });
  }
  return preparedRoomPromise;
}

function RoomModel({ onReady, onError }: { onReady: (ready: boolean) => void; onError: (message: string) => void }) {
  const [preparedRoom, setPreparedRoom] = useState<PreparedRoom | null>(null);
  const modelRef = useRef<any>(null);

  useEffect(() => {
    let active = true;
    loadPreparedRoom()
      .then((room) => {
        if (!active) return;
        console.log('Direct GLB parse complete');
        console.log('Scene meshes:', room.parts.length);
        console.log('ROOM CENTER:', room.center);
        console.log('ROOM SIZE:', room.size);
        setPreparedRoom(room);
        onReady(true);
      })
      .catch((error: unknown) => {
        if (active) onError(error instanceof Error ? error.message : String(error));
      });
    return () => { active = false; };
  }, [onError, onReady]);

  useFrame(() => {
    if (!modelRef.current || !preparedRoom) return;
    const visualScale = preparedRoom.scale / currentRoomTransform.zoom;
    modelRef.current.rotation.y = currentRoomTransform.rotationY;
    modelRef.current.scale.setScalar(visualScale);
    modelRef.current.updateMatrixWorld(true);
  });

  return preparedRoom ? (
    <group ref={modelRef} position={preparedRoom.position} scale={preparedRoom.scale}>
      {preparedRoom.parts.map((part, index) => (
        <mesh key={index} frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[part.positions, 3]} />
            <bufferAttribute attach="attributes-normal" args={[part.normals, 3]} />
            {part.indices ? <bufferAttribute attach="index" args={[part.indices, 1]} /> : null}
          </bufferGeometry>
          <rawShaderMaterial
            vertexShader={roomVertexShader}
            fragmentShader={roomFragmentShader(part.color)}
            side={2}
            depthTest
            depthWrite
          />
        </mesh>
      ))}
    </group>
  ) : null;
}

type RoomSceneProps = {
  rotationY: number;
  zoom: number;
  onRotationChange: (rotationY: number) => void;
};

export function RoomScene({ rotationY, zoom, onRotationChange }: RoomSceneProps) {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const rotationStart = useRef(0);
  const rotationRef = useRef(0);
  rotationRef.current = rotationY;
  useEffect(() => {
    setRoomCameraTarget({ rotationY, zoom });
  }, [rotationY, zoom]);
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 2,
    onPanResponderGrant: () => { rotationStart.current = rotationRef.current; },
    onPanResponderMove: (_, gesture) => { onRotationChange(rotationStart.current + gesture.dx * 0.009); },
  }), [onRotationChange]);
  return (
    <View style={styles.container}>
      <Canvas style={styles.canvas} gl={{ alpha: true }} camera={{ position: [11, 8, -12], fov: 32, near: 0.1, far: 100 }}>
        <CameraAim />
        <SceneDiagnostics enabled={loaded} />
        <ambientLight intensity={0.9} />
        <hemisphereLight args={['#fffaf0', '#9aa7ad', 1.55]} />
        <directionalLight position={[-5, 10, -7]} intensity={2.25} />
        <directionalLight position={[6, 5, 6]} intensity={0.85} />
        <RoomModel onReady={setLoaded} onError={setLoadError} />
      </Canvas>
      <View accessibilityLabel="Drag horizontally to rotate room" style={styles.gestureLayer} {...panResponder.panHandlers} />
      {!loaded ? <View style={styles.loading}>{!loadError ? <ActivityIndicator color="#666"/> : null}<Text style={styles.loadingText}>{loadError || 'Loading room model...'}</Text></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: 'transparent' }, canvas: { backgroundColor: 'transparent' }, gestureLayer: { ...StyleSheet.absoluteFillObject, zIndex: 2 }, loading: { ...StyleSheet.absoluteFillObject, zIndex: 3, alignItems: 'center', justifyContent: 'center', gap: 10 }, loadingText: { color: '#666', fontSize: 12 } });
