/* eslint-disable @typescript-eslint/no-require-imports, react/no-unknown-property */
import { useGLTF } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Asset } from 'expo-asset';
import { Suspense, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Box3, DoubleSide, Group, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { RotateLeftIcon, RotateRightIcon } from './Icons';

const roomAsset = Asset.fromModule(require('../assets/models/homepageroom-runtime.glb'));

function CameraAim() {
  const camera = useThree((state) => state.camera);
  useLayoutEffect(() => {
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
  }, [camera]);
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

function compatibleScene(source: Group) {
  const flattened = new Group();
  source.updateMatrixWorld(true);
  source.traverse((object: Object3D) => {
    if (!(object as Mesh).isMesh) return;
    const sourceMesh = object as Mesh;
    const original = Array.isArray(sourceMesh.material) ? sourceMesh.material[0] : sourceMesh.material;
    const geometry = sourceMesh.geometry.clone();
    geometry.applyMatrix4(sourceMesh.matrixWorld);
    const mesh = new Mesh(geometry, new MeshStandardMaterial({ color: materialColor(original?.name ?? ''), roughness: 0.9, metalness: 0, side: DoubleSide }));
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    flattened.add(mesh);
  });
  const box = new Box3().setFromObject(flattened);
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  const largestSide = Math.max(size.x, size.y, size.z);
  const scale = 10 / largestSide;
  flattened.scale.setScalar(scale);
  flattened.position.copy(center.multiplyScalar(-scale));
  return flattened;
}

function RoomModel({ onReady, rotationY }: { onReady: () => void; rotationY: number }) {
  const { scene } = useGLTF(roomAsset.uri) as { scene: Group };
  const displayScene = useMemo(() => compatibleScene(scene), [scene]);
  useEffect(() => onReady(), [onReady]);
  return <primitive object={displayScene} rotation={[0, rotationY, 0]} />;
}

export function RoomScene() {
  const [loaded, setLoaded] = useState(false);
  const [rotationY, setRotationY] = useState(0);
  return (
    <View style={styles.container}>
      <Canvas shadows camera={{ position: [9, 7, 12], fov: 45, near: 0.1, far: 100 }}>
        <CameraAim />
        <color attach="background" args={['#dde1e5']} />
        <ambientLight intensity={1.1} />
        <directionalLight castShadow position={[7, 10, 8]} intensity={1.4} shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
        <Suspense fallback={null}>
          <RoomModel onReady={() => setLoaded(true)} rotationY={rotationY} />
        </Suspense>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.05, 0]} receiveShadow>
          <planeGeometry args={[20, 20]} />
          <shadowMaterial transparent opacity={0.18} />
        </mesh>
      </Canvas>
      {!loaded ? <View style={styles.loading}><ActivityIndicator color="#666"/><Text style={styles.loadingText}>Loading room model...</Text></View> : null}
      <View style={styles.rotationControls}>
        <Pressable accessibilityLabel="Rotate room left" style={styles.rotationButton} onPress={() => setRotationY((value) => value - Math.PI / 8)}><RotateLeftIcon size={25}/></Pressable>
        <Text style={styles.rotationLabel}>Rotate room</Text>
        <Pressable accessibilityLabel="Rotate room right" style={styles.rotationButton} onPress={() => setRotationY((value) => value + Math.PI / 8)}><RotateRightIcon size={25}/></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 }, loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 10 }, loadingText: { color: '#666', fontSize: 12 }, rotationControls: { position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,.9)' }, rotationButton: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#bbb', alignItems: 'center', justifyContent: 'center' }, rotationLabel: { color: '#555', fontSize: 11, fontWeight: '600' } });
