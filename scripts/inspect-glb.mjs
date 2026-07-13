import fs from 'node:fs';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';

const filename = process.argv[2];
const buffer = fs.readFileSync(filename);
const jsonLength = buffer.readUInt32LE(12);
const gltf = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString().replace(/\0+$/, ''));
const bounds = new Box3();
let primitiveCount = 0;

function nodeMatrix(node) {
  if (node.matrix) return new Matrix4().fromArray(node.matrix);
  return new Matrix4().compose(
    new Vector3().fromArray(node.translation ?? [0, 0, 0]),
    new Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
    new Vector3().fromArray(node.scale ?? [1, 1, 1]),
  );
}

function includeMesh(meshIndex, worldMatrix) {
  const mesh = gltf.meshes[meshIndex];
  for (const primitive of mesh.primitives) {
    primitiveCount += 1;
    const accessor = gltf.accessors[primitive.attributes.POSITION];
    if (!accessor?.min || !accessor?.max) continue;
    const min = accessor.min;
    const max = accessor.max;
    for (const x of [min[0], max[0]]) {
      for (const y of [min[1], max[1]]) {
        for (const z of [min[2], max[2]]) {
          bounds.expandByPoint(new Vector3(x, y, z).applyMatrix4(worldMatrix));
        }
      }
    }
  }
}

function visit(nodeIndex, parentMatrix) {
  const node = gltf.nodes[nodeIndex];
  const worldMatrix = parentMatrix.clone().multiply(nodeMatrix(node));
  if (node.mesh !== undefined) includeMesh(node.mesh, worldMatrix);
  for (const child of node.children ?? []) visit(child, worldMatrix);
}

const scene = gltf.scenes[gltf.scene ?? 0];
for (const root of scene.nodes ?? []) visit(root, new Matrix4());

const center = bounds.getCenter(new Vector3());
const size = bounds.getSize(new Vector3());
const materials = (gltf.materials ?? []).map((material) => ({
  name: material.name,
  alphaMode: material.alphaMode ?? 'OPAQUE',
  alpha: material.pbrMetallicRoughness?.baseColorFactor?.[3] ?? 1,
  doubleSided: material.doubleSided ?? false,
  unlit: Boolean(material.extensions?.KHR_materials_unlit),
}));

console.log(JSON.stringify({
  filename,
  nodes: gltf.nodes?.length ?? 0,
  meshes: gltf.meshes?.length ?? 0,
  primitives: primitiveCount,
  bounds: { min: bounds.min.toArray(), max: bounds.max.toArray(), center: center.toArray(), size: size.toArray() },
  materials,
}, null, 2));
